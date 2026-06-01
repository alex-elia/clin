import Image from "next/image";
import Link from "next/link";
import {
  CLIN_GITHUB_ISSUES_NEW,
  CLIN_GITHUB_REPO,
} from "@/lib/projectLinks";

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
            About Clin
          </h1>
          <p className="mt-1 text-sm text-[var(--clin-muted)]">
            Local-first LinkedIn assistant
          </p>
        </div>
      </div>

      <section className="clin-card space-y-3 p-6">
        <h2 className="text-lg font-medium text-[var(--clin-text)]">
          Three workspaces
        </h2>
        <ul className="space-y-3 text-sm text-[var(--clin-muted)]">
          <li>
            <Link href="/data" className="clin-link font-medium text-[var(--clin-text)]">
              Data & cleaning
            </Link>
            — capture and analyze profiles from search pages or individual
            profiles; review contacts and run optional cleaning batches.
          </li>
          <li>
            <Link href="/outreach" className="clin-link font-medium text-[var(--clin-text)]">
              Outreach
            </Link>
            — campaigns, messaging drafts, decisions, and inbox snapshots.
          </li>
          <li>
            <Link href="/branding" className="clin-link font-medium text-[var(--clin-text)]">
              Personal branding
            </Link>
            — your voice and goals, post analytics, and influence-oriented
            captures from LinkedIn.
          </li>
        </ul>
      </section>

      <section className="clin-card space-y-3 p-6">
        <h2 className="text-lg font-medium text-[var(--clin-text)]">
          Maintainer
        </h2>
        <p className="text-sm leading-relaxed text-[var(--clin-muted)]">
          Clin is created and maintained by{" "}
          <strong className="text-[var(--clin-text)]">Alex Gon</strong> as open
          source software — a local, inspectable assistant, not a hosted growth
          product. Maintenance is <strong className="text-[var(--clin-text)]">best-effort</strong>:
          no paid support or guaranteed response times.
        </p>
      </section>

      <section className="clin-card space-y-3 p-6">
        <h2 className="text-lg font-medium text-[var(--clin-text)]">
          Community and GitHub
        </h2>
        <p className="text-sm leading-relaxed text-[var(--clin-muted)]">
          The project is open source and community-friendly: you can fork,
          inspect, and adapt the code. Feedback and contributions go through
          GitHub.
        </p>
        <ul className="space-y-2 text-sm">
          <li>
            <a
              href={CLIN_GITHUB_REPO}
              className="clin-link"
              target="_blank"
              rel="noreferrer"
            >
              github.com/alex-elia/clin
            </a>
            — source and releases
          </li>
          <li>
            <a
              href={CLIN_GITHUB_ISSUES_NEW}
              className="clin-link"
              target="_blank"
              rel="noreferrer"
            >
              Open an issue
            </a>
            — bugs, LinkedIn DOM breakage, ideas
          </li>
          <li className="text-[var(--clin-muted)]">
            Pull requests welcome for focused fixes (especially{" "}
            <code className="rounded bg-[var(--clin-surface-muted)] px-1.5 py-0.5 text-xs">
              extension/background.js
            </code>
            ).
          </li>
        </ul>
      </section>

      <section className="clin-card space-y-2 p-6">
        <h2 className="text-lg font-medium text-[var(--clin-text)]">
          Get started
        </h2>
        <ul className="space-y-2 text-sm text-[var(--clin-muted)]">
          <li>
            <Link href="/settings" className="clin-link">
              Settings
            </Link>{" "}
            — pacing, data path, backup, automation toggles
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
