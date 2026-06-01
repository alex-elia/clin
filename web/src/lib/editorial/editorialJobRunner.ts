import {
  finishEditorialJob,
  listDueEditorialJobs,
  releaseStaleLocks,
  tryLockEditorialJob,
} from "@/lib/editorial/editorialJobs";
import { runEditorialJob } from "@/lib/editorial/editorialOrchestrator";
import { listContentPosts } from "@/lib/contentPosts";
import { enqueueEditorialJob } from "@/lib/editorial/editorialJobs";
import { getOrCreateContentBrandContext } from "@/lib/contentBrandContext";

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

/** Enqueue draft_post for posts scheduled today (idea/drafting). */
export async function enqueueDueDraftPosts(): Promise<number> {
  const brand = await getOrCreateContentBrandContext();
  if (!brand.editorialAutopilotEnabled) return 0;
  const policy = brand.editorialAutopilotPolicy ?? {};
  if (policy.runDraftWhenDue === false) return 0;

  const max = policy.maxPostsPerRun ?? 3;
  const start = startOfLocalDay(new Date());
  const end = endOfLocalDay(new Date());
  const posts = await listContentPosts({
    statuses: ["idea", "drafting"],
    limit: 50,
  });
  let enqueued = 0;
  for (const p of posts) {
    if (enqueued >= max) break;
    if (!p.scheduledAt) continue;
    if (p.scheduledAt < start || p.scheduledAt > end) continue;
    const brief = (p.ideaNotes ?? "").trim();
    if (brief.length < 12) continue;
    await enqueueEditorialJob({
      type: "draft_post",
      postId: p.id,
      runAfter: new Date(),
    });
    enqueued += 1;
  }
  return enqueued;
}

export async function runEditorialJobTick(options?: {
  maxJobs?: number;
  enqueueDrafts?: boolean;
}): Promise<EditorialTickResult> {
  await releaseStaleLocks();
  if (options?.enqueueDrafts !== false) {
    await enqueueDueDraftPosts();
  }

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

  return { processed: results.length, results, enqueuedDrafts: 0 };
}
