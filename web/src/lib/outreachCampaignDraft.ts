import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { contacts, outreachCampaignMembers, outreachCampaigns } from "@/db/schema";
import {
  callOllamaJson,
  extractJsonObjectFromModelText,
} from "@/lib/llmAnalysis";
import { getOllamaSettings } from "@/lib/ollamaSettings";
import { getGlobalWriterInstructions } from "@/lib/brand";
import { getLatestProfileContextForOutreach } from "@/lib/profileCaptureContext";
import { updateMemberDraft } from "@/lib/outreachCampaigns";

const outSchema = z.object({ message: z.string() });

const DEFAULT_OUTREACH_SYSTEM = `You write short, personalized LinkedIn connection notes or DMs (keep under 2000 characters). Reply with strictly valid JSON only: {"message":"..."} — no markdown, no code fences, no extra keys.

If your runtime exposes web search, browsing, or URL fetch tools (e.g. Ollama web_search / web_fetch or an app-integrated browser): use them before you draft when the recipient names a company or organization in Company or Headline. Run a few focused queries—such as "<company> official about products", "<company> news", or the company name plus the person's role from Headline—to ground one concrete, truthful hook (what they build, sector, or a recent public milestone). Do not invent financials, headcount, or non-public facts. If tools are unavailable or results are empty, write using only the Clin-provided fields.

Tone: professional, warm, concise. Be specific; avoid generic templates.`;

/** Appended to the user message so it applies even when the campaign overrides the system prompt. */
const USER_WEB_RESEARCH_BLOCK = `Research and grounding (read carefully):
- If web search / fetch tools are available in your session, call them before finalizing the message when Company or Headline suggests an employer. Prefer 1–3 short queries; synthesize snippets into at most one or two sentences of relevance in the outreach text.
- Do not state numbers, funding rounds, or claims unless a search result clearly supports them. If unsure, stay generic about the industry or problem space.
- Clin does not provide LinkedIn DM or messaging history—never imply you read their inbox.
- If no tools run or search returns nothing useful, personalize only from the campaign and profile text above.
`;

function logDraft(...args: unknown[]) {
  if (process.env.NODE_ENV === "production") return;
  console.info("[clin:outreach-draft]", ...args);
}

export async function generateOutreachDraftForMember(
  memberId: string,
): Promise<{ ok: true } | { ok: false; error: string; stage?: string }> {
  const db = getDb();
  const member = await db.query.outreachCampaignMembers.findFirst({
    where: eq(outreachCampaignMembers.id, memberId),
  });
  if (!member) return { ok: false, error: "Member not found", stage: "load" };
  const campaign = await db.query.outreachCampaigns.findFirst({
    where: eq(outreachCampaigns.id, member.campaignId),
  });
  const contact = await db.query.contacts.findFirst({
    where: eq(contacts.id, member.contactId),
  });
  if (!campaign || !contact) {
    return { ok: false, error: "Missing campaign or contact", stage: "load" };
  }

  const ollama = await getOllamaSettings();
  const override = campaign.systemPromptOverride?.trim();
  const system =
    override && override.length > 0 ? override : DEFAULT_OUTREACH_SYSTEM;

  let user = `Campaign context (from the Clin user):\n${campaign.contextText}\n\n`;
  const globalWriter = await getGlobalWriterInstructions();
  if (globalWriter) {
    user += `Your global positioning and voice (from Clin → You & goals):\n${globalWriter}\n\n`;
  }
  const writerNotes = campaign.writerInstructions?.trim();
  if (writerNotes) {
    user += `Additional instructions from the user (follow closely):\n${writerNotes}\n\n`;
  }
  user += `Recipient:\n- Name: ${contact.fullName ?? ""}\n- Headline: ${contact.headline ?? ""}\n- Company: ${contact.company ?? ""}\n- Location: ${contact.location ?? ""}\n`;

  const profileBlock = await getLatestProfileContextForOutreach(contact.id);
  if (profileBlock) {
    user += `\nProfile details (from the latest LinkedIn profile Capture in Clin — scroll About/Experience/Education on their profile, then Capture again to refresh):\n${profileBlock}\n`;
  }
  user += `\n${USER_WEB_RESEARCH_BLOCK}\n`;

  logDraft("request", {
    memberId,
    campaignId: campaign.id,
    contactId: contact.id,
    model: ollama.model,
    baseUrl: ollama.baseUrl,
    systemOverride: Boolean(override),
    hasWriterInstructions: Boolean(writerNotes),
  });

  let raw: string;
  try {
    raw = await callOllamaJson({
      settings: ollama,
      system,
      user,
      timeoutMs: 180_000,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logDraft("ollama_http_error", msg);
    return {
      ok: false,
      error: `Ollama request failed: ${msg}. Is Ollama running and the model installed? (Clin → Settings)`,
      stage: "ollama",
    };
  }

  logDraft("ollama_raw_chars", raw.length);

  const jsonStr = extractJsonObjectFromModelText(raw);
  if (!jsonStr.trim()) {
    logDraft("empty_extract", raw.slice(0, 500));
    return {
      ok: false,
      error: "Model returned no JSON object. Check server logs for raw output.",
      stage: "parse",
    };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(jsonStr);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logDraft("json_parse_error", msg, jsonStr.slice(0, 400));
    return {
      ok: false,
      error: `Invalid JSON from model: ${msg}. Snippet: ${jsonStr.slice(0, 120)}…`,
      stage: "parse",
    };
  }

  const parsed = outSchema.safeParse(parsedJson);
  if (!parsed.success) {
    logDraft("zod_error", parsed.error.flatten());
    return {
      ok: false,
      error:
        'Model JSON must be exactly {"message":"..."}. Got keys: ' +
        (parsedJson && typeof parsedJson === "object"
          ? Object.keys(parsedJson as object).join(", ")
          : typeof parsedJson),
      stage: "shape",
    };
  }

  const msg = parsed.data.message.trim();
  if (!msg) {
    logDraft("empty_message");
    return { ok: false, error: "Empty message from model.", stage: "empty" };
  }

  await updateMemberDraft(memberId, msg);
  logDraft("saved", { memberId, draftChars: msg.length });
  return { ok: true };
}
