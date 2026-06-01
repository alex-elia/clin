import type { ContentSourceRow, FetchedSourceItem } from "@/lib/sources/types";

export type TavilyUsage = { creditsUsed: number };

export async function fetchTavilySearch(
  source: ContentSourceRow,
  options?: { maxResults?: number; budgetRemaining?: number },
): Promise<{ items: FetchedSourceItem[]; usage: TavilyUsage }> {
  const key = process.env.TAVILY_API_KEY?.trim();
  if (!key) {
    throw new Error("TAVILY_API_KEY is not set.");
  }
  const cfg = source.configJson ?? {};
  const queries = cfg.queries?.length
    ? cfg.queries
    : source.type === "trend_digest"
      ? []
      : [];
  if (!queries.length) {
    return { items: [], usage: { creditsUsed: 0 } };
  }
  const maxPerQuery = Math.min(
    options?.maxResults ?? cfg.maxItemsPerRun ?? 5,
    10,
  );
  const items: FetchedSourceItem[] = [];
  let creditsUsed = 0;
  for (const query of queries.slice(0, 5)) {
    if (
      options?.budgetRemaining !== undefined &&
      creditsUsed >= options.budgetRemaining
    ) {
      break;
    }
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query,
        max_results: maxPerQuery,
        search_depth: "basic",
        include_answer: false,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Tavily search failed: ${err.slice(0, 200)}`);
    }
    creditsUsed += 1;
    const data = (await res.json()) as {
      results?: { title?: string; url?: string; content?: string }[];
    };
    for (const r of data.results ?? []) {
      if (!r.title) continue;
      items.push({
        title: r.title,
        url: r.url,
        excerpt: r.content?.slice(0, 500),
        itemKind: "trend_topic",
        trendScore: 0.7,
      });
    }
  }
  return { items, usage: { creditsUsed } };
}
