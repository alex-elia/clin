import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { captureSessions } from "@/db/schema";

function asStringArray(v: unknown, maxLen: number, maxItems: number): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: string[] = [];
  for (const x of v) {
    if (out.length >= maxItems) break;
    if (typeof x !== "string") continue;
    const t = x.replace(/\s+/g, " ").trim();
    if (!t) continue;
    out.push(t.length > maxLen ? `${t.slice(0, maxLen - 1)}…` : t);
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
    typeof extracted.about === "string" ? extracted.about.trim() : "";
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

  let text = parts.join("\n\n");
  if (text.length > maxChars) text = `${text.slice(0, maxChars - 1)}…`;
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

export async function getLatestProfileContextForOutreach(
  contactId: string,
): Promise<string> {
  const json = await getLatestProfileCaptureJson(contactId);
  return formatRichProfileForPrompt(json);
}
