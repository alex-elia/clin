import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import * as schema from "@/db/schema";
import { captureSessions, contacts } from "@/db/schema";
import { parseScoreReasons } from "@/lib/scoreExplain";
import { completeChat } from "@/lib/llm/completeChat";
import type { LlmConfig } from "@/lib/llm/types";
import {
  getUserContextForLlm,
  userContextHasLlmSignal,
  type UserContextForLlm,
} from "@/lib/userContext";

type Db = BetterSQLite3Database<typeof schema>;

const nullishString = z.preprocess(
  (v) => (v === null || v === "" ? undefined : v),
  z.string().optional(),
);

export const llmAnalysisOutputSchema = z.object({
  scores: z.object({
    r: z.number(),
    b: z.number(),
    c: z.number(),
  }),
  rationale: z
    .object({
      relationship: nullishString,
      business: nullishString,
      cleanup: nullishString,
    })
    .optional(),
  suggested_actions: z.array(z.string()).nullish(),
  data_gaps: z.array(z.string()).nullish(),
  message_read: nullishString,
  /** Populated when the user pasted a message thread — advice on pruning the connection. */
  connection_stewardship: z
    .object({
      recommendation: z.enum(["keep", "consider_removing", "unclear"]),
      rationale: z.string(),
    })
    .nullish(),
  /** When owner_context (goals/offer) is present — fit vs what the user sells. */
  outreach_fit: z
    .object({
      recommendation: z.enum(["reach_out", "nurture", "skip", "unclear"]),
      rationale: z.string(),
      icp_signals: z.array(z.string()).nullish(),
    })
    .nullish(),
  /** Primary cleaning bucket for Clin's review board (always include when scoring). */
  cleaning_plan: z
    .object({
      bucket: z.enum([
        "enrich_first",
        "needs_review",
        "review_remove",
        "reach_out_dm",
        "engage_comment",
        "nurture_light",
        "keep_passive",
      ]),
      confidence: z.enum(["low", "medium", "high"]),
      rationale: z.string(),
      playbook: z.string().nullish(),
    })
    .nullish(),
});

export type LlmAnalysisOutput = z.infer<typeof llmAnalysisOutputSchema>;

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.min(100, Math.max(0, n)));
}

function normalizeScores(raw: LlmAnalysisOutput): LlmAnalysisOutput {
  return {
    ...raw,
    scores: {
      r: clampScore(raw.scores.r),
      b: clampScore(raw.scores.b),
      c: clampScore(raw.scores.c),
    },
  };
}

/** Strip DeepSeek-R1 / similar thinking blocks and fenced JSON. */
export function extractJsonObjectFromModelText(text: string): string {
  let t = text.trim();
  const thinkClose = t.lastIndexOf("</think>");
  if (thinkClose !== -1) {
    t = t.slice(thinkClose + "</think>".length).trim();
  }
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const objStart = t.indexOf("{");
  const objEnd = t.lastIndexOf("}");
  if (objStart !== -1 && objEnd > objStart) {
    return t.slice(objStart, objEnd + 1);
  }
  return t;
}

export async function inferAnalysisTier(
  db: Db,
  contactId: string,
  messageContext: string | null | undefined,
): Promise<"provisional" | "refined"> {
  const caps = await db.query.captureSessions.findMany({
    where: eq(captureSessions.contactId, contactId),
    orderBy: [desc(captureSessions.capturedAt)],
    limit: 12,
  });
  const c = await db.query.contacts.findFirst({
    where: eq(contacts.id, contactId),
  });
  if (!c) throw new Error("Contact not found");

  const hasProfileCapture = caps.some((s) => s.pageType === "profile");
  const rich =
    Boolean(c.headline?.trim()) &&
    Boolean(c.company?.trim() || c.location?.trim());
  const hasMessageSnippet =
    typeof messageContext === "string" && messageContext.trim().length >= 40;
  const hasMessagingCapture = caps.some((s) => s.pageType === "messaging");

  if (hasMessageSnippet && c.headline?.trim()) return "refined";
  if (hasMessagingCapture && hasMessageSnippet) return "refined";
  if (hasMessagingCapture && caps.some((s) => s.pageType === "profile")) {
    return "refined";
  }
  if (hasProfileCapture && rich) return "refined";
  return "provisional";
}

