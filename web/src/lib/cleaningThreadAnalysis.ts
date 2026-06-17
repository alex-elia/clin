import { selectContactLlmExtension } from "@/lib/contactSqlExtras";
import {
  getCampaignThreadSalesContext,
  runInboxThreadAnalysis,
} from "@/lib/inboxThreadAnalysis";
import type { InboxThreadAnalysis } from "@/lib/inboxThreadAnalysisTypes";
import type { StoredThreadAnalysis } from "@/lib/inboxThreadAnalysisTypes";
import {
  getThreadAnalysis,
  isThreadAnalysisStale,
} from "@/lib/inboxThreadAnalysisStore";
import { getLlmConfig } from "@/lib/llm/completeChat";
import type { LlmConfig } from "@/lib/llm/types";
import { getMergedMessagingThreadForContact } from "@/lib/messagingContext";
import { MANUAL_PASTE_THREAD_KEY } from "@/lib/pastedThreadText";

export type CleaningThreadContext = {
  stored: StoredThreadAnalysis | null;
  analysis: InboxThreadAnalysis | null;
  threadKey: string | null;
  messageCount: number;
};

export { formatThreadAnalysisForContactAnalyze } from "@/lib/cleaningThreadHelpers";

/** Run or refresh inbox-style thread analysis for cleaning (any captured or pasted thread). */
export async function ensureCleaningThreadAnalysis(
  contactId: string,
  llm?: LlmConfig,
): Promise<CleaningThreadContext> {
  const thread = await getMergedMessagingThreadForContact(contactId);
  const pasted =
    selectContactLlmExtension(contactId)?.llmMessageContext?.trim() ?? "";

  if (!thread?.messages.length && pasted.length < 40) {
    return {
      stored: null,
      analysis: null,
      threadKey: null,
      messageCount: 0,
    };
  }

  const threadKey = thread?.threadKey ?? MANUAL_PASTE_THREAD_KEY;
  const messageCount = thread?.messageCount ?? 0;
  const stored = getThreadAnalysis(contactId, threadKey);

  if (
    thread?.messages.length &&
    !isThreadAnalysisStale(stored, messageCount)
  ) {
    return {
      stored,
      analysis: stored?.analysis ?? null,
      threadKey,
      messageCount,
    };
  }

  if (!thread?.messages.length && stored && pasted.length >= 40) {
    return {
      stored,
      analysis: stored.analysis,
      threadKey,
      messageCount: stored.messageCount,
    };
  }

  try {
    const settings = llm ?? (await getLlmConfig());
    const campaignContext = await getCampaignThreadSalesContext(contactId);
    const out = await runInboxThreadAnalysis({
      contactId,
      threadKey: thread ? thread.threadKey : MANUAL_PASTE_THREAD_KEY,
      pastedThreadText: thread ? undefined : pasted,
      settings,
      persist: true,
      campaignContext,
    });
    const fresh = getThreadAnalysis(contactId, out.threadKey);
    return {
      stored: fresh,
      analysis: out.analysis,
      threadKey: out.threadKey,
      messageCount: out.messageCount,
    };
  } catch (err) {
    console.error("[clin cleaning] thread analysis failed:", contactId, err);
    return {
      stored,
      analysis: stored?.analysis ?? null,
      threadKey,
      messageCount,
    };
  }
}
