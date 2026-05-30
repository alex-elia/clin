"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  getSpeechSupport,
  speechLangFromPreference,
  startSpeechListen,
  type SpeechLangCode,
} from "@/lib/speechRecognition";

export type VoiceInputButtonProps = {
  /** Called with each finalized phrase (append to your field). */
  onAppend: (text: string) => void;
  /** `fr` | `en` | `auto` — maps to fr-FR / en-US */
  language?: string | null;
  disabled?: boolean;
  size?: "sm" | "md";
  /** Accessible label override */
  label?: string;
  className?: string;
};

export function VoiceInputButton({
  onAppend,
  language,
  disabled = false,
  size = "md",
  label = "Voice input",
  className = "",
}: VoiceInputButtonProps) {
  const hintId = useId();
  const [mounted, setMounted] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => setMounted(true), []);

  const support = mounted
    ? getSpeechSupport()
    : ({ supported: true } as const);

  const lang: SpeechLangCode = mounted
    ? speechLangFromPreference(language === "auto" ? null : language)
    : "en-US";

  const buttonTitle = !mounted
    ? label
    : !support.supported
      ? support.reason
      : listening
        ? "Stop listening"
        : `${label} (${lang})`;

  const stop = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    setListening(false);
    setInterim("");
  }, []);

  useEffect(() => () => stop(), [stop]);

  const toggle = useCallback(() => {
    if (disabled) return;
    if (!support.supported) {
      setError(support.reason);
      return;
    }
    if (listening) {
      stop();
      return;
    }
    setError(null);
    setInterim("");
    stopRef.current = startSpeechListen({
      lang,
      onFinal: (text) => {
        onAppend(text);
        setInterim("");
      },
      onInterim: (text) => setInterim(text),
      onError: (msg) => {
        setError(msg);
        stop();
      },
      onStateChange: (active) => {
        if (!active) {
          stopRef.current = null;
          setListening(false);
          setInterim("");
        } else {
          setListening(true);
        }
      },
    });
  }, [disabled, support, listening, lang, onAppend, stop]);

  const sizeClass =
    size === "sm"
      ? "h-9 w-9 text-base"
      : "h-11 w-11 text-lg";

  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      <button
        type="button"
        aria-label={listening ? "Stop voice input" : label}
        aria-pressed={listening}
        aria-describedby={error || interim ? hintId : undefined}
        disabled={disabled}
        title={buttonTitle}
        suppressHydrationWarning
        onClick={() => toggle()}
        className={`flex shrink-0 items-center justify-center rounded-full border transition-colors ${sizeClass} ${
          listening
            ? "border-red-300 bg-red-50 text-red-700 animate-pulse dark:border-red-800 dark:bg-red-950/50 dark:text-red-200"
            : "border-[var(--clin-border)] bg-[var(--clin-surface)] text-[var(--clin-accent)] hover:bg-[var(--clin-primary-soft)]"
        } disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <span aria-hidden className="text-xs font-bold uppercase tracking-wide">
          {listening ? "Stop" : "Mic"}
        </span>
      </button>
      <p id={hintId} className="max-w-[10rem] text-center text-[10px] leading-tight text-[var(--clin-muted)]">
        {error ? (
          <span className="text-red-700 dark:text-red-300">{error}</span>
        ) : listening ? (
          interim ? (
            <span className="italic">{interim}</span>
          ) : (
            "Listening…"
          )
        ) : (
          "Voice"
        )}
      </p>
    </div>
  );
}
