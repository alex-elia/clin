import Link from "next/link";
import {
  listPostAnalyticsSnapshots,
  summarizeMetricsAcrossSnapshots,
} from "@/lib/accountAnalytics";

export const dynamic = "force-dynamic";

function formatCount(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString("fr-FR");
}

export default async function AnalyticsPage() {
  const snapshots = await listPostAnalyticsSnapshots(50);
  const summary = summarizeMetricsAcrossSnapshots(snapshots);

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <div>
        <h1 className="clin-page-title">Account analytics</h1>
        <p className="mt-2 text-sm text-clin-muted">
          Run <strong>Snapshot post analytics</strong> in the extension on LinkedIn
          creator stats. Re-capture after updating the extension for DOM parsing.
        </p>
      </div>

      {summary.length > 0 ? (
        <section className="clin-card p-4">
          <h2 className="text-sm font-semibold">Latest snapshot KPIs</h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {summary.map((m) => (
              <div key={m.label} className="rounded-md border border-clin-border px-3 py-2">
                <dt className="text-xs text-clin-muted">{m.label}</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums">{m.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <ul className="space-y-4">
        {snapshots.length === 0 ? (
          <li className="text-sm text-clin-muted">No analytics snapshots yet.</li>
        ) : (
          snapshots.map((s) => (
            <li key={s.id} className="clin-card p-4">
              <div className="flex justify-between gap-2">
                <span className="font-medium">{s.title ?? "LinkedIn snapshot"}</span>
                <time className="text-xs text-clin-muted">
                  {s.capturedAt.toLocaleString()}
                </time>
              </div>
              {s.periodLabel ? (
                <p className="mt-1 text-xs text-clin-muted">
                  {s.periodLabel}
                  <span className="ml-2">· {s.parseSource} parse</span>
                </p>
              ) : null}
              {s.overviewMetrics.length > 0 ? (
                <dl className="mt-3 flex flex-wrap gap-2">
                  {s.overviewMetrics.map((m) => (
                    <div key={m.label} className="clin-pill">
                      <span className="text-clin-muted">{m.label}</span>{" "}
                      <span className="font-semibold">{m.value}</span>
                    </div>
                  ))}
                </dl>
              ) : null}
              {s.topPosts.length > 0 ? (
                <ul className="mt-4 space-y-2">
                  {s.topPosts.map((p, i) => (
                    <li key={i} className="rounded border border-clin-border px-3 py-2 text-sm">
                      <span className="text-xs text-clin-muted">{p.ageLabel ?? "Post"}</span>
                      <span className="ml-2 text-xs tabular-nums">
                        {formatCount(p.impressions)} imp · {formatCount(p.reactions)} react ·{" "}
                        {formatCount(p.comments)} com
                      </span>
                      {p.excerpt ? (
                        <p className="mt-1 line-clamp-2 text-xs">{p.excerpt}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))
        )}
      </ul>
      <p className="text-sm text-clin-muted">
        <Link href="/captures" className="clin-link">
          Capture log
        </Link>
      </p>
    </div>
  );
}
