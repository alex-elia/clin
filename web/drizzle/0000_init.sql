CREATE TABLE `action_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`suggested_action` text,
	`kind` text DEFAULT 'review' NOT NULL,
	`created_at` integer NOT NULL,
	`reviewed_at` integer,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `queue_status_idx` ON `action_queue` (`status`);--> statement-breakpoint
CREATE INDEX `queue_contact_idx` ON `action_queue` (`contact_id`);--> statement-breakpoint
CREATE TABLE `capture_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text,
	`schema_version` text NOT NULL,
	`page_type` text NOT NULL,
	`source_url` text NOT NULL,
	`confidence` real,
	`field_presence` text,
	`extracted_json` text,
	`captured_at` integer NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `capture_sessions_captured_idx` ON `capture_sessions` (`captured_at`);--> statement-breakpoint
CREATE TABLE `contact_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`captured_at` integer NOT NULL,
	`snapshot_json` text NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `snapshots_contact_idx` ON `contact_snapshots` (`contact_id`);--> statement-breakpoint
CREATE TABLE `contact_tags` (
	`contact_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`contact_id`, `tag_id`),
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`linkedin_url_canonical` text NOT NULL,
	`linkedin_url_raw` text,
	`full_name` text,
	`headline` text,
	`company` text,
	`company_normalized` text,
	`location` text,
	`connection_degree` text,
	`segment` text DEFAULT 'warm' NOT NULL,
	`relationship_score` integer DEFAULT 0 NOT NULL,
	`business_score` integer DEFAULT 0 NOT NULL,
	`cleanup_score` integer DEFAULT 0 NOT NULL,
	`relationship_reasons` text,
	`business_reasons` text,
	`cleanup_reasons` text,
	`score_rule_version` text DEFAULT '1' NOT NULL,
	`last_seen_at` integer,
	`last_updated_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contacts_linkedin_url_canonical_unique` ON `contacts` (`linkedin_url_canonical`);--> statement-breakpoint
CREATE INDEX `contacts_segment_idx` ON `contacts` (`segment`);--> statement-breakpoint
CREATE INDEX `contacts_company_norm_idx` ON `contacts` (`company_normalized`);--> statement-breakpoint
CREATE INDEX `contacts_updated_idx` ON `contacts` (`last_updated_at`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notes_contact_idx` ON `notes` (`contact_id`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);