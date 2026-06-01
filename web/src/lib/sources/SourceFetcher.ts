import { fetchPasteSource } from "@/lib/sources/adapters/paste";
import { fetchRssSource } from "@/lib/sources/adapters/rss";
import { fetchTavilySearch } from "@/lib/sources/adapters/tavily";
import { fetchUrlReadability } from "@/lib/sources/adapters/urlReadability";
import type {
  ContentSourceRow,
  FetchedSourceItem,
  SourceFetcher,
  SourceFetcherId,
} from "@/lib/sources/types";

const rssFetcher: SourceFetcher = {
  id: "rss",
  fetch: fetchRssSource,
};

const pasteFetcher: SourceFetcher = {
  id: "paste",
  fetch: fetchPasteSource,
};

const urlFetcher: SourceFetcher = {
  id: "url_readability",
  fetch: fetchUrlReadability,
};

const tavilyFetcher: SourceFetcher = {
  id: "tavily_search",
  async fetch(source) {
    const { items } = await fetchTavilySearch(source);
    return items;
  },
};

const FETCHERS: Record<SourceFetcherId, SourceFetcher> = {
  rss: rssFetcher,
  paste: pasteFetcher,
  url_readability: urlFetcher,
  tavily_search: tavilyFetcher,
};

export function resolveFetcherId(
  source: ContentSourceRow,
): SourceFetcherId {
  const adapter = source.configJson?.adapter;
  if (adapter && adapter in FETCHERS) {
    return adapter as SourceFetcherId;
  }
  switch (source.type) {
    case "rss":
    case "trend_digest":
      return source.configJson?.adapter === "tavily_search"
        ? "tavily_search"
        : "rss";
    case "paste":
      return "paste";
    case "url":
      return "url_readability";
    case "search_digest":
      return "tavily_search";
    default:
      return "rss";
  }
}

export async function fetchSourceItems(
  source: ContentSourceRow,
  options?: { tavilyBudgetRemaining?: number },
): Promise<FetchedSourceItem[]> {
  const id = resolveFetcherId(source);
  if (id === "tavily_search") {
    const { items } = await fetchTavilySearch(source, {
      budgetRemaining: options?.tavilyBudgetRemaining,
    });
    return items;
  }
  const fetcher = FETCHERS[id];
  return fetcher.fetch(source);
}

export { FETCHERS };
