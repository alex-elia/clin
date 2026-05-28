import Link from "next/link";
import { ScoreLegend } from "@/components/ScoreLegend";
import { scoresTooltipLines } from "@/lib/scoreExplain";
import { listContacts } from "@/lib/queries";

export const dynamic = "force-dynamic";
/** Ensure RSC runs in Node (better-sqlite3); avoids any experimental edge bundling. */
export const runtime = "nodejs";

const segments = [
  "active",
  "warm",
  "dormant",
  "ghost",
  "remove_candidate",
] as const;

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; segment?: string; sort?: string }>;
}) {
  const sp = await searchParams;
  const sort = sp.sort === "cleanup" ? ("cleanup" as const) : ("updated" as const);
  const rows = await listContacts({
    q: sp.q,
    segment: sp.segment,
    sort,
    limit: 80,
    offset: 0,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="clin-page-title">Contacts</h1>
        <p className="mt-1 text-sm text-clin-muted">
          Search and filter captured profiles.
        </p>
      </div>

      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        method="get"
      >
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="text-clin-muted">Search</span>
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Name, company, headline"
            className="clin-input"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:w-48">
          <span className="text-clin-muted">Segment</span>
          <select
            name="segment"
            defaultValue={sp.segment ?? ""}
            className="clin-input"
          >
            <option value="">All</option>
            {segments.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm sm:w-52">
          <span className="text-clin-muted">Sort</span>
          <select
            name="sort"
            defaultValue={sort === "cleanup" ? "cleanup" : "updated"}
            className="clin-input"
          >
            <option value="updated">Recently updated</option>
            <option value="cleanup">Cleanup score (high first)</option>
          </select>
        </label>
        <button
          type="submit"
          className="clin-btn-primary"
        >
          Apply
        </button>
      </form>

      <ScoreLegend />

      <div className="clin-table-wrap">
        <table className="clin-table">
          <thead className="text-xs uppercase text-clin-muted">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Company</th>
              <th className="px-3 py-2">Segment</th>
              <th className="px-3 py-2">
                Scores{" "}
                <span className="font-normal normal-case text-clin-muted">
                  (hover a row)
                </span>
              </th>
              <th className="px-3 py-2">Updated</th>
            </tr>
          </thead>
          <tbody className="">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center text-clin-muted"
                >
                  No contacts. Use the Chrome extension to capture a profile.
                </td>
              </tr>
            ) : (
              rows.map((c) => (
                <tr key={c.id} >
                  <td className="px-3 py-2">
                    <div className="font-medium text-clin-text">
                      <Link
                        href={`/contacts/${c.id}`}
                        className="clin-link"
                      >
                        {c.fullName ?? "—"}
                      </Link>
                    </div>
                    <div className="text-xs text-clin-muted line-clamp-1">
                      {c.headline ?? ""}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-clin-muted">
                    {c.company ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span className="clin-pill">
                      {c.segment}
                    </span>
                  </td>
                  <td
                    className="px-3 py-2 font-mono text-xs text-clin-muted"
                    title={scoresTooltipLines(c)}
                  >
                    <span className="cursor-help underline decoration-dotted decoration-clin-muted underline-offset-2">
                      R{c.relationshipScore} B{c.businessScore} C{c.cleanupScore}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-clin-muted">
                    {c.lastUpdatedAt
                      ? c.lastUpdatedAt.toLocaleString()
                      : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-clin-muted">
        Profile links: open LinkedIn manually from your browser — Clin does not
        automate navigation.{" "}
        <Link href="/queue" className="clin-link">
          Review queue
        </Link>
      </p>
    </div>
  );
}
