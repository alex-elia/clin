import { SectionHub } from "@/components/SectionHub";

export const dynamic = "force-dynamic";

export default function BrandingHubPage() {
  return (
    <SectionHub
      title="Personal branding"
      lead="Shape how you show up on LinkedIn: your voice, goals, post analytics, and influence signals captured locally."
      links={[
        {
          href: "/branding/calendar",
          title: "Content plan",
          description:
            "Editorial calendar, pipeline table, kanban board, and post workspace.",
        },
        {
          href: "/branding/studio",
          title: "Planning chat",
          description:
            "Calendar planning chat: new slots, reschedule, ideas — not full post drafting.",
        },
        {
          href: "/branding/setup",
          title: "Voice setup",
          description:
            "Tutorial before writing: profile, goals, positioning, publish rhythm.",
        },
        {
          href: "/me",
          title: "You & voice",
          description: "Read-only summary and outreach DM writer settings.",
        },
        {
          href: "/analytics",
          title: "Analytics",
          description:
            "Post and creator analytics snapshots from LinkedIn (via extension capture).",
        },
      ]}
    />
  );
}
