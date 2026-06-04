"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { CoachDraftPayload } from "@/components/PostWritingAssistant";
import type { PostFormPatch } from "@/components/ContentPostWorkspace";
import { CoachDebugPanel } from "@/components/CoachDebugPanel";
import { AutopilotConfetti } from "@/components/post-autopilot/AutopilotConfetti";
import { PostAutopilotFinale } from "@/components/post-autopilot/PostAutopilotFinale";
import { PostAutopilotPipeline, type StepUiState } from "@/components/post-autopilot/PostAutopilotPipeline";
import type { BrandCoachTurnDebug } from "@/lib/coachDebug";
import {
  POST_AUTOPILOT_MIN_BRIEF_CHARS,
  POST_AUTOPILOT_STEPS,
  POST_AUTOPILOT_TOTAL_XP,
  runPostAutopilot,
  type PostAutopilotComplementRequest,
  type PostAutopilotStepId,
} from "@/lib/postAutopilot";
import type { PostImageStyle } from "@/lib/postImageStyle";

function initialStepStates(): Record<PostAutopilotStepId, StepUiState> {
  const states = {} as Record<PostAutopilotStepId, StepUiState>;
  for (const s of POST_AUTOPILOT_STEPS) {
    states[s.id] = { status: "pending" };
  }
  return states;
}

type PostAutopilotPanelProps = {
  postId: string;
  getDraft: () => CoachDraftPayload & { brandLanguage?: string };
  sdEnabled: boolean;
  imageStyle: PostImageStyle;
  onApplyPatch: (patch: PostFormPatch) => void;
  onMediaItem: (item: {
    kind: "image";
    url: string;
    filename?: string;
    style: PostImageStyle;
    note?: string;
    alt?: string;
  }) => void;
  onScrollToHandoff?: () => void;
  onComplete?: (result: { imageGenerated: boolean }) => void;
};

