import Link from "next/link";
import type { NetworkHygieneRow } from "@/lib/networkHygieneTypes";

const ZOMBIE_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-800",
  medium: "bg-amber-100 text-amber-900",
  low: "bg-zinc-100 text-zinc-700",
  active: "bg-emerald-100 text-emerald-800",
};

const VERDICT_LABELS: Record<string, string> = {
  yes: "Disconnect: yes",
  maybe: "Disconnect: maybe",
  no: "Keep",
  not_applicable: "Not 1st degree",
};

type Props = {
  hygiene: NetworkHygieneRow;
};

export function ContactHygieneChip({ hygiene }: Props) {
  const zombieClass =
    ZOMBIE_COLORS[hygiene.zombieLevel] ?? "bg-zinc-100 text-zinc-700";

  return (
    <section className="clin-card space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="clin-section-title">Network hygiene</h2>
        <Link href="/cleaning" className="clin-link text-sm">
          Open pipeline
        </Link>
      </div>
      <p className="flex flex-wrap gap-2 text-xs">
        <span className={`clin-pill ${zombieClass}`}>
          Zombie: {hygiene.zombieLevel}
        </span>
        <span className="clin-pill">
          {VERDICT_LABELS[hygiene.removeVerdict] ?? hygiene.removeVerdict}
        </span>
        <span className="clin-pill">Confidence: {hygiene.adviceConfidence}</span>
        {hygiene.bucket ? (
          <span className="clin-pill">Bucket: {hygiene.bucket}</span>
        ) : null}
      </p>
      {hygiene.reasons.length > 0 ? (
        <ul className="list-inside list-disc text-sm text-[var(--clin-muted)]">
          {hygiene.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
      {hygiene.canDisconnect && hygiene.removeVerdict === "yes" ? (
        <p className="text-sm text-[var(--clin-muted)]">
          Accept on the cleaning board to queue removal, or confirm after you
          disconnect on LinkedIn from the{" "}
          <Link href="/cleaning" className="clin-link">
            cleaning page
          </Link>
          .
        </p>
      ) : null}
    </section>
  );
}
