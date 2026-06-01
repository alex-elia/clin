import type { ContentSourceRow, FetchedSourceItem } from "@/lib/sources/types";

export async function fetchPasteSource(
  source: ContentSourceRow,
): Promise<FetchedSourceItem[]> {
  const text = source.configJson?.pasteText?.trim() ?? "";
  if (!text) return [];
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  return lines.slice(0, 20).map((line) => {
    const urlMatch = line.match(/https?:\/\/\S+/);
    const url = urlMatch?.[0];
    const title = line.replace(url ?? "", "").trim() || line;
    return {
      title: title.slice(0, 300),
      url,
      excerpt: line.slice(0, 500),
      itemKind: "paste" as const,
    };
  });
}
