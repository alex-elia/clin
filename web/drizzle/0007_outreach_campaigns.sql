CREATE TABLE IF NOT EXISTS `outreach_campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`context_text` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `outreach_campaign_members` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`draft_outreach` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `outreach_campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `ocm_campaign_contact_unique` ON `outreach_campaign_members` (`campaign_id`,`contact_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ocm_campaign_status_idx` ON `outreach_campaign_members` (`campaign_id`,`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ocm_campaign_idx` ON `outreach_campaign_members` (`campaign_id`);
