import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { extensionSnapshots } from "@/db/schema";

export type ParsedMetric = {
  label: string;
  value: string;
};

export type ParsedTopPost = {
  ageLabel: string | null;
  excerpt: string;
  reactions: number | null;
  comments: number | null;
  impressions: number | null;
};

export type AccountAnalyticsSnapshot = {
  id: string;
  capturedAt: Date;
  sourceUrl: string;
  title: string | null;
  periodLabel: string | null;
  overviewMetrics: ParsedMetric[];
  topPosts: ParsedTopPost[];
  metrics: ParsedMetric[];
  excerpt: string;
  rawPlainText: string;
  parseSource: "dom" | "text";
};

const POSTS_SECTION =
  /(?:Posts les plus performants|Top performing posts|Publications les plus performantes)/i;

const POST_HEADER =
  /^(.+?\s+a publi[eé] ceci\s*•\s*(.+?)|.+?\s+posted this\s*•\s*(.+?))\s*$/im;

const PERIOD_RE =
  /(?:Les\s+(\d+\s+derniers jours)|Last\s+(\d+\s+days))/i;

const RANK_PERIOD_RE =
  /(?:p[eé]riode allant du|period from|from)\s+(.+?)\s+(?:au|to)\s+(.+?)(?:\n|$)/i;

type DomOverview = {
  rankPeriod?: string | null;
  impressions?: number | null;
  membersReached?: number | null;
  impressionsTrend?: string | null;
  membersTrend?: string | null;
};

type DomTopPost = {
  ageLabel?: string | null;
  impressions?: number | null;
  reactions?: number | null;
  comments?: number | null;
  preview?: string | null;
};

export function parseLocalizedNumber(raw: string): number | null {
  let t = raw.trim();
  if (!t) return null;
  const isPercent = t.endsWith("%");
  if (isPercent) t = t.slice(0, -1).trim();
  t = t.replace(/[\u00A0\u202F\s]/g, "");
  if (/^\d+,\d+$/.test(t)) t = t.replace(",", ".");
  else t = t.replace(/,/g, "");
  const m = t.match(/^([\d.]+)\s*([KMB])?$/i);
  if (!m?.[1]) return null;
  let n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const suffix = (m[2] ?? "").toUpperCase();
  if (suffix === "K") n *= 1_000;
  else if (suffix === "M") n *= 1_000_000;
  else if (suffix === "B") n *= 1_000_000_000;
  return isPercent ? Math.round(n * 10) / 10 : Math.round(n);
}

function formatMetricNumber(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (n >= 1_000) return n.toLocaleString("fr-FR");
  return String(n);
}

function formatPercentDisplay(raw: string): string {
  const n = parseLocalizedNumber(raw.endsWith("%") ? raw : `${raw}%`);
  if (n == null) return raw;
  return `${String(n).replace(".", ",")}%`;
}

function normalizePlainText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[\u00A0\u202F]/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripChartNoise(text: string): string {
  return text
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (!t) return true;
      if (/^Chart$/i.test(t)) return false;
      if (/^Line chart with \d+ data points\.?$/i.test(t)) return false;
      if (/^End of interactive chart\.?$/i.test(t)) return false;
      if (/^Le graphique comporte/i.test(t)) return false;
      if (/^Le graphique contient/i.test(t)) return false;
      if (/^Les donn[eé]es quotidiennes/i.test(t)) return false;
      if (/^Nombre cumul[eé]$/i.test(t)) return false;
      return true;
    })
    .join("\n");
}

function extractPeriodLabel(text: string): string | null {
  const rank = text.match(RANK_PERIOD_RE);
  if (rank?.[1] && rank[2]) {
    return `${rank[1].trim()} – ${rank[2].trim()}`;
  }
  const m = text.match(PERIOD_RE);
  if (!m) return null;
  if (m[1]) return `Les ${m[1].trim()}`;
  if (m[2]) return `Last ${m[2].trim()}`;
  return null;
}

function firstNumberToken(raw: string): number | null {
  const line = raw.split("\n")[0]?.trim() ?? raw.trim();
  return parseLocalizedNumber(line);
}

function pickMetricFromBlock(block: string, labelRe: RegExp): number | null {
  const afterLine = block.match(
    new RegExp(`${labelRe.source}\\s*\\n\\s*([\\d][\\d\\s\\u202F,.]*)`, "i"),
  );
  if (afterLine?.[1]) {
    const n = firstNumberToken(afterLine[1]);
    if (n != null) return n;
  }
  const beforeLine = block.match(
    new RegExp(`([\\d][\\d\\s\\u202F,.]*)\\s*\\n\\s*${labelRe.source}`, "i"),
  );
  if (beforeLine?.[1]) return firstNumberToken(beforeLine[1]);
  const inline = block.match(
    new RegExp(`${labelRe.source}\\s+([\\d][\\d\\s\\u202F,.]*)`, "i"),
  );
  if (inline?.[1]) return firstNumberToken(inline[1]);
  return null;
}

