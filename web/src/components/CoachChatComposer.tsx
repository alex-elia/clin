"use client";

import { VoiceInputButton } from "@/components/VoiceInputButton";
import { appendTranscriptToText } from "@/lib/speechRecognition";

type CoachChatComposerProps = {
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  loading?: boolean;
  placeholder?: string;
  sendLabel?: string;
  speechLanguage?: string | null;
  quickPrompts?: string[];
  onQuickPrompt?: (text: string) => void;
};

export function CoachChatComposer({
  input,
  onInputChange,
  onSend,
  loading = false,
  placeholder = "Ask a question…",
  sendLabel = "Send",
  speechLanguage,
  quickPrompts,
  onQuickPrompt,
}: CoachChatComposerProps) {
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!loading && input.trim().length >= 2) onSend();
    }
  }

  return (
    <div className="mt-4 space-y-3">
      {quickPrompts && quickPrompts.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {quickPrompts.map((q) => (
            <button
              key={q}
              type="button"
              className="clin-pill max-w-full truncate text-left text-xs"
              title={q}
              onClick={() => onQuickPrompt?.(q)}
            >
              {q.length > 56 ? `${q.slice(0, 56)}…` : q}
            </button>
          ))}
        </div>
      ) : null}

      <div className="rounded-xl border border-[var(--clin-border)] bg-[var(--clin-surface)] p-2">
        <textarea
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          placeholder={placeholder}
          disabled={loading}
          className="clin-input min-h-[4.5rem] w-full resize-y border-0 bg-transparent shadow-none focus:ring-0"
        />
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2 border-t border-[var(--clin-border)] pt-2">
          <VoiceInputButton
            language={speechLanguage ?? undefined}
            disabled={loading}
            onAppend={(text) =>
              onInputChange(appendTranscriptToText(input, text))
            }
          />
          <button
            type="button"
            className="clin-btn-primary min-w-[5.5rem]"
            disabled={loading || input.trim().length < 2}
            onClick={() => onSend()}
          >
            {loading ? "…" : sendLabel}
          </button>
        </div>
      </div>
      <p className="text-center text-[11px] text-[var(--clin-muted)]">
        Enter to send · Shift+Enter for a new line
      </p>
    </div>
  );
}
