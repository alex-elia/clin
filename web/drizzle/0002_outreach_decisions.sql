ALTER TABLE `action_queue` ADD `draft_outreach` text;--> statement-breakpoint
ALTER TABLE `action_queue` ADD `outreach_decision` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
CREATE INDEX `queue_outreach_decision_idx` ON `action_queue` (`outreach_decision`);