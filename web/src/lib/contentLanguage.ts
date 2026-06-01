/**
 * LinkedIn post language: brand default, per-post override, or heuristic detection.
 */

export const CONTENT_LANGUAGE_PREFS = ["auto", "fr", "en"] as const;
export type ContentLanguagePreference = (typeof CONTENT_LANGUAGE_PREFS)[number];

export const POST_LANGUAGES = ["fr", "en"] as const;
export type PostLanguage = (typeof POST_LANGUAGES)[number];

export type ResolvedPostLanguage = PostLanguage;

export type LanguageResolutionSource =
  | "post"
  | "brand"
  | "detected_post"
  | "detected_message"
  | "default";

export type ResolvedLanguage = {
  language: ResolvedPostLanguage;
  source: LanguageResolutionSource;
};

export const CONTENT_LANGUAGE_PREF_LABELS: Record<
  ContentLanguagePreference,
  { label: string; hint: string }
> = {
  auto: {
    label: "Auto-detect",
    hint: "From post text and your messages to the assistant",
  },
  fr: { label: "French", hint: "Posts and coach replies in French" },
  en: { label: "English", hint: "Posts and coach replies in English" },
};

export const POST_LANGUAGE_LABELS: Record<PostLanguage, string> = {
  fr: "French",
  en: "English",
};

export function parseContentLanguagePreference(
  raw: string | null | undefined,
): ContentLanguagePreference {
  if (raw === "fr" || raw === "en") return raw;
  return "auto";
}

export function parsePostLanguage(
  raw: string | null | undefined,
): PostLanguage | null {
  if (raw === "fr" || raw === "en") return raw;
  return null;
}

const FR_MARKERS =
  /\b(le|la|les|des|une|un|et|est|pour|avec|dans|sur|pas|plus|nous|vous|je|tu|ils|elles|être|avoir|fait|faire|très|aussi|comme|mais|donc|chez|aux|du|de|d')\b|à|é|è|ê|ë|ç|ù|û|î|ï|œ/gi;

const EN_MARKERS =
  /\b(the|and|with|your|for|this|that|from|have|has|are|was|were|will|would|about|into|their|our|you|not|but|can|how|what|when|why)\b/gi;

/** Lightweight heuristic (no extra LLM call). */
export function detectPostLanguage(text: string): ResolvedPostLanguage | null {
  const sample = text.trim().slice(0, 8000);
  if (sample.length < 16) return null;

  const fr = (sample.match(FR_MARKERS) ?? []).length;
  const en = (sample.match(EN_MARKERS) ?? []).length;

  if (fr === 0 && en === 0) return null;
  if (fr >= en * 1.15) return "fr";
  if (en >= fr * 1.15) return "en";
  if (fr > en) return "fr";
  if (en > fr) return "en";
  return null;
}

export function resolveContentLanguage(input: {
  brandPreference: ContentLanguagePreference;
  postLanguage?: string | null;
  postText?: string;
  userMessage?: string;
  defaultLanguage?: ResolvedPostLanguage;
}): ResolvedLanguage {
  const postLang = parsePostLanguage(input.postLanguage ?? null);
  if (postLang) {
    return { language: postLang, source: "post" };
  }

  if (input.brandPreference === "fr" || input.brandPreference === "en") {
    return { language: input.brandPreference, source: "brand" };
  }

  if (input.userMessage?.trim()) {
    const fromMsg = detectPostLanguage(input.userMessage);
    if (fromMsg) {
      return { language: fromMsg, source: "detected_message" };
    }
  }

  if (input.postText?.trim()) {
    const fromPost = detectPostLanguage(input.postText);
    if (fromPost) {
      return { language: fromPost, source: "detected_post" };
    }
  }

  return {
    language: input.defaultLanguage ?? "fr",
    source: "default",
  };
}

export function languageResolutionHint(resolved: ResolvedLanguage): string {
  if (resolved.source === "post") {
    return `Post language: ${POST_LANGUAGE_LABELS[resolved.language]}`;
  }
  if (resolved.source === "brand") {
    return `Default language: ${POST_LANGUAGE_LABELS[resolved.language]}`;
  }
  if (resolved.source === "detected_post") {
    return `Detected from post: ${POST_LANGUAGE_LABELS[resolved.language]}`;
  }
  if (resolved.source === "detected_message") {
    return `Detected from your message: ${POST_LANGUAGE_LABELS[resolved.language]}`;
  }
  return `Default: ${POST_LANGUAGE_LABELS[resolved.language]}`;
}

export function buildCoachLanguageInstruction(
  language: ResolvedPostLanguage,
): string {
  const name = POST_LANGUAGE_LABELS[language];
  return `Language: Write hook, body, articleBody, and your conversational replies in ${name}. Closing lines and hashtags use the same language, woven in naturally (never labeled "CTA" or "**CTA:**"). Do not mix languages unless the user explicitly asks.`;
}

export function buildPostCopyLanguageInstruction(
  language: ResolvedPostLanguage,
): string {
  const name = POST_LANGUAGE_LABELS[language];
  return `Write in ${name} only.`;
}

export function postTextForLanguageDetection(parts: {
  title?: string | null;
  ideaNotes?: string | null;
  hook?: string | null;
  body?: string | null;
  articleBody?: string | null;
}): string {
  return [parts.title, parts.ideaNotes, parts.hook, parts.body, parts.articleBody]
    .filter((s) => typeof s === "string" && s.trim())
    .join("\n\n");
}
