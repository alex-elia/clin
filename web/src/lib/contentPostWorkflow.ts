/**
 * Shared orchestration for the branding post editor (manual UI + autopilot).
 * Keeps coach prompts, language resolution, coach/image API calls, and gap checks in one place.
 */

import type { PostFormPatch } from "@/components/ContentPostWorkspace";
import type { CoachDraftPayload } from "@/components/PostWritingAssistant";
import {
  applyCoachPatchesToForm,
  mergeDraftFromCoachActions,
} from "@/lib/brandCoachClient";
import type { CoachAction } from "@/lib/brandCoachTypes";
import type { BrandCoachTurnDebug } from "@/lib/coachDebug";
import { formatCoachNoActionsMessage } from "@/lib/coachDebug";
import {
  languageResolutionHint,
  parseContentLanguagePreference,
  postTextForLanguageDetection,
  resolveContentLanguage,
  POST_LANGUAGE_LABELS,
  type ResolvedLanguage,
  type ResolvedPostLanguage,
} from "@/lib/contentLanguage";
import type { PostImageStyle } from "@/lib/postImageStyle";

export const POST_MIN_BRIEF_CHARS = 24;

/** Same default prompt as Writing assistant quick action #1 (English). */
export const POST_COMPOSE_COACH_PROMPT_EN =
  "From my brief: write a powerful LinkedIn post (hook + body + title). Suggest format and schedule.";

export const POST_COMPOSE_COACH_PROMPT_FR =
  "À partir de mon brief : rédige un post LinkedIn percutant (accroche + corps + titre). Propose le format et un créneau de publication.";

export const POST_WRITING_QUICK_PROMPTS_POST = {
  en: [
    POST_COMPOSE_COACH_PROMPT_EN,
    "Add concrete quotes I mentioned into the hook, then polish the body.",
    "Shorten for feed; keep the punchline.",
  ],
  fr: [
    POST_COMPOSE_COACH_PROMPT_FR,
    "Intègre les citations concrètes que j'ai mentionnées dans l'accroche, puis peaufine le corps.",
    "Raccourcis pour le fil ; garde la chute.",
  ],
} as const;

export const POST_WRITING_QUICK_PROMPTS_STUDIO = [
  "What should I publish next this week?",
  "I published yesterday — reschedule my pipeline.",
] as const;

export type PostWorkflowDraft = CoachDraftPayload & {
  brandLanguage?: string;
};

export function getComposeCoachPrompt(language: ResolvedPostLanguage): string {
  return language === "fr"
    ? POST_COMPOSE_COACH_PROMPT_FR
    : POST_COMPOSE_COACH_PROMPT_EN;
}

export function hasPostTextForImage(draft: PostWorkflowDraft): boolean {
  return [draft.hook, draft.body, draft.ideaNotes, draft.title].some(
    (s) => (s ?? "").trim().length >= 12,
  );
}

export function resolveWorkflowLanguage(
  draft: PostWorkflowDraft,
): ResolvedLanguage {
  const brief = draft.ideaNotes?.trim() ?? "";
  return resolveContentLanguage({
    brandPreference: parseContentLanguagePreference(draft.brandLanguage),
    postLanguage:
      draft.language === "fr" || draft.language === "en" ? draft.language : null,
    postText: postTextForLanguageDetection({
      ideaNotes: brief,
      title: draft.title,
      hook: draft.hook,
      body: draft.body,
      articleBody: draft.articleBody,
    }),
  });
}

export function languageLabel(resolved: ResolvedLanguage): string {
  return `${POST_LANGUAGE_LABELS[resolved.language]} — ${languageResolutionHint(resolved)}`;
}

export type BriefGapAssessment =
  | { ok: true }
  | { ok: false; questions: string[] };

