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
          className="text-sm text-zinc-600 underline dark:text-zinc-400"
        >
          ← Campaigns
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">New campaign</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          <strong className="font-medium">Context</strong> is the main pitch the model sees for every person.
          <strong className="font-medium"> Writer instructions</strong> refine tone and rules. Configure Ollama URL
          and model under{" "}
          <Link href="/settings" className="underline">
            Settings
          </Link>
          . While <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-800">npm run dev</code> is running,
          draft generation logs as{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-800">[clin:outreach-draft]</code> in the
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
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Name
          </span>
          <input
            name="name"
            required
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            placeholder="e.g. Q2 partner intros"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Campaign context
          </span>
          <textarea
            name="contextText"
            required
            rows={8}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            placeholder="What you’re offering, why now, 1–2 proof points, who you help…"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Writer instructions (optional)
          </span>
          <textarea
            name="writerInstructions"
            rows={5}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            placeholder="e.g. Always mention we met at X. Keep under 800 chars. No emojis. Ask for a 15-min call. Never claim we worked together."
          />
        </label>
        <details className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
          <summary className="cursor-pointer text-sm font-medium">
            Advanced: custom system prompt (optional)
          </summary>
          <p className="mt-2 text-xs text-zinc-500">
            Replaces the default JSON instruction entirely. You must still ask the model for{" "}
            <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">{"{\"message\":\"...\"}"}</code> only.
          </p>
          <textarea
            name="systemPromptOverride"
            rows={6}
            className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
            placeholder="Leave empty to use Clin’s default outreach system prompt."
          />
        </details>
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Create
        </button>
      </form>
    </div>
  );
}
