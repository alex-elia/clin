import type { ContentSourceRow, FetchedSourceItem } from "@/lib/sources/types";

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function metaContent(html: string, prop: string): string | undefined {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  const m = html.match(re);
  return m?.[1];
}

export async function fetchUrlReadability(
  source: ContentSourceRow,
): Promise<FetchedSourceItem[]> {
  const url = source.configJson?.url?.trim();
  if (!url) {
    throw new Error(`URL source "${source.name}" has no url in config.`);
  }
  const res = await fetch(url, {
    headers: { "User-Agent": "Clin/1.0 (local editorial)" },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    throw new Error(`URL fetch failed (${res.status}): ${url}`);
  }
  const html = await res.text();
  const title =
    metaContent(html, "og:title") ??
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ??
    url;
  const desc =
    metaContent(html, "og:description") ??
    metaContent(html, "description");
  const body = stripHtml(html).slice(0, 4000);
  return [
    {
      title: title.slice(0, 300),
      url,
      excerpt: desc ?? body.slice(0, 500),
      bodyMarkdown: body.slice(0, 8000),
      itemKind: "article",
    },
  ];
}
