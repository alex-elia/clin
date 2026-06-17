import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { captureSessions } from "@/db/schema";
import { safeTruncate, stripLoneSurrogates } from "@/lib/llm/sanitizePromptText";
import {
  filterRecentProfilePosts,
  POST_RECENCY_PROMPT_EMPTY_NOTE,
} from "@/lib/profilePostRecency";
import {
  formatSinglePostForPrompt,
  type ProfilePostCapture,
} from "@/lib/profilePostKinds";

function asStringArray(v: unknown, maxLen: number, maxItems: number): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: string[] = [];
  for (const x of v) {
    if (out.length >= maxItems) break;
    if (typeof x !== "string") continue;
    const t = x.replace(/\s+/g, " ").trim();
    if (!t) continue;
    out.push(t.length > maxLen ? safeTruncate(t, maxLen) : t);
  }
  return out.length ? out : undefined;
}

/** Build a narrative block from stored capture JSON for Ollama (capped). */
export function formatRichProfileForPrompt(
  extracted: Record<string, unknown> | null | undefined,
  maxChars = 14_000,
): string {
  if (!extracted || typeof extracted !== "object") return "";

  const about =
    typeof extracted.about === "string"
      ? stripLoneSurrogates(extracted.about.trim())
      : "";
  const exp = asStringArray(extracted.experienceBullets, 520, 18);
  const edu = asStringArray(extracted.educationBullets, 420, 12);

  const parts: string[] = [];

  if (about) parts.push(`About (from profile):\n${about}`);

  if (exp?.length) {
    parts.push(
      `Experience (visible sections — scroll/capture again to refresh):\n${exp.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
    );
  }

  if (edu?.length) {
    parts.push(
      `Education:\n${edu.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
    );
  }

  const postsBlock = formatProfilePostsForPrompt(extracted, 6000);
  if (postsBlock) parts.push(postsBlock);

  let text = parts.join("\n\n");
  if (text.length > maxChars) text = safeTruncate(text, maxChars);
  return text;
}

/** Latest full-profile page capture (not connections list rows). */
export async function getLatestProfileCaptureJson(
  contactId: string,
): Promise<Record<string, unknown> | null> {
  const db = getDb();
  const row = await db.query.captureSessions.findFirst({
    where: and(
      eq(captureSessions.contactId, contactId),
      eq(captureSessions.pageType, "profile"),
    ),
    orderBy: [desc(captureSessions.capturedAt)],
  });
  const raw = row?.extractedJson;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function formatProfilePostsForPrompt(
  extracted: Record<string, unknown> | null | undefined,
  maxChars = 8000,
): string {
  const posts = extracted?.profilePosts;
  if (!Array.isArray(posts) || posts.length === 0) return "";
  const recent = filterRecentProfilePosts(
    posts as ProfilePostCapture[],
  );
  const lines: string[] = [];
  for (let i = 0; i < recent.length && i < 12; i++) {
    const p = recent[i] as ProfilePostCapture;
    if (!p?.text?.trim() && !p?.sharedTitle?.trim()) continue;
    lines.push(formatSinglePostForPrompt(p, i));
  }
  if (!lines.length) {
    const hadPosts = posts.some(
      (p) =>
        p &&
        typeof p === "object" &&
        typeof (p as { text?: string }).text === "string" &&
        (p as { text: string }).text.trim().length > 0,
    );
    if (hadPosts) {
      return `${POST_RECENCY_PROMPT_EMPTY_NOTE} Do not reference older posts in outreach or comments.`;
    }
    return "";
  }
  let block =
    `Recent LinkedIn posts (last year only, captured):\n${lines.join("\n")}`;
  if (block.length > maxChars) block = safeTruncate(block, maxChars);
  return block;
}

/** Latest posts-scope capture for a contact. */
export async function getLatestPostsCaptureJson(
  contactId: string,
): Promise<Record<string, unknown> | null> {
  const db = getDb();
  const row = await db.query.captureSessions.findFirst({
    where: and(
      eq(captureSessions.contactId, contactId),
      eq(captureSessions.pageType, "posts"),
    ),
    orderBy: [desc(captureSessions.capturedAt)],
  });
  const raw = row?.extractedJson;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

export async function getLatestProfileContextForOutreach(
  contactId: string,
): Promise<string> {
  const [profileJson, postsJson] = await Promise.all([
    getLatestProfileCaptureJson(contactId),
    getLatestPostsCaptureJson(contactId),
  ]);
  const parts = [
    formatRichProfileForPrompt(profileJson),
    formatProfilePostsForPrompt(postsJson),
  ].filter(Boolean);
  return parts.join("\n\n");
}
