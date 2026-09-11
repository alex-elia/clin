import { normalizeConnectionDegree } from "@/lib/connectionDegree";
import {
  isFirstDegreeConnection,
  needsInviteStep,
} from "@/lib/outreachInviteWorkflow";

/** Disconnect on LinkedIn only exists for 1st-degree connections. */
export function cleaningCanDisconnect(
  connectionDegree: string | null | undefined,
): boolean {
  return isFirstDegreeConnection(connectionDegree);
}

/** 1st: DM. Anyone else: Connect + invite note. */
export function cleaningNeedsInvite(
  connectionDegree: string | null | undefined,
): boolean {
  return needsInviteStep(connectionDegree);
}

export function cleaningNetworkLabel(
  connectionDegree: string | null | undefined,
): string {
  return normalizeConnectionDegree(connectionDegree) ?? "unknown";
}
