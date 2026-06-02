/** Client-safe types and labels for inbox thread AI coach (no server/db imports). */

export type InboxThreadRecommendedAction =
  | "reply_now"
  | "reply_later"
  | "mark_done"
  | "no_reply_needed"
  | "follow_up_question"
  | "schedule_call";

export type InboxThreadAnalysis = {
  thread_summary: string;
  urgency: "high" | "medium" | "low";
  recommended_action: InboxThreadRecommendedAction;
  action_rationale: string;
  suggested_reply?: string | null;
  alternative_actions?: string[] | null;
  tone_notes?: string | null;
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
