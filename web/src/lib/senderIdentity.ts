import { getUserContextForLlm } from "@/lib/userContext";

export type SenderIdentity = {
  fullName: string | null;
  headline: string | null;
  company: string | null;
};

export async function getSenderIdentity(): Promise<SenderIdentity> {
  const ctx = await getUserContextForLlm();
  return {
    fullName: ctx.selfProfile?.fullName?.trim() || null,
    headline: ctx.selfProfile?.headline?.trim() || null,
    company: ctx.selfProfile?.company?.trim() || null,
  };
}

/** Prompt block for outreach / DM generation. */
export function buildSenderIdentityPromptBlock(sender: SenderIdentity): string {
  const lines = [
    "Sender (you — the Clin user who will paste this message on LinkedIn):",
  ];
  if (sender.fullName) lines.push(`- Name: ${sender.fullName}`);
  if (sender.headline) lines.push(`- Headline: ${sender.headline}`);
  if (sender.company) lines.push(`- Company: ${sender.company}`);
  if (!sender.fullName && !sender.headline) {
    lines.push(
      "- Name unknown in Clin — capture your own LinkedIn profile (voice setup) so drafts can sign correctly.",
    );
  }
  lines.push(
    "- Sign with your real first name or full name as shown above. No bracket placeholders.",
    "- NEVER output placeholders such as [Your Name], [your name], {{name}}, [Company], [Title], or similar.",
  );
  return lines.join("\n");
}

const PLACEHOLDER_PATTERNS: { re: RegExp; useFirstName?: boolean }[] = [
  { re: /\[your name\]/gi },
  { re: /\[Your Name\]/g },
  { re: /\{\{name\}\}/gi },
  { re: /\[Name\]/g },
  { re: /\[First Name\]/gi },
  { re: /\[Company\]/gi },
  { re: /\[Your Company\]/gi },
];

/** Replace common model placeholders when we know the sender's name. */
export function applySenderNameToDraft(
  message: string,
  sender: SenderIdentity,
): string {
  const name = sender.fullName?.trim();
  if (!name) return message;
  const first = name.split(/\s+/)[0] || name;
  let out = message;
  for (const { re } of PLACEHOLDER_PATTERNS) {
    out = out.replace(re, first);
  }
  return out;
}
