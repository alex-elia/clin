/**
 * Normalize extension capture payloads before Zod validation.
 * Scrapers often emit long experience/education lines or relative LinkedIn URLs.
 */
import { canonicalizeLinkedInUrl } from "@/lib/url";

export function ensureLinkedInAbsoluteUrl(
  raw: string | null | undefined,
): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  if (!t) return undefined;
  let candidate = t;
  if (!/^https?:\/\//i.test(candidate)) {
    if (candidate.startsWith("/")) {
      candidate = `https://www.linkedin.com${candidate}`;
    } else if (/^(www\.)?linkedin\.com\//i.test(candidate)) {
      candidate = `https://${candidate.replace(/^https?:\/\//i, "")}`;
    } else {
      return undefined;
    }
  }
  return canonicalizeLinkedInUrl(candidate) ?? candidate;
}

function truncate(value: string | undefined, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  if (!t) return undefined;
  if (t.length <= max) return t;
  return t.slice(0, Math.max(0, max - 1)) + "…";
}

function truncateBullets(
  items: unknown,
  maxItems: number,
  maxChars: number,
): string[] | undefined {
  if (!Array.isArray(items)) return undefined;
  const out: string[] = [];
  for (const item of items) {
    if (out.length >= maxItems) break;
    if (typeof item !== "string") continue;
    const t = truncate(item, maxChars);
    if (t) out.push(t);
  }
  return out.length ? out : undefined;
}

export function sanitizeCapturePayload(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const input = body as Record<string, unknown>;
  const rest = { ...input };
  delete rest.captureMethods;
  delete rest.captureDiagnostics;

  const out: Record<string, unknown> = { ...rest };

  const fallbackSource =
    ensureLinkedInAbsoluteUrl(
      typeof out.expectedParticipantProfileUrl === "string"
        ? out.expectedParticipantProfileUrl
        : undefined,
    ) ??
    ensureLinkedInAbsoluteUrl(
      typeof out.sourceUrl === "string" ? out.sourceUrl : undefined,
    );

  if (typeof out.sourceUrl === "string" && out.sourceUrl.trim()) {
    out.sourceUrl = ensureLinkedInAbsoluteUrl(out.sourceUrl) ?? out.sourceUrl;
  } else if (fallbackSource) {
    out.sourceUrl = fallbackSource;
  }
  if (typeof out.expectedParticipantProfileUrl === "string") {
    out.expectedParticipantProfileUrl =
      ensureLinkedInAbsoluteUrl(out.expectedParticipantProfileUrl) ??
      out.expectedParticipantProfileUrl;
  }

  const fields = out.extractedFields;
  if (fields && typeof fields === "object") {
    const ef = { ...(fields as Record<string, unknown>) };
    if (typeof ef.about === "string") {
      ef.about = truncate(ef.about, 20_000);
    }
    const exp = truncateBullets(ef.experienceBullets, 25, 600);
    if (exp) ef.experienceBullets = exp;
    else delete ef.experienceBullets;
    const edu = truncateBullets(ef.educationBullets, 20, 500);
    if (edu) ef.educationBullets = edu;
    else delete ef.educationBullets;
    out.extractedFields = ef;
  }

  return out;
}

export function formatCaptureValidationError(details: unknown): string {
  if (!details || typeof details !== "object") return "Validation failed";
  const flat = details as {
    fieldErrors?: Record<string, string[]>;
    formErrors?: string[];
  };
  const parts: string[] = [];
  if (flat.formErrors?.length) parts.push(...flat.formErrors);
  for (const [key, msgs] of Object.entries(flat.fieldErrors ?? {})) {
    if (msgs?.length) parts.push(`${key}: ${msgs.join(", ")}`);
  }
  return parts.length ? parts.join(" · ") : "Validation failed";
}
