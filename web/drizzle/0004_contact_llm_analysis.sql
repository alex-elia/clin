ALTER TABLE `contacts` ADD `llm_message_context` text;--> statement-breakpoint
ALTER TABLE `contacts` ADD `llm_provisional_json` text;--> statement-breakpoint
ALTER TABLE `contacts` ADD `llm_provisional_at` integer;--> statement-breakpoint
ALTER TABLE `contacts` ADD `llm_refined_json` text;--> statement-breakpoint
ALTER TABLE `contacts` ADD `llm_refined_at` integer;--> statement-breakpoint
ALTER TABLE `contacts` ADD `llm_last_model` text;
