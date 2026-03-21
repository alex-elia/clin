export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
      <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-16 sm:py-24">
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Local-first
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Clin
          </h1>
          <p className="text-lg leading-relaxed text-zinc-600 dark:text-zinc-300">
            Network intelligence for your LinkedIn graph: capture, score, and
            review — with you in control. No automated actions on LinkedIn.
          </p>
        </div>
        <ul className="list-inside list-disc space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
          <li>
            API:{" "}
            <code className="rounded bg-zinc-200/80 px-1.5 py-0.5 font-mono text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
              GET /api/health
            </code>{" "}
            (for the future extension)
          </li>
          <li>Design and boundaries: see <code className="font-mono">docs/DESIGN.md</code> in the repo root</li>
        </ul>
      </main>
    </div>
  );
}
