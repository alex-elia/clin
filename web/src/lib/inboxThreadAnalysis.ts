import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { contacts, outreachCampaignMembers, outreachCampaigns } from "@/db/schema";
import { getGlobalWriterInstructions } from "@/lib/brand";
import { extractJsonObjectFromModelText } from "@/lib/llmAnalysis";
import { completeChat, getLlmConfig } from "@/lib/llm/completeChat";
import type { LlmConfig } from "@/lib/llm/types";
import {
  formatMessagingMessagesForContext,
  getMergedMessagingThreadForContact,
  type ThreadReplyState,
} from "@/lib/messagingContext";
import { selectContactLlmExtension, tryUpdateLlmMessageContext } from "@/lib/contactSqlExtras";
import {
  MANUAL_PASTE_THREAD_KEY,
  deriveReplyStateFromPastedText,
  estimatePastedMessageCount,
} from "@/lib/pastedThreadText";
import { saveThreadAnalysis } from "@/lib/inboxThreadAnalysisStore";
import { getLatestProfileContextForOutreach } from "@/lib/profileCaptureContext";
import {
  buildSalesCoachPlaybookBlock,
  inferSalesMotion,
} from "@/lib/salesCoachPlaybook";
import {
  buildSenderIdentityPromptBlock,
  getSenderIdentity,
} from "@/lib/senderIdentity";
import { INBOX_THREAD_ANALYSIS_SYSTEM_PROMPT } from "@/lib/threadAnalysisPrompt";
import { getUserContextForLlm, userContextHasLlmSignal } from "@/lib/userContext";
import type { InboxThreadAnalysis } from "@/lib/inboxThreadAnalysisTypes";
export type { InboxThreadAnalysis } from "@/lib/inboxThreadAnalysisTypes";
export {
  INBOX_ACTION_LABELS,
  STRATEGY_VERDICT_LABELS,
} from "@/lib/inboxThreadAnalysisTypes";

export const inboxThreadAnalysisSchema = z.object({
  thread_stage: z.enum([
    "cold_no_reply",
    "awaiting_their_reply",
    "first_reply",
    "objection",
    "scheduling",
    "ghosted",
    "social_only",
    "closed",
  ]),
  thread_summary: z.string(),
  urgency: z.enum(["high", "medium", "low"]),
  strategy_verdict: z.enum(["reply_with_draft", "no_reply", "other"]),
  sales_rationale: z.string(),
  recommended_action: z.enum([
    "reply_now",
    "reply_later",
    "mark_done",
    "no_reply_needed",
    "follow_up_question",
    "schedule_call",
  ]),
  action_rationale: z.string(),
  suggested_reply: z.string().nullish(),
  alternative_actions: z.array(z.string()).nullish(),
  tone_notes: z.string().nullish(),
}) satisfies z.ZodType<InboxThreadAnalysis>;

export type CampaignThreadSalesContext = {
  campaignName: string;
  contextText: string;
  icpText: string | null;
  writerInstructions: string | null;
  draftOutreach: string | null;
  memberStatus: string;
  icpMatch: string | null;
  icpRationale: string | null;
  icpRecommendedAction: string | null;
};

export async function getCampaignThreadSalesContext(
  contactId: string,
): Promise<CampaignThreadSalesContext | null> {
  const db = getDb();
  const rows = await db
    .select({
      campaignName: outreachCampaigns.name,
      contextText: outreachCampaigns.contextText,
      icpText: outreachCampaigns.icpText,
      writerInstructions: outreachCampaigns.writerInstructions,
      draftOutreach: outreachCampaignMembers.draftOutreach,
      memberStatus: outreachCampaignMembers.status,
      icpMatch: outreachCampaignMembers.icpMatch,
      icpRationale: outreachCampaignMembers.icpRationale,
      icpRecommendedAction: outreachCampaignMembers.icpRecommendedAction,
      memberUpdatedAt: outreachCampaignMembers.updatedAt,
    })
    .from(outreachCampaignMembers)
    .innerJoin(
      outreachCampaigns,
      eq(outreachCampaignMembers.campaignId, outreachCampaigns.id),
    )
    .where(eq(outreachCampaignMembers.contactId, contactId))
    .orderBy(desc(outreachCampaignMembers.updatedAt))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return {
    campaignName: row.campaignName,
    contextText: row.contextText,
    icpText: row.icpText,
    writerInstructions: row.writerInstructions,
    draftOutreach: row.draftOutreach,
    memberStatus: row.memberStatus,
    icpMatch: row.icpMatch,
    icpRationale: row.icpRationale,
    icpRecommendedAction: row.icpRecommendedAction,
  };
}

