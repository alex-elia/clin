import Link from "next/link";
import { redirect } from "next/navigation";
import { PlanningChatPanel } from "@/components/PlanningChatPanel";
import { listContentPosts, listRecentPublished } from "@/lib/contentPosts";
import { CONTENT_STATUS_LABELS, type ContentPostStatus } from "@/lib/contentPostsShared";
import { getOrCreateContentBrandContext } from "@/lib/contentBrandContext";
import { getVoiceSetupStatus } from "@/lib/voiceSetup";

export const dynamic = "force-dynamic";

export default async function BrandStudioPage() {
  const setup = await getVoiceSetupStatus();
  if (!setup.complete) {
    redirect("/branding/setup");
  }

  const [posts, published, brand] = await Promise.all([
    listContentPosts({ limit: 30 }),
    listRecentPublished(5),
    getOrCreateContentBrandContext(),
  ]);

  const upcoming = posts
    .filter((p) => p.scheduledAt && p.status !== "published" && p.status !== "archived")
    .slice(0, 5);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <Link href="/branding/calendar" className="clin-link text-sm">
          ← Content plan
        </Link>
        <h1 className="clin-page-title mt-2">Planning chat</h1>
        <p className="clin-page-lead">
          Editorial planning with the brand coach: add calendar slots, reschedule the
          pipeline, or sketch post ideas. Click Apply to save calendar changes. Hook,
          body, and visuals are written on each post page (Content plan → open a post).
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="clin-card p-4 text-sm">
          <h2 className="clin-section-title">Upcoming</h2>
          {upcoming.length === 0 ? (
            <p className="mt-2 text-[var(--clin-muted)]">Nothing scheduled.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {upcoming.map((p) => (
                <li key={p.id}>
                  <Link href={`/branding/posts/${p.id}`} className="clin-link">
                    {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="clin-card p-4 text-sm">
          <h2 className="clin-section-title">Recently published</h2>
          {published.length === 0 ? (
            <p className="mt-2 text-[var(--clin-muted)]">None yet.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {published.map((p) => (
                <li key={p.id}>
                  {p.title}
                  <span className="text-[var(--clin-muted)]">
                    {" "}
                    ({CONTENT_STATUS_LABELS[p.status as ContentPostStatus]})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <PlanningChatPanel brandLanguage={brand.contentLanguage} />
    </div>
  );
}
