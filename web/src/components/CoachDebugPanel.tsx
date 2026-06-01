"use client";

import type { BrandCoachTurnDebug } from "@/lib/coachDebug";

type CoachDebugPanelProps = {
  debug: BrandCoachTurnDebug;
};

export function CoachDebugPanel({ debug }: CoachDebugPanelProps) {
  const p = debug.parse;
  return (
    <details className="mt-3 rounded-md border border-amber-200 bg-amber-50/80 p-3 text-xs dark:border-amber-900/50 dark:bg-amber-950/30">
      <summary className="cursor-pointer font-semibold text-amber-950 dark:text-amber-100">
        Coach / LLM debug
      </summary>
      <dl className="mt-2 space-y-1 text-amber-950/90 dark:text-amber-100/90">
        <div>
          <dt className="inline font-medium">Model: </dt>
          <dd className="inline">
            {debug.provider} / {debug.model}
          </dd>
        </div>
        <div>
          <dt className="inline font-medium">coach-actions block: </dt>
          <dd className="inline">{p.hasCoachActionsBlock ? "yes" : "no"}</dd>
        </div>
        <div>
          <dt className="inline font-medium">JSON extracted: </dt>
          <dd className="inline">{p.jsonExtracted ? "yes" : "no"}</dd>
        </div>
        <div>
          <dt className="inline font-medium">Schema valid: </dt>
          <dd className="inline">{p.schemaValid ? "yes" : "no"}</dd>
        </div>
        <div>
          <dt className="inline font-medium">Actions count: </dt>
          <dd className="inline">{p.actionsCount}</dd>
        </div>
        {p.schemaError ? (
          <div>
            <dt className="font-medium">Schema error</dt>
            <dd className="mt-0.5 font-mono">{p.schemaError}</dd>
          </div>
        ) : null}
        {debug.replyPreview ? (
          <div>
            <dt className="font-medium">Reply preview</dt>
            <dd className="mt-0.5 whitespace-pre-wrap font-mono text-[11px]">
              {debug.replyPreview}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="font-medium">Raw tail (model output)</dt>
          <dd className="mt-0.5 max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-[10px]">
            {p.rawTailPreview}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-[10px] text-amber-800 dark:text-amber-200/80">
        Full history: Settings → AI call logs
      </p>
    </details>
  );
}
