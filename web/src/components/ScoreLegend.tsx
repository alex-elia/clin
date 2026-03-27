import { SCORE_LEGEND } from "@/lib/scoreExplain";

export function ScoreLegend() {
  return (
    <section
      className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-4 text-sm leading-relaxed text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-300"
      aria-labelledby="score-legend-heading"
    >
      <h2
        id="score-legend-heading"
        className="text-sm font-semibold text-zinc-900 dark:text-zinc-100"
      >
        {SCORE_LEGEND.title}
      </h2>
      <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
        {SCORE_LEGEND.intro}
      </p>
      <dl className="mt-3 space-y-3">
        <div>
          <dt className="font-medium text-zinc-900 dark:text-zinc-100">
            {SCORE_LEGEND.r.label}
          </dt>
          <dd className="mt-0.5 text-xs">{SCORE_LEGEND.r.body}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-900 dark:text-zinc-100">
            {SCORE_LEGEND.b.label}
          </dt>
          <dd className="mt-0.5 text-xs">{SCORE_LEGEND.b.body}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-900 dark:text-zinc-100">
            {SCORE_LEGEND.c.label}
          </dt>
          <dd className="mt-0.5 text-xs">{SCORE_LEGEND.c.body}</dd>
        </div>
      </dl>
      <p className="mt-3 border-t border-zinc-200 pt-3 text-xs text-zinc-500 dark:border-zinc-700">
        {SCORE_LEGEND.example}
      </p>
    </section>
  );
}
