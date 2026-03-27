ALTER TABLE `contacts` ADD `last_hygiene_visit_at` integer;--> statement-breakpoint
CREATE TABLE `automation_log` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`kind` text NOT NULL,
	`outcome` text,
	`created_at` integer NOT NULL
);--> statement-breakpoint
CREATE INDEX `automation_log_created_idx` ON `automation_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `automation_log_contact_idx` ON `automation_log` (`contact_id`);
