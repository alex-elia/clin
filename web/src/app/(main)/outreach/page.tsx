import { SectionHub } from "@/components/SectionHub";

export const dynamic = "force-dynamic";

export default function OutreachHubPage() {
  return (
    <SectionHub
      title="Outreach"
      lead="Run campaigns, approve drafts, and track messaging handoff between the dashboard and the Chrome extension."
      links={[
        {
          href: "/campaigns",
          title: "Campaigns",
          description:
            "Named outreach contexts, capture targets, member drafts, and readiness filters.",
        },
        {
          href: "/decisions",
          title: "Decisions",
          description:
            "Approve or skip drafts before they appear in the extension ready list.",
        },
        {
          href: "/inbox",
          title: "Inbox",
          description:
            "Snapshots of messaging threads captured from LinkedIn for local review.",
        },
      ]}
    />
  );
}
