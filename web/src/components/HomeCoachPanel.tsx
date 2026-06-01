"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { CoachChatComposer } from "@/components/CoachChatComposer";
import { CoachChatThread } from "@/components/CoachChatThread";
import { CoachDebugPanel } from "@/components/CoachDebugPanel";
import type { BrandCoachTurnDebug } from "@/lib/coachDebug";
import type { CoachAction } from "@/lib/brandCoachTypes";
import { HOME_COACH_QUICK_PROMPTS } from "@/lib/homeCoachPrompts";

type HomeCoachPanelProps = {
  brandLanguage?: string | null;
};

export function HomeCoachPanel({ brandLanguage }: HomeCoachPanelProps) {
  const router = useRouter();
  const [threadId, setThreadId] = useState<string | undefined>();
  const [messages, setMessages] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingActions, setPendingActions] = useState<CoachAction[]>([]);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const [coachDebug, setCoachDebug] = useState<BrandCoachTurnDebug | null>(null);

  const quickPrompts =
    brandLanguage === "fr"
      ? [...HOME_COACH_QUICK_PROMPTS.fr]
      : [...HOME_COACH_QUICK_PROMPTS.en];

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
          scope: "home",
        }),
      });
      const data = (await res.json()) as {
        threadId?: string;
        reply?: string;
        actions?: CoachAction[];
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
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  }, [input, loading, threadId]);

  const applyAll = useCallback(async () => {
    if (!pendingActions.length || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/branding/coach/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actions: pendingActions }),
      });
      const data = (await res.json()) as {
        applied?: number;
        createdPostIds?: string[];
      };
      if (!res.ok) {
        setError("Could not apply changes.");
        return;
      }
      setPendingActions([]);
      setStatusLine(
        `Applied ${data.applied ?? 0} change(s). Open Content plan to review your calendar.`,
      );
      router.refresh();
      if (data.createdPostIds?.length) {
        router.push("/branding/calendar");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apply failed.");
    } finally {
      setLoading(false);
    }
  }, [pendingActions, loading, router]);

  return (
    <section
      data-tour="home-coach"
      className="clin-card border-2 border-[var(--clin-accent)]/25 p-5 sm:p-6"
    >
      <h2 className="clin-section-title">Ask Clin</h2>
      <p className="mt-1 text-sm text-[var(--clin-muted)]">
        Plan content, prioritize your week, or get pointed to the right screen.
        When the coach proposes calendar changes, use{" "}
        <strong className="clin-strong">Apply</strong> to save them.
      </p>

      <CoachChatThread
        messages={messages}
        loading={loading}
        assistantLabel="Clin"
        emptyHint={
          messages.length === 0
            ? "Ask about your LinkedIn strategy, content pipeline, or what to do after importing contacts."
            : undefined
        }
      />

      {pendingActions.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--clin-accent)]/30 bg-[var(--clin-accent)]/5 px-3 py-2">
          <span className="text-sm text-[var(--clin-text)]">
            Calendar changes ready
          </span>
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
        <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-200">
          {statusLine}
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-sm text-red-700 dark:text-red-300">{error}</p>
      ) : null}
      {coachDebug ? <CoachDebugPanel debug={coachDebug} /> : null}

      <CoachChatComposer
        input={input}
        onInputChange={setInput}
        onSend={() => void send()}
        loading={loading}
        placeholder="What should I focus on this week?"
        speechLanguage={brandLanguage}
        quickPrompts={messages.length === 0 ? quickPrompts : undefined}
        onQuickPrompt={setInput}
      />
    </section>
  );
}
