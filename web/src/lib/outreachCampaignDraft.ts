import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { contacts, outreachCampaignMembers, outreachCampaigns } from "@/db/schema";
import { extractJsonObjectFromModelText } from "@/lib/llmAnalysis";
import { completeChat, getLlmConfigForFeature } from "@/lib/llm/completeChat";
import { parseOutreachDraftMessage } from "@/lib/outreachDraftParse";
import { getGlobalWriterInstructions } from "@/lib/brand";
import { getOrCreateContentBrandContext } from "@/lib/contentBrandContext";
import {
  buildOutreachFormattingInstruction,
  buildOutreachLanguageInstruction,
  parseContentLanguagePreference,
  POST_LANGUAGE_LABELS,
  recipientTextForOutreachLanguage,
  resolveOutreachLanguage,
  campaignWantsRecipientLanguage,
} from "@/lib/contentLanguage";
import { readMemberIcpFromRow } from "@/lib/campaignMemberIcp";
import { buildContactContextBundle } from "@/lib/contactContextBundle";
import {
  formatContactPlaybookForDraftPrompt,
  pickContactPlaybookFromEnvelope,
} from "@/lib/contactPlaybook";
import { selectContactLlmExtension } from "@/lib/contactSqlExtras";
import { getLatestProfileCaptureJson, getLatestProfileContextForOutreach, formatRichProfileForPrompt } from "@/lib/profileCaptureContext";
import { updateMemberDraft, updateMemberInviteNote, updateMemberOutreachStep } from "@/lib/outreachCampaigns";
import {
  applySenderNameToDraft,
  buildSenderIdentityPromptBlock,
  getSenderIdentity,
} from "@/lib/senderIdentity";
import { getUserContextForLlm, userContextHasLlmSignal } from "@/lib/userContext";
import { POST_ORIGIN_LLM_RULE } from "@/lib/profilePostKinds";
import { POST_RECENCY_LLM_RULE } from "@/lib/profilePostRecency";
import {
  clampInviteNote,
  INVITE_NOTE_MAX_CHARS,
  memberNeedsInviteBeforeDm,
} from "@/lib/outreachInviteWorkflow";

const outSchema = z.object({ message: z.string() });

const OUTREACH_JSON_SCHEMA = {
  name: "outreach_message",
  schema: {
    type: "object",
    properties: {
      message: { type: "string" },
    },
    required: ["message"],
    additionalProperties: false,
  },
};

const DEFAULT_OUTREACH_SYSTEM = `You write personalized LinkedIn DMs. Keep them short and native to LinkedIn: prefer 350-700 characters, hard cap 900. Reply with strictly valid JSON only: {"message":"the DM text"} — no markdown, no code fences, no extra keys. The message value must be the real DM, never an ellipsis.

The user message includes who YOU are (sender) and who the recipient is. Write in the sender's voice.
LinkedIn already shows the sender — NEVER append a name signature, full name, or letter sign-off (Cordialement / Best regards + Name). Never use bracket placeholders like [Your Name] or {{name}}.

Follow the LANGUAGE and FORMATTING sections in the user message. If "Additional instructions from the user" conflict with default tone or length, user instructions win — except the no-signature rule always applies.

If your runtime exposes web search, browsing, or URL fetch tools (e.g. Ollama web_search / web_fetch or an app-integrated browser): use them before you draft when the recipient names a company or organization in Company or Headline. Run a few focused queries—such as "<company> official about products", "<company> news", or the company name plus the person's role from Headline—to ground one concrete, truthful hook (what they build, sector, or a recent public milestone). Do not invent financials, headcount, or non-public facts. If tools are unavailable or results are empty, write using only the Clin-provided fields.

Tone: professional, warm, specific. One clear reason to reply. Avoid generic templates and long pitches.

${POST_RECENCY_LLM_RULE}

${POST_ORIGIN_LLM_RULE}`;

const DEFAULT_INVITE_NOTE_SYSTEM = `You write personalized LinkedIn connection invitation notes. Hard cap ${INVITE_NOTE_MAX_CHARS} characters (LinkedIn rejects longer notes). Reply with strictly valid JSON only: {"message":"the invite note"} — no markdown, no code fences, no extra keys. The message value must be the real note, never an ellipsis.

The user message includes who YOU are (sender) and who the recipient is. Write in the sender's voice.
LinkedIn already shows the sender — NEVER append a name signature, full name, or letter sign-off. Never use bracket placeholders like [Your Name] or {{name}}.

Follow the LANGUAGE section in the user message. Prefer 80-180 characters. One specific reason to connect. No pitch, no meeting ask, no links. Do not call tools. Do not write a chain of thought. Do not explain the task.

${POST_RECENCY_LLM_RULE}

${POST_ORIGIN_LLM_RULE}`;

