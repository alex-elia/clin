/**
 * Server-side post autopilot for editorial_jobs (no fetch/UI callbacks).
 */

import { applyCoachActions } from "@/lib/brandCoachApply";
import { runBrandCoachTurn } from "@/lib/brandCoach";
import type { CoachAction } from "@/lib/brandCoachTypes";
import {
  assessBriefGaps,
  appendBriefSupplement,
  classifyCoachTurn,
  getComposeCoachPrompt,
  hasPostTextForImage,
  resolveWorkflowLanguage,
  type PostWorkflowDraft,
} from "@/lib/contentPostWorkflow";
import { getContentPostById, updateContentPost } from "@/lib/contentPosts";
import type { ContentPostFormat } from "@/lib/contentPostsShared";
import { getOrCreateContentBrandContext } from "@/lib/contentBrandContext";
import { mergeDraftFromCoachActions } from "@/lib/brandCoachClient";
import { resolveImagePromptForPost } from "@/lib/postImagePrompt";
import { generatePostImage } from "@/lib/stableDiffusion";
import { getSdSettings } from "@/lib/sdSettings";
import type { ContentMediaJson } from "@/db/schema";
import { mediaUrlToFilename } from "@/lib/contentPostMedia";
import { parsePostImageStyle } from "@/lib/postImageStyle";

export type ServerAutopilotResult =
  | { ok: true; applied: number; imageGenerated: boolean }
  | { ok: false; error: string };

export async function runPostAutopilotServer(
  postId: string,
  options?: { includeImage?: boolean },
): Promise<ServerAutopilotResult> {
  const post = await getContentPostById(postId);
  if (!post) return { ok: false, error: "Post not found." };

  const brand = await getOrCreateContentBrandContext();
  const policy = brand.editorialAutopilotPolicy ?? {};
  const includeImage = options?.includeImage ?? policy.includeImage ?? false;

  let workingDraft: PostWorkflowDraft = {
    title: post.title,
    format: post.format,
    ideaNotes: post.ideaNotes ?? undefined,
    hook: post.hook ?? undefined,
    body: post.body ?? undefined,
    articleBody: post.articleBody ?? undefined,
    language: post.language ?? undefined,
    brandLanguage: brand.contentLanguage ?? "auto",
  };

  const gaps = assessBriefGaps(workingDraft.ideaNotes ?? "");
  if (!gaps.ok) {
    return { ok: false, error: gaps.questions.join(" ") };
  }

  const resolved = resolveWorkflowLanguage(workingDraft);
  const resolvedLang = resolved.language;
  workingDraft.language = resolvedLang;

  let coachActions: CoachAction[] = [];
  const message = getComposeCoachPrompt(resolvedLang);
  const turn = await runBrandCoachTurn({
    message,
    postId,
    draft: workingDraft,
    scope: "post",
  });
  if (!turn.ok) {
    return { ok: false, error: turn.error };
  }
  const issue = classifyCoachTurn({
    reply: turn.reply,
    actions: turn.actions,
    resolvedLanguage: turn.resolvedLanguage.language,
  });
  if (issue) {
    return {
      ok: false,
      error: issue.kind === "needs_complement" ? issue.questions.join(" ") : issue.message,
    };
  }
  coachActions = turn.actions;

  const applyResult = await applyCoachActions(coachActions);
  const merged = mergeDraftFromCoachActions(
    workingDraft as Record<string, string | undefined>,
    coachActions,
    postId,
  );
  workingDraft = { ...workingDraft, ...merged };

  const formatCandidate = workingDraft.format ?? post.format;
  const format: ContentPostFormat =
    formatCandidate === "article" ||
    formatCandidate === "carousel" ||
    formatCandidate === "poll"
      ? formatCandidate
      : "feed";

  await updateContentPost(postId, {
    title: workingDraft.title?.trim() || post.title,
    hook: workingDraft.hook ?? null,
    body: workingDraft.body ?? null,
    ideaNotes: workingDraft.ideaNotes ?? null,
    format,
    language: resolvedLang,
    status: "drafting",
  });

  let imageGenerated = false;
  if (includeImage) {
    const sd = await getSdSettings();
    if (sd.enabled && hasPostTextForImage(workingDraft)) {
      const imageStyle = parsePostImageStyle("photo");
      const refreshed = await getContentPostById(postId);
      if (refreshed) {
        const resolvedPrompt = await resolveImagePromptForPost({
          post: refreshed,
          draft: workingDraft,
          autoFromPost: true,
          imageStyle,
        });
        if (resolvedPrompt.ok) {
          const result = await generatePostImage({
            postId,
            prompt: resolvedPrompt.prompt,
            imageStyle,
          });
          if (result.ok) {
            const existing = refreshed.mediaJson?.items ?? [];
            const mediaJson: ContentMediaJson = {
              items: [
                ...existing,
                {
                  kind: "image",
                  url: result.apiUrl,
                  filename: mediaUrlToFilename(result.apiUrl) ?? undefined,
                  style: imageStyle,
                  note: result.prompt.slice(0, 200),
                },
              ],
            };
            await updateContentPost(postId, { mediaJson });
            imageGenerated = true;
          }
        }
      }
    }
  }

  const autoReady = policy.autoMarkReady === true;
  await updateContentPost(postId, {
    status: autoReady ? "ready" : "review",
    ...(autoReady ? { readyAt: new Date() } : {}),
  });

  return {
    ok: true,
    applied: applyResult.applied,
    imageGenerated,
  };
}
