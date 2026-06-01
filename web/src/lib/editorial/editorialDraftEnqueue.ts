import type { EditorialAutopilotPolicyJson } from "@/db/schema";
import { getOrCreateContentBrandContext } from "@/lib/contentBrandContext";
import type { ContentPostRow } from "@/lib/contentPosts";
import { getContentPostById } from "@/lib/contentPosts";
import {
  enqueueEditorialJob,
  hasPendingDraftJobForPost,
} from "@/lib/editorial/editorialJobs";

export function policyAllowsWritingDraft(
  policy: EditorialAutopilotPolicyJson,
): boolean {
  return policy.runDraftWhenWriting !== false;
}

export function policyAllowsDueIdeaDraft(
  policy: EditorialAutopilotPolicyJson,
): boolean {
  return policy.runDraftWhenDue !== false;
}

const MIN_BRIEF_CHARS = 12;
const MIN_DRAFT_TEXT_CHARS = 80;

/** Enough hook/body/article to skip re-drafting. */
export function postHasSubstantiveDraft(post: ContentPostRow): boolean {
  const text = `${post.hook ?? ""}${post.body ?? ""}${post.articleBody ?? ""}`.trim();
  return text.length >= MIN_DRAFT_TEXT_CHARS;
}

export function postHasBriefForAutopilot(post: ContentPostRow): boolean {
  const brief = (post.ideaNotes ?? "").trim();
  if (brief.length >= MIN_BRIEF_CHARS) return true;
  return (post.title?.trim().length ?? 0) >= 8 && brief.length >= 4;
}

export function postNeedsAutopilotDraft(post: ContentPostRow): boolean {
  if (post.status === "archived" || post.status === "published") return false;
  if (post.status === "review" || post.status === "ready") return false;
  if (!postHasBriefForAutopilot(post)) return false;
  return !postHasSubstantiveDraft(post);
}

/**
 * Queue a draft_post job when editorial autopilot is on and the post is eligible.
 */
export async function tryEnqueueDraftPost(postId: string): Promise<boolean> {
  const brand = await getOrCreateContentBrandContext();
  if (!brand.editorialAutopilotEnabled) return false;
  const policy = brand.editorialAutopilotPolicy ?? {};

  const post = await getContentPostById(postId);
  if (!post) return false;
  if (post.status === "drafting") {
    if (!policyAllowsWritingDraft(policy)) return false;
  } else if (post.status === "idea") {
    if (!policyAllowsDueIdeaDraft(policy)) return false;
  } else {
    return false;
  }
  if (!postNeedsAutopilotDraft(post)) return false;
  if (await hasPendingDraftJobForPost(postId)) return false;

  await enqueueEditorialJob({
    type: "draft_post",
    postId,
    runAfter: new Date(),
  });
  return true;
}