/** Appended to the user message so it applies even when the campaign overrides the system prompt. */
const USER_WEB_RESEARCH_BLOCK = `Research and grounding (read carefully):
- If web search / fetch tools are available in your session, call them before finalizing the message when Company or Headline suggests an employer. Prefer 1–3 short queries; synthesize snippets into at most one or two sentences of relevance in the outreach text.
- Do not state numbers, funding rounds, or claims unless a search result clearly supports them. If unsure, stay generic about the industry or problem space.
- Clin does not provide LinkedIn DM or messaging history—never imply you read their inbox.
- If no tools run or search returns nothing useful, personalize only from the campaign and profile text above.
`;

const USER_LINKEDIN_NATIVE_BLOCK = `LinkedIn-native output (always applies, overrides conflicting writer notes):
- Keep the message short (prefer 350-700 characters).
- NEVER end with a personal name, full name, or letter sign-off (Cordialement / Best regards + Name). LinkedIn already shows who you are.
`;

const USER_INVITE_NOTE_BLOCK = `LinkedIn connection note (always applies):
- Hard cap ${INVITE_NOTE_MAX_CHARS} characters. Shorter is better.
- This is an invitation note, not a DM. One reason to connect. No meeting ask.
- NEVER end with a personal name or letter sign-off.
- The note itself must follow the LANGUAGE instruction, not the language of the campaign brief.
`;

function logDraft(...args: unknown[]) {
  if (process.env.NODE_ENV === "production") return;
  console.info("[clin:outreach-draft]", ...args);
}

export type OutreachDraftKind = "invite" | "followup";

export async function generateInviteNoteDraft(
  memberId: string,
): Promise<{ ok: true } | { ok: false; error: string; stage?: string }> {
  return generateOutreachDraftForMember(memberId, { kind: "invite" });
}

export async function generateFollowupDmDraft(
  memberId: string,
): Promise<{ ok: true } | { ok: false; error: string; stage?: string }> {
  return generateOutreachDraftForMember(memberId, { kind: "followup" });
}

