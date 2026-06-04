import Link from "next/link";

export type CampaignDetailTab = "prep" | "exec";

export function parseCampaignDetailTab(
  input: {
    tab?: string;
    memberFilter?: string;
  },
  opts?: { hasMembers?: boolean },
): CampaignDetailTab {
  if (input.tab === "prep") return "prep";
  if (input.tab === "exec" || input.memberFilter) return "exec";
  if (opts?.hasMembers) return "exec";
  return "prep";
}

export function campaignDetailTabHref(
  campaignId: string,
  tab: CampaignDetailTab,
  memberFilter?: string,
) {
  const params = new URLSearchParams({ tab });
  if (tab === "exec" && memberFilter && memberFilter !== "all") {
    params.set("memberFilter", memberFilter);
  }
  return `/campaigns/${campaignId}?${params.toString()}`;
}

function tabLinkClass(active: boolean) {
  return active
    ? "border-b-2 border-[var(--clin-accent)] px-1 pb-2 text-sm font-semibold text-[var(--clin-text)]"
    : "border-b-2 border-transparent px-1 pb-2 text-sm font-medium text-[var(--clin-muted)] hover:text-[var(--clin-text)]";
}

export function CampaignDetailTabNav({
  campaignId,
  activeTab,
}: {
  campaignId: string;
  activeTab: CampaignDetailTab;
}) {
  return (
    <nav
      className="flex gap-6 border-b border-[var(--clin-border)]"
      aria-label="Campaign sections"
    >
      <Link
        href={campaignDetailTabHref(campaignId, "prep")}
        className={tabLinkClass(activeTab === "prep")}
        aria-current={activeTab === "prep" ? "page" : undefined}
      >
        Preparation
      </Link>
      <Link
        href={campaignDetailTabHref(campaignId, "exec")}
        className={tabLinkClass(activeTab === "exec")}
        aria-current={activeTab === "exec" ? "page" : undefined}
      >
        Execution
      </Link>
    </nav>
  );
}
