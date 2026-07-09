export function campaignExecScrollKey(campaignId: string): string {
  return `clin-campaign-exec-scroll-${campaignId}`;
}

export function preserveCampaignExecScroll(campaignId: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(
    campaignExecScrollKey(campaignId),
    String(window.scrollY),
  );
}

export function consumeCampaignExecScroll(campaignId: string): number | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(campaignExecScrollKey(campaignId));
  sessionStorage.removeItem(campaignExecScrollKey(campaignId));
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

export function campaignMemberAnchorId(memberId: string): string {
  return `member-${memberId}`;
}
