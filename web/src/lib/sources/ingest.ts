import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { contentSourceItems } from "@/db/schema";
import { getOrCreateContentBrandContext } from "@/lib/contentBrandContext";
import { fetchSourceItems } from "@/lib/sources/SourceFetcher";
import { fetchTavilySearch } from "@/lib/sources/adapters/tavily";
import {
  listContentSources,
  setSourceFetchResult,
} from "@/lib/sources/contentSources";
import type { ContentSourceRow } from "@/lib/sources/types";
import { hashSourceItem } from "@/lib/sources/hash";
import type { FetchedSourceItem } from "@/lib/sources/types";

function isWithinRecency(
  item: FetchedSourceItem,
  recencyDays: number,
): boolean {
  if (!item.publishedAt) return true;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - recencyDays);
  return item.publishedAt >= cutoff;
}

async function itemExists(hash: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: contentSourceItems.id })
    .from(contentSourceItems)
    .where(eq(contentSourceItems.contentHash, hash))
    .limit(1);
  return rows.length > 0;
}

async function storeItems(
  sourceId: string,
  items: FetchedSourceItem[],
  recencyDays: number,
): Promise<number> {
  const db = getDb();
  let stored = 0;
  for (const item of items) {
    if (!isWithinRecency(item, recencyDays)) continue;
    const hash = hashSourceItem(item.title, item.url);
    if (await itemExists(hash)) continue;
    await db.insert(contentSourceItems).values({
      id: crypto.randomUUID(),
      sourceId,
      title: item.title,
      url: item.url ?? null,
      excerpt: item.excerpt ?? null,
      bodyMarkdown: item.bodyMarkdown ?? null,
      contentHash: hash,
      itemKind: item.itemKind ?? "article",
      trendScore: item.trendScore
        ? Math.round(item.trendScore * 100)
        : null,
      publishedAt: item.publishedAt ?? null,
      fetchedAt: new Date(),
    });
    stored += 1;
  }
  return stored;
}

function sourcesForIngest(
  sources: ContentSourceRow[],
  mode: "sources" | "trends",
): ContentSourceRow[] {
  return sources.filter((s) => {
    if (!s.enabled) return false;
    if (mode === "trends") {
      return s.type === "trend_digest" || s.type === "rss";
    }
    return s.type !== "trend_digest";
  });
}

export type IngestResult = {
  sourcesProcessed: number;
  itemsStored: number;
  errors: string[];
  tavilyCreditsUsed: number;
};

export async function ingestContentSources(options?: {
  mode?: "sources" | "trends";
}): Promise<IngestResult> {
  const mode = options?.mode ?? "sources";
  const brand = await getOrCreateContentBrandContext();
  const policy = brand.editorialAutopilotPolicy ?? {};
  const recencyDays = 7;
  const sources = sourcesForIngest(await listContentSources(), mode);
  const result: IngestResult = {
    sourcesProcessed: 0,
    itemsStored: 0,
    errors: [],
    tavilyCreditsUsed: 0,
  };
  let tavilyBudget =
    policy.tavilyDiscoveryEnabled && process.env.TAVILY_API_KEY
      ? (policy.maxTavilyCreditsPerTick ?? 5)
      : 0;

  for (const source of sources) {
    try {
      let items: FetchedSourceItem[] = [];
      if (
        source.type === "trend_digest" &&
        source.configJson?.adapter === "tavily_search" &&
        tavilyBudget > 0
      ) {
        const queries =
          source.configJson.queries?.length
            ? source.configJson.queries
            : policy.trendQueries ?? [];
        const withQueries = {
          ...source,
          configJson: { ...source.configJson, queries },
        };
        const { items: tItems, usage } = await fetchTavilySearch(withQueries, {
          budgetRemaining: tavilyBudget,
        });
        items = tItems;
        result.tavilyCreditsUsed += usage.creditsUsed;
        tavilyBudget -= usage.creditsUsed;
      } else {
        items = await fetchSourceItems(source, {
          tavilyBudgetRemaining: tavilyBudget,
        });
      }
      const stored = await storeItems(
        source.id,
        items,
        source.configJson?.recencyDays ?? recencyDays,
      );
      result.itemsStored += stored;
      result.sourcesProcessed += 1;
      await setSourceFetchResult(source.id, null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.errors.push(`${source.name}: ${msg}`);
      await setSourceFetchResult(source.id, msg);
    }
  }
  return result;
}
