import { relations } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
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
    kind: text("kind").notNull().default("review"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    index("queue_status_idx").on(t.status),
    index("queue_contact_idx").on(t.contactId),
  ],
);

/** Tunable pacing for low-risk, human-in-the-loop workflows (local + API limits only). */
export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const contactsRelations = relations(contacts, ({ many }) => ({
  captures: many(captureSessions),
  snapshots: many(contactSnapshots),
  contactTags: many(contactTags),
  notes: many(notes),
  queueItems: many(actionQueue),
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
