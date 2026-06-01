import type { FetchedSourceItem } from "@/lib/sources/types";
import type { ContentSourceRow } from "@/lib/sources/types";

function decodeXml(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function tag(block: string, name: string): string | undefined {
  const re = new RegExp(
    `<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`,
    "i",
  );
  const m = block.match(re);
  if (!m) return undefined;
  return decodeXml(m[1].trim());
}

function parseRssXml(xml: string): FetchedSourceItem[] {
  const items: FetchedSourceItem[] = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  if (blocks.length === 0) {
    const entries = xml.match(/<entry[\s\S]*?<\/entry>/gi) ?? [];
    for (const block of entries.slice(0, 30)) {
      const title = tag(block, "title");
      if (!title) continue;
      const link =
        block.match(/<link[^>]+href="([^"]+)"/i)?.[1] ??
        tag(block, "link");
      const summary =
        tag(block, "summary") ?? tag(block, "content");
      const published = tag(block, "published") ?? tag(block, "updated");
      items.push({
        title,
        url: link,
        excerpt: summary?.slice(0, 500),
        publishedAt: published ? new Date(published) : undefined,
        itemKind: "article",
      });
    }
    return items;
  }
  for (const block of blocks.slice(0, 30)) {
    const title = tag(block, "title");
    if (!title) continue;
    const link = tag(block, "link") ?? tag(block, "guid");
    const desc =
      tag(block, "description") ?? tag(block, "content:encoded");
    const pub = tag(block, "pubDate");
    items.push({
      title,
      url: link,
      excerpt: desc?.slice(0, 500),
      publishedAt: pub ? new Date(pub) : undefined,
      itemKind: "article",
    });
  }
  return items;
}

export async function fetchRssFeed(feedUrl: string): Promise<FetchedSourceItem[]> {
  const res = await fetch(feedUrl, {
    headers: { Accept: "application/rss+xml, application/atom+xml, text/xml" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(`RSS fetch failed (${res.status}): ${feedUrl}`);
  }
  const xml = await res.text();
  return parseRssXml(xml);
}

export async function fetchRssSource(
  source: ContentSourceRow,
): Promise<FetchedSourceItem[]> {
  const cfg = source.configJson ?? {};
  const urls = cfg.feedUrls?.length
    ? cfg.feedUrls
    : cfg.feedUrl
      ? [cfg.feedUrl]
      : [];
  if (!urls.length) {
    throw new Error(`RSS source "${source.name}" has no feed URL.`);
  }
  const all: FetchedSourceItem[] = [];
  for (const url of urls) {
    const items = await fetchRssFeed(url);
    all.push(...items);
  }
  const max = cfg.maxItemsPerRun ?? 20;
  return all.slice(0, max);
}
