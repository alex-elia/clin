"use client";

import { useCallback, useState } from "react";
import { CoachDebugPanel } from "@/components/CoachDebugPanel";
import { VoiceInputButton } from "@/components/VoiceInputButton";
import type { BrandCoachTurnDebug } from "@/lib/coachDebug";
import { applyCoachPatchesToForm } from "@/lib/brandCoachClient";
import {
  POST_WRITING_QUICK_PROMPTS_POST,
  POST_WRITING_QUICK_PROMPTS_STUDIO,
} from "@/lib/contentPostWorkflow";
import { appendTranscriptToText } from "@/lib/speechRecognition";
import type { CoachAction } from "@/lib/brandCoachTypes";
import type { PostFormPatch } from "@/components/ContentPostWorkspace";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export type CoachDraftPayload = {
  title?: string;
  format?: string;
  ideaNotes?: string;
  hook?: string;
  body?: string;
  articleBody?: string;
  language?: string;
};

type PostWritingAssistantProps = {
  postId?: string;
  coachDraft?: CoachDraftPayload;
  /** `fr` | `en` | `auto` for speech recognition language */
  speechLanguage?: string | null;
  onApplyPatch: (patch: PostFormPatch) => void;
  /** Studio mode: planning only, no form fill */
  planningOnly?: boolean;
};

export function PostWritingAssistant({
  postId,
  coachDraft,
  speechLanguage,
  onApplyPatch,
  planningOnly = false,
}: PostWritingAssistantProps) {
  const [threadId, setThreadId] = useState<string | undefined>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingActions, setPendingActions] = useState<CoachAction[]>([]);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const [languageHint, setLanguageHint] = useState<string | null>(null);
  const [coachDebug, setCoachDebug] = useState<BrandCoachTurnDebug | null>(null);

  const send = useCallback(async () => {
    const trimmed = input.trim();
    if (trimmed.length < 2 || loading) return;
    setLoading(true);
    setError(null);
    setCoachDebug(null);
    setStatusLine(null);
    setMessages((m) => [...m, { role: "user", content: trimmed }]);
    setInput("");
    try {
      const res = await fetch("/api/branding/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          threadId,
          postId: planningOnly ? undefined : postId,
          draft: coachDraft,
        }),
      });
      const data = (await res.json()) as {
        threadId?: string;
        reply?: string;
        actions?: CoachAction[];
        resolvedLanguage?: string;
        languageHint?: string;
        error?: string;
        debug?: BrandCoachTurnDebug;
      };
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        if (data.debug) setCoachDebug(data.debug);
        return;
      }
      if (data.threadId) setThreadId(data.threadId);
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.reply ?? "" },
      ]);
      if (data.actions?.length) {
        setPendingActions(data.actions);
        setCoachDebug(null);
      } else if (data.debug) {
        setCoachDebug(data.debug);
        setError(
          "Coach replied but sent no form updates (missing or invalid coach-actions block). Expand debug below or check Settings → AI call logs.",
        );
      }
      if (data.resolvedLanguage) {
        setLanguageHint(
          data.languageHint
            ? `${data.resolvedLanguage.toUpperCase()} (${data.languageHint})`
            : data.resolvedLanguage.toUpperCase(),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  }, [input, loading, threadId, postId, planningOnly, coachDraft]);

  const applyAll = useCallback(async () => {
    if (!pendingActions.length || loading) return;
    setLoading(true);
    setError(null);

    if (!planningOnly && postId) {
      applyCoachPatchesToForm(pendingActions, postId, onApplyPatch);
    }

    try {
      const res = await fetch("/api/branding/coach/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actions: pendingActions }),
      });
      const data = (await res.json()) as {
        applied?: number;
        errors?: string[];
        createdPostIds?: string[];
      };
      if (!res.ok) {
        setError("Could not save suggestions.");
        return;
      }
      setPendingActions([]);
      setStatusLine(
        planningOnly
          ? `Applied ${data.applied ?? 0} change(s) to your calendar.`
          : `Filled the post form and saved ${data.applied ?? 0} update(s). Review below, then Save if you edited further.`,
      );
      if (data.createdPostIds?.[0] && planningOnly) {
        window.location.href = `/branding/posts/${data.createdPostIds[0]}`;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apply failed.");
    } finally {
      setLoading(false);
    }
  }, [pendingActions, loading, onApplyPatch, postId, planningOnly]);

  const quickPrompts = planningOnly
    ? [...POST_WRITING_QUICK_PROMPTS_STUDIO]
    : coachDraft?.language === "fr"
      ? [...POST_WRITING_QUICK_PROMPTS_POST.fr]
      : [...POST_WRITING_QUICK_PROMPTS_POST.en];

  return (
    <section
      data-tour="assistant"
      className="clin-card border-2 border-[var(--clin-accent)]/25 p-5"
    >
      <h2 className="clin-section-title">Writing assistant</h2>
      <p className="mt-1 text-sm text-[var(--clin-muted)]">
        One place to ask, iterate, and prefill title, schedule, hook, and full post.
        Use <strong className="clin-strong">Mic</strong> for voice instructions (Chrome / Edge).
        Click <strong className="clin-strong">Apply</strong> to push suggestions into the form.
      </p>
      {languageHint ? (
        <p className="mt-2 text-xs text-[var(--clin-muted)]">
          Language: {languageHint}
        </p>
      ) : null}

      {messages.length > 0 ? (
        <div className="mt-4 max-h-56 space-y-2 overflow-y-auto rounded-md bg-[var(--clin-surface-muted)]/50 p-3">
          {messages.map((m, i) => (
            <div key={i} className="text-sm">
              <span className="font-medium text-[var(--clin-accent)]">
                {m.role === "user" ? "You" : "Assistant"}:
              </span>{" "}
              <span className="whitespace-pre-wrap text-[var(--clin-text)]">
                {m.content}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {pendingActions.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="clin-btn-primary"
            disabled={loading}
            onClick={() => void applyAll()}
          >
            Apply ({pendingActions.length})
          </button>
          <button
            type="button"
            className="clin-btn-secondary text-sm"
            onClick={() => setPendingActions([])}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {statusLine ? (
        <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-200">{statusLine}</p>
      ) : null}
      {error ? <p className="mt-2 text-sm text-red-700 dark:text-red-300">{error}</p> : null}
      {coachDebug ? <CoachDebugPanel debug={coachDebug} /> : null}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {quickPrompts.map((q) => (
          <button
            key={q}
            type="button"
            className="clin-pill text-xs"
            onClick={() => setInput(q)}
          >
            {q.length > 48 ? `${q.slice(0, 48)}…` : q}
          </button>
        ))}
      </div>

      <div className="mt-3 clin-voice-field">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={3}
          placeholder="Speak or type: voice note, full post request, or Q&A…"
          className="clin-input min-h-0 flex-1"
        />
        <VoiceInputButton
          language={speechLanguage ?? coachDraft?.language}
          disabled={loading}
          onAppend={(text) =>
            setInput((prev) => appendTranscriptToText(prev, text))
          }
        />
        <button
          type="button"
          className="clin-btn-primary shrink-0 self-end"
          disabled={loading}
          onClick={() => void send()}
        >
          {loading ? "…" : "Ask"}
        </button>
      </div>
    </section>
  );
}
