import { relations } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const contacts = sqliteTable(
  "contacts",
  {
    id: text("id").primaryKey(),
    linkedinUrlCanonical: text("linkedin_url_canonical").notNull().unique(),
    linkedinUrlRaw: text("linkedin_url_raw"),
    fullName: text("full_name"),
    headline: text("headline"),
    company: text("company"),
    companyNormalized: text("company_normalized"),
    location: text("location"),
    connectionDegree: text("connection_degree"),
    segment: text("segment").notNull().default("warm"),
    relationshipScore: integer("relationship_score").notNull().default(0),
    businessScore: integer("business_score").notNull().default(0),
    cleanupScore: integer("cleanup_score").notNull().default(0),
    relationshipReasons: text("relationship_reasons"),
    businessReasons: text("business_reasons"),
    cleanupReasons: text("cleanup_reasons"),
    scoreRuleVersion: text("score_rule_version").notNull().default("1"),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }),
    lastUpdatedAt: integer("last_updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    /**
     * Hygiene + LLM columns are optional SQLite ALTERs only — not declared here so
     * Drizzle never selects missing columns. Use lib/contactSqlExtras.ts and npm run db:repair.
     */
  },
  (t) => [
    index("contacts_segment_idx").on(t.segment),
    index("contacts_company_norm_idx").on(t.companyNormalized),
    index("contacts_updated_idx").on(t.lastUpdatedAt),
  ],
);

