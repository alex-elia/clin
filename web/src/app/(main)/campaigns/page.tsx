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
          <h1 className="clin-page-title">Campaigns</h1>
          <p className="mt-1 max-w-2xl text-sm text-clin-muted">
            One <strong className="font-medium">campaign</strong> is your pitch context plus a{" "}
            <strong className="font-medium">list of contacts</strong>. Set a{" "}
            <strong className="font-medium">capture target</strong> on a campaign, then use the extension on LinkedIn
            search/lists/profiles to fill that list. Generate drafts with Ollama (dashboard or extension), edit, mark{" "}
            <strong className="font-medium">ready</strong>, set{" "}
            <strong className="font-medium">active for extension</strong>, then refresh{" "}
            <code className="clin-code font-mono">
              Outreach
            </code>{" "}
            in the browser extension — same pull model as{" "}
            <Link href="/decisions" className="clin-link">
              Decisions
            </Link>
            .
          </p>
        </div>
        <Link
          href="/campaigns/new"
          className="clin-btn-primary"
        >
          New campaign
        </Link>
      </div>

      <div className="clin-card">
        {campaigns.length === 0 ? (
          <p className="p-6 text-sm text-clin-muted">
            No campaigns yet. Create one and add contacts by segment (e.g. warm) or paste
            contact IDs from{" "}
            <Link href="/contacts" className="clin-link">
              Contacts
            </Link>
            .
          </p>
        ) : (
          <ul className="">
            {campaigns.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <Link
                    href={`/campaigns/${c.id}`}
                    className="font-medium text-clin-text clin-link"
                  >
                    {c.name}
                  </Link>
                  {activeId === c.id ? (
                    <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                      Active for extension
                    </span>
                  ) : null}
                  <p className="mt-0.5 line-clamp-2 text-xs text-clin-muted">
                    {c.contextText}
                  </p>
                </div>
                <Link
                  href={`/campaigns/${c.id}`}
                  className="clin-link text-sm"
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
