import { isDisconnectedDegree } from "@/lib/connectionDegree";

/** People already handled in cleaning: dismissed from the board or marked disconnected. */
export function contactExcludedFromCleaningKpis(input: {
  connectionDegree?: string | null;
  cleaningDismissedAt?: number | null;
}): boolean {
  if (input.cleaningDismissedAt != null) return true;
  return isDisconnectedDegree(input.connectionDegree);
}
