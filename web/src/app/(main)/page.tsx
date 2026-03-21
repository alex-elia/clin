import Link from "next/link";
import { recomputeAllScores } from "@/app/actions";
import { OverviewCharts } from "@/components/charts/OverviewCharts";
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
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Overview
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Local-first network intelligence. Data stays on this machine.{" "}
          <Link href="/settings" className="underline">
            Pacing
          </Link>{" "}
          keeps captures slow;{" "}
          <Link href="/decisions" className="underline">
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
        <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Segments (summary)
        </h2>
        <ul className="flex flex-wrap gap-2 text-sm">
          {stats.bySegment.length === 0 ? (
            <li className="text-zinc-500">No contacts yet.</li>
          ) : (
            stats.bySegment.map((s) => (
              <li
                key={s.segment}
                className="rounded-full bg-zinc-100 px-3 py-1 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
              >
                {s.segment}{" "}
                <span className="text-zinc-500 dark:text-zinc-400">({s.n})</span>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Scoring
        </h2>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          Re-run rule version 1 on all contacts after bulk imports or rule tweaks.
        </p>
        <form action={recomputeAllScores} className="mt-3">
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
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
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
        {value}
      </dd>
    </div>
  );
}
