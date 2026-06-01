import { listTrendInbox } from "@/lib/sources/contentSources";

export async function buildTrendInboxContextBlock(
  days = 7,
  limit = 10,
): Promise<string> {
  const items = await listTrendInbox({ days, limit });
  if (!items.length) {
    return `Trend inbox (last ${days} days): empty — use RSS pack or paste sources in Settings.`;
  }
  const lines = items.map((it) => {
    const score =
      it.trendScore != null ? `, score: ${(it.trendScore / 100).toFixed(2)}` : "";
    const url = it.url ? ` (url: ${it.url})` : "";
    return `- [${it.itemKind}] ${it.title}${url}${score}`;
  });
  return `Trend inbox (last ${days} days, not yet used):
${lines.join("\n")}
When planning posts, prefer unused high-score items; cite in ideaNotes; do not invent URLs.`;
}
