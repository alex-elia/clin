import Link from "next/link";
import { redirect } from "next/navigation";
import { updateContentPostStatusAction } from "@/app/actions";
import {
  countScheduledPosts,
  listContentPosts,
  listScheduledPostsInCalendarMonth,
  listUnscheduledBacklog,
  postsByLocalDay,
} from "@/lib/contentPosts";
import {
  BOARD_COLUMNS,
  CONTENT_FORMAT_LABELS,
  CONTENT_STATUS_LABELS,
  type ContentPostStatus,
} from "@/lib/contentPostsShared";
import { getVoiceSetupStatus } from "@/lib/voiceSetup";

export const dynamic = "force-dynamic";

function monthHref(year: number, month: number, view: string) {
  return `/branding/calendar?y=${year}&m=${month}&view=${view}`;
}

function parseCalendarYear(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const y = parseInt(raw, 10);
  return Number.isFinite(y) && y >= 1970 && y < 2100 ? y : fallback;
}

/** URL `m` is 0–11 (JS month), matching month navigation links. */
function parseCalendarMonth(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const m = parseInt(raw, 10);
  if (!Number.isFinite(m)) return fallback;
  if (m >= 0 && m <= 11) return m;
  if (m >= 1 && m <= 12) return m - 1;
  return fallback;
}

