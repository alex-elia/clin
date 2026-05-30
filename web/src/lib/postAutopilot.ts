/** Post autopilot: same steps as the manual editor, with optional complement prompts. */

import type { PostImageStyle } from "@/lib/postImageStyle";
import {
  appendBriefSupplement,
  applyBrandCoachTurn,
  assessBriefGaps,
  classifyCoachTurn,
  generatePostImageClient,
  getComposeCoachPrompt,
  hasPostTextForImage,
  languageLabel,
  POST_MIN_BRIEF_CHARS,
  requestBrandCoachTurn,
  resolveWorkflowLanguage,
  suggestPostImagePromptClient,
  type PostWorkflowDraft,
} from "@/lib/contentPostWorkflow";
import type { ResolvedPostLanguage } from "@/lib/contentLanguage";

export const POST_AUTOPILOT_MIN_BRIEF_CHARS = POST_MIN_BRIEF_CHARS;

export type PostAutopilotStepStatus =
  | "pending"
  | "active"
  | "done"
  | "skipped"
  | "error";

export type PostAutopilotStepId =
  | "prepare"
  | "assistant"
  | "apply"
  | "visual_prompt"
  | "visual_gen"
  | "review"
  | "done";

export type PostAutopilotStepDef = {
  id: PostAutopilotStepId;
  label: string;
  subtitle: string;
  xp: number;
  minDisplayMs: number;
};

/** Mirrors ContentPostWorkspace sections: Prepare → Assistant → Post → Visual → Preview. */
export const POST_AUTOPILOT_STEPS: PostAutopilotStepDef[] = [
  {
    id: "prepare",
    label: "1. Prepare",
    subtitle: "Brief check and post language (same as the form)",
    xp: 15,
    minDisplayMs: 500,
  },
  {
    id: "assistant",
    label: "Writing assistant",
    subtitle: "Same coach prompt as “From my brief…” quick action",
    xp: 40,
    minDisplayMs: 0,
  },
  {
    id: "apply",
    label: "Apply to form",
    subtitle: "Same as clicking Apply in the assistant",
    xp: 15,
    minDisplayMs: 400,
  },
  {
    id: "visual_prompt",
    label: "3. Visual — prompt",
    subtitle: "Preview prompt from post (Settings → image APIs)",
    xp: 15,
    minDisplayMs: 400,
  },
  {
    id: "visual_gen",
    label: "Generate from post",
    subtitle: "Same as “Generate from post content”",
    xp: 30,
    minDisplayMs: 0,
  },
  {
    id: "review",
    label: "Preview & handoff",
    subtitle: "Review, Save post, Mark ready for extension",
    xp: 15,
    minDisplayMs: 400,
  },
  {
    id: "done",
    label: "Ready for you",
    subtitle: "Tweak, save, extension",
    xp: 20,
    minDisplayMs: 0,
  },
];

export const POST_AUTOPILOT_TOTAL_XP = POST_AUTOPILOT_STEPS.reduce(
  (s, step) => s + step.xp,
  0,
);

export type PostAutopilotComplementRequest = {
  questions: string[];
  coachReply?: string;
};

export type PostAutopilotRunOptions = {
  postId: string;
  getDraft: () => PostWorkflowDraft;
  includeImage: boolean;
  imageStyle: PostImageStyle;
  sdEnabled: boolean;
  onApplyPatch: (patch: import("@/components/ContentPostWorkspace").PostFormPatch) => void;
  onStepStart: (id: PostAutopilotStepId, detail?: string) => void;
  onStepDone: (id: PostAutopilotStepId, detail?: string) => void;
  onStepSkipped: (id: PostAutopilotStepId, reason: string) => void;
  onXp: (delta: number) => void;
  onMediaItem: (item: {
    url: string;
    filename?: string;
    style: PostImageStyle;
    note?: string;
    alt?: string;
  }) => void;
  onLanguageResolved?: (label: string) => void;
  onNeedsComplement?: (
    request: PostAutopilotComplementRequest,
  ) => Promise<string | null>;
};

