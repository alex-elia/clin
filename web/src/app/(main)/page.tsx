import Link from "next/link";
import { DailyTasksPanel } from "@/components/DailyTasksPanel";
import { HomeCoachPanel } from "@/components/HomeCoachPanel";
import { getDb } from "@/db";
import { getDailyReminderSummary } from "@/lib/dailyReminder";
import { getHomeDashboardData } from "@/lib/homeDashboard";
import { getOrCreateContentBrandContext } from "@/lib/contentBrandContext";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  getDb();
  const [dash, brand, dailyTasks] = await Promise.all([
    getHomeDashboardData(),
    getOrCreateContentBrandContext(),
    getDailyReminderSummary(),
  ]);

  const pipelineActive =
    dash.branding.postsByStatus.idea +
    dash.branding.postsByStatus.drafting +
    dash.branding.postsByStatus.review +
    dash.branding.postsByStatus.ready;

  const storySteps = [
    {
      n: "1",
      title: "Capture your graph",
      body: "Use the browser extension on LinkedIn search, lists, or profiles. Everything stays on this machine.",
      href: "/data",
      cta: "Data & cleaning",
    },
    {
      n: "2",
      title: "Clean and prioritize",
      body: "Review the queue, run autopilot on lists, and keep contacts you actually want to nurture.",
      href: "/cleaning",
      cta: "Cleaning",
    },
    {
      n: "3",
      title: "Outreach with intent",
      body: "Campaigns, drafts, and inbox snapshots — hand off to LinkedIn when you are ready to send.",
      href: "/outreach",
      cta: "Outreach",
    },
    {
      n: "4",
      title: "Show up on your terms",
      body: "Voice, calendar, and analytics — plan posts, draft in your voice, publish on rhythm.",
      href: "/branding",
      cta: "Personal branding",
    },
  ];

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <h1 className="clin-page-title">Home</h1>
        <p className="clin-page-lead max-w-3xl">
          Clin is your local LinkedIn workspace: grow a clean network, run
          thoughtful outreach, and build a personal brand without shipping your
          data to the cloud.
        </p>
        {!dash.branding.voiceSetupComplete ? (
          <p className="text-sm">
            <Link
              href="/branding/setup"
              className="font-medium text-[var(--clin-accent)] underline-offset-2 hover:underline"
            >
              Finish voice setup
            </Link>{" "}
            so planning and drafts match how you want to sound.
          </p>
        ) : null}
      </header>

      <DailyTasksPanel summary={dailyTasks} />

      <section aria-label="Your workflow">
        <h2 className="clin-section-title">How Clin fits your week</h2>
        <ol className="mt-4 grid gap-4 sm:grid-cols-2">
          {storySteps.map((step) => (
            <li key={step.n} className="clin-card flex flex-col p-5">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--clin-accent)]">
                Step {step.n}
              </span>
              <h3 className="mt-2 text-base font-semibold text-[var(--clin-text)]">
                {step.title}
              </h3>
              <p className="mt-2 flex-1 text-sm text-[var(--clin-muted)]">
                {step.body}
              </p>
              <Link
                href={step.href}
                className="mt-4 text-sm font-medium text-[var(--clin-accent)] hover:underline"
              >
                {step.cta} →
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section aria-label="Personal branding at a glance">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="clin-section-title">Personal branding</h2>
          <Link
            href="/branding/calendar"
            className="text-sm font-medium text-[var(--clin-accent)] hover:underline"
          >
            Content plan →
          </Link>
        </div>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="In pipeline"
            value={pipelineActive}
            hint="Ideas through ready"
          />
          <Kpi
            label="Ready to publish"
            value={dash.branding.readyToPublish}
          />
          <Kpi
            label="Scheduled (14 days)"
            value={dash.branding.scheduledNext14Days}
          />
          <Kpi
            label="Published (30 days)"
            value={dash.branding.publishedLast30Days}
          />
        </dl>
        {dash.analytics.hasSnapshots && dash.analytics.metrics.length > 0 ? (
          <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {dash.analytics.metrics.map((m) => (
              <Kpi key={m.label} label={m.label} value={m.value} />
            ))}
          </dl>
        ) : (
          <p className="mt-3 text-sm text-[var(--clin-muted)]">
            Capture post analytics from LinkedIn via the extension to see
            impressions and engagement here.{" "}
            <Link href="/analytics" className="text-[var(--clin-accent)] hover:underline">
              Analytics
            </Link>
          </p>
        )}
      </section>

      <section aria-label="Network snapshot">
        <h2 className="clin-section-title">Network</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <Kpi label="Contacts" value={dash.network.contacts} />
          <Kpi label="Queue pending" value={dash.network.queuePending} />
          <Kpi label="Campaigns" value={dash.outreach.campaigns} />
        </dl>
        {dash.network.bySegment.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-2 text-sm">
            {dash.network.bySegment.map((s) => (
              <li key={s.segment} className="clin-pill">
                {s.segment}{" "}
                <span className="text-[var(--clin-muted)]">({s.n})</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-[var(--clin-muted)]">
            No contacts yet — start with{" "}
            <Link href="/data" className="text-[var(--clin-accent)] hover:underline">
              import & enrich
            </Link>{" "}
            from the extension.
          </p>
        )}
      </section>

      <HomeCoachPanel brandLanguage={brand.contentLanguage} />
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="clin-stat">
      <dt className="text-xs font-medium uppercase tracking-wide text-[var(--clin-muted)]">
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums text-[var(--clin-text)]">
        {value}
      </dd>
      {hint ? (
        <dd className="mt-0.5 text-xs text-[var(--clin-muted)]">{hint}</dd>
      ) : null}
    </div>
  );
}