export default async function ContentCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string; view?: string }>;
}) {
  const setup = await getVoiceSetupStatus();
  if (!setup.complete) {
    redirect("/branding/setup");
  }

  const sp = await searchParams;
  const now = new Date();
  const year = parseCalendarYear(sp.y, now.getFullYear());
  const month = parseCalendarMonth(sp.m, now.getMonth());
  const view = sp.view === "board" || sp.view === "table" ? sp.view : "calendar";

  const prev = month === 0 ? { y: year - 1, m: 11 } : { y: year, m: month - 1 };
  const next = month === 11 ? { y: year + 1, m: 0 } : { y: year, m: month + 1 };
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay();

  const [backlog, postsThisMonthList, allPosts, scheduledTotal] =
    await Promise.all([
      listUnscheduledBacklog(),
      listScheduledPostsInCalendarMonth(year, month),
      listContentPosts({ limit: 200 }),
      countScheduledPosts(),
    ]);
  const byDay = postsByLocalDay(postsThisMonthList, year, month);
  const postsThisMonth = [...byDay.values()].flat();
  const scheduledElsewhere = Math.max(
    0,
    scheduledTotal - postsThisMonthList.length,
  );

  const monthLabel = new Date(year, month, 1).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });

  const boardPosts = Object.fromEntries(
    BOARD_COLUMNS.map((col) => [
      col,
      allPosts.filter((p) => p.status === col),
    ]),
  ) as Record<ContentPostStatus, typeof allPosts>;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="clin-page-title">Content plan</h1>
          <p className="clin-page-lead">
            Plan and write posts. Open a post for the writing assistant at the top.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/branding/setup" className="clin-btn-secondary text-sm">
            Voice setup
          </Link>
          <Link href="/branding/studio" className="clin-btn-secondary">
            Planning chat
          </Link>
          <Link href="/branding/posts/new" className="clin-btn-primary">
            New post
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["calendar", "table", "board"] as const).map((v) => (
          <Link
            key={v}
            href={monthHref(year, month, v)}
            className={view === v ? "clin-pill clin-pill-active" : "clin-pill"}
          >
            {v === "calendar" ? "Calendar" : v === "table" ? "Pipeline" : "Board"}
          </Link>
        ))}
      </div>

      {view === "calendar" ? (
        <>
          <div className="flex items-center justify-between gap-4">
            <Link href={monthHref(prev.y, prev.m, view)} className="clin-link text-sm">
              ← Previous
            </Link>
            <h2 className="text-lg font-semibold">{monthLabel}</h2>
            <Link href={monthHref(next.y, next.m, view)} className="clin-link text-sm">
              Next →
            </Link>
          </div>
          {scheduledElsewhere > 0 ? (
            <p className="text-sm text-[var(--clin-muted)]">
              {scheduledElsewhere} scheduled post{scheduledElsewhere === 1 ? "" : "s"}{" "}
              in other months — use Previous / Next to browse.
            </p>
          ) : null}

          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-[var(--clin-muted)]">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDow }).map((_, i) => (
              <div key={`pad-${i}`} className="min-h-[5rem] rounded-md bg-transparent" />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const posts = byDay.get(day) ?? [];
              return (
                <div
                  key={day}
                  className="min-h-[5rem] rounded-md border border-[var(--clin-border)] bg-[var(--clin-surface)] p-1"
                >
                  <span className="text-xs font-medium text-[var(--clin-muted)]">{day}</span>
                  <ul className="mt-1 space-y-0.5">
                    {posts.map((p) => (
                      <li key={p.id}>
                        <Link
                          href={`/branding/posts/${p.id}`}
                          className="block truncate rounded px-1 py-0.5 text-[10px] hover:bg-[var(--clin-surface-muted)]"
                          title={p.title}
                        >
                          <span
                            className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${
                              p.status === "ready"
                                ? "bg-emerald-500"
                                : p.status === "published"
                                  ? "bg-zinc-400"
                                  : "bg-amber-500"
                            }`}
                          />
                          {p.format === "article" ? "[Article] " : ""}
                          {p.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          <aside className="clin-card p-4">
            <h3 className="clin-section-title">Unscheduled backlog</h3>
            {backlog.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--clin-muted)]">No backlog items.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {backlog.map((p) => (
                  <li key={p.id}>
                    <Link href={`/branding/posts/${p.id}`} className="clin-link text-sm">
                      {p.title}
                    </Link>
                    <span className="ml-2 text-xs text-[var(--clin-muted)]">
                      {CONTENT_STATUS_LABELS[p.status as ContentPostStatus]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </>
      ) : null}

      {view === "table" ? (
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
              {allPosts.map((p) => (
                <tr key={p.id} className="border-b border-[var(--clin-border)]">
                  <td className="px-3 py-2 text-[var(--clin-muted)]">
                    {p.scheduledAt
                      ? new Date(p.scheduledAt).toLocaleString(undefined, {
                          dateStyle: "short",
                          timeStyle: "short",
                        })
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/branding/posts/${p.id}`} className="clin-link font-medium">
                      {p.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-[var(--clin-muted)]">
                    {CONTENT_FORMAT_LABELS[p.format as keyof typeof CONTENT_FORMAT_LABELS] ?? p.format}
                  </td>
                  <td className="px-3 py-2">
                    {CONTENT_STATUS_LABELS[p.status as ContentPostStatus]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {view === "board" ? (
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
          {BOARD_COLUMNS.map((col) => (
            <div
              key={col}
              className="rounded-lg border border-[var(--clin-border)] bg-[var(--clin-surface-muted)]/40 p-3"
            >
              <h3 className="text-sm font-semibold">{CONTENT_STATUS_LABELS[col]}</h3>
              <ul className="mt-2 space-y-2">
                {(boardPosts[col] ?? []).map((p) => (
                  <li key={p.id} className="clin-card p-2 text-sm">
                    <Link href={`/branding/posts/${p.id}`} className="clin-link font-medium">
                      {p.title}
                    </Link>
                    {p.scheduledAt ? (
                      <p className="mt-1 text-[10px] text-[var(--clin-muted)]">
                        {new Date(p.scheduledAt).toLocaleDateString()}
                      </p>
                    ) : null}
                    {col !== "published" ? (
                      <form action={updateContentPostStatusAction} className="mt-2">
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="status" value={nextStatus(col)} />
                        <button type="submit" className="text-[10px] text-[var(--clin-accent)]">
                          → {CONTENT_STATUS_LABELS[nextStatus(col)]}
                        </button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function nextStatus(current: ContentPostStatus): ContentPostStatus {
  const flow: ContentPostStatus[] = [
    "idea",
    "drafting",
    "review",
    "ready",
    "published",
  ];
  const i = flow.indexOf(current);
  return i >= 0 && i < flow.length - 1 ? flow[i + 1]! : current;
}
