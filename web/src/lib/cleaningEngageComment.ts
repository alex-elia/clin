import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { contacts } from "@/db/schema";
import { getGlobalWriterInstructions } from "@/lib/brand";
import { buildContactContextBundle } from "@/lib/contactContextBundle";
import {
  buildContactPlaybookFromAnalysis,
  formatContactPlaybookForDraftPrompt,
} from "@/lib/contactPlaybook";
import { pickLatestAnalysisView } from "@/lib/contactLlmDisplay";
import { selectContactLlmExtension } from "@/lib/contactSqlExtras";
import { getLatestThreadAnalysisForContact } from "@/lib/inboxThreadAnalysisStore";
import { extractJsonObjectFromModelText } from "@/lib/llmAnalysis";
import { completeChat, getLlmConfig } from "@/lib/llm/completeChat";
import { getLatestProfileContextForOutreach } from "@/lib/profileCaptureContext";
import {
  applySenderNameToDraft,
  buildSenderIdentityPromptBlock,
  getSenderIdentity,
} from "@/lib/senderIdentity";
import { getUserContextForLlm, userContextHasLlmSignal } from "@/lib/userContext";
import { POST_RECENCY_LLM_RULE } from "@/lib/profilePostRecency";
import { POST_ORIGIN_LLM_RULE } from "@/lib/profilePostKinds";

const outSchema = z.object({ comment: z.string().min(1) });

const ENGAGE_COMMENT_SYSTEM = `You write short, tailored LinkedIn comments the user can paste on a contact's recent post.

Rules:
- 1–3 sentences, warm and specific — not a sales pitch or connection request.
- Reference something concrete from their posts or profile when captures exist.
- No hashtags, no "Great post!", no generic praise without substance.
- Never sign with your name or a letter sign-off — LinkedIn already shows who commented.
- Match the language of the post when obvious (French post → French comment).
- ${POST_RECENCY_LLM_RULE}
- ${POST_ORIGIN_LLM_RULE}
- Reply with strictly valid JSON only: {"comment":"..."} — no markdown, no code fences.`;

export type EngageCommentResult =
  | { ok: true; comment: string }
  | { ok: false; error: string };

export type EngageCommentCampaignContext = {
  name: string;
  contextText: string;
  icpText?: string | null;
};

export async function generateEngageCommentForContact(
  contactId: string,
  opts?: { campaignContext?: EngageCommentCampaignContext },
): Promise<EngageCommentResult> {
  const db = getDb();
  const contact = await db.query.contacts.findFirst({
    where: eq(contacts.id, contactId),
  });
  if (!contact) return { ok: false, error: "Contact not found." };

  function parseEnvelope(raw: string | null | undefined): unknown {
    if (!raw?.trim()) return null;
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }

  const llmExt = selectContactLlmExtension(contactId);
  const rawRefined = parseEnvelope(llmExt?.llmRefinedJson);
  const rawProv = parseEnvelope(llmExt?.llmProvisionalJson);
  const analysis = pickLatestAnalysisView(rawRefined, rawProv);
  const threadStored = getLatestThreadAnalysisForContact(contactId);
  const playbook = buildContactPlaybookFromAnalysis({
    analysis,
    rawOutput:
      (rawRefined as Record<string, unknown> | null) ??
      (rawProv as Record<string, unknown> | null),
    threadAnalysis: threadStored?.analysis ?? null,
  });

  const [sender, ownerCtx, globalWriter, profileBlock, contextBundle] =
    await Promise.all([
      getSenderIdentity(),
      getUserContextForLlm(),
      getGlobalWriterInstructions(),
      getLatestProfileContextForOutreach(contactId),
      buildContactContextBundle(contactId),
    ]);

  let user = `${buildSenderIdentityPromptBlock(sender)}\n\n`;
  user += `Task: Write ONE public LinkedIn comment for this person (not a DM).\n\n`;
  user += `Recipient:\n- Name: ${contact.fullName ?? ""}\n- Headline: ${contact.headline ?? ""}\n- Company: ${contact.company ?? ""}\n`;

  if (userContextHasLlmSignal(ownerCtx)) {
    if (ownerCtx.positioningSummary) {
      user += `\nYour positioning (for tone only — do not pitch in the comment):\n${ownerCtx.positioningSummary}\n`;
    }
  }
  if (globalWriter) {
    user += `\nYour voice (Clin):\n${globalWriter}\n`;
  }
  if (profileBlock) {
    user += `\n${profileBlock}\n`;
  }
  if (contextBundle.company_intel_context?.trim()) {
    user += `\nCompany intel:\n${contextBundle.company_intel_context.trim()}\n`;
  }

  const playbookBlock = formatContactPlaybookForDraftPrompt(playbook);
  if (playbookBlock) {
    user += `\n${playbookBlock}\n`;
  }

  const campaignCtx = opts?.campaignContext;
  if (campaignCtx) {
    user += `\nCampaign context (tone only — do not pitch in the public comment):\n`;
    user += `- Campaign: ${campaignCtx.name}\n`;
    if (campaignCtx.icpText?.trim()) {
      user += `- ICP: ${campaignCtx.icpText.trim()}\n`;
    }
    user += `- Offer framing: ${campaignCtx.contextText.trim().slice(0, 1200)}\n`;
  }

  user +=
    `\n${POST_RECENCY_LLM_RULE}\n${POST_ORIGIN_LLM_RULE}\nWrite the comment the user should paste on the most relevant recent post (within the last year).`;

  let raw: string;
  try {
    raw = await completeChat({
      config: await getLlmConfig(),
      feature: "cleaning_engage_comment",
      system: ENGAGE_COMMENT_SYSTEM,
      user,
      jsonMode: true,
      timeoutMs: 120_000,
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  const jsonStr = extractJsonObjectFromModelText(raw);
  if (!jsonStr.trim()) {
    return { ok: false, error: "Model returned no JSON comment." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return { ok: false, error: "Could not parse comment JSON." };
  }

  const out = outSchema.safeParse(parsed);
  if (!out.success) {
    return { ok: false, error: "Comment JSON missing required field." };
  }

  const comment = applySenderNameToDraft(out.data.comment.trim(), sender);
  if (!comment) return { ok: false, error: "Empty comment from model." };

  return { ok: true, comment };
}
