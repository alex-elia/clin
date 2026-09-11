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

/** Prompt block for outreach / DM / comment generation — identity for voice, never for sign-off. */
export function buildSenderIdentityPromptBlock(sender: SenderIdentity): string {
  const lines = [
    "Sender (you — the Clin user who will paste this on LinkedIn):",
  ];
  if (sender.fullName) lines.push(`- Name: ${sender.fullName}`);
  if (sender.headline) lines.push(`- Headline: ${sender.headline}`);
  if (sender.company) lines.push(`- Company: ${sender.company}`);
  if (!sender.fullName && !sender.headline) {
    lines.push(
      "- Name unknown in Clin — capture your own LinkedIn profile (voice setup) so drafts can use your company/headline context.",
    );
  }
  lines.push(
    "- Write in first person as this sender. LinkedIn already shows who you are — NEVER append a name signature, full name, or letter sign-off (e.g. \"Cordialement,\" / \"Best regards,\" + Name).",
    "- NEVER output placeholders such as [Your Name], [your name], {{name}}, [Company], [Title], or similar.",
    "- End on the ask, question, or last thought — not a personal name line.",
  );
  return lines.join("\n");
}

const PLACEHOLDER_PATTERNS: RegExp[] = [
  /\[your name\]/gi,
  /\[Your Name\]/g,
  /\{\{name\}\}/gi,
  /\[Name\]/g,
  /\[First Name\]/gi,
  /\[Company\]/gi,
  /\[Your Company\]/gi,
];

const LETTER_SIGNOFF_RE =
  /(?:\n|^)\s*(?:Cordialement|Bien à vous|Bien cordialement|Meilleures salutations|Best regards|Kind regards|Warm regards|Regards|Sincerely|Cheers|Thanks|Thank you|Merci)\s*[,.]?\s*$/i;

/**
 * Remove trailing letter-style sign-offs and known sender name lines.
 * LinkedIn already attributes the message to the profile.
 */
export function stripSenderSignatureFromDraft(
  message: string,
  sender?: SenderIdentity | null,
): string {
  let out = message.replace(/\r\n/g, "\n").trimEnd();
  for (let i = 0; i < 4; i++) {
    const before = out;
    out = out.replace(LETTER_SIGNOFF_RE, "").trimEnd();

    const name = sender?.fullName?.trim();
    if (name) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const first = (name.split(/\s+/)[0] || name).replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
      );
      out = out
        .replace(
          new RegExp(
            `(?:\\n|^)\\s*(?:—|–|-)?\\s*${escaped}\\s*[.!]?\\s*$`,
            "iu",
          ),
          "",
        )
        .trimEnd();
      out = out
        .replace(
          new RegExp(
            `(?:\\n|^)\\s*(?:—|–|-)?\\s*${first}\\s*[.!]?\\s*$`,
            "iu",
          ),
          "",
        )
        .trimEnd();
    }

    // Trailing "Firstname ALLCAPS" style signatures without a letter phrase
    out = out
      .replace(
        /(?:\n|^)\s*(?:—|–|-)?\s*[A-ZÀ-Ÿ][a-zà-ÿ'’-]+\s+[A-ZÀ-Ÿ]{2,}\s*$/u,
        "",
      )
      .trimEnd();

    if (out === before) break;
  }
  return out.trim();
}

/**
 * Remove name placeholders and strip trailing signatures.
 * (Historically filled placeholders with the sender name — that produced "Alexandre GON" endings.)
 */
export function applySenderNameToDraft(
  message: string,
  sender: SenderIdentity,
): string {
  let out = message;
  for (const re of PLACEHOLDER_PATTERNS) {
    out = out.replace(re, "");
  }
  out = out
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return stripSenderSignatureFromDraft(out, sender);
}
