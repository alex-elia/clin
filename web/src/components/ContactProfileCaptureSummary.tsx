import Link from "next/link";
import {
  profileDepthFromLatestJson,
  type ProfileDepth,
} from "@/lib/campaignMemberReadiness";
import { formatRichProfileForPrompt } from "@/lib/profileCaptureContext";
import {
  getLatestPostsCaptureJson,
  getLatestProfileCaptureJson,
} from "@/lib/profileCaptureContext";

const DEPTH_LABEL: Record<ProfileDepth, string> = {
  missing: "No profile capture",
  thin: "Thin capture (name/card only)",
  ok: "Detailed capture (About or Experience/Education)",
};

const DEPTH_HINT: Record<ProfileDepth, string> = {
  missing:
    "Open their LinkedIn profile in Chrome, scroll so About and Experience load, then Capture in the Clin extension.",
  thin:
    "Capture ran but Clin only got the top card (name). Scroll the full profile — About, Experience, Education — then Capture again.",
  ok: "Enough for outreach analysis and drafts. Re-capture after major profile changes.",
};

export async function ContactProfileCaptureSummary({
  contactId,
  headline,
  company,
  location,
}: {
  contactId: string;
  headline: string | null;
  company: string | null;
  location: string | null;
}) {
  const [json, postsJson] = await Promise.all([
    getLatestProfileCaptureJson(contactId),
    getLatestPostsCaptureJson(contactId),
  ]);
  const depth = profileDepthFromLatestJson(json);
  const rich = formatRichProfileForPrompt(json, 8000);
  const postItems = Array.isArray(postsJson?.profilePosts)
    ? (postsJson.profilePosts as { text?: string; ageLabel?: string }[]).filter(
        (p) => typeof p?.text === "string" && p.text.trim(),
      )
    : [];

  const exp = Array.isArray(json?.experienceBullets)
    ? (json.experienceBullets as string[]).filter((x) => typeof x === "string")
    : [];
  const edu = Array.isArray(json?.educationBullets)
    ? (json.educationBullets as string[]).filter((x) => typeof x === "string")
    : [];
  const about =
    typeof json?.about === "string" ? json.about.trim().slice(0, 400) : "";

  return (
    <section className="clin-card space-y-3 p-5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="clin-section-title">Profile capture</h2>
        <span
          className={`clin-pill text-xs ${
            depth === "ok"
              ? "border-emerald-400/50 text-emerald-800 dark:text-emerald-200"
              : depth === "thin"
                ? "border-amber-400/50 text-amber-900 dark:text-amber-100"
                : ""
          }`}
        >
          {DEPTH_LABEL[depth]}
        </span>
      </div>
      <p className="text-[var(--clin-muted)]">{DEPTH_HINT[depth]}</p>

      <dl className="grid gap-2 text-xs sm:grid-cols-3">
        <div>
          <dt className="font-medium text-[var(--clin-text)]">Headline</dt>
          <dd className="mt-0.5 text-[var(--clin-muted)]">{headline?.trim() || "—"}</dd>
        </div>
        <div>
          <dt className="font-medium text-[var(--clin-text)]">Company</dt>
          <dd className="mt-0.5 text-[var(--clin-muted)]">{company?.trim() || "—"}</dd>
        </div>
        <div>
          <dt className="font-medium text-[var(--clin-text)]">Location</dt>
          <dd className="mt-0.5 text-[var(--clin-muted)]">{location?.trim() || "—"}</dd>
        </div>
      </dl>

      {about ? (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--clin-muted)]">
            About (captured)
          </h3>
          <p className="mt-1 whitespace-pre-wrap text-[var(--clin-text)]">
            {about}
            {about.length >= 400 ? "…" : ""}
          </p>
        </div>
      ) : null}

      {exp.length > 0 ? (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--clin-muted)]">
            Experience ({exp.length} blocks)
          </h3>
          <ul className="mt-1 list-inside list-disc space-y-1 text-[var(--clin-text)]">
            {exp.slice(0, 5).map((line, i) => (
              <li key={i} className="text-xs leading-snug">
                {line.length > 200 ? `${line.slice(0, 197)}…` : line}
              </li>
            ))}
            {exp.length > 5 ? (
              <li className="text-[var(--clin-muted)]">+{exp.length - 5} more</li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {edu.length > 0 ? (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--clin-muted)]">
            Education ({edu.length})
          </h3>
          <ul className="mt-1 list-inside list-disc space-y-1 text-xs text-[var(--clin-text)]">
            {edu.slice(0, 3).map((line, i) => (
              <li key={i}>{line.length > 160 ? `${line.slice(0, 157)}…` : line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {!about && exp.length === 0 && edu.length === 0 && depth !== "missing" ? (
        <p className="text-xs text-[var(--clin-muted)]">
          Latest capture has no About / Experience / Education text. LinkedIn may not
          have rendered those sections yet, or the page layout changed.
        </p>
      ) : null}

      {postItems.length > 0 ? (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--clin-muted)]">
            Recent posts ({postItems.length})
          </h3>
          <ul className="mt-1 list-inside list-disc space-y-1 text-xs text-[var(--clin-text)]">
            {postItems.slice(0, 4).map((p, i) => (
              <li key={i} className="leading-snug">
                {p.ageLabel ? (
                  <span className="text-[var(--clin-muted)]">[{p.ageLabel}] </span>
                ) : null}
                {(p.text ?? "").length > 220
                  ? `${(p.text ?? "").slice(0, 217)}…`
                  : p.text}
              </li>
            ))}
            {postItems.length > 4 ? (
              <li className="text-[var(--clin-muted)]">+{postItems.length - 4} more</li>
            ) : null}
          </ul>
        </div>
      ) : null}

      <p className="text-xs text-[var(--clin-muted)]">
        <strong className="font-medium text-[var(--clin-text)]">Separate captures:</strong>{" "}
        use extension <em>Posts</em> on their profile/activity and <em>Messaging</em> on a
        thread. Messages appear in{" "}
        <Link href={`/inbox?contact=${encodeURIComponent(contactId)}`} className="clin-link">
          Inbox
        </Link>
        . R/B/C scores use headline + recency — run{" "}
        <span className="font-medium">Full LLM analysis</span> for stewardship.
      </p>

      <p className="text-xs">
        <Link href="/captures" className="clin-link">
          Capture log
        </Link>
        {rich ? (
          <>
            {" "}
            · rich text is included in outreach drafts when depth is{" "}
            <em>detailed</em>
          </>
        ) : null}
      </p>
    </section>
  );
}
