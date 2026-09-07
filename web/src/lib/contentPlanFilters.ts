import {
  CONTENT_POST_FORMATS,
  CONTENT_POST_STATUSES,
  type ContentPostFormat,
  type ContentPostStatus,
} from "@/lib/contentPostsShared";

export type ContentPlanScheduledFilter = "all" | "yes" | "no";

export type ContentPlanFilters = {
  statuses: ContentPostStatus[];
  format: ContentPostFormat | null;
  search: string;
  scheduled: ContentPlanScheduledFilter;
};

export type ContentPlanSearchParams = {
  y?: string;
  m?: string;
  view?: string;
  status?: string;
  format?: string;
  q?: string;
  scheduled?: string;
};

export type ContentPlanHrefParams = Omit<
  ContentPlanSearchParams,
  "y" | "m" | "view"
> & {
  y: number;
  m: number;
  view: string;
};

export type ContentPlanPostCard = {
  id: string;
  title: string;
  status: ContentPostStatus;
  format: ContentPostFormat;
  scheduledAt: string | null;
};

const ACTIVE_STATUSES = CONTENT_POST_STATUSES.filter((s) => s !== "archived");

export function parseContentPlanFilters(
  sp: ContentPlanSearchParams,
): ContentPlanFilters {
  const statusRaw = sp.status?.trim();
  let statuses: ContentPostStatus[] = [];
  if (statusRaw && statusRaw !== "all") {
    statuses = statusRaw
      .split(",")
      .map((s) => s.trim())
      .filter((s): s is ContentPostStatus =>
        (CONTENT_POST_STATUSES as readonly string[]).includes(s),
      );
  }

  const formatRaw = sp.format?.trim();
  const format =
    formatRaw &&
    (CONTENT_POST_FORMATS as readonly string[]).includes(formatRaw)
      ? (formatRaw as ContentPostFormat)
      : null;

  const scheduledRaw = sp.scheduled?.trim();
  const scheduled: ContentPlanScheduledFilter =
    scheduledRaw === "yes" || scheduledRaw === "no" ? scheduledRaw : "all";

  return {
    statuses,
    format,
    search: sp.q?.trim() ?? "",
    scheduled,
  };
}

export function buildContentPlanHref(
  base: ContentPlanHrefParams,
  patch?: Partial<ContentPlanSearchParams>,
): string {
  const merged = { ...base, ...patch };
  const params = new URLSearchParams();
  params.set("y", String(merged.y));
  params.set("m", String(merged.m));
  params.set("view", merged.view);

  const filters = parseContentPlanFilters({
    status: merged.status,
    format: merged.format,
    q: merged.q,
    scheduled: merged.scheduled,
  });
  if (filters.statuses.length > 0) {
    params.set("status", filters.statuses.join(","));
  }
  if (filters.format) params.set("format", filters.format);
  if (filters.search) params.set("q", filters.search);
  if (filters.scheduled !== "all") params.set("scheduled", filters.scheduled);

  return `/branding/calendar?${params.toString()}`;
}

export { ACTIVE_STATUSES };
