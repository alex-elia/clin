/**
 * Browser Web Speech API (SpeechRecognition) — local, no server audio upload.
 */

export type SpeechLangCode = "fr-FR" | "en-US";

export function speechLangFromPreference(
  lang: string | null | undefined,
): SpeechLangCode {
  if (lang === "fr") return "fr-FR";
  if (lang === "en") return "en-US";
  if (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("fr")) {
    return "fr-FR";
  }
  return "en-US";
}

export type SpeechSupport =
  | { supported: true }
  | { supported: false; reason: string };

export function getSpeechSupport(): SpeechSupport {
  if (typeof window === "undefined") {
    return { supported: false, reason: "Speech recognition runs in the browser only." };
  }
  const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (!Ctor) {
    return {
      supported: false,
      reason: "Use Chrome or Edge for voice input (Web Speech API).",
    };
  }
  return { supported: true };
}

export function appendTranscriptToText(current: string, chunk: string): string {
  const addition = chunk.trim();
  if (!addition) return current;
  const base = current.trimEnd();
  if (!base) return addition;
  const sep = /[\s\n]$/.test(base) ? "" : " ";
  return `${base}${sep}${addition}`;
}

export function appendTranscriptToFieldById(id: string, chunk: string): void {
  const el = document.getElementById(id);
  if (
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLInputElement
  ) {
    el.value = appendTranscriptToText(el.value, chunk);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

export type StartSpeechListenOptions = {
  lang?: SpeechLangCode;
  onFinal: (text: string) => void;
  onInterim?: (text: string) => void;
  onError?: (message: string) => void;
  onStateChange?: (listening: boolean) => void;
};

export function startSpeechListen(
  options: StartSpeechListenOptions,
): () => void {
  const support = getSpeechSupport();
  if (!support.supported) {
    options.onError?.(support.reason);
    return () => {};
  }

  const Ctor = (window.SpeechRecognition ?? window.webkitSpeechRecognition)!;

  const rec = new Ctor();
  rec.lang = options.lang ?? speechLangFromPreference(null);
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  let stopped = false;

  rec.onstart = () => options.onStateChange?.(true);

  rec.onresult = (event: SpeechRecognitionEvent) => {
    let interim = "";
    let finalText = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const text = result[0]?.transcript ?? "";
      if (result.isFinal) finalText += text;
      else interim += text;
    }
    if (interim.trim()) options.onInterim?.(interim.trim());
    if (finalText.trim()) options.onFinal(finalText.trim());
  };

  rec.onerror = (event: SpeechRecognitionErrorEvent) => {
    if (event.error === "aborted" || stopped) return;
    const messages: Record<string, string> = {
      "not-allowed": "Microphone permission denied. Allow mic access for this site.",
      "no-speech": "No speech detected. Try again closer to the mic.",
      "network": "Speech recognition needs a network connection in this browser.",
      "audio-capture": "No microphone found.",
    };
    options.onError?.(messages[event.error] ?? `Speech error: ${event.error}`);
    options.onStateChange?.(false);
  };

  rec.onend = () => {
    options.onStateChange?.(false);
  };

  try {
    rec.start();
  } catch (e) {
    options.onError?.(
      e instanceof Error ? e.message : "Could not start speech recognition.",
    );
    return () => {};
  }

  return () => {
    stopped = true;
    try {
      rec.stop();
    } catch {
      /* ignore */
    }
    options.onStateChange?.(false);
  };
}