export type PostAutopilotRunResult =
  | { ok: true; threadId?: string; applied: number; imageGenerated: boolean }
  | {
      ok: false;
      error: string;
      failedStep?: PostAutopilotStepId;
      coachDebug?: import("@/lib/coachDebug").BrandCoachTurnDebug;
      needsComplement?: PostAutopilotComplementRequest;
      cancelled?: boolean;
    };

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function withMinDisplay(startedAt: number, minMs: number): Promise<void> {
  const elapsed = Date.now() - startedAt;
  if (minMs > elapsed) await sleep(minMs - elapsed);
}

const MAX_COMPLEMENT_ROUNDS = 2;

export async function runPostAutopilot(
  opts: PostAutopilotRunOptions,
): Promise<PostAutopilotRunResult> {
  let threadId: string | undefined;
  let applied = 0;
  let imageGenerated = false;
  let failedStep: PostAutopilotStepId = "prepare";
  let workingDraft: PostWorkflowDraft = { ...opts.getDraft() };
  let coachActions: import("@/lib/brandCoachTypes").CoachAction[] = [];
  let lastCoachDebug: import("@/lib/coachDebug").BrandCoachTurnDebug | undefined;
  let resolvedLang: ResolvedPostLanguage = "fr";
  let imagePrompt = "";

  const stepDef = (id: PostAutopilotStepId) =>
    POST_AUTOPILOT_STEPS.find((s) => s.id === id)!;

  const runTimed = async (
    id: PostAutopilotStepId,
    fn: () => Promise<string | undefined | void>,
    startDetail?: string,
  ) => {
    failedStep = id;
    const def = stepDef(id);
    const t0 = Date.now();
    opts.onStepStart(id, startDetail);
    const endDetail = (await fn()) ?? startDetail;
    await withMinDisplay(t0, def.minDisplayMs);
    opts.onStepDone(id, endDetail);
    opts.onXp(def.xp);
  };

  const askComplement = async (
    request: PostAutopilotComplementRequest,
  ): Promise<string> => {
    if (!opts.onNeedsComplement) {
      const err = new Error(request.questions.join(" ")) as Error & {
        needsComplement: PostAutopilotComplementRequest;
      };
      err.needsComplement = request;
      throw err;
    }
    const supplement = await opts.onNeedsComplement(request);
    if (!supplement?.trim()) {
      const err = new Error(
        "Cancelled — add more detail to your brief or writing assistant.",
      ) as Error & { cancelled: boolean };
      err.cancelled = true;
      throw err;
    }
    return supplement;
  };

  const ensureBrief = async (): Promise<void> => {
    for (let round = 0; round < MAX_COMPLEMENT_ROUNDS; round++) {
      workingDraft = { ...opts.getDraft(), ...workingDraft };
      const gaps = assessBriefGaps(workingDraft.ideaNotes ?? "");
      if (gaps.ok) return;
      const supplement = await askComplement({ questions: gaps.questions });
      workingDraft.ideaNotes = appendBriefSupplement(
        workingDraft.ideaNotes ?? "",
        supplement,
      );
      opts.onApplyPatch({ ideaNotes: workingDraft.ideaNotes });
    }
    const final = assessBriefGaps(workingDraft.ideaNotes ?? "");
    if (!final.ok) {
      throw new Error(final.questions.join(" "));
    }
  };

  const runCoachCompose = async (): Promise<void> => {
    const message = getComposeCoachPrompt(resolvedLang);
    for (let round = 0; round < MAX_COMPLEMENT_ROUNDS; round++) {
      workingDraft = {
        ...opts.getDraft(),
        ...workingDraft,
        language: resolvedLang,
      };
      const turn = await requestBrandCoachTurn({
        message,
        postId: opts.postId,
        draft: workingDraft,
        threadId,
      });
      if (!turn.ok) {
        const err = new Error(turn.error) as Error & {
          coachDebug?: typeof turn.debug;
        };
        err.coachDebug = turn.debug;
        throw err;
      }
      threadId = turn.data.threadId ?? threadId;
      lastCoachDebug = turn.data.debug;
      if (turn.data.resolvedLanguage) {
        resolvedLang = turn.data.resolvedLanguage;
      }
      const issue = classifyCoachTurn(turn.data);
      if (!issue) {
        coachActions = turn.data.actions;
        return;
      }
      if (issue.kind === "needs_complement") {
        const supplement = await askComplement({
          questions: issue.questions,
          coachReply: issue.coachReply,
        });
        workingDraft.ideaNotes = appendBriefSupplement(
          workingDraft.ideaNotes ?? "",
          supplement,
        );
        opts.onApplyPatch({ ideaNotes: workingDraft.ideaNotes });
        continue;
      }
      const err = new Error(issue.message) as Error & {
        coachDebug?: typeof issue.debug;
      };
      err.coachDebug = issue.debug;
      throw err;
    }
    throw new Error("Coach still needs more context after follow-up.");
  };

  try {
    await runTimed("prepare", async () => {
      await ensureBrief();
      const resolved = resolveWorkflowLanguage(workingDraft);
      resolvedLang = resolved.language;
      workingDraft.language = resolvedLang;
      opts.onApplyPatch({ language: resolvedLang });
      opts.onLanguageResolved?.(languageLabel(resolved));
    });

    await runTimed("assistant", runCoachCompose);

    await runTimed("apply", async () => {
      const result = await applyBrandCoachTurn({
        actions: coachActions,
        postId: opts.postId,
        draft: workingDraft as Record<string, string | undefined>,
        onApplyPatch: opts.onApplyPatch,
      });
      applied = result.applied;
      workingDraft = result.draft;
    });

    if (!opts.includeImage || !opts.sdEnabled) {
      opts.onStepSkipped(
        "visual_prompt",
        opts.sdEnabled
          ? "Visual step turned off for this run"
          : "Enable post images in Settings",
      );
      opts.onStepSkipped("visual_gen", "Skipped");
    } else if (!hasPostTextForImage(workingDraft)) {
      opts.onStepSkipped("visual_prompt", "Add hook or body first (section 2)");
      opts.onStepSkipped("visual_gen", "Skipped");
    } else {
      await runTimed("visual_prompt", async () => {
        const { prompt, source } = await suggestPostImagePromptClient({
          postId: opts.postId,
          draft: workingDraft,
          imageStyle: opts.imageStyle,
        });
        imagePrompt = prompt;
        return source === "llm"
          ? "Suggested by AI from your post"
          : "Suggested from post (template)";
      });

      await runTimed("visual_gen", async () => {
        const data = await generatePostImageClient({
          postId: opts.postId,
          draft: workingDraft,
          imageStyle: opts.imageStyle,
          autoFromPost: true,
        });
        imageGenerated = true;
        const style =
          data.imageStyle === "text_card" ? "text_card" : opts.imageStyle;
        opts.onMediaItem({
          url: data.imageUrl,
          filename: data.filename,
          style,
          note: (data.prompt ?? imagePrompt).slice(0, 120),
          alt:
            style === "text_card"
              ? "Generated quote graphic"
              : "Generated post photo",
        });
      });
    }

    await runTimed(
      "review",
      async () => undefined,
      "Save post → Mark ready for extension",
    );

    const doneDef = stepDef("done");
    opts.onStepStart("done");
    opts.onStepDone("done");
    opts.onXp(doneDef.xp);

    return { ok: true, threadId, applied, imageGenerated };
  } catch (e) {
    const err = e as Error & {
      coachDebug?: import("@/lib/coachDebug").BrandCoachTurnDebug;
      needsComplement?: PostAutopilotComplementRequest;
      cancelled?: boolean;
    };
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(e),
      failedStep,
      coachDebug: err.coachDebug ?? lastCoachDebug,
      needsComplement: err.needsComplement,
      cancelled: err.cancelled,
    };
  }
}