export function PostAutopilotPanel({
  postId,
  getDraft,
  sdEnabled,
  imageStyle,
  onApplyPatch,
  onMediaItem,
  onScrollToHandoff,
  onComplete,
}: PostAutopilotPanelProps) {
  const [running, setRunning] = useState(false);
  const [complete, setComplete] = useState(false);
  const [showSteps, setShowSteps] = useState(true);
  const [includeImage, setIncludeImage] = useState(sdEnabled);
  const [stepStates, setStepStates] = useState(initialStepStates);
  const [activeStep, setActiveStep] = useState<PostAutopilotStepId | null>(null);
  const [xp, setXp] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [coachDebug, setCoachDebug] = useState<BrandCoachTurnDebug | null>(null);
  const [complementRequest, setComplementRequest] =
    useState<PostAutopilotComplementRequest | null>(null);
  const [complementInput, setComplementInput] = useState("");
  const complementResolverRef = useRef<((value: string | null) => void) | null>(
    null,
  );

  const briefLen = getDraft().ideaNotes?.trim().length ?? 0;
  const canRun = briefLen >= POST_AUTOPILOT_MIN_BRIEF_CHARS && !running;

  const doneCount = useMemo(
    () =>
      POST_AUTOPILOT_STEPS.filter((s) => stepStates[s.id].status === "done").length,
    [stepStates],
  );

  const progressPct = complete
    ? 100
    : Math.round((doneCount / POST_AUTOPILOT_STEPS.length) * 100);

  const setStep = useCallback(
    (id: PostAutopilotStepId, patch: Partial<StepUiState>) => {
      setStepStates((prev) => ({
        ...prev,
        [id]: { ...prev[id], ...patch },
      }));
    },
    [],
  );

  const reset = useCallback(() => {
    setStepStates(initialStepStates());
    setActiveStep(null);
    setXp(0);
    setComplete(false);
    setError(null);
    setCoachDebug(null);
    setShowSteps(true);
    setComplementRequest(null);
    setComplementInput("");
    complementResolverRef.current = null;
  }, []);

  const resolveComplement = useCallback((value: string | null) => {
    complementResolverRef.current?.(value);
    complementResolverRef.current = null;
    setComplementRequest(null);
    setComplementInput("");
  }, []);

  const run = useCallback(async () => {
    if (!canRun) return;
    reset();
    setRunning(true);
    setShowSteps(true);
    setError(null);
    setCoachDebug(null);

    const result = await runPostAutopilot({
      postId,
      getDraft: () => {
        const d = getDraft();
        return {
          title: d.title,
          format: d.format,
          ideaNotes: d.ideaNotes,
          hook: d.hook,
          body: d.body,
          articleBody: d.articleBody,
          language: d.language,
          brandLanguage: d.brandLanguage,
        };
      },
      includeImage,
      imageStyle,
      sdEnabled,
      onApplyPatch,
      onLanguageResolved: (label) => setStep("prepare", { detail: label }),
      onNeedsComplement: (request) =>
        new Promise<string | null>((resolve) => {
          complementResolverRef.current = resolve;
          setComplementRequest(request);
          setComplementInput("");
        }),
      onStepStart: (id, detail) => {
        setActiveStep(id);
        setStep(id, { status: "active", detail });
      },
      onStepDone: (id, detail) => {
        setStep(id, { status: "done", detail });
      },
      onStepSkipped: (id, reason) => {
        setStep(id, { status: "skipped", detail: reason });
      },
      onXp: (delta) => setXp((x) => Math.min(POST_AUTOPILOT_TOTAL_XP, x + delta)),
      onMediaItem: (item) => {
        onMediaItem({ kind: "image", ...item });
      },
    });

    setRunning(false);
    setActiveStep(null);

    if (!result.ok) {
      if (result.cancelled) {
        setError(null);
        return;
      }
      setError(result.error);
      if (result.coachDebug) setCoachDebug(result.coachDebug);
      if (result.failedStep) {
        setStep(result.failedStep, {
          status: "error",
          detail: result.error,
        });
      }
      return;
    }

    setComplete(true);
    setXp(POST_AUTOPILOT_TOTAL_XP);
    setShowSteps(false);
    onScrollToHandoff?.();
    onComplete?.({ imageGenerated: result.imageGenerated });
  }, [
    canRun,
    reset,
    getDraft,
    postId,
    includeImage,
    imageStyle,
    sdEnabled,
    onApplyPatch,
    onMediaItem,
    onScrollToHandoff,
    onComplete,
    setStep,
  ]);

  const heroClass = [
    "clin-autopilot-hero clin-card overflow-hidden p-5",
    running ? "is-running" : "",
    complete ? "is-complete" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section data-tour="autopilot" className={heroClass}>
      <AutopilotConfetti active={complete} />

      <div className="relative z-[1]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--clin-accent)]">
              Autopilot
            </p>
            <h2 className="clin-section-title mt-0.5">
              {complete ? "Post generated" : "Generate full LinkedIn post"}
            </h2>
            <p className="mt-1 max-w-xl text-sm text-[var(--clin-muted)]">
              {complete
                ? "Confetti moment — your draft is below. Tweak, save, then mark ready."
                : "Same path as the editor: Prepare → Writing assistant → Apply → Visual → Preview. We may ask for a bit more brief detail."}
            </p>
          </div>
          {!running && !complete ? (
            <button
              type="button"
              className="clin-btn-primary shrink-0"
              disabled={!canRun}
              title={
                canRun
                  ? undefined
                  : `Add at least ${POST_AUTOPILOT_MIN_BRIEF_CHARS} characters in Prepare first`
              }
              onClick={() => void run()}
            >
              Run autopilot
            </button>
          ) : null}
        </div>

        {!complete ? (
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2 text-[var(--clin-text)]">
              <input
                type="checkbox"
                checked={includeImage}
                disabled={running || !sdEnabled}
                onChange={(e) => setIncludeImage(e.target.checked)}
                className="rounded border-[var(--clin-border)]"
              />
              Include visual step
              {!sdEnabled ? (
                <span className="text-xs text-[var(--clin-muted)]">(enable in Settings)</span>
              ) : null}
            </label>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="clin-btn-secondary text-sm" onClick={reset}>
              Run again
            </button>
            <button
              type="button"
              className="clin-link text-sm"
              onClick={() => setShowSteps((s) => !s)}
            >
              {showSteps ? "Hide pipeline" : "Show pipeline"}
            </button>
          </div>
        )}

        {complementRequest && running ? (
          <div className="mt-4 rounded-md border border-[var(--clin-accent)]/40 bg-[var(--clin-surface-muted)]/60 p-4">
            <p className="text-sm font-medium text-[var(--clin-text)]">
              A bit more context needed
            </p>
            <ul className="mt-2 list-inside list-disc text-sm text-[var(--clin-muted)]">
              {complementRequest.questions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
            {complementRequest.coachReply ? (
              <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--clin-text)]">
                <span className="font-medium text-[var(--clin-accent)]">
                  Assistant:
                </span>{" "}
                {complementRequest.coachReply}
              </p>
            ) : null}
            <textarea
              value={complementInput}
              onChange={(e) => setComplementInput(e.target.value)}
              rows={4}
              className="clin-input mt-3 w-full text-sm"
              placeholder="Quotes, audience, angle, or answer to the assistant…"
              autoFocus
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="clin-btn-primary text-sm"
                disabled={complementInput.trim().length < 4}
                onClick={() => resolveComplement(complementInput.trim())}
              >
                Continue autopilot
              </button>
              <button
                type="button"
                className="clin-btn-secondary text-sm"
                onClick={() => resolveComplement(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="mt-3 text-sm text-red-700 dark:text-red-300">{error}</p>
        ) : null}
        {coachDebug ? <CoachDebugPanel debug={coachDebug} /> : null}

        {complete ? (
          <div className="mt-4 border-t border-[var(--clin-border)] pt-4">
            <PostAutopilotFinale
              onGoToHandoff={() => onScrollToHandoff?.()}
            />
          </div>
        ) : null}

        {(running || showSteps) && !complete ? (
          <div className="mt-4 border-t border-[var(--clin-border)] pt-4">
            <PostAutopilotPipeline
              stepStates={stepStates}
              activeStep={activeStep}
              xp={xp}
              running={running}
              progressPct={progressPct}
            />
          </div>
        ) : null}

        {complete && showSteps ? (
          <div className="mt-4 border-t border-[var(--clin-border)] pt-4">
            <PostAutopilotPipeline
              stepStates={stepStates}
              activeStep={null}
              xp={xp}
              running={false}
              progressPct={100}
            />
          </div>
        ) : null}

        {!running && !complete && briefLen < POST_AUTOPILOT_MIN_BRIEF_CHARS ? (
          <p className="mt-3 text-xs text-[var(--clin-muted)]">
            Add your brief in section 1 ({POST_AUTOPILOT_MIN_BRIEF_CHARS}+ characters) to
            unlock.
          </p>
        ) : null}
      </div>
    </section>
  );
}
