"use client";

import { CoachMessageBody } from "@/lib/coachMarkdown";

export type CoachChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type CoachChatThreadProps = {
  messages: CoachChatMessage[];
  loading?: boolean;
  assistantLabel?: string;
  emptyHint?: string;
};

export function CoachChatThread({
  messages,
  loading = false,
  assistantLabel = "Clin",
  emptyHint,
}: CoachChatThreadProps) {
  if (messages.length === 0 && !loading && !emptyHint) return null;

  return (
    <div
      className="mt-4 max-h-[min(28rem,60vh)] space-y-3 overflow-y-auto rounded-xl border border-[var(--clin-border)] bg-[var(--clin-surface-muted)]/40 p-3 sm:p-4"
      aria-live="polite"
    >
      {messages.length === 0 && emptyHint ? (
        <p className="text-sm text-[var(--clin-muted)]">{emptyHint}</p>
      ) : null}

      {messages.map((m, i) => (
        <CoachChatBubble
          key={i}
          role={m.role}
          content={m.content}
          assistantLabel={assistantLabel}
        />
      ))}

      {loading ? (
        <div className="flex justify-start">
          <div className="rounded-2xl border border-[var(--clin-border)] bg-[var(--clin-surface)] px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--clin-muted)]">
              {assistantLabel}
            </p>
            <p className="mt-1 text-sm text-[var(--clin-muted)]">Thinking…</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CoachChatBubble({
  role,
  content,
  assistantLabel,
}: {
  role: "user" | "assistant";
  content: string;
  assistantLabel: string;
}) {
  const isUser = role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[min(100%,36rem)] ${
          isUser
            ? "rounded-2xl rounded-br-md bg-[var(--clin-accent)] px-3.5 py-2.5 text-white shadow-sm"
            : "rounded-2xl rounded-bl-md border border-[var(--clin-border)] bg-[var(--clin-surface)] px-3.5 py-3 shadow-sm"
        }`}
      >
        <p
          className={`mb-1 text-[10px] font-semibold uppercase tracking-wide ${
            isUser ? "text-white/80" : "text-[var(--clin-muted)]"
          }`}
        >
          {isUser ? "You" : assistantLabel}
        </p>
        {isUser ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{content}</p>
        ) : (
          <CoachMessageBody content={content} />
        )}
      </div>
    </div>
  );
}
