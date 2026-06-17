import type { InboxThreadAnalysis } from "@/lib/inboxThreadAnalysisTypes";
import { THREAD_STAGE_LABELS } from "@/lib/inboxThreadAnalysisTypes";

/** Client-safe helpers — no DB / Node imports. */

export function formatThreadAnalysisForContactAnalyze(
  analysis: InboxThreadAnalysis,
): Record<string, unknown> {
  return {
    thread_stage: analysis.thread_stage ?? null,
    thread_summary: analysis.thread_summary,
    strategy_verdict: analysis.strategy_verdict,
    sales_rationale: analysis.sales_rationale,
    recommended_action: analysis.recommended_action,
    action_rationale: analysis.action_rationale,
    tone_notes: analysis.tone_notes ?? null,
  };
}

export function threadStageLabel(stage: string | undefined): string | null {
  if (!stage) return null;
  return THREAD_STAGE_LABELS[stage as keyof typeof THREAD_STAGE_LABELS] ?? stage;
}

export function cleaningAdviceFromThread(
  analysis: InboxThreadAnalysis | null | undefined,
): string | null {
  if (!analysis) return null;
  const stage = analysis.thread_stage;
  if (stage === "ghosted") {
    return (
      analysis.action_rationale?.trim() ||
      analysis.sales_rationale?.trim() ||
      "Messaging thread went quiet after engagement — review whether to disconnect."
    );
  }
  if (stage === "cold_no_reply") {
    return (
      analysis.sales_rationale?.trim() ||
      "One-sided outreach with no reply — consider pruning if not worth another touch."
    );
  }
  if (stage === "closed") {
    return (
      analysis.action_rationale?.trim() ||
      "Thread is closed — keep passive or review removal."
    );
  }
  if (analysis.action_rationale?.trim()) return analysis.action_rationale.trim();
  if (analysis.thread_summary?.trim()) return analysis.thread_summary.trim();
  return null;
}

/** True when thread analysis suggests pruning (ghost / cold one-sided). */
export function threadSuggestsRemoval(
  analysis: InboxThreadAnalysis | null | undefined,
): boolean {
  if (!analysis) return false;
  const stage = analysis.thread_stage;
  if (stage === "ghosted" || stage === "closed") return true;
  if (
    stage === "cold_no_reply" &&
    analysis.strategy_verdict === "no_reply" &&
    analysis.recommended_action === "mark_done"
  ) {
    return true;
  }
  return false;
}
