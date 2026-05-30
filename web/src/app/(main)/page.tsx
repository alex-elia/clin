import Link from "next/link";
import { recomputeAllScores } from "@/app/actions";
import { OverviewCharts } from "@/components/charts/OverviewCharts";
import { ScoreLegend } from "@/components/ScoreLegend";
import {
  getAvgScores,
  getCapturesPerDaySeries,
  getRelationshipScoreBuckets,
  getTopOpportunities,
} from "@/lib/analytics";
import { getDb } from "@/db";
import { getOverviewStats } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  getDb(); // run migrations before parallel work (raw sqlite in analytics can race otherwise)
  const [stats, capturesSeries, scoreBuckets, topOpps, averages] =
    await Promise.all([
      getOverviewStats(),
      Promise.resolve(getCapturesPerDaySeries(14)),
      Promise.resolve(getRelationshipScoreBuckets()),
      getTopOpportunities(8),
      getAvgScores(),
    ]);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="clin-page-title">Home</h1>
        <p className="clin-page-lead">
          Local-first LinkedIn assistant. Data stays on this machine. Work in
          three areas below — capture and clean your graph, run outreach, and
          grow your personal brand.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <PillarCard
          href="/data"
          title="Data & cleaning"
          description="Capture from search, lists, or profiles. Contacts, queue, and batch cleaning."
        />
        <PillarCard
          href="/outreach"
          title="Outreach"
          description="Campaigns, approved drafts, inbox snapshots, and extension handoff."
        />
        <PillarCard
          href="/branding"
          title="Personal branding"
          description="Your voice, goals, post analytics, and influence signals."
        />
      </section>

      <dl className="grid gap-4 sm:grid-cols-3">
        <Stat label="Contacts" value={stats.contacts} />
        <Stat label="Capture events" value={stats.captures} />
        <Stat label="Queue (pending)" value={stats.queuePending} />
      </dl>

      <ScoreLegend />

      <OverviewCharts
        segments={stats.bySegment}
        capturesSeries={capturesSeries}
        scoreBuckets={scoreBuckets}
        topOpportunities={topOpps.map((o) => ({
          fullName: o.fullName,
          company: o.company,
          businessScore: o.businessScore,
        }))}
        averages={{
          avgRelationship: Number(averages.avgRelationship) || 0,
          avgBusiness: Number(averages.avgBusiness) || 0,
          avgCleanup: Number(averages.avgCleanup) || 0,
        }}
      />

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-clin-text">
          Segments (summary)
        </h2>
        <ul className="flex flex-wrap gap-2 text-sm">
          {stats.bySegment.length === 0 ? (
            <li className="text-clin-muted">No contacts yet.</li>
          ) : (
            stats.bySegment.map((s) => (
              <li
                key={s.segment}
                className="clin-pill"
              >
                {s.segment}{" "}
                <span className="text-clin-muted">({s.n})</span>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="clin-callout">
        <h2 className="text-sm font-medium text-clin-text">
          Scoring
        </h2>
        <p className="mt-1 text-xs text-clin-muted">
          Re-run rule version 1 on all contacts after bulk imports or rule tweaks.
        </p>
        <form action={recomputeAllScores} className="mt-3">
          <button
            type="submit"
            className="clin-btn-primary"
          >
            Recompute scores
          </button>
        </form>
      </section>
    </div>
  );
}

function PillarCard({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link href={href} className="clin-card block p-5 hover:shadow-md">
      <h2 className="text-base font-semibold text-[var(--clin-text)]">{title}</h2>
      <p className="mt-2 text-sm text-[var(--clin-muted)]">{description}</p>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="clin-stat">
      <dt className="text-xs font-medium uppercase tracking-wide text-[var(--clin-muted)]">
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums text-[var(--clin-text)]">
        {value}
      </dd>
    </div>
  );
}
