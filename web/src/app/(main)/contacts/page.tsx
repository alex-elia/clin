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
  searchParams: Promise<{ q?: string; segment?: string }>;
}) {
  const sp = await searchParams;
  const rows = await listContacts({
    q: sp.q,
    segment: sp.segment,
    limit: 80,
    offset: 0,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Search and filter captured profiles.
        </p>
      </div>

      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        method="get"
      >
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Search</span>
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Name, company, headline"
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:w-48">
          <span className="text-zinc-600 dark:text-zinc-400">Segment</span>
          <select
            name="segment"
            defaultValue={sp.segment ?? ""}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          >
            <option value="">All</option>
            {segments.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Apply
        </button>
      </form>

      <ScoreLegend />

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Company</th>
              <th className="px-3 py-2">Segment</th>
              <th className="px-3 py-2">
                Scores{" "}
                <span className="font-normal normal-case text-zinc-400">
                  (hover a row)
                </span>
              </th>
              <th className="px-3 py-2">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center text-zinc-500"
                >
                  No contacts. Use the Chrome extension to capture a profile.
                </td>
              </tr>
            ) : (
              rows.map((c) => (
                <tr key={c.id} className="bg-white dark:bg-zinc-950">
                  <td className="px-3 py-2">
                    <div className="font-medium text-zinc-900 dark:text-zinc-100">
                      <Link
                        href={`/contacts/${c.id}`}
                        className="hover:underline"
                      >
                        {c.fullName ?? "—"}
                      </Link>
                    </div>
                    <div className="text-xs text-zinc-500 line-clamp-1">
                      {c.headline ?? ""}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                    {c.company ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs dark:bg-zinc-900">
                      {c.segment}
                    </span>
                  </td>
                  <td
                    className="px-3 py-2 font-mono text-xs text-zinc-600 dark:text-zinc-400"
                    title={scoresTooltipLines(c)}
                  >
                    <span className="cursor-help underline decoration-dotted decoration-zinc-400 underline-offset-2">
                      R{c.relationshipScore} B{c.businessScore} C{c.cleanupScore}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-500">
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

      <p className="text-xs text-zinc-500">
        Profile links: open LinkedIn manually from your browser — Clin does not
        automate navigation.{" "}
        <Link href="/queue" className="underline">
          Review queue
        </Link>
      </p>
    </div>
  );
}
