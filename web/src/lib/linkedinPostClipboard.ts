/**
 * Plain-text copy for pasting into LinkedIn (feed or article).
 * LinkedIn does not render markdown; emphasis uses Unicode on copy (see linkedinUnicodeFormat).
 */

import { applyLinkedInUnicodeEmphasis } from "@/lib/linkedinUnicodeFormat";

/** Shared LLM instruction — import in coach / copy assistant prompts. */
export const LINKEDIN_POST_COPY_RULES = `LinkedIn hook and body: plain text (no ## headings or markdown links).
Write for the LinkedIn feed: short, scannable paragraphs — prefer ~800–1300 characters for the body (format=post) unless the user explicitly asks longer. One idea per post; cut filler and corporate fluff.
Use light emphasis markers that Clin converts when copying to LinkedIn: **key phrase** for bold, *phrase* for italic (1–3 highlights per post, not whole paragraphs).
Never use section labels such as "CTA:", "**CTA:**", "Call to action:", "Hashtags:", or "Accroche:".
End with a natural closing line (question, invite to comment, link, DM) woven into the prose — not labeled as a CTA.
NEVER end with a personal name signature, email, phone, or letter sign-off (e.g. "Alexandre GON", "— Firstname Lastname", "Cordialement," / "Best regards," + name). LinkedIn already shows the author.
Hashtags only when appropriate, inline at the end without a "Hashtags" header (max ~3–5).
When a mention roster is provided, tag people/companies using the exact @Name spelling from the roster (LinkedIn will link on paste).`;

export const LINKEDIN_MENTION_COACH_HINT = `Mention roster (use exact spellings for @tags when relevant, max 1–3 per post):
`;

/** Strip labeled sections and letter-style name sign-offs before paste. */
export function stripLinkedInSectionLabels(text: string): string {
  return stripLinkedInLetterSignOff(
    text
      .replace(
        /^\s*(?:\*\*)?\s*(?:CTA|Call[- ]to[- ]action|Hashtags?|Accroche|Chute)\s*(?:\*\*)?\s*:?\s*$/gim,
        "",
      )
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}

const LETTER_SIGNOFF_LINE_RE =
  /(?:\n|^)\s*(?:Cordialement|Bien à vous|Bien cordialement|Meilleures salutations|Best regards|Kind regards|Warm regards|Regards|Sincerely|Cheers)\s*[,.]?\s*(?:\n+\s*(?:—|–|-)?\s*[A-ZÀ-Ÿ][^\n]{1,60})?\s*$/iu;

/** Remove trailing "Cordialement, / Best regards," + Name blocks from post copy. */
export function stripLinkedInLetterSignOff(text: string): string {
  let out = text.replace(/\r\n/g, "\n").trimEnd();
  for (let i = 0; i < 3; i++) {
    const next = out.replace(LETTER_SIGNOFF_LINE_RE, "").trimEnd();
    if (next === out) break;
    out = next;
  }
  return out.trim();
}

export type LinkedInPostCopyInput = {
  format?: string | null;
  hook?: string | null;
  body?: string | null;
  articleBody?: string | null;
  styleNotes?: string | null;
  title?: string | null;
};

function normalizeLinkedInBase(text: string): string {
  let t = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  t = t.replace(/```[\w-]*\n?([\s\S]*?)```/g, "$1");
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");
  t = t.replace(/__([^_]+)__/g, "$1");
  t = t.replace(/(?<!_)_([^_\n]+)_(?!_)/g, "$1");
  t = t.replace(/^#{1,6}\s+/gm, "");
  t = t.replace(/[ \t]+\n/g, "\n");
  t = t.replace(/\n{3,}/g, "\n\n");
  return stripLinkedInSectionLabels(t);
}

/** Strip markdown emphasis (editor preview without Unicode). */
export function normalizeLinkedInPlainText(text: string): string {
  let t = normalizeLinkedInBase(text);
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1");
  t = t.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "$1");
  return t;
}

function hookIsRedundant(hook: string, body: string): boolean {
  const h = hook.trim();
  const b = body.trim();
  if (!h || !b) return false;
  const hLower = h.toLowerCase();
  const bLower = b.toLowerCase();
  if (bLower.startsWith(hLower)) return true;
  const firstLine = b.split("\n")[0]?.trim().toLowerCase() ?? "";
  if (firstLine === hLower) return true;
  const prefix = hLower.slice(0, Math.min(72, hLower.length));
  return prefix.length >= 24 && firstLine.startsWith(prefix);
}

export type LinkedInClipboardOptions = {
  /** Convert **bold** / *italic* markers to Unicode (default true). */
  unicodeEmphasis?: boolean;
};

function finalizeLinkedInText(
  text: string,
  options?: LinkedInClipboardOptions,
): string {
  const normalized = normalizeLinkedInBase(text);
  if (options?.unicodeEmphasis === false) {
    return normalized
      .replace(/\*\*([^*\n]+)\*\*/g, "$1")
      .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "$1");
  }
  return applyLinkedInUnicodeEmphasis(normalized);
}

export function formatPostForLinkedInClipboard(
  post: LinkedInPostCopyInput,
  options?: LinkedInClipboardOptions,
): string {
  const hook = post.hook?.trim() ?? "";
  const body = post.body?.trim() ?? "";
  const article = post.articleBody?.trim() ?? "";

  if (post.format === "article") {
    const source = article || body || hook;
    if (source) return finalizeLinkedInText(source, options);
  }

  const segments: string[] = [];
  if (hook && !hookIsRedundant(hook, body)) {
    segments.push(finalizeLinkedInText(hook, options));
  }
  if (body) {
    segments.push(finalizeLinkedInText(body, options));
  } else if (hook && segments.length === 0) {
    segments.push(finalizeLinkedInText(hook, options));
  }

  const joined = segments.join("\n\n");
  if (joined) return joined;

  const fallback = post.title?.trim();
  return fallback ? finalizeLinkedInText(fallback, options) : "";
}
