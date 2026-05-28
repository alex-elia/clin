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
        <h1 className="clin-page-title">Overview</h1>
        <p className="clin-page-lead">
          Local-first network intelligence. Data stays on this machine.{" "}
          <Link href="/settings" className="clin-link">
            Pacing
          </Link>{" "}
          keeps captures slow;{" "}
          <Link href="/decisions" className="clin-link">
            Decisions
          </Link>{" "}
          is where you approve drafts before manual sends.
        </p>
      </div>

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
