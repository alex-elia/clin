"use client";

import { useCallback, useId, useState } from "react";
import { VoiceInputButton } from "@/components/VoiceInputButton";
import { appendTranscriptToText } from "@/lib/speechRecognition";
import {
  COPY_AUDIENCE_LABELS,
  type CopyAudience,
  type CopyField,
} from "@/lib/copyAssistantShared";

type CopyFieldAssistantProps = {
  field: CopyField;
  textareaId: string;
  /** Other input/textarea ids to send as context (e.g. campaign name). */
  contextFieldIds?: string[];
  compact?: boolean;
  /** Speech recognition locale hint */
  language?: string | null;
};

function readFieldValue(id: string): string {
  const el = document.getElementById(id);
  if (!el) return "";
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return el.value;
  }
  return "";
}

export function CopyFieldAssistant({
  field,
  textareaId,
  contextFieldIds = [],
  compact = false,
  language,
}: CopyFieldAssistantProps) {
  const promptId = useId();
  const [audience, setAudience] = useState<CopyAudience>("b2b");
  const [brief, setBrief] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    const trimmed = brief.trim();
    if (trimmed.length < 3) {
      setError("Add a short brief (at least 3 characters).");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const context: Record<string, string> = {
        existingText: readFieldValue(textareaId),
      };
      for (const id of contextFieldIds) {
        const v = readFieldValue(id);
        if (!v) continue;
        if (id === "campaign-name") context.campaignName = v;
        else if (id === "campaign-context") context.campaignContext = v;
        else if (id === "goals-text" || id === "voice-goals-text") context.goalsText = v;
        else if (
          id === "positioning-summary" ||
          id === "voice-positioning-summary"
        ) {
          context.positioningSummary = v;
        }
      }

      const res = await fetch("/api/assistant/generate-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field,
          audience,
          prompt: trimmed,
          context,
        }),
      });
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
        return;
      }
      const target = document.getElementById(textareaId);
      if (
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLInputElement
      ) {
        target.value = data.text ?? "";
        target.dispatchEvent(new Event("input", { bubbles: true }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [audience, brief, contextFieldIds, field, textareaId]);

  return (
    <div
      className={`rounded-lg border border-[var(--clin-border)] bg-[var(--clin-surface-muted)] ${
        compact ? "p-2.5" : "p-3"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--clin-muted)]">
        Copy assistant
      </p>
      <p className="mt-1 text-xs text-[var(--clin-muted)]">
        Brief + audience → AI fills the field below. Use Mic to dictate (Chrome / Edge).
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        {(Object.keys(COPY_AUDIENCE_LABELS) as CopyAudience[]).map((key) => {
          const meta = COPY_AUDIENCE_LABELS[key];
          const on = audience === key;
          return (
            <button
              key={key}
              type="button"
              title={meta.hint}
              onClick={() => setAudience(key)}
              className={
                on
                  ? "clin-pill clin-pill-active cursor-pointer"
                  : "clin-pill cursor-pointer hover:bg-[var(--clin-primary-soft)]"
              }
            >
              {meta.label}
            </button>
          );
        })}
      </div>

      <label className="mt-2 block text-xs text-[var(--clin-muted)]" htmlFor={promptId}>
        Your brief
      </label>
      <div className="clin-voice-field mt-1">
        <textarea
          id={promptId}
          rows={compact ? 2 : 3}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="Speak or type what you want in the field below…"
          className="clin-input min-h-0 flex-1 text-sm"
          disabled={loading}
        />
        <VoiceInputButton
          language={language}
          size="sm"
          disabled={loading}
          onAppend={(text) => setBrief((b) => appendTranscriptToText(b, text))}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void generate()}
          disabled={loading}
          className="clin-btn-secondary text-xs disabled:opacity-50"
        >
          {loading ? "Generating…" : "Generate into field"}
        </button>
        <span className="text-[10px] text-[var(--clin-muted)]">
          {COPY_AUDIENCE_LABELS[audience].hint}
        </span>
      </div>

      {error ? (
        <p className="mt-2 text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
