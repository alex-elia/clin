import { SectionHub } from "@/components/SectionHub";

export const dynamic = "force-dynamic";

export default function DataHubPage() {
  return (
    <SectionHub
      title="Data & cleaning"
      lead="Use the extension Import & enrich flow on LinkedIn search, then review contacts and AI analysis here."
      links={[
        {
          href: "/contacts",
          title: "Contacts",
          description:
            "Browse and search your local graph. Open a contact for scores, notes, and capture history.",
        },
        {
          href: "/captures",
          title: "Captures",
          description:
            "Audit log of what was read from LinkedIn and when — profiles, lists, and snapshots.",
        },
        {
          href: "/queue",
          title: "Queue",
          description:
            "Review queue for contacts that need attention, defer, or dismiss.",
        },
        {
          href: "/cleaning",
          title: "Cleaning",
          description:
            "Extraction readiness, AI buckets (remove, nurture, comment, DM), and batch analysis.",
        },
        {
          href: "/autopilot",
          title: "Autopilot",
          description:
            "Campaign autopilot and batch analysis settings.",
        },
      ]}
    />
  );
}
