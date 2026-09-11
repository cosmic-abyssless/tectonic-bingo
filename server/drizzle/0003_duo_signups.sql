CREATE TABLE `signup_pairings` (
	`id` text PRIMARY KEY NOT NULL,
	`bingo_id` text NOT NULL,
	`requester_user_id` text NOT NULL,
	`target_discord_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`responded_at` integer,
	FOREIGN KEY (`bingo_id`) REFERENCES `bingos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requester_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
DROP INDEX `draft_picks_bingo_pick_unq`;--> statement-breakpoint
ALTER TABLE `bingos` ADD `signup_mode` text DEFAULT 'solo' NOT NULL;--> statement-breakpoint
ALTER TABLE `team_members` ADD `is_co_captain` integer DEFAULT false NOT NULL;