export async function generateOutreachDraftForMember(
  memberId: string,
  opts?: { kind?: OutreachDraftKind },
): Promise<{ ok: true } | { ok: false; error: string; stage?: string }> {
  const db = getDb();
  const member = await db.query.outreachCampaignMembers.findFirst({
    where: eq(outreachCampaignMembers.id, memberId),
  });
  if (!member) return { ok: false, error: "Member not found", stage: "load" };
  if (
    member.status === "skipped" ||
    member.status === "sent" ||
    member.status === "closed" ||
    member.status === "invite_sent"
  ) {
    return {
      ok: false,
      error: `Member status is "${member.status}" — cannot draft outreach.`,
      stage: "status",
    };
  }
  const campaign = await db.query.outreachCampaigns.findFirst({
    where: eq(outreachCampaigns.id, member.campaignId),
  });
  const contact = await db.query.contacts.findFirst({
    where: eq(contacts.id, member.contactId),
  });
  if (!campaign || !contact) {
    return { ok: false, error: "Missing campaign or contact", stage: "load" };
  }

  const kind: OutreachDraftKind =
    opts?.kind ??
    (memberNeedsInviteBeforeDm({
      connectionDegree: contact.connectionDegree,
      outreachStep: member.outreachStep,
      connectionAcceptedAt: member.connectionAcceptedAt,
    })
      ? "invite"
      : "followup");

  const routed = await getLlmConfigForFeature("outreach_draft", { kind });
  const llm = routed.config;
  const override = campaign.systemPromptOverride?.trim();
  let system =
    kind === "invite"
      ? DEFAULT_INVITE_NOTE_SYSTEM
      : override && override.length > 0
        ? override
        : DEFAULT_OUTREACH_SYSTEM;

  const sender = await getSenderIdentity();
  const ownerCtx = await getUserContextForLlm();
  const [globalWriter, brandCtx] = await Promise.all([
    getGlobalWriterInstructions(),
    getOrCreateContentBrandContext(),
  ]);

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
  if (globalWriter) {
    user += `Your global outreach voice (Clin → You & voice):\n${globalWriter}\n\n`;
  }
  const writerNotes = campaign.writerInstructions?.trim();
  if (writerNotes) {
    user += `Additional instructions from the user (follow closely — overrides default formatting and tone when they conflict):\n${writerNotes}\n\n`;
  }
  user += `Recipient:\n- Name: ${contact.fullName ?? ""}\n- Headline: ${contact.headline ?? ""}\n- Company: ${contact.company ?? ""}\n- Location: ${contact.location ?? ""}\n`;

  const [profileBlock, contextBundle, llmExt] = await Promise.all([
    kind === "invite"
      ? getLatestProfileCaptureJson(contact.id).then((json) =>
          formatRichProfileForPrompt(json, 1_200),
        )
      : getLatestProfileContextForOutreach(contact.id),
    kind === "invite"
      ? Promise.resolve(null)
      : buildContactContextBundle(contact.id),
    Promise.resolve(selectContactLlmExtension(contact.id)),
  ]);

  const recipientContext = recipientTextForOutreachLanguage({
    fullName: contact.fullName,
    headline: contact.headline,
    company: contact.company,
    location: contact.location,
    profileContext: profileBlock || contextBundle?.profile_context,
  });
  const resolvedLanguage = resolveOutreachLanguage({
    brandPreference: parseContentLanguagePreference(brandCtx.contentLanguage),
    marketRegion: brandCtx.marketRegion,
    campaignWriterInstructions: writerNotes ?? null,
    globalWriterInstructions: globalWriter,
    recipientContext,
  });
  const languageBlock = buildOutreachLanguageInstruction(resolvedLanguage, {
    matchRecipient: campaignWantsRecipientLanguage(writerNotes ?? null),
  });
  const languageName = POST_LANGUAGE_LABELS[resolvedLanguage.language];
  if (kind === "invite" || !(override && override.length > 0)) {
    system += `\n\nMandatory language: the JSON "message" value must be entirely in ${languageName}. English LinkedIn headlines or English campaign context do not change that.`;
  }
  user = `${languageBlock}\n\n${user}`;
  user += `\n${languageBlock}\n\n`;
  user += `${buildOutreachFormattingInstruction(writerNotes ?? null)}\n\n`;
  if (profileBlock) {
    user += `\nProfile details (from the latest LinkedIn profile Capture in Clin — scroll About/Experience/Education on their profile, then Capture again to refresh):\n${profileBlock}\n`;
  }
  if (contextBundle?.company_intel_context?.trim()) {
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

  if (kind !== "invite") {
    user += `\n${USER_WEB_RESEARCH_BLOCK}\n`;
  }
  user += `\n${kind === "invite" ? USER_INVITE_NOTE_BLOCK : USER_LINKEDIN_NATIVE_BLOCK}\n`;

  logDraft("request", {
    memberId,
    campaignId: campaign.id,
    contactId: contact.id,
    kind,
    model: llm.model,
    modelTier: routed.modelTier,
    routeReason: routed.reason,
    baseUrl: llm.baseUrl,
    provider: llm.provider,
    systemOverride: kind !== "invite" && Boolean(override),
    hasWriterInstructions: Boolean(writerNotes),
    draftLanguage: resolvedLanguage.language,
    draftLanguageSource: resolvedLanguage.source,
  });

  let raw: string;
  try {
    raw = await completeChat({
      config: llm,
      feature: "outreach_draft",
      system,
      user,
      jsonMode: true,
      jsonSchema: OUTREACH_JSON_SCHEMA,
      timeoutMs: kind === "invite" ? 45_000 : 90_000,
      maxTokens: kind === "invite" ? 1024 : 700,
      meta: {
        kind,
        modelTier: routed.modelTier,
        routeReason: routed.reason,
      },
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

  let msg = parseOutreachDraftMessage(raw);
  if (!msg) {
    logDraft("parse_retry", raw.slice(0, 400));
    try {
      raw = await completeChat({
        config: llm,
        feature: "outreach_draft",
        system,
        user:
          user +
          `\n\nYour previous reply was not usable JSON. Output one JSON object only: {"message":"the actual ${kind === "invite" ? "invite note" : "DM"}"}. Fill message with the real text. Never use an ellipsis. No reasoning.\n/no_think`,
        jsonMode: true,
        jsonSchema: OUTREACH_JSON_SCHEMA,
        timeoutMs: kind === "invite" ? 45_000 : 90_000,
        maxTokens: 1024,
        temperature: 0.2,
        meta: {
          kind,
          modelTier: routed.modelTier,
          routeReason: "json parse retry",
        },
      });
      msg = parseOutreachDraftMessage(raw);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        error: `LLM request failed: ${err}. Check Settings → Inference.`,
        stage: "ollama",
      };
    }
  }

  if (!msg) {
    const jsonStr = extractJsonObjectFromModelText(raw);
    logDraft("json_parse_error", jsonStr.slice(0, 400));
    return {
      ok: false,
      error: `Invalid JSON from model: snippet: ${jsonStr.slice(0, 120)}`,
      stage: "parse",
    };
  }

  const parsed = outSchema.safeParse({ message: msg });
  if (!parsed.success) {
    return { ok: false, error: "Empty message from model.", stage: "empty" };
  }

  msg = applySenderNameToDraft(parsed.data.message.trim(), sender);
  if (kind === "invite") {
    msg = clampInviteNote(msg);
  }

  if (kind === "invite") {
    await updateMemberInviteNote(memberId, msg);
    await updateMemberOutreachStep(memberId, "invite");
  } else {
    await updateMemberDraft(memberId, msg);
    if (
      !memberNeedsInviteBeforeDm({
        connectionDegree: contact.connectionDegree,
        outreachStep: member.outreachStep,
        connectionAcceptedAt: member.connectionAcceptedAt,
      })
    ) {
      await updateMemberOutreachStep(memberId, "followup");
    }
  }
  logDraft("saved", { memberId, kind, draftChars: msg.length });
  return { ok: true };
}
