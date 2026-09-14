ALTER TABLE `bingos` ADD `wom_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `bingos` ADD `wom_group_id` text;--> statement-breakpoint
ALTER TABLE `bingos` ADD `wom_group_verification_code` text;--> statement-breakpoint
ALTER TABLE `bingos` ADD `wom_competition_id` integer;--> statement-breakpoint
ALTER TABLE `bingos` ADD `wom_sync_error` text;