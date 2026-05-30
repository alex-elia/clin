import Link from "next/link";
import {
  countContactsPendingLlmAnalysis,
  getAutopilotSettings,
} from "@/lib/autopilot";
import { AutopilotBatchPanel } from "./AutopilotBatchPanel";

export const dynamic = "force-dynamic";

export default async function AutopilotPage() {
  const [pending, settings] = await Promise.all([
    Promise.resolve(countContactsPendingLlmAnalysis()),
    getAutopilotSettings(),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--clin-muted)]">
          <Link href="/data" className="clin-link">
            Data & cleaning
          </Link>
        </p>
        <h1 className="clin-page-title">Cleaning</h1>
        <p className="clin-page-lead">
          <strong className="clin-strong">On LinkedIn</strong>, Clin stays
          human-in-the-loop: you open pages and press Capture (or use the optional
          hygiene runner under{" "}
          <Link href="/settings" className="clin-link">
            Settings
          </Link>
          ). There is no supported mode that auto-scrolls, auto-clicks, or pulls
          data without your action — that is intentional for safety and ToS
          posture.
        </p>
        <p className="mt-3 clin-page-lead">
          <strong className="clin-strong">On your machine</strong>, you can put{" "}
          <strong className="clin-strong">AI contact analysis</strong> on autopilot:
          after each <em>profile</em> capture, or in batches below. That uses only
          data already stored in your local SQLite DB.
        </p>
      </div>

      <section className="clin-callout">
        <h2 className="clin-section-title">Maximize what each contact stores</h2>
        <ol className="mt-2 list-decimal space-y-2 pl-5">
          <li>
            Import the <strong>connections / search list</strong> with one-off
            Capture, or use the extension side panel{" "}
            <strong>List sprint</strong> (auto-scroll + import rounds) while the
            same <strong>pacing and hourly caps</strong> apply. Allow sprint in
            Clin → Settings if needed.
          </li>
          <li>
            Open high-value <strong>/in/… profiles</strong> and Capture on each tab
            for full name, headline, company, and richer context (best signal for
            LLM advice).
          </li>
          <li>
            Enable{" "}
            <strong className="clin-strong">
              Analyze after each profile capture
            </strong>{" "}
            in Settings, or run batches here when you have hundreds of pending
            contacts.
          </li>
        </ol>
      </section>

      <AutopilotBatchPanel
        defaultLimit={settings.batchDefaultLimit}
        pendingCount={pending}
      />

      <p className="text-xs text-clin-muted">
        API:{" "}
        <code className="clin-code">POST /api/autopilot/analyze-batch</code> with
        body <code className="clin-code">{`{"limit":8}`}</code>.
      </p>
    </div>
  );
}
