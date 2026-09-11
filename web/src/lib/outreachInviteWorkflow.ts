/** Client-safe invite vs DM routing for two-step campaign outreach. */

import { normalizeConnectionDegree } from "@/lib/connectionDegree";

export const INVITE_NOTE_MAX_CHARS = 200;

export type OutreachAction = "invite" | "dm";
export type OutreachStep = "invite" | "followup";

export function clampInviteNote(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= INVITE_NOTE_MAX_CHARS) return trimmed;
  return trimmed.slice(0, INVITE_NOTE_MAX_CHARS).trimEnd();
}

/** False for empty notes and model placeholders such as "..." */
export function isUsableOutreachCopy(text: string | null | undefined): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  return !/^(?:[.…·]+|<\s*invite note\s*>)$/i.test(t);
}

export function isInviteNoteTooLong(text: string): boolean {
  return text.trim().length > INVITE_NOTE_MAX_CHARS;
}

/**
 * Connect + note is required unless we already know they are 1st degree.
 * Unknown / missing degree still needs an invite: most campaign targets are not 1st.
 */
export function needsInviteStep(
  connectionDegree: string | null | undefined,
): boolean {
  return !isFirstDegreeConnection(connectionDegree);
}

/** Show and draft the invite note (not yet accepted, and not a known 1st). */
export function memberNeedsInviteBeforeDm(input: {
  connectionDegree?: string | null;
  outreachStep?: string | null;
  connectionAcceptedAt?: Date | number | null;
}): boolean {
  if (input.connectionAcceptedAt) return false;
  if (normalizeOutreachStep(input.outreachStep) === "invite") return true;
  return needsInviteStep(input.connectionDegree);
}

export function isFirstDegreeConnection(
  connectionDegree: string | null | undefined,
): boolean {
  return normalizeConnectionDegree(connectionDegree) === "1st";
}

export function normalizeOutreachStep(
  step: string | null | undefined,
): OutreachStep {
  return step === "invite" ? "invite" : "followup";
}

/**
 * Which extension action the current member is eligible for, or null if not sendable.
 */
export function resolveOutreachAction(input: {
  connectionDegree?: string | null;
  outreachStep?: string | null;
  status: string;
  connectionAcceptedAt?: Date | number | null;
}): OutreachAction | null {
  const st = input.status;

  if (st === "followup_ready") return "dm";

  if (st === "ready") {
    if (memberNeedsInviteBeforeDm(input)) return "invite";
    return "dm";
  }

  return null;
}

export function memberHasSendableInvite(input: {
  status: string;
  outreachStep?: string | null;
  draftInviteNote?: string | null;
  connectionAcceptedAt?: Date | number | null;
}): boolean {
  if (input.status !== "ready") return false;
  if (normalizeOutreachStep(input.outreachStep) !== "invite") return false;
  if (input.connectionAcceptedAt) return false;
  return isUsableOutreachCopy(input.draftInviteNote);
}

export function memberHasSendableFollowup(input: {
  status: string;
  outreachStep?: string | null;
  draftOutreach?: string | null;
}): boolean {
  const draft = isUsableOutreachCopy(input.draftOutreach);
  if (!draft) return false;
  if (input.status === "followup_ready") return true;
  if (
    input.status === "ready" &&
    normalizeOutreachStep(input.outreachStep) === "followup"
  ) {
    return true;
  }
  return false;
}

export function statusLabelForMember(status: string): string {
  switch (status) {
    case "ready":
      return "ready for extension";
    case "invite_sent":
      return "invite sent";
    case "followup_ready":
      return "ready for follow-up DM";
    case "engage":
      return "engage queued";
    case "closed":
      return "campaign ended";
    default:
      return status;
  }
}

export function nextMemberStatusAfterSend(
  action: OutreachAction,
): "invite_sent" | "sent" {
  return action === "invite" ? "invite_sent" : "sent";
}

export function pickOutreachQueueDecision(input: {
  inviteEnabled: boolean;
  dmEnabled: boolean;
  inviteCapHit: boolean;
  dmCapHit: boolean;
  hasInviteCandidate: boolean;
  hasDmCandidate: boolean;
}):
  | { action: OutreachAction }
  | { reason: string } {
  if (!input.inviteEnabled && !input.dmEnabled) {
    return { reason: "linkedin_outreach_disabled" };
  }
  if (input.inviteEnabled && !input.inviteCapHit && input.hasInviteCandidate) {
    return { action: "invite" };
  }
  if (input.dmEnabled && !input.dmCapHit && input.hasDmCandidate) {
    return { action: "dm" };
  }
  if (input.inviteEnabled && input.inviteCapHit && !input.hasDmCandidate) {
    return { reason: "daily_invite_cap" };
  }
  if (input.dmEnabled && input.dmCapHit && !input.hasInviteCandidate) {
    return { reason: "daily_send_cap" };
  }
  return { reason: "no_ready_members" };
}
