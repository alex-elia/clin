/** How a captured LinkedIn activity item was authored. */
export type ProfilePostKind = "original" | "reshare" | "news_share";

export type ProfilePostCapture = {
  text: string;
  ageLabel?: string;
  postKind?: ProfilePostKind;
  /** Contact's own words when sharing (not the embedded article). */
  userComment?: string;
  sharedTitle?: string;
  sharedExcerpt?: string;
  sharedSource?: string;
  reactions?: number;
  comments?: number;
  postUrl?: string;
};

export const POST_KIND_LABELS: Record<ProfilePostKind, string> = {
  original: "Original post",
  reshare: "Reshare",
  news_share: "Shared news / article",
};

export const POST_ORIGIN_LLM_RULE = `When posts are marked reshare or news_share, do NOT treat the shared headline or article text as the contact's own opinion, achievement, or announcement. It signals topic interest, community belonging, or curation — use it for nurture hooks only. Prefer original posts or the contact's own commentary (userComment) for personalized outreach.`;

export function normalizeProfilePostKind(
  raw: string | null | undefined,
): ProfilePostKind | undefined {
  if (raw === "original" || raw === "reshare" || raw === "news_share") {
    return raw;
  }
  return undefined;
}

const ANALYSIS_POST_KINDS = [
  "original",
  "reshare",
  "news_share",
  "unknown",
] as const;
export type AnalysisPostKind = (typeof ANALYSIS_POST_KINDS)[number];

/**
 * Models often emit aliases (repost, article, quoted). Map those so analysis
 * does not fail the whole JSON when one post_notes.kind is off-enum.
 */
export function normalizeAnalysisPostKind(raw: unknown): AnalysisPostKind {
  if (typeof raw !== "string" || !raw.trim()) return "unknown";
  const t = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if ((ANALYSIS_POST_KINDS as readonly string[]).includes(t)) {
    return t as AnalysisPostKind;
  }
  if (/news|article|publication|link/.test(t)) return "news_share";
  if (/repost|reshare|quoted?|share/.test(t)) return "reshare";
  if (/original|organic|native|own|authored/.test(t)) return "original";
  return "unknown";
}

export function formatSinglePostForPrompt(
  post: ProfilePostCapture,
  index: number,
): string {
  const kind = normalizeProfilePostKind(post.postKind) ?? "original";
  const age = post.ageLabel?.trim();
  const prefix = `${index + 1}. [${POST_KIND_LABELS[kind]}${age ? ` · ${age}` : ""}]`;

  if (kind === "original") {
    const text = post.text.trim();
    return `${prefix} ${text.length > 900 ? `${text.slice(0, 897)}…` : text}`;
  }

  const lines = [prefix];
  if (post.userComment?.trim()) {
    lines.push(`   Their comment: ${post.userComment.trim()}`);
  }
  if (post.sharedTitle?.trim()) {
    lines.push(`   Shared title: ${post.sharedTitle.trim()}`);
  }
  if (post.sharedExcerpt?.trim()) {
    const ex = post.sharedExcerpt.trim();
    lines.push(
      `   Shared excerpt: ${ex.length > 400 ? `${ex.slice(0, 397)}…` : ex}`,
    );
  }
  if (post.sharedSource?.trim()) {
    lines.push(`   Source: ${post.sharedSource.trim()}`);
  }
  if (!post.userComment?.trim() && !post.sharedTitle?.trim()) {
    lines.push(`   Shared content: ${post.text.trim().slice(0, 500)}`);
  }
  lines.push(
    "   (Interest/curation signal — not their original writing.)",
  );
  return lines.join("\n");
}