function extractPostMetricsFromText(text: string): {
  impressions: number | null;
  reactions: number | null;
  comments: number | null;
} {
  const impressions = (() => {
    for (const re of [
      /(?:▲|▼)?\s*([\d\s,.]+)\s+Impressions\b/i,
      /(?:▲|▼)?\s*([\d\s,.]+)\s*\n\s*Impressions\b/i,
      /\n\s*([\d\s,.]+)\s*\n\s*Impressions\b/i,
    ]) {
      const m = text.match(re);
      if (m?.[1]) {
        const n = parseLocalizedNumber(m[1]);
        if (n != null) return n;
      }
    }
    return null;
  })();
  const commentsM = text.match(/(\d+)\s*commentaires?\b/i);
  const comments = commentsM ? parseLocalizedNumber(commentsM[1]) : null;
  let reactions: number | null = null;
  const reactBeforeComments = text.match(
    /\n(\d+)\s*\n\s*\d+\s*commentaires?\b/i,
  );
  if (reactBeforeComments) {
    reactions = parseLocalizedNumber(reactBeforeComments[1]);
  } else {
    const reactPair = text.match(/(\d+)\s*\n\s*(\d+)\s*commentaires?\b/i);
    if (reactPair) reactions = parseLocalizedNumber(reactPair[1]);
  }
  return { impressions, reactions, comments };
}

function parseDomOverview(dom: DomOverview): ParsedMetric[] {
  const out: ParsedMetric[] = [];
  const seen = new Set<string>();
  function push(label: string, value: string) {
    const key = `${label}:${value}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ label, value });
  }
  if (dom.rankPeriod) push("Période classée", dom.rankPeriod);
  if (dom.impressions != null) {
    push("Impressions", formatMetricNumber(dom.impressions));
  }
  if (dom.membersReached != null) {
    push("Membres touchés", formatMetricNumber(dom.membersReached));
  }
  if (dom.impressionsTrend) {
    push("Variation impressions", formatPercentDisplay(dom.impressionsTrend));
  }
  if (dom.membersTrend) {
    push("Variation membres touchés", formatPercentDisplay(dom.membersTrend));
  }
  return out;
}

function parseDomTopPosts(rows: DomTopPost[]): ParsedTopPost[] {
  return rows
    .map((r) => ({
      ageLabel: r.ageLabel?.trim() || null,
      excerpt: (r.preview ?? "").trim(),
      reactions: r.reactions ?? null,
      comments: r.comments ?? null,
      impressions: r.impressions ?? null,
    }))
    .filter((r) => r.impressions != null || r.comments != null);
}

function splitOverviewAndPosts(text: string): {
  overview: string;
  postsSection: string;
} {
  const idx = text.search(POSTS_SECTION);
  if (idx < 0) return { overview: text, postsSection: "" };
  return {
    overview: text.slice(0, idx).trim(),
    postsSection: text.slice(idx).trim(),
  };
}

function extractOverviewMetricsFromText(overview: string): ParsedMetric[] {
  const out: ParsedMetric[] = [];
  const seen = new Set<string>();
  function push(label: string, value: string) {
    const key = `${label}:${value}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ label, value });
  }
  const period = extractPeriodLabel(overview);
  if (period) push("Période", period);
  const discoveryIdx = overview.search(/D[eé]couverte|Discovery/i);
  const block = discoveryIdx >= 0 ? overview.slice(discoveryIdx) : overview;
  const impressions = pickMetricFromBlock(block, /Impressions/);
  if (impressions != null) push("Impressions", formatMetricNumber(impressions));
  const members = pickMetricFromBlock(
    block,
    /(?:Membres touch[eé]s|Members reached)/,
  );
  if (members != null) push("Membres touchés", formatMetricNumber(members));
  const trends = [
    ...block.matchAll(/(?:▼|▲)?\s*([\d,.]+)\s*%[^\n]*/gi),
  ].map((m) => m[1]);
  if (trends[0]) {
    push("Variation impressions", formatPercentDisplay(`${trends[0]}%`));
  }
  if (trends[1]) {
    push("Variation membres touchés", formatPercentDisplay(`${trends[1]}%`));
  }
  return out;
}

