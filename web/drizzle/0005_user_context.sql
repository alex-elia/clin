CREATE TABLE `user_context` (
	`id` text PRIMARY KEY NOT NULL,
	`self_contact_id` text,
	`goals_text` text,
	`positioning_summary` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`self_contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE set null
);
