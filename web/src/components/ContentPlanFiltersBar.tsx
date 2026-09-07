"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import {
  ACTIVE_STATUSES,
  buildContentPlanHref,
  type ContentPlanFilters,
  type ContentPlanSearchParams,
} from "@/lib/contentPlanFilters";
import {
  CONTENT_FORMAT_LABELS,
  CONTENT_POST_FORMATS,
  CONTENT_STATUS_LABELS,
} from "@/lib/contentPostsShared";

type Props = {
  year: number;
  month: number;
  view: string;
  filters: ContentPlanFilters;
  resultCount?: number;
};

export function ContentPlanFiltersBar({
  year,
  month,
  view,
  filters,
  resultCount,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [searchDraft, setSearchDraft] = useState(filters.search);

  const baseParams = {
    y: year,
    m: month,
    view,
    status:
      filters.statuses.length > 0 ? filters.statuses.join(",") : undefined,
    format: filters.format ?? undefined,
    q: filters.search || undefined,
    scheduled: filters.scheduled !== "all" ? filters.scheduled : undefined,
  };

  const applyFilters = useCallback(
    (patch: Partial<ContentPlanSearchParams>) => {
      startTransition(() => {
        router.push(
          buildContentPlanHref({
            y: year,
            m: month,
            view,
            status: patch.status ?? baseParams.status,
            format: patch.format ?? baseParams.format,
            q: patch.q ?? baseParams.q,
            scheduled: patch.scheduled ?? baseParams.scheduled,
          }),
        );
      });
    },
    [baseParams, month, router, view, year],
  );

  const statusValue =
    filters.statuses.length === 1 ? filters.statuses[0]! : "all";

  const hasFilters =
    filters.statuses.length > 0 ||
    filters.format ||
    filters.search ||
    filters.scheduled !== "all";

  return (
    <div className="space-y-2">
      <div className="clin-card flex flex-wrap items-end gap-3 p-4">
        <label className="flex min-w-[9rem] flex-col gap-1 text-xs">
          <span className="font-medium text-[var(--clin-text)]">Status</span>
          <select
            value={statusValue}
            disabled={pending}
            onChange={(e) => {
              const v = e.target.value;
              applyFilters({ status: v === "all" ? undefined : v });
            }}
            className="rounded-md border border-[var(--clin-border)] bg-transparent px-2 py-1.5 text-sm"
          >
            <option value="all">All active</option>
            {ACTIVE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {CONTENT_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-[9rem] flex-col gap-1 text-xs">
          <span className="font-medium text-[var(--clin-text)]">Format</span>
          <select
            value={filters.format ?? "all"}
            disabled={pending}
            onChange={(e) => {
              const v = e.target.value;
              applyFilters({ format: v === "all" ? undefined : v });
            }}
            className="rounded-md border border-[var(--clin-border)] bg-transparent px-2 py-1.5 text-sm"
          >
            <option value="all">All formats</option>
            {CONTENT_POST_FORMATS.map((f) => (
              <option key={f} value={f}>
                {CONTENT_FORMAT_LABELS[f]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-[9rem] flex-col gap-1 text-xs">
          <span className="font-medium text-[var(--clin-text)]">Scheduled</span>
          <select
            value={filters.scheduled}
            disabled={pending}
            onChange={(e) => {
              const v = e.target.value;
              applyFilters({ scheduled: v === "all" ? undefined : v });
            }}
            className="rounded-md border border-[var(--clin-border)] bg-transparent px-2 py-1.5 text-sm"
          >
            <option value="all">Any</option>
            <option value="yes">Has date</option>
            <option value="no">Unscheduled</option>
          </select>
        </label>

        <form
          className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs"
          onSubmit={(e) => {
            e.preventDefault();
            applyFilters({ q: searchDraft.trim() || undefined });
          }}
        >
          <span className="font-medium text-[var(--clin-text)]">Search</span>
          <div className="flex gap-2">
            <input
              type="search"
              value={searchDraft}
              disabled={pending}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="Title, hook, notes…"
              className="min-w-0 flex-1 rounded-md border border-[var(--clin-border)] bg-transparent px-2 py-1.5 text-sm"
            />
            <button
              type="submit"
              disabled={pending}
              className="clin-btn-secondary px-2 py-1 text-xs"
            >
              Go
            </button>
          </div>
        </form>

        {hasFilters ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              applyFilters({
                status: undefined,
                format: undefined,
                q: undefined,
                scheduled: undefined,
              })
            }
            className="clin-link text-xs"
          >
            Clear filters
          </button>
        ) : null}
      </div>
      {resultCount != null ? (
        <p className="text-sm text-[var(--clin-muted)]">
          {resultCount} post{resultCount === 1 ? "" : "s"}
          {pending ? " · updating…" : ""}
        </p>
      ) : null}
    </div>
  );
}
