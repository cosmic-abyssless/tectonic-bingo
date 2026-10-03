CREATE TABLE `discord_resources` (
	`id` text PRIMARY KEY NOT NULL,
	`bingo_id` text NOT NULL,
	`team_id` text,
	`kind` text NOT NULL,
	`channel_key` text,
	`discord_id` text NOT NULL,
	`applied_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `discord_resources_bingo_idx` ON `discord_resources` (`bingo_id`);--> statement-breakpoint
ALTER TABLE `bingos` ADD `discord_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `bingos` ADD `discord_category_name` text;--> statement-breakpoint
ALTER TABLE `bingos` ADD `discord_channels_json` text DEFAULT '[{"key":"chat","type":"text","name":"{team}"},{"key":"voice","type":"voice","name":"{team}"}]' NOT NULL;--> statement-breakpoint
ALTER TABLE `bingos` ADD `discord_sync_error` text;--> statement-breakpoint
ALTER TABLE `bingos` ADD `discord_synced_at` integer;