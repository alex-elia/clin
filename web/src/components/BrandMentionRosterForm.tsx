import { saveMentionRosterAction } from "@/app/actions";

type Props = {
  mentionRosterDefault: string;
};

export function BrandMentionRosterForm({ mentionRosterDefault }: Props) {
  return (
    <form action={saveMentionRosterAction} className="clin-card space-y-3 p-5">
      <h2 className="clin-section-title">LinkedIn @mentions</h2>
      <p className="text-sm text-[var(--clin-muted)]">
        People and companies you want the writing assistant to tag when relevant.
        Use the exact name as it appears on LinkedIn (e.g.{" "}
        <code className="text-xs">@Jean Dupont</code>,{" "}
        <code className="text-xs">@OVHcloud</code>). One per line; optional note
        after a dash.
      </p>
      <textarea
        name="mentionRoster"
        rows={6}
        defaultValue={mentionRosterDefault}
        placeholder={
          "@Marie Martin — CTO FinTech partner\n@OVHcloud — cloud & AI infra\n@CNIL — regulation context"
        }
        className="clin-input w-full font-mono text-sm"
      />
      <p className="text-xs text-[var(--clin-muted)]">
        Post copy uses <strong className="font-medium">**bold**</strong> and{" "}
        <em>*italic*</em> markers in the editor; Clin converts them to LinkedIn-style
        Unicode when you copy (like{" "}
        <a
          href="https://typegrow.com/tools/linkedin-text-formatter"
          className="clin-link"
          target="_blank"
          rel="noreferrer"
        >
          Typegrow&apos;s formatter
        </a>
        ). Toggle in Settings → Editorial autopilot.
      </p>
      <button type="submit" className="clin-btn-primary">
        Save mention roster
      </button>
    </form>
  );
}
