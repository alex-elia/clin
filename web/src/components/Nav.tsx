import Image from "next/image";
import Link from "next/link";

const links = [
  { href: "/", label: "Overview" },
  { href: "/about", label: "About" },
  { href: "/me", label: "You & goals" },
  { href: "/contacts", label: "Contacts" },
  { href: "/inbox", label: "Inbox" },
  { href: "/decisions", label: "Decisions" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/analytics", label: "Analytics" },
  { href: "/queue", label: "Queue" },
  { href: "/captures", label: "Captures" },
  { href: "/autopilot", label: "Autopilot" },
  { href: "/settings", label: "Settings" },
] as const;

export function Nav() {
  return (
    <header className="border-b border-[var(--clin-border)] bg-[var(--clin-surface)]">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-3">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-[var(--clin-text)]"
        >
          <Image
            src="/brand/Clin_Logo_Small.png"
            alt="Clin"
            width={350}
            height={232}
            priority
            className="h-9 w-auto"
          />
        </Link>
        <nav className="flex flex-wrap gap-4 text-sm text-[var(--clin-muted)]">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="hover:text-[var(--clin-accent)]"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
