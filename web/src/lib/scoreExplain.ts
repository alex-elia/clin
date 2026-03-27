import type { contacts } from "@/db/schema";

type ContactScores = Pick<
  typeof contacts.$inferSelect,
  | "relationshipScore"
  | "businessScore"
  | "cleanupScore"
  | "relationshipReasons"
  | "businessReasons"
  | "cleanupReasons"
>;

/** Stored as JSON array of strings from scoring. */
export function parseScoreReasons(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) && v.every((x) => typeof x === "string") ? v : [];
  } catch {
    return [];
  }
}

/** Multi-line string for native `title` tooltips on the contacts table. */
export function scoresTooltipLines(c: ContactScores): string {
  const r = parseScoreReasons(c.relationshipReasons);
  const b = parseScoreReasons(c.businessReasons);
  const cl = parseScoreReasons(c.cleanupReasons);
  return [
    `R (relationship) ${c.relationshipScore}/100 — ${r.length ? r.join(" ") : "Recency from your last Clin capture of this profile."}`,
    `B (business) ${c.businessScore}/100 — ${b.length ? b.join(" ") : "Heuristic from headline keywords + company field."}`,
    `C (cleanup) ${c.cleanupScore}/100 — ${cl.length ? cl.join(" ") : "Stale / thin profile signals; for your review only."}`,
  ].join("\n");
}

/**
 * User-facing copy. Keep aligned with rules in `scoring.ts` (version 1).
 */
export const SCORE_LEGEND = {
  title: "What R, B, and C mean",
  intro:
    "Scores are 0–100 heuristics from data Clin has captured locally. They are not LinkedIn engagement metrics and not legal or HR advice.",
  r: {
    label: "R — Relationship (recency)",
    body:
      "Mostly driven by how long ago Clin last captured this profile: very recent → high R; months ago → low R. If there is no capture time yet, R starts conservative.",
  },
  b: {
    label: "B — Business (rough relevance)",
    body:
      "Starts from a baseline, then bumps up if the headline matches common business role keywords (e.g. founder, sales, hiring) and if a company name was captured. Useful for sorting “who might matter for work” — not a quality judgment.",
  },
  c: {
    label: "C — Cleanup (network hygiene)",
    body:
      "Higher when the relationship score is low (stale) and/or the profile looks incomplete in Clin (e.g. missing headline). Very high C contributes to the remove_candidate segment so you can review whether to disconnect — Clin never removes anyone for you.",
  },
  example:
    "Example: R85 B20 C30 is a recently seen contact (strong R), weak business-keyword signal (B20), and moderate cleanup pressure — often from a thin capture (e.g. missing headline) rather than only “old.”",
} as const;