function buildOwnerContextBlock(ownerCtx: Awaited<ReturnType<typeof getUserContextForLlm>>): string {
  if (!userContextHasLlmSignal(ownerCtx)) return "";
  const parts: string[] = ["Owner context (Clin):"];
  if (ownerCtx.goalsText) parts.push(`Goals:\n${ownerCtx.goalsText}`);
  if (ownerCtx.positioningSummary) {
    parts.push(`Positioning / offer / ICP:\n${ownerCtx.positioningSummary}`);
  }
  if (ownerCtx.selfProfile) {
    const sp = ownerCtx.selfProfile;
    parts.push(
      "Owner profile snapshot:",
      JSON.stringify(
        {
          fullName: sp.fullName,
          headline: sp.headline,
          company: sp.company,
          location: sp.location,
        },
        null,
        2,
      ),
    );
  }
  return parts.join("\n");
}

function buildCampaignContextBlock(campaignCtx: CampaignThreadSalesContext): string {
  const parts = [
    "Campaign outreach context:",
    `Campaign: ${campaignCtx.campaignName}`,
    `Member status: ${campaignCtx.memberStatus}`,
    `Offer / angle:\n${campaignCtx.contextText}`,
  ];
  if (campaignCtx.icpText?.trim()) {
    parts.push(`Campaign ICP:\n${campaignCtx.icpText.trim()}`);
  }
  if (campaignCtx.writerInstructions?.trim()) {
    parts.push(
      `Reply coach instructions (tone, CTA, must-mention, avoid — follow for suggested_reply):\n${campaignCtx.writerInstructions.trim()}`,
    );
  }
  const draft = campaignCtx.draftOutreach?.trim();
  if (draft) {
    parts.push(`Our outreach message sent (draft on file):\n${draft}`);
  }
  if (campaignCtx.icpMatch) {
    const icpLines = [`Member ICP fit: ${campaignCtx.icpMatch}`];
    if (campaignCtx.icpRationale?.trim()) {
      icpLines.push(`ICP rationale: ${campaignCtx.icpRationale.trim()}`);
    }
    if (campaignCtx.icpRecommendedAction?.trim()) {
      icpLines.push(`ICP recommended action: ${campaignCtx.icpRecommendedAction.trim()}`);
    }
    parts.push(icpLines.join("\n"));
  }
  return parts.join("\n\n");
}

