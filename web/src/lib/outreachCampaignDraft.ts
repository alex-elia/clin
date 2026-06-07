import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { contacts, outreachCampaignMembers, outreachCampaigns } from "@/db/schema";
import { extractJsonObjectFromModelText } from "@/lib/llmAnalysis";
import { completeChat, getLlmConfig } from "@/lib/llm/completeChat";
import { getGlobalWriterInstructions } from "@/lib/brand";
import { readMemberIcpFromRow } from "@/lib/campaignMemberIcp";
import { buildContactContextBundle } from "@/lib/contactContextBundle";
import {
  formatContactPlaybookForDraftPrompt,
  pickContactPlaybookFromEnvelope,
} from "@/lib/contactPlaybook";
import { selectContactLlmExtension } from "@/lib/contactSqlExtras";
import { getLatestProfileContextForOutreach } from "@/lib/profileCaptureContext";
import { updateMemberDraft } from "@/lib/outreachCampaigns";
import {
  applySenderNameToDraft,
  buildSenderIdentityPromptBlock,
  getSenderIdentity,
} from "@/lib/senderIdentity";
import { getUserContextForLlm, userContextHasLlmSignal } from "@/lib/userContext";

const outSchema = z.object({ message: z.string() });

const DEFAULT_OUTREACH_SYSTEM = `You write short, personalized LinkedIn connection notes or DMs (keep under 2000 characters). Reply with strictly valid JSON only: {"message":"..."} — no markdown, no code fences, no extra keys.

The user message includes who YOU are (sender) and who the recipient is. Write in the sender's voice. Sign with the sender's real name — never use bracket placeholders like [Your Name] or {{name}}.

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

  const llm = await getLlmConfig();
  const override = campaign.systemPromptOverride?.trim();
  const system =
    override && override.length > 0 ? override : DEFAULT_OUTREACH_SYSTEM;

  const sender = await getSenderIdentity();
  const ownerCtx = await getUserContextForLlm();

  let user = `${buildSenderIdentityPromptBlock(sender)}\n\n`;
  user += `Campaign context (what you are offering in this campaign):\n${campaign.contextText}\n\n`;
  if (campaign.icpText?.trim()) {
    user += `Campaign ICP (who this campaign targets):\n${campaign.icpText.trim()}\n\n`;
  }
  if (userContextHasLlmSignal(ownerCtx)) {
    if (ownerCtx.goalsText) {
      user += `Your networking goals (Clin):\n${ownerCtx.goalsText}\n\n`;
    }
    if (ownerCtx.positioningSummary) {
      user += `Your positioning & offer (what you sell / who you help):\n${ownerCtx.positioningSummary}\n\n`;
    }
  }
  const globalWriter = await getGlobalWriterInstructions();
  if (globalWriter) {
    user += `Your global outreach voice (Clin → You & voice):\n${globalWriter}\n\n`;
  }
  const writerNotes = campaign.writerInstructions?.trim();
  if (writerNotes) {
    user += `Additional instructions from the user (follow closely):\n${writerNotes}\n\n`;
  }
  user += `Recipient:\n- Name: ${contact.fullName ?? ""}\n- Headline: ${contact.headline ?? ""}\n- Company: ${contact.company ?? ""}\n- Location: ${contact.location ?? ""}\n`;

  const [profileBlock, contextBundle, llmExt] = await Promise.all([
    getLatestProfileContextForOutreach(contact.id),
    buildContactContextBundle(contact.id),
    Promise.resolve(selectContactLlmExtension(contact.id)),
  ]);
  if (profileBlock) {
    user += `\nProfile details (from the latest LinkedIn profile Capture in Clin — scroll About/Experience/Education on their profile, then Capture again to refresh):\n${profileBlock}\n`;
  }
  if (contextBundle.company_intel_context?.trim()) {
    user += `\nCompany / jobs intel (from LinkedIn company or careers captures):\n${contextBundle.company_intel_context.trim()}\n`;
  }

  const playbook = pickContactPlaybookFromEnvelope(
    contact.id,
    llmExt?.llmProvisionalJson,
    llmExt?.llmRefinedJson,
  );
  const icp = readMemberIcpFromRow(member);
  const playbookBlock = formatContactPlaybookForDraftPrompt(playbook, {
    icpRationale: icp.icpRationale,
  });
  if (playbookBlock) {
    user += `\n${playbookBlock}\n`;
  }

  user += `\n${USER_WEB_RESEARCH_BLOCK}\n`;

  logDraft("request", {
    memberId,
    campaignId: campaign.id,
    contactId: contact.id,
    model: llm.model,
    baseUrl: llm.baseUrl,
    provider: llm.provider,
    systemOverride: Boolean(override),
    hasWriterInstructions: Boolean(writerNotes),
  });

  let raw: string;
  try {
    raw = await completeChat({
      config: llm,
      feature: "outreach_draft",
      system,
      user,
      jsonMode: true,
      timeoutMs: 180_000,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logDraft("ollama_http_error", msg);
    return {
      ok: false,
      error: `LLM request failed: ${msg}. Check Settings → Inference.`,
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

  let msg = parsed.data.message.trim();
  if (!msg) {
    logDraft("empty_message");
    return { ok: false, error: "Empty message from model.", stage: "empty" };
  }

  msg = applySenderNameToDraft(msg, sender);

  await updateMemberDraft(memberId, msg);
  logDraft("saved", { memberId, draftChars: msg.length });
  return { ok: true };
}
