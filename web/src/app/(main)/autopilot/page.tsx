import Link from "next/link";
import {
  countContactsPendingLlmAnalysis,
  getAutopilotSettings,
} from "@/lib/autopilot";
import { countCampaignMembersPendingAnalysis } from "@/lib/campaignAutopilot";
import { countContactsNeedingProfileCapture } from "@/lib/enrichment";
import { listOutreachCampaigns } from "@/lib/outreachCampaigns";
import { AutopilotBatchPanel } from "./AutopilotBatchPanel";
import { AutopilotCampaignPanel } from "./AutopilotCampaignPanel";

export const dynamic = "force-dynamic";

export default async function AutopilotPage() {
  const [pending, settings, needsProfile, campaignRows] = await Promise.all([
    Promise.resolve(countContactsPendingLlmAnalysis()),
    getAutopilotSettings(),
    countContactsNeedingProfileCapture(),
    listOutreachCampaigns(),
  ]);
  const campaigns = campaignRows.map((c) => ({
    id: c.id,
    name: c.name,
    pendingAnalysis: countCampaignMembersPendingAnalysis(c.id),
  }));

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--clin-muted)]">
          <Link href="/data" className="clin-link">
            Data & cleaning
          </Link>
        </p>
        <h1 className="clin-page-title">Autopilot</h1>
        <p className="clin-page-lead">
          Local AI scores fit vs your offer (reach out / nurture / skip), runs in
          batches, and can draft outreach for a campaign. Import and enrich run in
          the <strong className="clin-strong">extension → Import &amp; enrich</strong>{" "}
          — enable messaging capture there for better thread context.
        </p>
      </div>

      <section className="clin-callout">
        <h2 className="clin-section-title">Simple workflow</h2>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-[var(--clin-muted)]">
          <li>
            LinkedIn people search → extension <strong>Import &amp; enrich</strong>{" "}
            ({needsProfile > 0 ? `${needsProfile} contacts still need full profile locally` : "list + profiles"}).
          </li>
          <li>
            Fill <Link href="/branding/setup?edit=1" className="clin-link">goals &amp; offer</Link>{" "}
            so analysis is meaningful.
          </li>
          <li>
            Analysis runs after the <strong>capture chain</strong> (profile, optional
            posts) completes when enabled in Settings — or run batches below.
          </li>
          <li>
            <strong>Campaign autopilot</strong> analyzes members and can generate drafts
            or update segments from fit.
          </li>
        </ol>
      </section>

      <AutopilotCampaignPanel
        campaigns={campaigns}
        defaultLimit={settings.batchDefaultLimit}
        draftOnReachOut={settings.campaignDraftOnReachOut}
        tagSkipAsGhost={settings.campaignTagSkipGhost}
        tagNurtureAsWarm={settings.campaignTagNurtureWarm}
      />

      <AutopilotBatchPanel
        defaultLimit={settings.batchDefaultLimit}
        pendingCount={pending}
      />
    </div>
  );
}
