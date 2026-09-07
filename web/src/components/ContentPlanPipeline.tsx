"use client";

import Link from "next/link";
import type { ContentPlanFilters, ContentPlanPostCard } from "@/lib/contentPlanFilters";
import {
  CONTENT_FORMAT_LABELS,
  CONTENT_STATUS_LABELS,
} from "@/lib/contentPostsShared";
import { ContentPlanFiltersBar } from "@/components/ContentPlanFiltersBar";

type Props = {
  year: number;
  month: number;
  view: string;
  filters: ContentPlanFilters;
  posts: ContentPlanPostCard[];
};

export function ContentPlanPipeline({
  year,
  month,
  view,
  filters,
  posts,
}: Props) {
  return (
    <div className="space-y-4">
      <ContentPlanFiltersBar
        year={year}
        month={month}
        view={view}
        filters={filters}
        resultCount={posts.length}
      />

      <div className="overflow-x-auto rounded-lg border border-[var(--clin-border)]">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-[var(--clin-border)] bg-[var(--clin-surface-muted)]">
            <tr>
              <th className="px-3 py-2 font-medium">Scheduled</th>
              <th className="px-3 py-2 font-medium">Title</th>
              <th className="px-3 py-2 font-medium">Format</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {posts.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-8 text-center text-[var(--clin-muted)]"
                >
                  No posts match these filters.
                </td>
              </tr>
            ) : (
              posts.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-[var(--clin-border)]"
                >
                  <td className="px-3 py-2 text-[var(--clin-muted)]">
                    {p.scheduledAt
                      ? new Date(p.scheduledAt).toLocaleString(undefined, {
                          dateStyle: "short",
                          timeStyle: "short",
                        })
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/branding/posts/${p.id}`}
                      className="clin-link font-medium"
                    >
                      {p.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-[var(--clin-muted)]">
                    {CONTENT_FORMAT_LABELS[p.format]}
                  </td>
                  <td className="px-3 py-2">
                    {CONTENT_STATUS_LABELS[p.status]}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
