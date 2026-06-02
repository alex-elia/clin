"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CLEANING_BUCKET_LABELS,
  outreachFitHeadline,
} from "@/lib/contactLlmDisplay";
import {
  CLEANING_BUCKET_META,
  type CleaningBucket,
} from "@/lib/cleaningBuckets";
import { EXTRACTION_READINESS_LABELS } from "@/lib/contactReadinessShared";
import type {
  CleaningBoardData,
  CleaningContactCard,
} from "@/lib/cleaningBoardTypes";

type Props = {
  data: CleaningBoardData;
};

export function CleaningBoard({ data }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramBucket = searchParams.get("bucket");
  const defaultBucket =
    CLEANING_BUCKET_META.find((m) => (data.summary.bucketCounts[m.id] ?? 0) > 0)
      ?.id ?? "needs_review";
  const active: CleaningBucket =
    paramBucket &&
    CLEANING_BUCKET_META.some((m) => m.id === paramBucket)
      ? (paramBucket as CleaningBucket)
      : defaultBucket;
  const bucketMeta = CLEANING_BUCKET_META.find((m) => m.id === active);
  const cards = data.byBucket[active] ?? [];
  const count = data.summary.bucketCounts[active] ?? 0;

  function selectBucket(id: CleaningBucket) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("bucket", id);
    router.push(`/cleaning?${params.toString()}`);
  }

  return (
    <div className="space-y-8">
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryStat
          label="Ready for analysis"
          value={data.summary.readyForAnalysis}
        />
        <SummaryStat
          label="Waiting for AI run"
          value={data.summary.pendingLlmAnalysis}
        />
        <SummaryStat
          label="Need profile capture"
          value={data.summary.needsProfileCapture}
        />
        <SummaryStat
          label="Analyzed (recent)"
          value={data.summary.analyzedInBoard}
        />
      </dl>

      <section>
        <h2 className="clin-section-title">Buckets</h2>
        <p className="mt-1 text-sm text-[var(--clin-muted)]">
          Contacts are grouped by recommended next step after extraction and AI
          analysis. Counts reflect your most recently updated contacts.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {CLEANING_BUCKET_META.map((meta) => {
            const n = data.summary.bucketCounts[meta.id] ?? 0;
            const selected = active === meta.id;
            return (
              <button
                key={meta.id}
                type="button"
                onClick={() => selectBucket(meta.id)}
                className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  selected
                    ? "border-[var(--clin-accent)] bg-[var(--clin-accent)]/10"
                    : "border-[var(--clin-border)] hover:bg-[var(--clin-surface-muted)]"
                }`}
              >
                <span className="font-medium text-[var(--clin-text)]">
                  {meta.title}
                </span>{" "}
                <span className="tabular-nums text-[var(--clin-muted)]">
                  ({n})
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="clin-section-title">{bucketMeta?.title ?? active}</h2>
        <p className="mt-1 text-sm text-[var(--clin-muted)]">
          {bucketMeta?.description}
          {count > cards.length ? (
            <>
              {" "}
              Showing {cards.length} of {count} in this bucket.
            </>
          ) : null}
        </p>
        {cards.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--clin-muted)]">
            No contacts in this bucket among recent records. Run batch analysis or
            import more profiles.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {cards.map((c) => (
              <ContactBucketCard key={c.contactId} card={c} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="clin-stat">
      <dt className="text-xs font-medium uppercase tracking-wide text-[var(--clin-muted)]">
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function ContactBucketCard({ card }: { card: CleaningContactCard }) {
  const plan = card.analysis?.cleaningPlan;
  const fit = card.analysis?.outreachFit;
  const playbook =
    plan?.playbook?.trim() ||
    plan?.rationale?.trim() ||
    card.analysis?.stewardship?.rationale;

  return (
    <li className="clin-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link
            href={`/contacts/${card.contactId}`}
            className="font-medium text-[var(--clin-accent)] hover:underline"
          >
            {card.fullName ?? "Unknown"}
          </Link>
          {card.headline ? (
            <p className="mt-0.5 text-sm text-[var(--clin-muted)]">
              {card.headline}
            </p>
          ) : null}
          {card.company ? (
            <p className="text-xs text-[var(--clin-muted)]">{card.company}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="clin-pill text-xs">
            {CLEANING_BUCKET_LABELS[card.bucket]}
          </span>
          <span className="clin-pill text-xs">
            {EXTRACTION_READINESS_LABELS[card.readiness.extractionLevel]}
          </span>
          {card.compositeScore != null ? (
            <span className="clin-pill text-xs tabular-nums">
              Score {card.compositeScore}
            </span>
          ) : null}
        </div>
      </div>
      {fit ? (
        <p className="mt-2 text-sm">
          <span className="font-medium">{outreachFitHeadline(fit)}:</span>{" "}
          {fit.rationale}
        </p>
      ) : null}
      {playbook ? (
        <p className="mt-2 text-sm text-[var(--clin-text)]">{playbook}</p>
      ) : null}
      {card.readiness.missing.length > 0 ? (
        <p className="mt-2 text-xs text-[var(--clin-muted)]">
          Missing: {card.readiness.missing.join(" · ")}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <Link href={`/contacts/${card.contactId}`} className="clin-link">
          Open contact
        </Link>
        {card.bucket === "reach_out_dm" ? (
          <Link href="/decisions" className="clin-link">
            Decisions
          </Link>
        ) : null}
        {card.bucket === "review_remove" ? (
          <Link href="/queue" className="clin-link">
            Review queue
          </Link>
        ) : null}
      </div>
    </li>
  );
}