function buildUserPayload(input: {
  contact: typeof contacts.$inferSelect;
  threadText: string;
  replyState: ThreadReplyState;
  profileBlock: string;
  senderBlock: string;
  ownerBlock: string;
  campaignBlock: string;
  globalWriterBlock: string;
  playbookBlock: string;
}): string {
  return [
    input.senderBlock,
    input.ownerBlock,
    input.globalWriterBlock,
    input.playbookBlock,
    input.campaignBlock,
    "Contact:",
    JSON.stringify(
      {
        fullName: input.contact.fullName,
        headline: input.contact.headline,
        company: input.contact.company,
        location: input.contact.location,
      },
      null,
      2,
    ),
    input.profileBlock ? `\nProfile capture:\n${input.profileBlock}` : "",
    "\nThread reply state:",
    JSON.stringify(input.replyState, null, 2),
    "\nMessage thread (Me = sender, Them = contact):",
    input.threadText,
  ]
    .filter(Boolean)
    .join("\n");
}
export async function runInboxThreadAnalysis(input: {
  contactId: string;
  threadKey?: string;
  pastedThreadText?: string;
  persistPastedThread?: boolean;
  settings?: LlmConfig;
  persist?: boolean;
  campaignContext?: CampaignThreadSalesContext | null;
}): Promise<{
  analysis: InboxThreadAnalysis;
  threadKey: string;
  messageCount: number;
  replyState: ThreadReplyState;
  model: string;
}> {
  const db = getDb();
  const contact = await db.query.contacts.findFirst({
    where: eq(contacts.id, input.contactId),
  });
  if (!contact) throw new Error("Contact not found");

  const useManual =
    input.threadKey === MANUAL_PASTE_THREAD_KEY ||
    Boolean(input.pastedThreadText?.trim());

  const captured = useManual
    ? null
    : await getMergedMessagingThreadForContact(input.contactId, {
        threadKey: input.threadKey,
      });

  let resolvedThreadKey: string;
  let threadText: string;
  let replyState: ThreadReplyState;
  let messageCount: number;

  if (captured?.messages.length && !useManual) {
    resolvedThreadKey = captured.threadKey;
    threadText =
      input.threadKey && captured.text
        ? captured.text
        : formatMessagingMessagesForContext(captured.messages);
    replyState = captured.replyState;
    messageCount = captured.messageCount;
  } else {
    const pasted =
      input.pastedThreadText?.trim() ||
      selectContactLlmExtension(input.contactId)?.llmMessageContext?.trim() ||
      "";
    if (pasted.length < 40) {
      throw new Error(
        "Paste the conversation (at least a few lines) or capture the thread in the extension.",
      );
    }
    if (input.persistPastedThread && input.pastedThreadText?.trim()) {
      tryUpdateLlmMessageContext(input.contactId, input.pastedThreadText.trim());
    }
    resolvedThreadKey = MANUAL_PASTE_THREAD_KEY;
    threadText = pasted;
    replyState = deriveReplyStateFromPastedText(pasted);
    messageCount = estimatePastedMessageCount(pasted);
  }

  const settings = input.settings ?? (await getLlmConfig());
  const sender = await getSenderIdentity();
  const ownerCtx = await getUserContextForLlm();
  const profileCtx = await getLatestProfileContextForOutreach(input.contactId);
  const campaignCtx =
    input.campaignContext !== undefined
      ? input.campaignContext
      : await getCampaignThreadSalesContext(input.contactId);

  const ownerBlock = buildOwnerContextBlock(ownerCtx);
  const campaignBlock = campaignCtx ? buildCampaignContextBlock(campaignCtx) : "";
  const globalWriter = await getGlobalWriterInstructions();
  const globalWriterBlock = globalWriter?.trim()
    ? `Global voice instructions (all campaigns):\n${globalWriter.trim()}`
    : "";

  const motion = inferSalesMotion({
    positioningSummary: ownerCtx.positioningSummary,
    goalsText: ownerCtx.goalsText,
    campaignContextText: campaignCtx?.contextText,
    campaignIcpText: campaignCtx?.icpText,
    contactHeadline: contact.headline,
    contactCompany: contact.company,
  });
  const playbookBlock = buildSalesCoachPlaybookBlock(motion);

  const threadTextForModel = threadText;

  const rawText = await completeChat({
    config: settings,
    feature: "inbox_thread_analyze",
    system: INBOX_THREAD_ANALYSIS_SYSTEM_PROMPT,
    user: buildUserPayload({
      contact,
      threadText: threadTextForModel,
      replyState,
      profileBlock: profileCtx?.trim() ?? "",
      senderBlock: buildSenderIdentityPromptBlock(sender),
      ownerBlock,
      campaignBlock,
      globalWriterBlock,
      playbookBlock,
    }),
    jsonMode: true,
    timeoutMs: 120_000,
    meta: { contactId: input.contactId, threadKey: resolvedThreadKey },
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

  const out = inboxThreadAnalysisSchema.safeParse(parsed);
  if (!out.success) {
    throw new Error(
      `JSON shape mismatch: ${out.error.message.slice(0, 400)}`,
    );
  }

  if (input.persist !== false) {
    await saveThreadAnalysis({
      contactId: input.contactId,
      threadKey: resolvedThreadKey,
      analysis: out.data,
      messageCount,
      model: settings.model,
    });
  }

  return {
    analysis: out.data,
    threadKey: resolvedThreadKey,
    messageCount,
    replyState,
    model: settings.model,
  };
}