export function assessBriefGaps(ideaNotes: string): BriefGapAssessment {
  const brief = ideaNotes.trim();
  if (brief.length < POST_MIN_BRIEF_CHARS) {
    return {
      ok: false,
      questions: [
        `Add at least ${POST_MIN_BRIEF_CHARS} characters to your brief (quotes, context, angle).`,
      ],
    };
  }
  const words = brief.split(/\s+/).filter(Boolean).length;
  const hasConcrete =
    /["'«»“”]|https?:\/\/|—|-\s|\d+%|:\s/.test(brief) || words >= 18;
  if (!hasConcrete) {
    return {
      ok: false,
      questions: [
        "What concrete quote or example should we lead with?",
        "Who is this post for, and what is your one-line takeaway?",
      ],
    };
  }
  return { ok: true };
}

export function appendBriefSupplement(brief: string, supplement: string): string {
  const base = brief.trim();
  const add = supplement.trim();
  if (!add) return base;
  return base ? `${base}\n\n---\n${add}` : add;
}

/** Coach replied without actions and appears to ask for more context. */
export function coachReplyNeedsComplement(
  reply: string,
  actionsCount: number,
): boolean {
  if (actionsCount > 0) return false;
  const r = reply.trim();
  if (r.length < 12) return false;
  return /\?|could you|can you (share|clarify|tell|provide)|need (more|a bit|some)|missing|unclear|précise|préciser|précision|manque|quel angle|what (angle|topic|audience)|quelle (angle|audience)|before i (write|draft)|avant de rédiger/i.test(
    r,
  );
}

export type BrandCoachClientResult = {
  threadId?: string;
  reply: string;
  actions: CoachAction[];
  resolvedLanguage?: ResolvedPostLanguage;
  languageHint?: string;
  debug?: BrandCoachTurnDebug;
};

export async function requestBrandCoachTurn(input: {
  message: string;
  postId: string;
  draft: PostWorkflowDraft;
  threadId?: string;
}): Promise<
  | { ok: true; data: BrandCoachClientResult }
  | { ok: false; error: string; debug?: BrandCoachTurnDebug }
> {
  const res = await fetch("/api/branding/coach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: input.message,
      threadId: input.threadId,
      postId: input.postId,
      draft: input.draft,
    }),
  });
  const data = (await res.json()) as BrandCoachClientResult & {
    error?: string;
  };
  if (!res.ok) {
    return { ok: false, error: data.error ?? "Coach failed.", debug: data.debug };
  }
  return {
    ok: true,
    data: {
      threadId: data.threadId,
      reply: data.reply ?? "",
      actions: data.actions ?? [],
      resolvedLanguage: data.resolvedLanguage,
      languageHint: data.languageHint,
      debug: data.debug,
    },
  };
}

export async function applyBrandCoachTurn(input: {
  actions: CoachAction[];
  postId: string;
  draft: Record<string, string | undefined>;
  onApplyPatch: (patch: PostFormPatch) => void;
}): Promise<{
  applied: number;
  draft: Record<string, string | undefined>;
}> {
  const applied = applyCoachPatchesToForm(
    input.actions,
    input.postId,
    input.onApplyPatch,
  );
  const draft = mergeDraftFromCoachActions(
    input.draft,
    input.actions,
    input.postId,
  );
  const res = await fetch("/api/branding/coach/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actions: input.actions }),
  });
  if (!res.ok) {
    throw new Error("Could not save coach updates.");
  }
  return { applied, draft };
}

export type CoachTurnIssue =
  | { kind: "error"; message: string; debug?: BrandCoachTurnDebug }
  | { kind: "needs_complement"; questions: string[]; coachReply: string; debug?: BrandCoachTurnDebug }
  | { kind: "no_actions"; message: string; debug?: BrandCoachTurnDebug };

export function classifyCoachTurn(data: BrandCoachClientResult): CoachTurnIssue | null {
  if (data.actions.length > 0) return null;
  if (coachReplyNeedsComplement(data.reply, 0)) {
    return {
      kind: "needs_complement",
      questions: [
        "The writing assistant needs a bit more context. Add detail below (quotes, audience, angle).",
      ],
      coachReply: data.reply,
      debug: data.debug,
    };
  }
  return {
    kind: "no_actions",
    message: formatCoachNoActionsMessage(data.debug),
    debug: data.debug,
  };
}

export async function suggestPostImagePromptClient(input: {
  postId: string;
  draft: PostWorkflowDraft;
  imageStyle: PostImageStyle;
}): Promise<{ prompt: string; source?: string }> {
  const res = await fetch("/api/branding/generate-image/prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      postId: input.postId,
      draft: input.draft,
      imageStyle: input.imageStyle,
    }),
  });
  const data = (await res.json()) as {
    prompt?: string;
    source?: string;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error ?? "Could not build prompt.");
  }
  if (!data.prompt?.trim()) {
    throw new Error("No image prompt returned.");
  }
  return { prompt: data.prompt, source: data.source };
}

export type GeneratedPostImage = {
  imageUrl: string;
  filename?: string;
  imageStyle?: PostImageStyle;
  prompt?: string;
};

export async function generatePostImageClient(input: {
  postId: string;
  draft: PostWorkflowDraft;
  imageStyle: PostImageStyle;
  autoFromPost?: boolean;
  prompt?: string;
}): Promise<GeneratedPostImage> {
  const res = await fetch("/api/branding/generate-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      postId: input.postId,
      draft: input.draft,
      imageStyle: input.imageStyle,
      ...(input.autoFromPost
        ? { autoFromPost: true }
        : { prompt: input.prompt?.trim() }),
    }),
  });
  const data = (await res.json()) as GeneratedPostImage & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? "Image generation failed.");
  }
  if (!data.imageUrl) {
    throw new Error("No image returned.");
  }
  return data;
}