function buildSystemPrompt(includeOwnerContext: boolean): string {
  const base = `You are a local networking assistant for a user's LinkedIn contacts database (Clin).
You primarily see fields the user captured locally — not live LinkedIn data.

If your runtime exposes web search or URL fetch tools, you may use a brief search to clarify the contact's current company or industry when Company or Headline names an organization (e.g. one query: "<company> what they do"). Use results only to tighten business relevance (b) and rationale—never invent private facts. If no tools are available or search is empty, rely only on the JSON payload below.

Respond with a single JSON object (no markdown) matching this shape:
{
  "scores": { "r": 0-100, "b": 0-100, "c": 0-100 },
  "rationale": { "relationship": "string", "business": "string", "cleanup": "string" },
  "suggested_actions": ["write" | "visit_profile" | "stay_connected" | "consider_removing" | "comment_on_post" | "none"],
  "data_gaps": ["optional short strings: what is missing for confidence"],
  "message_read": "optional: brief read on tone/recency if messages were provided",
  "connection_stewardship": { "recommendation": "keep" | "consider_removing" | "unclear", "rationale": "string" },
  "outreach_fit": { "recommendation": "reach_out" | "nurture" | "skip" | "unclear", "rationale": "string", "icp_signals": ["short strings"] },
  "cleaning_plan": { "bucket": "enrich_first" | "needs_review" | "review_remove" | "reach_out_dm" | "engage_comment" | "nurture_light" | "keep_passive", "confidence": "low" | "medium" | "high", "rationale": "string", "playbook": "one short next step for the user" }
}

Definitions (align with user's app):
- r (relationship): recency/strength of tie from available evidence (captures, message snippets if any).
- b (business): rough professional relevance from role/company/headline text.
- c (cleanup): whether the connection looks worth pruning or needs a fresh profile visit.

When the user message includes a non-empty "message_context" (pasted LinkedIn DM thread):
- You MUST include "connection_stewardship". Be kind and practical: one-sided outreach, long gaps with no reply after reasonable follow-ups, or clear disinterest support "consider_removing"; ongoing mutual dialogue or obvious value supports "keep"; thin or ambiguous threads use "unclear" and explain.
- Align suggested_actions with stewardship (e.g. consider_removing → include "consider_removing" when appropriate).
- This is guidance for the user's own CRM only — they still remove connections manually on LinkedIn if they choose.

When "message_context" is null or empty, omit "connection_stewardship" or set recommendation to "unclear" with rationale "no thread pasted".
Use null or omit optional fields — do not set optional strings to JSON null.

When "owner_context" includes goals or positioning_and_offer, you MUST include "outreach_fit":
- Compare the contact's role, company, headline, and any profile/messaging evidence to what the owner sells and who they want to reach.
- reach_out: strong ICP match and a clear reason to message now.
- nurture: plausible fit but weak data, wrong timing, or better as a soft follow later.
- skip: poor fit, wrong seniority/sector, or likely waste of attention.
- unclear: owner offer context too thin to judge — say what is missing in rationale and data_gaps.
- icp_signals: 0–4 short bullets (e.g. "VP Engineering", "B2B SaaS", "no overlap with owner's offer").

If owner_context is absent or empty, omit "outreach_fit".

You MUST include "cleaning_plan" on every response:
- Pick exactly one bucket that best matches the user's next step.
- enrich_first: list-only or missing About/Experience — user should capture more on LinkedIn first.
- review_remove: stewardship or cleanup suggests pruning the connection.
- reach_out_dm: strong outreach_fit reach_out with enough profile context for a DM.
- engage_comment: nurture fit OR weak timing for DM but relationship worth a public comment/react first.
- nurture_light: keep warm, revisit later; no pitch now.
- keep_passive: skip outreach but keep connection; or clearly low priority.
- needs_review: contradictory signals or very thin data despite a profile row.
- playbook: one imperative sentence (e.g. "Comment on their latest post, then DM in a week.").
- Align bucket with outreach_fit and connection_stewardship when those are present.

If data is thin (list-only capture, missing headline), give **provisional** scores and say so in data_gaps.
If richer profile + optional messages exist, be more confident (refined). Never claim certainty you lack.

Do not invent private facts. Do not output anything outside JSON.`;

  if (!includeOwnerContext) return base;

  return `${base}

The JSON user message may include "owner_context": goals, positioning_and_offer (what they sell / ICP), and a minimal snapshot of the owner's own captured profile. When present, use it as the database owner's networking intent: steer business relevance (b), relationship emphasis (r), suggested_actions, outreach_fit, and rationale toward those goals. Do not contradict obvious facts from the contact record; if owner_context is too thin to apply, note that in data_gaps instead of guessing.`;
}

