import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { contacts } from "@/db/schema";
import { extractJsonObjectFromModelText } from "@/lib/llmAnalysis";
import { completeChat } from "@/lib/llm/completeChat";
import type { LlmConfig } from "@/lib/llm/types";
import { getOrCreateContentBrandContext } from "@/lib/contentBrandContext";
import { getOrCreateUserContext } from "@/lib/userContext";
import { getSelfProfileReadyForOllama } from "@/lib/userProfileLlm";

const voiceSetupOutSchema = z.object({
  goals_text: z.string(),
  positioning_summary: z.string(),
  content_doctrine: z.string(),
  expertise_summary: z.string(),
  rhythm_weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  rhythm_time_window: z.string(),
});

export type VoiceSetupSuggest = {
  goalsText: string;
  positioningSummary: string;
  contentDoctrine: string;
  expertiseSummary: string;
  rhythmWeekdays: string;
  rhythmTimeWindow: string;
};

function weekdaysToFormValue(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 2 && sorted[0] === 2 && sorted[1] === 4) return "2,4";
  if (sorted.length === 3 && sorted[0] === 1 && sorted[1] === 3 && sorted[2] === 5) {
    return "1,3,5";
  }
  return sorted.join(",");
}

/**
 * One-shot LLM: goals, positioning, content principles, expertise, publish rhythm
 * from the linked self contact capture.
 */
export async function runVoiceSetupFromProfileLlm(opts: {
  settings: LlmConfig;
  userBrief?: string | null;
}): Promise<VoiceSetupSuggest> {
  const db = getDb();
  const [ctx, brand] = await Promise.all([
    getOrCreateUserContext(),
    getOrCreateContentBrandContext(),
  ]);
  if (!ctx.selfContactId) {
    throw new Error(
      "Link your profile on the previous step first (pick your /in/… contact).",
    );
  }
  const gate = await getSelfProfileReadyForOllama(db, ctx.selfContactId);
  if (!gate.ok) throw new Error(gate.message);

  const c = await db.query.contacts.findFirst({
    where: eq(contacts.id, ctx.selfContactId),
  });
  if (!c) throw new Error("Linked contact no longer exists. Choose another.");

  const system = `You help a user complete "Your voice & rhythm" for a local LinkedIn content calendar (Clin).
Respond with a single JSON object (no markdown) exactly in this shape:
{
  "goals_text": "string",
  "positioning_summary": "string",
  "content_doctrine": "string",
  "expertise_summary": "string",
  "rhythm_weekdays": [number, ...],
  "rhythm_time_window": "string"
}

goals_text: Networking and content goals (bullet lines with "- " allowed). Ground in profile; merge prior_goals if present.

positioning_summary: Who they are, who they help, proof angle — 2–5 short paragraphs. No invented employers or awards.

content_doctrine: 5–7 numbered principles for LinkedIn posts (tone, what to avoid, authenticity). Thought leadership, not sales spam.

expertise_summary: One crisp line (max ~25 words) for the writing assistant.

rhythm_weekdays: JS weekday integers 0=Sun … 6=Sat. Prefer 2 days for busy professionals (often Tue+Thu = [2,4]) unless user_brief says otherwise.

rhythm_time_window: Local time range like "08:45-09:15" for posting.

If capture is thin, state uncertainty in goals/positioning and keep doctrine generic. Do not invent facts.`;

  const user = JSON.stringify(
    {
      user_brief: opts.userBrief?.trim() || null,
      prior_goals: ctx.goalsText?.trim() || null,
      prior_positioning: ctx.positioningSummary?.trim() || null,
      prior_doctrine: brand.contentDoctrine?.trim() || null,
      prior_expertise: brand.expertiseSummary?.trim() || null,
      my_capture: {
        fullName: c.fullName,
        headline: c.headline,
        company: c.company,
        location: c.location,
        segment: c.segment,
      },
    },
    null,
    2,
  );

  const rawText = await completeChat({
    config: opts.settings,
    feature: "voice_setup",
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
  const out = voiceSetupOutSchema.safeParse(parsed);
  if (!out.success) {
    throw new Error(
      `JSON shape mismatch: ${out.error.message.slice(0, 400)}`,
    );
  }

  return {
    goalsText: out.data.goals_text.trim(),
    positioningSummary: out.data.positioning_summary.trim(),
    contentDoctrine: out.data.content_doctrine.trim(),
    expertiseSummary: out.data.expertise_summary.trim(),
    rhythmWeekdays: weekdaysToFormValue(out.data.rhythm_weekdays),
    rhythmTimeWindow: out.data.rhythm_time_window.trim() || "08:45-09:15",
  };
}
