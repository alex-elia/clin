import type {
  ContentSourceConfigJson,
  ContentSourceType,
  SourceItemKind,
} from "@/db/schema";

export type FetchedSourceItem = {
  title: string;
  url?: string;
  excerpt?: string;
  bodyMarkdown?: string;
  publishedAt?: Date;
  itemKind?: SourceItemKind;
  trendScore?: number;
};

export type ContentSourceRow = {
  id: string;
  name: string;
  type: ContentSourceType;
  configJson: ContentSourceConfigJson | null;
  enabled: boolean;
  fetchIntervalHours: number | null;
  lastFetchedAt: Date | null;
  lastError: string | null;
};

export type SourceFetcherId =
  | "rss"
  | "paste"
  | "url_readability"
  | "tavily_search";

export type SourceFetcher = {
  id: SourceFetcherId;
  fetch(
    source: ContentSourceRow,
  ): Promise<FetchedSourceItem[]>;
};