function buildUserPayload(input: {
  tier: "provisional" | "refined";
  contact: typeof contacts.$inferSelect;
  captureSummary: { pageType: string; capturedAt: string }[];
  messageContext: string | null;
  ownerContext: UserContextForLlm | null;
}): string {
  const cr = input.contact;
  const body: Record<string, unknown> = {
    analysis_tier_requested: input.tier,
    contact: {
      fullName: cr.fullName,
      headline: cr.headline,
      company: cr.company,
      location: cr.location,
      connectionDegree: cr.connectionDegree,
      segment: cr.segment,
      rule_scores: {
        r: cr.relationshipScore,
        b: cr.businessScore,
        c: cr.cleanupScore,
      },
      rule_reasons: {
        relationship: parseScoreReasons(cr.relationshipReasons),
        business: parseScoreReasons(cr.businessReasons),
        cleanup: parseScoreReasons(cr.cleanupReasons),
      },
      lastSeenAt: cr.lastSeenAt?.toISOString?.() ?? null,
    },
    recent_captures: input.captureSummary,
    message_context: input.messageContext?.trim() || null,
  };

  const oc = input.ownerContext;
  if (oc && userContextHasLlmSignal(oc)) {
    body.owner_context = {
      goals: oc.goalsText,
      positioning_and_offer: oc.positioningSummary,
      my_profile: oc.selfProfile,
    };
  }

  return JSON.stringify(body, null, 2);
}

export async function runContactLlmAnalysis(
  db: Db,
  input: {
    contactId: string;
    tier: "provisional" | "refined";
    messageContext: string | null;
    settings: LlmConfig;
    llmMeta?: Record<string, string | number | boolean | null>;
  },
): Promise<{
  tier: "provisional" | "refined";
  envelope: Record<string, unknown>;
  output: LlmAnalysisOutput;
}> {
  const contact = await db.query.contacts.findFirst({
    where: eq(contacts.id, input.contactId),
  });
  if (!contact) throw new Error("Contact not found");

  const caps = await db.query.captureSessions.findMany({
    where: eq(captureSessions.contactId, input.contactId),
    orderBy: [desc(captureSessions.capturedAt)],
    limit: 10,
  });
  const captureSummary = caps.map((s) => ({
    pageType: s.pageType,
    capturedAt: s.capturedAt.toISOString(),
  }));

  const ownerContext = await getUserContextForLlm();
  const includeOwner = userContextHasLlmSignal(ownerContext);

  const rawText = await completeChat({
    config: input.settings,
    feature: "contact_analyze",
    system: buildSystemPrompt(includeOwner),
    user: buildUserPayload({
      tier: input.tier,
      contact,
      captureSummary,
      messageContext: input.messageContext,
      ownerContext,
    }),
    jsonMode: true,
    timeoutMs: 120_000,
    meta: input.llmMeta,
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

  const out = llmAnalysisOutputSchema.safeParse(parsed);
  if (!out.success) {
    throw new Error(
      `JSON shape mismatch: ${out.error.message.slice(0, 400)}`,
    );
  }

  const output = normalizeScores(out.data);
  const envelope = {
    tier: input.tier,
    model: input.settings.model,
    at: new Date().toISOString(),
    rule_scores: {
      r: contact.relationshipScore,
      b: contact.businessScore,
      c: contact.cleanupScore,
    },
    model_scores: output.scores,
    output,
  };

  return { tier: input.tier, envelope, output };
}
