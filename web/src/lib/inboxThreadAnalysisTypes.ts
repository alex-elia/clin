/** Client-safe types and labels for inbox thread AI coach (no server/db imports). */

export type InboxThreadRecommendedAction =
  | "reply_now"
  | "reply_later"
  | "mark_done"
  | "no_reply_needed"
  | "follow_up_question"
  | "schedule_call";

/** Primary sales decision shown to the user. */
export type ThreadStrategyVerdict =
  | "reply_with_draft"
  | "no_reply"
  | "other";

export type ThreadStage =
  | "cold_no_reply"
  | "awaiting_their_reply"
  | "first_reply"
  | "objection"
  | "scheduling"
  | "ghosted"
  | "social_only"
  | "closed";

export type InboxThreadAnalysis = {
  thread_stage?: ThreadStage;
  thread_summary: string;
  urgency: "high" | "medium" | "low";
  strategy_verdict: ThreadStrategyVerdict;
  sales_rationale: string;
  recommended_action: InboxThreadRecommendedAction;
  action_rationale: string;
  suggested_reply?: string | null;
  alternative_actions?: string[] | null;
  tone_notes?: string | null;
};

export const THREAD_STAGE_LABELS: Record<ThreadStage, string> = {
  cold_no_reply: "Cold — no reply yet",
  awaiting_their_reply: "Ball in their court",
  first_reply: "First reply — qualify",
  objection: "Objection or pushback",
  scheduling: "Scheduling / next meeting",
  ghosted: "Ghosted after engagement",
  social_only: "Social — not a sales thread",
  closed: "Closed or rejected",
};

export const INBOX_ACTION_LABELS: Record<InboxThreadRecommendedAction, string> =
  {
    reply_now: "Reply now",
    reply_later: "Reply later",
    mark_done: "Mark done — no further action",
    no_reply_needed: "No reply needed",
    follow_up_question: "Ask a clarifying question",
    schedule_call: "Suggest a call or meeting",
  };

export const STRATEGY_VERDICT_LABELS: Record<ThreadStrategyVerdict, string> = {
  reply_with_draft: "Reply — use draft below",
  no_reply: "No answer recommended",
  other: "Other move — see advice",
};

export type StoredThreadAnalysis = {
  contactId: string;
  threadKey: string;
  analysis: InboxThreadAnalysis;
  messageCount: number;
  model: string | null;
  analyzedAt: Date;
};
