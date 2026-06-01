import {
  finishEditorialJob,
  hasPendingDraftJobForPost,
  listDueEditorialJobs,
  releaseStaleLocks,
  tryLockEditorialJob,
} from "@/lib/editorial/editorialJobs";
import { runEditorialJob } from "@/lib/editorial/editorialOrchestrator";
import { listContentPosts } from "@/lib/contentPosts";
import { enqueueEditorialJob } from "@/lib/editorial/editorialJobs";
import { getOrCreateContentBrandContext } from "@/lib/contentBrandContext";
import {
  policyAllowsDueIdeaDraft,
  policyAllowsWritingDraft,
  postHasBriefForAutopilot,
  postNeedsAutopilotDraft,
} from "@/lib/editorial/editorialDraftEnqueue";

export type EditorialTickResult = {
  processed: number;
  results: { jobId: string; type: string; ok: boolean; summary: string }[];
  enqueuedDrafts: number;
};

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/**
 * Enqueue draft_post for all eligible Writing posts (any date), then ideas due today.
 */
export async function enqueueDueDraftPosts(): Promise<number> {
  const brand = await getOrCreateContentBrandContext();
  if (!brand.editorialAutopilotEnabled) return 0;
  const policy = brand.editorialAutopilotPolicy ?? {};

  let enqueued = 0;
  const maxIdeas = policy.maxPostsPerRun ?? 3;
  const maxWriting = policy.maxWritingDraftsPerTick ?? 10;

  const tryEnqueue = async (postId: string): Promise<boolean> => {
    if (await hasPendingDraftJobForPost(postId)) return false;
    await enqueueEditorialJob({
      type: "draft_post",
      postId,
      runAfter: new Date(),
    });
    enqueued += 1;
    return true;
  };

  if (policyAllowsWritingDraft(policy)) {
    const writing = await listContentPosts({ statuses: ["drafting"], limit: 100 });
    let writingQueued = 0;
    for (const p of writing) {
      if (writingQueued >= maxWriting) break;
      if (!postNeedsAutopilotDraft(p)) continue;
      if (!postHasBriefForAutopilot(p)) continue;
      if (await tryEnqueue(p.id)) writingQueued += 1;
    }
  }

  if (policyAllowsDueIdeaDraft(policy)) {
    const start = startOfLocalDay(new Date());
    const end = endOfLocalDay(new Date());
    let ideasQueued = 0;
    const ideas = await listContentPosts({ statuses: ["idea"], limit: 50 });
    for (const p of ideas) {
      if (ideasQueued >= maxIdeas) break;
      if (!p.scheduledAt) continue;
      if (p.scheduledAt < start || p.scheduledAt > end) continue;
      if (!postNeedsAutopilotDraft(p)) continue;
      if (!postHasBriefForAutopilot(p)) continue;
      if (await tryEnqueue(p.id)) ideasQueued += 1;
    }
  }

  return enqueued;
}

export async function runEditorialJobTick(options?: {
  maxJobs?: number;
  enqueueDrafts?: boolean;
}): Promise<EditorialTickResult> {
  await releaseStaleLocks();
  const enqueuedDrafts =
    options?.enqueueDrafts !== false ? await enqueueDueDraftPosts() : 0;

  const maxJobs = options?.maxJobs ?? 5;
  const due = await listDueEditorialJobs(maxJobs);
  const results: EditorialTickResult["results"] = [];

  for (const job of due) {
    const locked = await tryLockEditorialJob(job.id);
    if (!locked) continue;
    try {
      const outcome = await runEditorialJob(locked);
      await finishEditorialJob(
        job.id,
        outcome.ok ? "done" : "failed",
        outcome.ok ? null : outcome.summary,
      );
      results.push({
        jobId: job.id,
        type: job.type,
        ok: outcome.ok,
        summary: outcome.summary,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await finishEditorialJob(job.id, "failed", msg);
      results.push({
        jobId: job.id,
        type: job.type,
        ok: false,
        summary: msg,
      });
    }
  }

  return { processed: results.length, results, enqueuedDrafts };
}

/** Enqueue (if needed) and run jobs now — after a post enters Writing. */
export async function maybeTriggerEditorialDraftForPost(
  postId: string,
): Promise<void> {
  const { tryEnqueueDraftPost } = await import("@/lib/editorial/editorialDraftEnqueue");
  const queued = await tryEnqueueDraftPost(postId);
  if (!queued) return;
  try {
    await runEditorialJobTick({ maxJobs: 10, enqueueDrafts: false });
  } catch (err) {
    console.error("[clin editorial] draft tick after enqueue failed:", postId, err);
  }
}
