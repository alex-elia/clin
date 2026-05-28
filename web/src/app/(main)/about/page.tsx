import Image from "next/image";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="flex items-center gap-4">
        <Image
          src="/brand/Clin_Logo_Small.png"
          alt=""
          width={350}
          height={232}
          className="h-11 w-auto"
        />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--clin-text)]">
            Clin
          </h1>
          <p className="mt-1 text-sm text-[var(--clin-muted)]">
            Local-first LinkedIn network intelligence
          </p>
        </div>
      </div>

      <section className="clin-card space-y-3 p-6">
        <h2 className="text-lg font-medium text-[var(--clin-text)]">
          What Clin does
        </h2>
        <p className="text-sm leading-relaxed text-[var(--clin-muted)]">
          Clin runs on your machine. The Chrome extension captures what you see
          on LinkedIn—profiles, lists, inbox threads, analytics—and stores it in
          a local database. The dashboard helps you score contacts, queue
          reviews, run campaigns, and track outcomes.
        </p>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-[var(--clin-muted)]">
          <li>
            <strong className="text-[var(--clin-text)]">Capture</strong> — save
            visible data with the extension
          </li>
          <li>
            <strong className="text-[var(--clin-text)]">Decide</strong> — approve
            drafts and pacing in the dashboard
          </li>
          <li>
            <strong className="text-[var(--clin-text)]">Outreach</strong> —
            campaigns with optional paced send automation (opt-in)
          </li>
        </ol>
      </section>

      <section className="clin-card space-y-2 p-6">
        <h2 className="text-lg font-medium text-[var(--clin-text)]">
          Get started
        </h2>
        <ul className="space-y-2 text-sm">
          <li>
            <Link href="/settings" className="clin-link">
              Settings
            </Link>{" "}
            — pacing, data backup, outreach automation
          </li>
          <li>
            <Link href="/me" className="clin-link">
              You & goals
            </Link>{" "}
            — positioning for smarter drafts
          </li>
          <li>
            Load the unpacked extension from{" "}
            <code className="rounded bg-[var(--clin-surface-muted)] px-1.5 py-0.5 text-xs">
              clin/extension
            </code>
          </li>
        </ul>
      </section>
    </div>
  );
}
