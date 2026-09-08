/** Normalized LinkedIn connection degree labels used across Clin. */

export const NORMALIZED_CONNECTION_DEGREES = ["1st", "2nd", "3rd+"] as const;
export type NormalizedConnectionDegree =
  (typeof NORMALIZED_CONNECTION_DEGREES)[number];

/** Stored on contacts after the user confirms a LinkedIn disconnect in Clin. */
export const DISCONNECTED_DEGREE = "disconnected";

export function isDisconnectedDegree(
  degree: string | null | undefined,
): boolean {
  return degree?.trim().toLowerCase() === DISCONNECTED_DEGREE;
}

function cleanDegreeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Parse raw LinkedIn UI text (English or French) into a normalized degree.
 * Mirrors extension `parseConnectionDegree`.
 */
export function parseConnectionDegree(
  text: string | null | undefined,
): NormalizedConnectionDegree | null {
  const t = text?.trim() ? cleanDegreeText(text) : "";
  if (!t) return null;
  if (
    /\b1er\b/i.test(t) ||
    /\b1\s*(?:er|re|st)\b/i.test(t) ||
    /\b1st\b/i.test(t)
  ) {
    return "1st";
  }
  if (
    /\b2e\b/i.test(t) ||
    /\b2\s*(?:e|nd)\b/i.test(t) ||
    /\b2nd\b/i.test(t)
  ) {
    return "2nd";
  }
  if (
    /\b3e\b/i.test(t) ||
    /\b3\s*(?:e|rd)?\+?\b/i.test(t) ||
    /\b3rd/i.test(t)
  ) {
    return "3rd+";
  }
  return null;
}

/** Accept already-normalized values or parse raw labels. */
export function normalizeConnectionDegree(
  degree: string | null | undefined,
): NormalizedConnectionDegree | null {
  if (isDisconnectedDegree(degree)) return null;
  if (!degree?.trim()) return null;
  const trimmed = degree.trim();
  if (
    (NORMALIZED_CONNECTION_DEGREES as readonly string[]).includes(trimmed)
  ) {
    return trimmed as NormalizedConnectionDegree;
  }
  return parseConnectionDegree(trimmed);
}

export function isKnownConnectionDegree(
  degree: string | null | undefined,
): boolean {
  return normalizeConnectionDegree(degree) != null;
}

function parseExtractedJson(raw: string | null): Record<string, unknown> | null {
  if (!raw?.trim()) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Best degree signal from capture history: connections list rows first, then
 * any capture JSON with connectionDegree. Connections page defaults to 1st.
 */
export function resolveDegreeFromCaptures(
  captures: {
    pageType: string;
    extractedJson: string | null;
  }[],
): NormalizedConnectionDegree | null {
  const ordered = [...captures].sort((a, b) => {
    const aConn = a.pageType === "connections" ? 0 : 1;
    const bConn = b.pageType === "connections" ? 0 : 1;
    return aConn - bConn;
  });

  for (const cap of ordered) {
    const json = parseExtractedJson(cap.extractedJson);
    const fromJson = normalizeConnectionDegree(
      typeof json?.connectionDegree === "string"
        ? json.connectionDegree
        : null,
    );
    if (fromJson) return fromJson;
    if (cap.pageType === "connections") return "1st";
  }
  return null;
}

export type ConnectionDegreeBackfillResult = {
  scanned: number;
  updated: number;
  alreadyOk: number;
  noSignal: number;
};
