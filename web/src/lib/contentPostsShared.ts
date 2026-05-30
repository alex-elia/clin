/** Client-safe content post types (no DB imports). */

export const CONTENT_POST_STATUSES = [
  "idea",
  "drafting",
  "review",
  "ready",
  "published",
  "archived",
] as const;

export type ContentPostStatus = (typeof CONTENT_POST_STATUSES)[number];

export const CONTENT_POST_FORMATS = [
  "feed",
  "article",
  "carousel",
  "poll",
] as const;

export type ContentPostFormat = (typeof CONTENT_POST_FORMATS)[number];

export const CONTENT_STATUS_LABELS: Record<ContentPostStatus, string> = {
  idea: "Idea",
  drafting: "Writing",
  review: "Review",
  ready: "Ready",
  published: "Published",
  archived: "Archived",
};

export const CONTENT_FORMAT_LABELS: Record<ContentPostFormat, string> = {
  feed: "Feed post",
  article: "Article",
  carousel: "Carousel",
  poll: "Poll",
};

export const BOARD_COLUMNS: ContentPostStatus[] = [
  "idea",
  "drafting",
  "review",
  "ready",
  "published",
];