export const captureSessions = sqliteTable(
  "capture_sessions",
  {
    id: text("id").primaryKey(),
    contactId: text("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    schemaVersion: text("schema_version").notNull(),
    pageType: text("page_type").notNull(),
    sourceUrl: text("source_url").notNull(),
    confidence: real("confidence"),
    fieldPresence: text("field_presence", { mode: "json" }).$type<
      Record<string, boolean>
    >(),
    extractedJson: text("extracted_json", { mode: "json" }).$type<
      Record<string, unknown>
    >(),
    capturedAt: integer("captured_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("capture_sessions_captured_idx").on(t.capturedAt)],
);

export const contactSnapshots = sqliteTable(
  "contact_snapshots",
  {
    id: text("id").primaryKey(),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    capturedAt: integer("captured_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    snapshotJson: text("snapshot_json", { mode: "json" })
      .notNull()
      .$type<Record<string, unknown>>(),
  },
  (t) => [index("snapshots_contact_idx").on(t.contactId)],
);

export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const contactTags = sqliteTable(
  "contact_tags",
  {
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.contactId, t.tagId] })],
);

export const notes = sqliteTable(
  "notes",
  {
    id: text("id").primaryKey(),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("notes_contact_idx").on(t.contactId)],
);

/** Per (contact, thread) triage — linked to captures with page_type = messaging. */
export const inboxThreadState = sqliteTable(
  "inbox_thread_state",
  {
    id: text("id").primaryKey(),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    threadKey: text("thread_key").notNull(),
    status: text("status").notNull().default("open"),
    snoozedUntil: integer("snoozed_until", { mode: "timestamp_ms" }),
    note: text("note"),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("inbox_thread_contact_key").on(t.contactId, t.threadKey),
    index("inbox_thread_status_idx").on(t.status),
  ],
);

/** Visible-page dumps from manual extension tasks (messages list, creator analytics UI, etc.). */
export const extensionSnapshots = sqliteTable(
  "extension_snapshots",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    sourceUrl: text("source_url").notNull(),
    payloadJson: text("payload_json", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    capturedAt: integer("captured_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("ext_snap_kind_idx").on(t.kind),
    index("ext_snap_captured_idx").on(t.capturedAt),
  ],
);

export const actionQueue = sqliteTable(
  "action_queue",
  {
    id: text("id").primaryKey(),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    priority: integer("priority").notNull().default(0),
    suggestedAction: text("suggested_action"),
    /** User-edited message draft before any manual send on LinkedIn. */
    draftOutreach: text("draft_outreach"),
    /**
     * Decision state for outreach prep (dashboard → you paste/send yourself).
     * Extension can read approved rows via /api/outreach/ready.
     */
    outreachDecision: text("outreach_decision").notNull().default("pending"),
    kind: text("kind").notNull().default("review"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    index("queue_status_idx").on(t.status),
    index("queue_contact_idx").on(t.contactId),
    index("queue_outreach_decision_idx").on(t.outreachDecision),
  ],
);

/** Audit trail for automated profile visits (local extension runner). */
export const automationLog = sqliteTable(
  "automation_log",
  {
    id: text("id").primaryKey(),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    outcome: text("outcome"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("automation_log_created_idx").on(t.createdAt),
    index("automation_log_contact_idx").on(t.contactId),
  ],
);

/** Named outreach campaign: your context + list of contacts with per-person drafts. */
export const outreachCampaigns = sqliteTable("outreach_campaigns", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  contextText: text("context_text").notNull(),
  /** Extra instructions merged into the user prompt (tone, must-mention, avoid, CTA). */
  writerInstructions: text("writer_instructions"),
  /** When set, replaces the default JSON system prompt for this campaign only. */
  systemPromptOverride: text("system_prompt_override"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Member of a campaign. status: draft → ready (for extension handoff) → sent | skipped.
 */
export const outreachCampaignMembers = sqliteTable(
  "outreach_campaign_members",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => outreachCampaigns.id, { onDelete: "cascade" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    draftOutreach: text("draft_outreach"),
    status: text("status").notNull().default("draft"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("ocm_campaign_contact_unique").on(t.campaignId, t.contactId),
    index("ocm_campaign_status_idx").on(t.campaignId, t.status),
    index("ocm_campaign_idx").on(t.campaignId),
  ],
);

/**
 * Singleton row (`id` = `default`): your own profile link, goals, and positioning text
 * used to steer contact analysis (Ollama) and future scoring.
 */
export const userContext = sqliteTable("user_context", {
  id: text("id").primaryKey(),
  selfContactId: text("self_contact_id").references(() => contacts.id, {
    onDelete: "set null",
  }),
  goalsText: text("goals_text"),
  positioningSummary: text("positioning_summary"),
  /** Extension polls and opens this URL to run a profile capture (Save profile link). */
  pendingSelfCaptureUrl: text("pending_self_capture_url"),
  pendingSelfCaptureAt: integer("pending_self_capture_at", {
    mode: "timestamp_ms",
  }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** Editorial calendar post (LinkedIn personal branding). */
export const contentPosts = sqliteTable(
  "content_posts",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    status: text("status").notNull().default("idea"),
    format: text("format").notNull().default("feed"),
    ideaNotes: text("idea_notes"),
    hook: text("hook"),
    body: text("body"),
    articleBody: text("article_body"),
    linkedTeaserPostId: text("linked_teaser_post_id"),
    styleNotes: text("style_notes"),
    mediaJson: text("media_json", { mode: "json" }).$type<ContentMediaJson>(),
    coachFlags: text("coach_flags", { mode: "json" }).$type<
      Record<string, boolean>
    >(),
    lastCoachSummary: text("last_coach_summary"),
    /** `fr` | `en` — overrides brand default; null = use brand / auto-detect */
    language: text("language"),
    scheduledAt: integer("scheduled_at", { mode: "timestamp_ms" }),
    readyAt: integer("ready_at", { mode: "timestamp_ms" }),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
    sourceAnalyticsSnapshotId: text("source_analytics_snapshot_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("content_posts_status_idx").on(t.status),
    index("content_posts_scheduled_idx").on(t.scheduledAt),
    index("content_posts_status_scheduled_idx").on(t.status, t.scheduledAt),
  ],
);

export type ContentMediaItem = {
  kind: "image" | "link";
  url?: string;
  /** Saved filename under data/media/posts (for downloads). */
  filename?: string;
  /** `photo` | `text_card` — how the visual was generated. */
  style?: "photo" | "text_card";
  note?: string;
  alt?: string;
};

export type ContentMediaJson = {
  items: ContentMediaItem[];
};

/** Singleton: Brand Coach planning context (doctrine, rhythm, stance). */
export const contentBrandContext = sqliteTable("content_brand_context", {
  id: text("id").primaryKey(),
  contentDoctrine: text("content_doctrine"),
  expertiseSummary: text("expertise_summary"),
  publishingRhythm: text("publishing_rhythm", { mode: "json" }).$type<
    PublishingRhythmJson
  >(),
  stanceNotes: text("stance_notes"),
  /** `auto` | `fr` | `en` — default for new posts and coach when post has no override */
  contentLanguage: text("content_language").default("auto"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type PublishingRhythmJson = {
  preferredWeekdays?: number[];
  timeWindow?: string;
  maxPostsPerWeek?: number;
  notes?: string;
};

export const contentAiThreads = sqliteTable("content_ai_threads", {
  id: text("id").primaryKey(),
  scope: text("scope").notNull(),
  postId: text("post_id").references(() => contentPosts.id, {
    onDelete: "set null",
  }),
  title: text("title"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const contentAiMessages = sqliteTable(
  "content_ai_messages",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => contentAiThreads.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    actionsJson: text("actions_json", { mode: "json" }).$type<
      Record<string, unknown>[]
    >(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("content_ai_messages_thread_idx").on(t.threadId)],
);

/** Tunable pacing for low-risk, human-in-the-loop workflows (local + API limits only). */
export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const userContextRelations = relations(userContext, ({ one }) => ({
  selfContact: one(contacts, {
    fields: [userContext.selfContactId],
    references: [contacts.id],
  }),
}));

export const inboxThreadStateRelations = relations(
  inboxThreadState,
  ({ one }) => ({
    contact: one(contacts, {
      fields: [inboxThreadState.contactId],
      references: [contacts.id],
    }),
  }),
);

export const contactsRelations = relations(contacts, ({ many, one }) => ({
  captures: many(captureSessions),
  snapshots: many(contactSnapshots),
  contactTags: many(contactTags),
  notes: many(notes),
  queueItems: many(actionQueue),
  automationLogs: many(automationLog),
  outreachCampaignMembers: many(outreachCampaignMembers),
  inboxThreads: many(inboxThreadState),
  linkedAsSelfOwner: one(userContext, {
    fields: [contacts.id],
    references: [userContext.selfContactId],
  }),
}));

export const outreachCampaignsRelations = relations(
  outreachCampaigns,
  ({ many }) => ({
    members: many(outreachCampaignMembers),
  }),
);

export const outreachCampaignMembersRelations = relations(
  outreachCampaignMembers,
  ({ one }) => ({
    campaign: one(outreachCampaigns, {
      fields: [outreachCampaignMembers.campaignId],
      references: [outreachCampaigns.id],
    }),
    contact: one(contacts, {
      fields: [outreachCampaignMembers.contactId],
      references: [contacts.id],
    }),
  }),
);

export const automationLogRelations = relations(automationLog, ({ one }) => ({
  contact: one(contacts, {
    fields: [automationLog.contactId],
    references: [contacts.id],
  }),
}));

export const captureSessionsRelations = relations(captureSessions, ({ one }) => ({
  contact: one(contacts, {
    fields: [captureSessions.contactId],
    references: [contacts.id],
  }),
}));

export const contactSnapshotsRelations = relations(
  contactSnapshots,
  ({ one }) => ({
    contact: one(contacts, {
      fields: [contactSnapshots.contactId],
      references: [contacts.id],
    }),
  }),
);

export const contactTagsRelations = relations(contactTags, ({ one }) => ({
  contact: one(contacts, {
    fields: [contactTags.contactId],
    references: [contacts.id],
  }),
  tag: one(tags, {
    fields: [contactTags.tagId],
    references: [tags.id],
  }),
}));

export const notesRelations = relations(notes, ({ one }) => ({
  contact: one(contacts, {
    fields: [notes.contactId],
    references: [contacts.id],
  }),
}));

export const actionQueueRelations = relations(actionQueue, ({ one }) => ({
  contact: one(contacts, {
    fields: [actionQueue.contactId],
    references: [contacts.id],
  }),
}));
