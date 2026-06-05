import { getAutopilotSettings } from "@/lib/autopilot";
import { inferReplyOutcomeFromThread } from "@/lib/campaignMemberMessaging";
import { updateMemberReplyOutcome } from "@/lib/campaignMemberOutreach";
import { getLlmConfig } from "@/lib/llm/completeChat";
import {
  getCampaignThreadSalesContext,
  runInboxThreadAnalysis,
} from "@/lib/inboxThreadAnalysis";
import {
  getThreadAnalysis,
  isThreadAnalysisStale,
} from "@/lib/inboxThreadAnalysisStore";
import { getMergedMessagingThreadForContact } from "@/lib/messagingContext";
import { getSqlite } from "@/db";

/**
 * After messaging capture: auto-run strategic thread analysis when they replied
 * (or thread changed). Updates campaign member reply status when applicable.
 */
export function maybeAutopilotThreadAnalysisAfterMessagingCapture(
  contactId: string,
): void {
  void (async () => {
    try {
      const settings = await getAutopilotSettings();
      if (!settings.analyzeAfterProfileCapture) return;

      const thread = await getMergedMessagingThreadForContact(contactId);
      if (!thread?.messages.length) return;

      const shouldAnalyze =
        thread.replyState.needsReply ||
        thread.replyState.lastFrom === "them" ||
        thread.replyState.theirMessageCount > 0;

      if (!shouldAnalyze) return;

      const stored = getThreadAnalysis(contactId, thread.threadKey);
      if (!isThreadAnalysisStale(stored, thread.messageCount)) return;

      const llm = await getLlmConfig();
      const campaignContext = await getCampaignThreadSalesContext(contactId);

      const out = await runInboxThreadAnalysis({
        contactId,
        threadKey: thread.threadKey,
        settings: llm,
        persist: true,
        campaignContext,
      });

      const outcome = inferReplyOutcomeFromThread(thread);
      const note =
        out.analysis.sales_rationale?.slice(0, 500) ||
        out.analysis.thread_summary?.slice(0, 500) ||
        null;

      const sqlite = getSqlite();
      const member = sqlite
        .prepare(
          `SELECT id FROM outreach_campaign_members
           WHERE contact_id = ? AND status = 'sent'
           ORDER BY updated_at DESC LIMIT 1`,
        )
        .get(contactId) as { id: string } | undefined;

      if (member?.id) {
        const stage = out.analysis.thread_stage;
        const action = out.analysis.recommended_action;
        let replyOutcome: string = outcome;
        let outcomeNote = note;

        if (stage === "ghosted" || stage === "closed") {
          replyOutcome = "ghosted";
          outcomeNote =
            out.analysis.action_rationale?.slice(0, 500) ||
            out.analysis.sales_rationale?.slice(0, 500) ||
            note;
        } else if (
          action === "mark_done" ||
          action === "no_reply_needed" ||
          out.analysis.strategy_verdict === "no_reply"
        ) {
          outcomeNote =
            out.analysis.action_rationale?.slice(0, 500) ||
            out.analysis.sales_rationale?.slice(0, 500) ||
            note;
        }

        if (replyOutcome === "replied" || replyOutcome === "ghosted") {
          await updateMemberReplyOutcome(
            member.id,
            replyOutcome,
            outcomeNote,
          );
        } else if (outcomeNote && action === "mark_done") {
          await updateMemberReplyOutcome(member.id, outcome, outcomeNote);
        }
      }
    } catch (err) {
      console.error(
        "[clin autopilot] thread analysis after messaging capture failed:",
        contactId,
        err,
      );
    }
  })();
}
