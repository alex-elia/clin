import Link from "next/link";

const links = [
  { href: "/", label: "Overview" },
  { href: "/contacts", label: "Contacts" },
  { href: "/decisions", label: "Decisions" },
  { href: "/queue", label: "Queue" },
  { href: "/captures", label: "Captures" },
  { href: "/settings", label: "Pacing" },
] as const;

export function Nav() {
  return (
    <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-3">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
        >
          Clin
        </Link>
        <nav className="flex flex-wrap gap-4 text-sm text-zinc-600 dark:text-zinc-400">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
