import { SectionHub } from "@/components/SectionHub";

export const dynamic = "force-dynamic";

export default function DataHubPage() {
  return (
    <SectionHub
      title="Data & cleaning"
      lead="Capture profiles from a search or list page, or one profile at a time. Review contacts, scores, and optional batch cleaning on your machine."
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
          href: "/autopilot",
          title: "Cleaning",
          description:
            "Batch LLM analysis on stored profiles, list sprint and hygiene runners (extension + settings).",
        },
      ]}
    />
  );
}
