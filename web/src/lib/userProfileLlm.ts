import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { captureSessions, contacts } from "@/db/schema";
import { extractJsonObjectFromModelText } from "@/lib/llmAnalysis";
import { completeChat } from "@/lib/llm/completeChat";
import type { LlmConfig } from "@/lib/llm/types";
import { backfillContactFieldsFromLatestProfileCapture } from "@/lib/contactProfileBackfill";
import { getOrCreateUserContext } from "@/lib/userContext";

const selfProfileOutSchema = z.object({
  goals_text: z.string(),
  positioning_summary: z.string(),
});

export type SelfProfileLlmResult = {
  goalsText: string;
  positioningSummary: string;
};

type Db = ReturnType<typeof getDb>;

/**
 * Ollama is only allowed after the Clin extension has run a **profile** capture
 * for this contact (not connections-list import alone) and at least one visible
 * field was stored.
 */
export async function getSelfProfileReadyForOllama(
  db: Db,
  contactId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  await backfillContactFieldsFromLatestProfileCapture(db, contactId);

  const profileCap = await db.query.captureSessions.findFirst({
    where: and(
      eq(captureSessions.contactId, contactId),
      eq(captureSessions.pageType, "profile"),
    ),
    orderBy: [desc(captureSessions.capturedAt)],
  });
  if (!profileCap) {
    return {
      ok: false,
      message:
        "No extension profile capture yet. Open your LinkedIn profile (/in/…) in Chrome while logged in, then click Capture in the Clin extension on that tab (not from a connections list).",
    };
  }

  const c = await db.query.contacts.findFirst({
    where: eq(contacts.id, contactId),
  });
  if (!c) {
    return { ok: false, message: "Linked contact no longer exists." };
  }
  const hasFields = Boolean(
    c.headline?.trim() ||
      c.fullName?.trim() ||
      c.company?.trim() ||
      c.location?.trim(),
  );
  if (!hasFields) {
    return {
      ok: false,
      message:
        "A profile capture exists but no name, headline, company, or location was found (not even in the raw capture payload). Open your full LinkedIn profile while logged in, scroll so your name and headline are visible, then run Capture again. If it keeps failing, LinkedIn may have changed the page layout — check Captures in Clin for that session.",
    };
  }
  return { ok: true };
}

/**
 * One-shot Ollama pass: infer networking goals + positioning from the linked
 * contact capture (and optional prior goals as hints).
 */
export async function runSelfGoalsAndPositioningLlm(opts: {
  settings: LlmConfig;
}): Promise<SelfProfileLlmResult> {
  const db = getDb();
  const ctx = await getOrCreateUserContext();
  if (!ctx.selfContactId) {
    throw new Error(
      "Link “your profile” to a contact first — capture your own /in/… page with the extension, then pick that contact below.",
    );
  }
  const gate = await getSelfProfileReadyForOllama(db, ctx.selfContactId);
  if (!gate.ok) throw new Error(gate.message);

  const c = await db.query.contacts.findFirst({
    where: eq(contacts.id, ctx.selfContactId),
  });
  if (!c) throw new Error("Linked contact no longer exists. Choose another.");

  const system = `You help a user define LinkedIn networking goals and positioning inside a local CRM (Clin).
Respond with a single JSON object (no markdown) exactly in this shape:
{"goals_text": "string", "positioning_summary": "string"}

goals_text: Concrete networking intent in plain language (bullet lines with leading "- " or short paragraphs). Infer from the profile fields what this person is likely optimizing for (e.g. hiring, fundraising, sales, job search, partnerships, staying visible in an industry). If prior_goals is non-empty, refine and merge with it rather than discarding it. If the capture is thin (e.g. no headline), say what is unknown and suggest one or two goal directions as hypotheses, not facts.

positioning_summary: 2–6 short paragraphs: what signal headline/company/location gives, who likely cares, how to prioritize connections and outreach. Ground only in provided data; do not invent employers, titles, or achievements.

If data is thin, say so in both fields and suggest what to capture next on LinkedIn.`;

  const user = JSON.stringify(
    {
      prior_goals: ctx.goalsText?.trim() || null,
      my_capture: {
        fullName: c.fullName,
        headline: c.headline,
        company: c.company,
        location: c.location,
        segment: c.segment,
        relationshipScore: c.relationshipScore,
        businessScore: c.businessScore,
        cleanupScore: c.cleanupScore,
      },
    },
    null,
    2,
  );

  const rawText = await completeChat({
    config: opts.settings,
    feature: "user_profile",
    system,
    user,
    jsonMode: true,
    timeoutMs: 120_000,
  });
  const jsonStr = extractJsonObjectFromModelText(rawText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(
      `Model did not return valid JSON. First 400 chars: ${jsonStr.slice(0, 400)}`,
    );
  }
  const out = selfProfileOutSchema.safeParse(parsed);
  if (!out.success) {
    throw new Error(
      `JSON shape mismatch: ${out.error.message.slice(0, 400)}`,
    );
  }
  return {
    goalsText: out.data.goals_text.trim(),
    positioningSummary: out.data.positioning_summary.trim(),
  };
}
