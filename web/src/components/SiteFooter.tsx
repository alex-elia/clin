import Link from "next/link";
import {
  CLIN_GITHUB_ISSUES,
  CLIN_GITHUB_REPO,
} from "@/lib/projectLinks";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-[var(--clin-border)] bg-[var(--clin-surface-muted)]">
      <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-[var(--clin-muted)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Clin — local-first LinkedIn assistant. Open source; you run it on
            your machine.
          </p>
          <p>
            Created by{" "}
            <span className="font-medium text-[var(--clin-text)]">
              Alex Gon
            </span>
            {" · "}
            <Link href="/about" className="clin-link">
              About
            </Link>
            {" · "}
            <Link href="/settings" className="clin-link">
              Settings
            </Link>
          </p>
        </div>
        <p className="mt-3 text-xs">
          <a
            href={CLIN_GITHUB_REPO}
            className="clin-link"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          {" · "}
          <a
            href={CLIN_GITHUB_ISSUES}
            className="clin-link"
            target="_blank"
            rel="noreferrer"
          >
            Issues
          </a>
          {" — "}
          best-effort maintenance; report bugs on GitHub
        </p>
      </div>
    </footer>
  );
}