function excerptFromPostBody(body: string, maxLen = 140): string {
  const lines = body
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const skip = new Set(["voir plus", "view more", "see more", "…voir plus"]);
  const content: string[] = [];
  for (const line of lines) {
    const low = line.toLowerCase();
    if (skip.has(low)) continue;
    if (/^like[a-z]+$/i.test(line)) continue;
    if (
      /^(?:like|love|funny|insightful|support|celebrate|interested)[a-z]*$/i.test(
        line,
      )
    ) {
      continue;
    }
    if (/^hashtag#/i.test(line)) continue;
    if (/^\d+$/.test(line)) continue;
    if (/commentaires?$/i.test(line)) continue;
    if (/^Impressions$/i.test(line)) continue;
    if (/^▲|^▼/.test(line)) continue;
    if (/Voir les statistiques/i.test(line)) continue;
    content.push(line);
    if (content.join(" ").length >= maxLen) break;
  }
  const t = content.join(" ").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > maxLen ? `${t.slice(0, maxLen - 1)}…` : t;
}

function parseTopPostsFromText(postsSection: string): ParsedTopPost[] {
  if (!postsSection.trim()) return [];
  const parts = postsSection.split(
    /\n(?=[^\n]+ a publi[eé] ceci • |[^\n]+ posted this • )/i,
  );
  const posts: ParsedTopPost[] = [];
  for (const part of parts) {
    const header = part.match(POST_HEADER);
    if (!header) continue;
    const ageLabel = (header[2] ?? header[3])?.trim() ?? null;
    const bodyStart = part.indexOf("\n", part.indexOf(header[1]!));
    const body = bodyStart >= 0 ? part.slice(bodyStart) : "";
    const metrics = extractPostMetricsFromText(body);
    if (metrics.impressions == null && metrics.comments == null) continue;
    posts.push({
      ageLabel,
      excerpt: excerptFromPostBody(body),
      reactions: metrics.reactions,
      comments: metrics.comments,
      impressions: metrics.impressions,
    });
  }
  return posts;
}

function hasStructuredDom(payload: Record<string, unknown>): boolean {
  const ov = payload.domOverview as DomOverview | undefined;
  const posts = payload.domTopPosts;
  if (ov && (ov.impressions != null || ov.membersReached != null)) return true;
  return Array.isArray(posts) && posts.length > 0;
}

export function parsePostAnalyticsPayload(payload: Record<string, unknown>): {
  title: string | null;
  periodLabel: string | null;
  overviewMetrics: ParsedMetric[];
  topPosts: ParsedTopPost[];
  metrics: ParsedMetric[];
  excerpt: string;
  rawPlainText: string;
  parseSource: "dom" | "text";
} {
  const title =
    typeof payload.title === "string" && payload.title.trim()
      ? payload.title.trim()
      : null;
  const rawPlainText =
    typeof payload.plainText === "string" ? payload.plainText.trim() : "";
  const normalized = stripChartNoise(normalizePlainText(rawPlainText));
  const periodLabel = extractPeriodLabel(normalized);
  let overviewMetrics: ParsedMetric[] = [];
  let topPosts: ParsedTopPost[] = [];
  let parseSource: "dom" | "text" = "text";
  if (hasStructuredDom(payload)) {
    parseSource = "dom";
    overviewMetrics = parseDomOverview(
      (payload.domOverview ?? {}) as DomOverview,
    );
    topPosts = parseDomTopPosts((payload.domTopPosts ?? []) as DomTopPost[]);
  }
  if (overviewMetrics.length === 0) {
    const { overview } = splitOverviewAndPosts(normalized);
    overviewMetrics = extractOverviewMetricsFromText(overview);
  }
  if (topPosts.length === 0) {
    const { postsSection } = splitOverviewAndPosts(normalized);
    topPosts = parseTopPostsFromText(postsSection);
  }
  const excerpt =
    normalized.length > 480
      ? `${normalized.slice(0, 477)}…`
      : normalized;
  return {
    title,
    periodLabel:
      periodLabel ??
      ((payload.domOverview as DomOverview | undefined)?.rankPeriod ?? null),
    overviewMetrics,
    topPosts,
    metrics: overviewMetrics,
    excerpt,
    rawPlainText,
    parseSource,
  };
}

export async function listPostAnalyticsSnapshots(
  limit = 40,
): Promise<AccountAnalyticsSnapshot[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(extensionSnapshots)
    .where(eq(extensionSnapshots.kind, "linkedin_post_analytics_visible"))
    .orderBy(desc(extensionSnapshots.capturedAt))
    .limit(Math.min(limit, 100));
  return rows.map((row) => {
    const parsed = parsePostAnalyticsPayload(
      (row.payloadJson ?? {}) as Record<string, unknown>,
    );
    return {
      id: row.id,
      capturedAt: row.capturedAt,
      sourceUrl: row.sourceUrl,
      title: parsed.title,
      periodLabel: parsed.periodLabel,
      overviewMetrics: parsed.overviewMetrics,
      topPosts: parsed.topPosts,
      metrics: parsed.metrics,
      excerpt: parsed.excerpt,
      rawPlainText: parsed.rawPlainText,
      parseSource: parsed.parseSource,
    };
  });
}

export function summarizeMetricsAcrossSnapshots(
  snapshots: AccountAnalyticsSnapshot[],
): ParsedMetric[] {
  const latest = snapshots[0];
  if (!latest) return [];
  return latest.overviewMetrics.filter((m) => !m.label.startsWith("Période"));
}
