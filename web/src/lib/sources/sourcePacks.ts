import fs from "node:fs";
import path from "node:path";
import { listContentSources, upsertContentSource } from "@/lib/sources/contentSources";

export type SourcePackFeed = { name: string; url: string };

export type SourcePack = {
  id: string;
  label: string;
  description?: string;
  feeds: SourcePackFeed[];
};

function resolveDataDir(): string {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "data"),
    path.join(cwd, "web", "data"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "source-packs"))) return dir;
  }
  return path.join(cwd, "data");
}

export function loadSourcePack(packId: string): SourcePack | null {
  const full = path.join(
    resolveDataDir(),
    "source-packs",
    `${packId}.json`,
  );
  if (!fs.existsSync(full)) return null;
  return JSON.parse(fs.readFileSync(full, "utf8")) as SourcePack;
}

/** One RSS source per feed in the pack (skips URLs already enabled). */
export async function enableSourcePack(packId: string): Promise<number> {
  const pack = loadSourcePack(packId);
  if (!pack) throw new Error(`Source pack not found: ${packId}`);
  const existing = await listContentSources();
  const existingUrls = new Set(
    existing
      .map((s) => s.configJson?.feedUrl)
      .filter(Boolean) as string[],
  );
  let added = 0;
  for (const feed of pack.feeds) {
    if (existingUrls.has(feed.url)) continue;
    await upsertContentSource({
      name: feed.name,
      type: "rss",
      configJson: {
        adapter: "rss",
        feedUrl: feed.url,
        maxItemsPerRun: 15,
        recencyDays: 7,
      },
      enabled: true,
      fetchIntervalHours: 168,
    });
    added += 1;
  }
  return added;
}
