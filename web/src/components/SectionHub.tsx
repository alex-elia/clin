import Link from "next/link";

export type HubLink = {
  href: string;
  title: string;
  description: string;
};

type SectionHubProps = {
  title: string;
  lead: string;
  links: HubLink[];
};

export function SectionHub({ title, lead, links }: SectionHubProps) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="clin-page-title">{title}</h1>
        <p className="clin-page-lead">{lead}</p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2">
        {links.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="clin-card block p-5 transition-shadow hover:shadow-md"
            >
              <h2 className="text-base font-semibold text-[var(--clin-text)]">
                {item.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--clin-muted)]">
                {item.description}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
