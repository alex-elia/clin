import Link from "next/link";
import {
  getActiveOutreachCampaignId,
  listOutreachCampaigns,
} from "@/lib/outreachCampaigns";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const [campaigns, activeId] = await Promise.all([
    listOutreachCampaigns(),
    getActiveOutreachCampaignId(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            One <strong className="font-medium">campaign</strong> is your pitch context plus a{" "}
            <strong className="font-medium">list of contacts</strong>. Set a{" "}
            <strong className="font-medium">capture target</strong> on a campaign, then use the extension on LinkedIn
            search/lists/profiles to fill that list. Generate drafts with Ollama (dashboard or extension), edit, mark{" "}
            <strong className="font-medium">ready</strong>, set{" "}
            <strong className="font-medium">active for extension</strong>, then refresh{" "}
            <code className="rounded bg-zinc-100 px-1 font-mono text-xs dark:bg-zinc-900">
              Outreach
            </code>{" "}
            in the browser extension — same pull model as{" "}
            <Link href="/decisions" className="underline">
              Decisions
            </Link>
            .
          </p>
        </div>
        <Link
          href="/campaigns/new"
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          New campaign
        </Link>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        {campaigns.length === 0 ? (
          <p className="p-6 text-sm text-zinc-600 dark:text-zinc-400">
            No campaigns yet. Create one and add contacts by segment (e.g. warm) or paste
            contact IDs from{" "}
            <Link href="/contacts" className="underline">
              Contacts
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {campaigns.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <Link
                    href={`/campaigns/${c.id}`}
                    className="font-medium text-zinc-900 hover:underline dark:text-zinc-50"
                  >
                    {c.name}
                  </Link>
                  {activeId === c.id ? (
                    <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                      Active for extension
                    </span>
                  ) : null}
                  <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">
                    {c.contextText}
                  </p>
                </div>
                <Link
                  href={`/campaigns/${c.id}`}
                  className="text-sm text-zinc-600 underline dark:text-zinc-400"
                >
                  Open
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
