import Link from "next/link";
import { createCampaignAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  const sp = await searchParams;
  const err = sp.err === "missing";

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link
          href="/campaigns"
          className="clin-link text-sm"
        >
          ← Campaigns
        </Link>
        <h1 className="mt-4 clin-page-title">New campaign</h1>
        <p className="mt-1 text-sm text-clin-muted">
          <strong className="font-medium">Context</strong> is the main pitch the model sees for every person.
          <strong className="font-medium"> Writer instructions</strong> refine tone and rules. Configure Ollama URL
          and model under{" "}
          <Link href="/settings" className="clin-link">
            Settings
          </Link>
          . While <code className="clin-code text-xs">npm run dev</code> is running,
          draft generation logs as{" "}
          <code className="clin-code text-xs">[clin:outreach-draft]</code> in the
          terminal.
        </p>
      </div>

      {err ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          Name and context are required.
        </p>
      ) : null}

      <form action={createCampaignAction} className="space-y-4">
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-clin-muted">
            Name
          </span>
          <input
            name="name"
            required
            className="mt-1 w-full clin-input text-sm"
            placeholder="e.g. Q2 partner intros"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-clin-muted">
            Campaign context
          </span>
          <textarea
            name="contextText"
            required
            rows={8}
            className="mt-1 w-full clin-input text-sm"
            placeholder="What you’re offering, why now, 1–2 proof points, who you help…"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-clin-muted">
            Writer instructions (optional)
          </span>
          <textarea
            name="writerInstructions"
            rows={5}
            className="mt-1 w-full clin-input text-sm"
            placeholder="e.g. Always mention we met at X. Keep under 800 chars. No emojis. Ask for a 15-min call. Never claim we worked together."
          />
        </label>
        <details className="clin-card p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Advanced: custom system prompt (optional)
          </summary>
          <p className="mt-2 text-xs text-clin-muted">
            Replaces the default JSON instruction entirely. You must still ask the model for{" "}
            <code className="clin-code">{"{\"message\":\"...\"}"}</code> only.
          </p>
          <textarea
            name="systemPromptOverride"
            rows={6}
            className="mt-2 w-full clin-input font-mono text-xs"
            placeholder="Leave empty to use Clin’s default outreach system prompt."
          />
        </details>
        <button
          type="submit"
          className="clin-btn-primary"
        >
          Create
        </button>
      </form>
    </div>
  );
}
