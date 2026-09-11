import { extractJsonObjectFromModelText } from "@/lib/llmAnalysis";

const PLACEHOLDER_RE = /^(?:[.…·]+|<\s*invite note\s*>|<\s*the invite note\s*>)$/i;

/** True when the model echoed the JSON example instead of writing a note. */
export function isPlaceholderOutreachMessage(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  return PLACEHOLDER_RE.test(t);
}

function unescapeJsonString(raw: string): string {
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return raw.replace(/\\"/g, '"').replace(/\\n/g, "\n");
  }
}

function messageFromParsed(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const message = (value as { message?: unknown }).message;
  if (typeof message !== "string") return null;
  const trimmed = message.trim();
  if (isPlaceholderOutreachMessage(trimmed)) return null;
  return trimmed;
}

function tryParseObject(jsonStr: string): unknown | null {
  try {
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

/**
 * Recover {"message":"..."} from thinking preambles, fences, or truncated JSON.
 * Returns null when there is no real invite/DM text.
 */
export function parseOutreachDraftMessage(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const extracted = extractJsonObjectFromModelText(trimmed);
  const fromExtract = messageFromParsed(tryParseObject(extracted));
  if (fromExtract) return fromExtract;

  const quoted = trimmed.match(/"message"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (quoted?.[1]) {
    const fromQuoted = unescapeJsonString(quoted[1]).trim();
    if (!isPlaceholderOutreachMessage(fromQuoted)) return fromQuoted;
  }

  return null;
}

export function responseLooksLikeJsonObject(text: string): boolean {
  const extracted = extractJsonObjectFromModelText(text);
  const parsed = tryParseObject(extracted);
  return parsed !== null && typeof parsed === "object";
}
