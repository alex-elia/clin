"use client";

import {
  POST_AUTOPILOT_STEPS,
  POST_AUTOPILOT_TOTAL_XP,
  type PostAutopilotStepId,
  type PostAutopilotStepStatus,
} from "@/lib/postAutopilot";

export type StepUiState = {
  status: PostAutopilotStepStatus;
  detail?: string;
};

type PostAutopilotPipelineProps = {
  stepStates: Record<PostAutopilotStepId, StepUiState>;
  activeStep: PostAutopilotStepId | null;
  xp: number;
  running: boolean;
  complete: boolean;
  progressPct: number;
};

export function PostAutopilotPipeline({
  stepStates,
  activeStep,
  xp,
  running,
  complete,
  progressPct,
}: PostAutopilotPipelineProps) {
  const level =
    xp >= POST_AUTOPILOT_TOTAL_XP * 0.85
      ? "Publisher"
      : xp >= POST_AUTOPILOT_TOTAL_XP * 0.5
        ? "Storyteller"
        : "Creator";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="clin-autopilot-progress-track min-w-[12rem] flex-1">
          <div
            className="clin-autopilot-progress-fill"
            style={{ width: `${Math.min(100, progressPct)}%` }}
          />
        </div>
        <div
          className="clin-xp-badge rounded-full border border-[var(--clin-border)] bg-[var(--clin-surface)] px-3 py-1 text-xs font-semibold tabular-nums text-[var(--clin-text)]"
          aria-live="polite"
        >
          <span className="text-[var(--clin-accent)]">{xp}</span>
          <span className="text-[var(--clin-muted)]"> / {POST_AUTOPILOT_TOTAL_XP} XP</span>
          <span className="ml-2 text-[var(--clin-muted)]">· {level}</span>
        </div>
      </div>

      <ol className="space-y-0" aria-label="Generation progress">
        {POST_AUTOPILOT_STEPS.map((def) => {
          const ui = stepStates[def.id];
          const isActive = activeStep === def.id && running;
          const classNames = [
            "clin-autopilot-step",
            ui.status === "pending" ? "is-pending" : "",
            isActive || ui.status === "active" ? "is-active" : "",
            ui.status === "done" ? "is-done" : "",
            ui.status === "skipped" ? "is-skipped" : "",
            ui.status === "error" ? "is-error" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <li key={def.id} className={classNames}>
              <span className="clin-autopilot-step-dot" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--clin-text)]">
                  {def.label}
                  {ui.status === "done" ? (
                    <span className="ml-2 text-xs font-normal text-emerald-700 dark:text-emerald-300">
                      ✓
                    </span>
                  ) : null}
                  {ui.status === "skipped" ? (
                    <span className="ml-2 text-xs font-normal text-[var(--clin-muted)]">
                      skipped
                    </span>
                  ) : null}
                  {isActive ? (
                    <span className="ml-2 inline-block h-3 w-3 animate-pulse rounded-full bg-[var(--clin-accent)] align-middle" />
                  ) : null}
                </p>
                <p className="text-xs text-[var(--clin-muted)]">
                  {ui.detail ?? def.subtitle}
                </p>
              </div>
              <span className="text-[10px] font-medium tabular-nums text-[var(--clin-muted)]">
                +{def.xp}
              </span>
            </li>
          );
        })}
      </ol>

    </div>
  );
}
