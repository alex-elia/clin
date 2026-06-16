/** Posts older than this are omitted from prompts and engage targets. */
export const MAX_RELEVANT_POST_AGE_DAYS = 365;

export type ProfilePostLike = {
  text?: string;
  ageLabel?: string;
};

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  january: 0,
  janv: 0,
  feb: 1,
  february: 1,
  fév: 1,
  fevr: 1,
  mar: 2,
  march: 2,
  mars: 2,
  apr: 3,
  april: 3,
  avr: 3,
  mai: 4,
  may: 4,
  jun: 5,
  june: 5,
  juin: 5,
  jul: 6,
  july: 6,
  juil: 6,
  aug: 7,
  august: 7,
  août: 7,
  aout: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  déc: 11,
  dec: 11,
  december: 11,
};

function daysBetween(a: Date, b: Date): number {
  return Math.floor(Math.abs(a.getTime() - b.getTime()) / 86_400_000);
}

function parseMonthName(token: string): number | null {
  const key = token.toLowerCase().replace(/\./g, "").slice(0, 5);
  for (const [name, idx] of Object.entries(MONTH_INDEX)) {
    if (key === name || key.startsWith(name.slice(0, 3))) return idx;
  }
  return null;
}

function parseAbsoluteDate(label: string, now: Date): Date | null {
  const s = label.toLowerCase().replace(/\s+/g, " ").trim();

  const named =
    s.match(
      /\b(jan(?:v|uary)?|f[eé]v(?:r|ruary)?|mar(?:s|ch)?|avr|apr(?:il)?|mai|may|juin|jun(?:e)?|juil|jul(?:y)?|ao[uû]t|aug(?:ust)?|sep(?:t)?|oct(?:obre|ober)?|nov(?:embre)?|d[eé]c(?:embre)?)\s+(\d{1,2})(?:,?\s+(\d{4}))?\b/i,
    ) ||
    s.match(
      /\b(\d{1,2})\s+(jan(?:v)?|f[eé]v|mar|avr|mai|juin|juil|ao[uû]t|sep|oct|nov|d[eé]c)\w*(?:\s+(\d{4}))?\b/i,
    );

  if (named) {
    let month: number | null = null;
    let day: number | null = null;
    let year: number | null = null;
    if (/^\d/.test(named[0])) {
      day = parseInt(named[1], 10);
      month = parseMonthName(named[2]);
      year = named[3] ? parseInt(named[3], 10) : null;
    } else {
      month = parseMonthName(named[1]);
      day = parseInt(named[2], 10);
      year = named[3] ? parseInt(named[3], 10) : null;
    }
    if (month == null || day == null) return null;
    if (year == null) {
      year = now.getFullYear();
      const candidate = new Date(year, month, day);
      if (candidate.getTime() > now.getTime()) year -= 1;
    }
    return new Date(year, month, day);
  }

  const yearOnly = s.match(/\b(20\d{2})\b/);
  if (yearOnly) {
    return new Date(parseInt(yearOnly[1], 10), 0, 1);
  }

  return null;
}

/**
 * True when LinkedIn's age label indicates the post is older than one year.
 * Unknown labels are treated as not stale (kept) but prompts still warn the model.
 */
export function isStaleLinkedInPostAge(
  ageLabel: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const raw = ageLabel?.trim();
  if (!raw) return false;

  const s = raw.toLowerCase().replace(/\s+/g, " ").trim();
  if (/^(today|yesterday|hier|aujourd)/i.test(s)) return false;

  const years = s.match(/(\d+)\s*(?:y|yr|yrs|year|years|ans|an)\b/);
  if (years) return parseInt(years[1], 10) >= 1;

  const months = s.match(/(\d+)\s*(?:mo|mos|month|months|mois)\b/);
  if (months) return parseInt(months[1], 10) >= 12;

  const weeks = s.match(
    /(\d+)\s*(?:w|wk|wks|week|weeks|sem|semaine|semaines)\b/,
  );
  if (weeks) return parseInt(weeks[1], 10) * 7 > MAX_RELEVANT_POST_AGE_DAYS;

  const days = s.match(/(\d+)\s*(?:d|day|days|j|jour|jours)\b/);
  if (days) return parseInt(days[1], 10) > MAX_RELEVANT_POST_AGE_DAYS;

  if (
    /(\d+)\s*(?:h|hr|hour|hours|heure|heures|min|mins|minute|minutes)\b/.test(
      s,
    )
  ) {
    return false;
  }

  const abs = parseAbsoluteDate(s, now);
  if (abs) return daysBetween(now, abs) > MAX_RELEVANT_POST_AGE_DAYS;

  return false;
}

export function filterRecentProfilePosts<T extends ProfilePostLike>(
  posts: T[] | null | undefined,
  now: Date = new Date(),
): T[] {
  if (!Array.isArray(posts)) return [];
  return posts.filter((p) => {
    if (!p || typeof p !== "object") return false;
    const text =
      typeof p.text === "string" ? p.text.trim() : "";
    if (!text) return false;
    return !isStaleLinkedInPostAge(p.ageLabel, now);
  });
}

export function pickFirstRecentPost<T extends ProfilePostLike>(
  posts: T[] | null | undefined,
  now: Date = new Date(),
): T | null {
  const recent = filterRecentProfilePosts(posts, now);
  return recent[0] ?? null;
}

export const POST_RECENCY_LLM_RULE = `Only reference LinkedIn posts or public activity from the last ${MAX_RELEVANT_POST_AGE_DAYS} days (~1 year). Never quote, paraphrase, or hook off older posts — use current profile/headline/company context instead.`;

export const POST_RECENCY_PROMPT_EMPTY_NOTE =
  "No LinkedIn posts captured within the last year (older activity omitted).";
