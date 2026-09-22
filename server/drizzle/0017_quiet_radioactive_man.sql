CREATE TABLE `wom_past_competitions` (
	`id` text PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`wom_id` integer NOT NULL,
	`bingo_id` text,
	`title` text NOT NULL,
	`metric` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`participant_count` integer DEFAULT 0 NOT NULL,
	`data_json` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`added_by_user_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`bingo_id`) REFERENCES `bingos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`added_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wom_past_competitions_guild_wom_unq` ON `wom_past_competitions` (`guild_id`,`wom_id`);