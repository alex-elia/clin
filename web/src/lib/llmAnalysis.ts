import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import * as schema from "@/db/schema";
import { captureSessions, contacts } from "@/db/schema";
import { parseScoreReasons } from "@/lib/scoreExplain";
import type { OllamaSettings } from "@/lib/ollamaSettings";
import {
  getUserContextForLlm,
  userContextHasLlmSignal,
  type UserContextForLlm,
} from "@/lib/userContext";

type Db = BetterSQLite3Database<typeof schema>;

export const llmAnalysisOutputSchema = z.object({
  scores: z.object({
    r: z.number(),
    b: z.number(),
    c: z.number(),
  }),
  rationale: z
    .object({
      relationship: z.string().optional(),
      business: z.string().optional(),
      cleanup: z.string().optional(),
    })
    .optional(),
  suggested_actions: z.array(z.string()).optional(),
  data_gaps: z.array(z.string()).optional(),
  message_read: z.string().optional(),
  /** Populated when the user pasted a message thread — advice on pruning the connection. */
  connection_stewardship: z
    .object({
      recommendation: z.enum(["keep", "consider_removing", "unclear"]),
      rationale: z.string(),
    })
    .optional(),
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

  if (hasMessageSnippet && c.headline?.trim()) return "refined";
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
  "suggested_actions": ["write" | "visit_profile" | "stay_connected" | "consider_removing" | "none"],
  "data_gaps": ["optional short strings: what is missing for confidence"],
  "message_read": "optional: brief read on tone/recency if messages were provided",
  "connection_stewardship": { "recommendation": "keep" | "consider_removing" | "unclear", "rationale": "string" }
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

If data is thin (list-only capture, missing headline), give **provisional** scores and say so in data_gaps.
If richer profile + optional messages exist, be more confident (refined). Never claim certainty you lack.

Do not invent private facts. Do not output anything outside JSON.`;

  if (!includeOwnerContext) return base;

  return `${base}

The JSON user message may include "owner_context": goals, a positioning summary, and a minimal snapshot of the owner's own captured profile. When present, use it as the database owner's networking intent: steer business relevance (b), relationship emphasis (r), suggested_actions, and rationale toward those goals. Do not contradict obvious facts from the contact record; if owner_context is too thin to apply, note that in data_gaps instead of guessing.`;
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
      positioning_summary: oc.positioningSummary,
      my_profile: oc.selfProfile,
    };
  }

  return JSON.stringify(body, null, 2);
}

/** User-facing message when /api/chat fails (missing model, wrong URL, etc.). */
export function formatOllamaChatError(
  status: number,
  bodyText: string,
  model: string,
): string {
  const trimmed = bodyText.trim();
  let detail = trimmed.slice(0, 500) || `HTTP ${status}`;
  try {
    const j = JSON.parse(trimmed) as { error?: string };
    if (typeof j.error === "string" && j.error) detail = j.error;
  } catch {
    /* keep raw snippet */
  }
  let out = `Ollama HTTP ${status}: ${detail}`;
  const looksMissingModel =
    status === 404 ||
    /not found|unknown model|model.*not found|does not exist/i.test(detail);
  if (looksMissingModel) {
    out += `\n\nFix: open a terminal and run: ollama pull ${model}`;
    out += `\nOr in Clin → Settings, set “Model name” to an installed tag (run ollama list — names must match exactly, e.g. qwen2.5:7b vs qwen2.5:8b).`;
  }
  return out;
}

export async function callOllamaJson(opts: {
  settings: OllamaSettings;
  system: string;
  user: string;
  timeoutMs?: number;
}): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${opts.settings.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: opts.settings.model,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        stream: false,
        format: "json",
        options: { temperature: 0.35 },
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(
        formatOllamaChatError(
          res.status,
          errText,
          opts.settings.model,
        ),
      );
    }
    const data = (await res.json()) as { message?: { content?: string } };
    const content = data.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("Ollama returned empty message content.");
    }
    return content;
  } finally {
    clearTimeout(t);
  }
}

export async function runContactLlmAnalysis(
  db: Db,
  input: {
    contactId: string;
    tier: "provisional" | "refined";
    messageContext: string | null;
    settings: OllamaSettings;
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

  const rawText = await callOllamaJson({
    settings: input.settings,
    system: buildSystemPrompt(includeOwner),
    user: buildUserPayload({
      tier: input.tier,
      contact,
      captureSummary,
      messageContext: input.messageContext,
      ownerContext,
    }),
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
