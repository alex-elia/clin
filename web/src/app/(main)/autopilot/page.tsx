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
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Autopilot
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          <strong className="font-medium text-zinc-800 dark:text-zinc-200">
            On LinkedIn
          </strong>
          , Clin stays human-in-the-loop: you open pages and press Capture (or use
          the optional hygiene runner under{" "}
          <Link href="/settings" className="text-blue-600 underline dark:text-blue-400">
            Settings
          </Link>
          ). There is no supported mode that auto-scrolls, auto-clicks, or pulls data
          without your action — that is intentional for safety and ToS posture.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          <strong className="font-medium text-zinc-800 dark:text-zinc-200">
            On your machine
          </strong>
          , you can put{" "}
          <strong className="font-medium text-zinc-800 dark:text-zinc-200">
            Ollama analysis
          </strong>{" "}
          on autopilot: after each{" "}
          <em>profile</em> capture, or in batches below. That uses only data already
          stored in your local SQLite DB.
        </p>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900/40">
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">
          Maximize what each contact stores
        </h2>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-zinc-700 dark:text-zinc-300">
          <li>
            Import the <strong>connections / search list</strong> with one-off
            Capture, or use the extension side panel{" "}
            <strong>List sprint</strong> (auto-scroll + import rounds) while
            the same <strong>pacing and hourly caps</strong> apply. Allow sprint in
            Clin → Settings if needed.
          </li>
          <li>
            Open high-value <strong>/in/… profiles</strong> and Capture on each tab
            for full name, headline, company, and richer context (best signal for LLM
            advice).
          </li>
          <li>
            Enable{" "}
            <strong className="font-medium">Analyze after each profile capture</strong>{" "}
            in Settings, or run batches here when you have hundreds of pending
            contacts.
          </li>
        </ol>
      </section>

      <AutopilotBatchPanel
        defaultLimit={settings.batchDefaultLimit}
        pendingCount={pending}
      />

      <p className="text-xs text-zinc-500">
        API:{" "}
        <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-900">
          POST /api/autopilot/analyze-batch
        </code>{" "}
        with body{" "}
        <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-900">
          {`{"limit":8}`}
        </code>
        .
      </p>
    </div>
  );
}
