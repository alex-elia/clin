import { SCORE_LEGEND } from "@/lib/scoreExplain";

export function ScoreLegend() {
  return (
    <section
      className="clin-callout"
      aria-labelledby="score-legend-heading"
    >
      <h2
        id="score-legend-heading"
        className="text-sm font-semibold text-clin-text"
      >
        {SCORE_LEGEND.title}
      </h2>
      <p className="mt-2 text-xs text-clin-muted">
        {SCORE_LEGEND.intro}
      </p>
      <dl className="mt-3 space-y-3">
        <div>
          <dt className="font-medium text-clin-text">
            {SCORE_LEGEND.r.label}
          </dt>
          <dd className="mt-0.5 text-xs">{SCORE_LEGEND.r.body}</dd>
        </div>
        <div>
          <dt className="font-medium text-clin-text">
            {SCORE_LEGEND.b.label}
          </dt>
          <dd className="mt-0.5 text-xs">{SCORE_LEGEND.b.body}</dd>
        </div>
        <div>
          <dt className="font-medium text-clin-text">
            {SCORE_LEGEND.c.label}
          </dt>
          <dd className="mt-0.5 text-xs">{SCORE_LEGEND.c.body}</dd>
        </div>
      </dl>
      <p className="mt-3 border-t border-clin-border pt-3 text-xs text-clin-muted">
        {SCORE_LEGEND.example}
      </p>
    </section>
  );
}
