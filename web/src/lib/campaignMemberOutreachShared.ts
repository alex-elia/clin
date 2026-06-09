/** Client-safe outreach member fields — no DB imports. */

export type MemberOutreachExtras = {
  messageSentAt: Date | null;
  messageReplyOutcome: string;
  messageOutcomeNote: string | null;
  closedAt: Date | null;
  closeReason: string | null;
};
