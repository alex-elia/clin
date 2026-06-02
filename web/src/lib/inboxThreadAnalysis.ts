import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { contacts } from "@/db/schema";
import { extractJsonObjectFromModelText } from "@/lib/llmAnalysis";
import { completeChat, getLlmConfig } from "@/lib/llm/completeChat";
import type { LlmConfig } from "@/lib/llm/types";
import {
  formatMessagingMessagesForContext,
  getMergedMessagingThreadForContact,
  type ThreadReplyState,
} from "@/lib/messagingContext";
import { getLatestProfileContextForOutreach } from "@/lib/profileCaptureContext";
import {
  buildSenderIdentityPromptBlock,
  getSenderIdentity,
} from "@/lib/senderIdentity";
import { getUserContextForLlm, userContextHasLlmSignal } from "@/lib/userContext";
import type { InboxThreadAnalysis } from "@/lib/inboxThreadAnalysisTypes";

export type { InboxThreadAnalysis } from "@/lib/inboxThreadAnalysisTypes";
export { INBOX_ACTION_LABELS } from "@/lib/inboxThreadAnalysisTypes";

export const inboxThreadAnalysisSchema = z.object({
  thread_summary: z.string(),
  urgency: z.enum(["high", "medium", "low"]),
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

const SYSTEM_PROMPT = `You are Clin's inbox coach for LinkedIn DM threads stored locally on the user's machine.

Given a captured message thread, contact profile hints, and the sender's goals, respond with a single JSON object (no markdown):
{
  "thread_summary": "1-2 sentences on what the thread is about and where it stands",
  "urgency": "high" | "medium" | "low",
  "recommended_action": "reply_now" | "reply_later" | "mark_done" | "no_reply_needed" | "follow_up_question" | "schedule_call",
  "action_rationale": "why this action fits",
  "suggested_reply": "optional draft reply in the sender's voice (under 1200 chars) — include when reply_now, reply_later, follow_up_question, or schedule_call",
  "alternative_actions": ["optional short bullets"],
  "tone_notes": "optional brief note on tone or risks"
}

Rules:
- Use only facts from the payload. Do not invent prior conversations or LinkedIn activity.
- If the last message is from Them and unanswered, bias toward reply_now or follow_up_question unless clearly spam or closed.
- If the last message is from Me with no reply, reply_later or mark_done may fit.
- suggested_reply must sound human, concise, professional — no bracket placeholders like [Your Name].
- Sign with the sender's real name when known.
- Align with owner goals/offer when provided; do not hard-sell if the thread is purely social.
- Clin never sends messages — the user copies your draft manually on LinkedIn.`;

function buildUserPayload(input: {
  contact: typeof contacts.$inferSelect;
  threadText: string;
  replyState: ThreadReplyState;
  profileBlock: string;
  senderBlock: string;
  ownerBlock: string;
}): string {
  return [
    input.senderBlock,
    input.ownerBlock,
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
  settings?: LlmConfig;
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

  const thread = await getMergedMessagingThreadForContact(input.contactId, {
    threadKey: input.threadKey,
  });
  if (!thread?.messages.length) {
    throw new Error(
      "No messaging thread captured for this contact. Open the LinkedIn thread and use Capture → Messaging in the extension.",
    );
  }

  const settings = input.settings ?? (await getLlmConfig());
  const sender = await getSenderIdentity();
  const ownerCtx = await getUserContextForLlm();
  const profileCtx = await getLatestProfileContextForOutreach(input.contactId);

  let ownerBlock = "";
  if (userContextHasLlmSignal(ownerCtx)) {
    const parts: string[] = ["Owner context (Clin):"];
    if (ownerCtx.goalsText) parts.push(`Goals: ${ownerCtx.goalsText}`);
    if (ownerCtx.positioningSummary) {
      parts.push(`Offer / ICP: ${ownerCtx.positioningSummary}`);
    }
    ownerBlock = parts.join("\n");
  }

  const threadText =
    input.threadKey && thread.text
      ? thread.text
      : formatMessagingMessagesForContext(thread.messages);

  const rawText = await completeChat({
    config: settings,
    feature: "inbox_thread_analyze",
    system: SYSTEM_PROMPT,
    user: buildUserPayload({
      contact,
      threadText,
      replyState: thread.replyState,
      profileBlock: profileCtx?.trim() ?? "",
      senderBlock: buildSenderIdentityPromptBlock(sender),
      ownerBlock,
    }),
    jsonMode: true,
    timeoutMs: 120_000,
    meta: { contactId: input.contactId, threadKey: thread.threadKey },
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

  return {
    analysis: out.data,
    threadKey: thread.threadKey,
    messageCount: thread.messageCount,
    replyState: thread.replyState,
    model: settings.model,
  };
}
