CREATE TABLE `tile_interests` (
	`id` text PRIMARY KEY NOT NULL,
	`tile_id` text NOT NULL,
	`team_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`tile_id`) REFERENCES `tiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tile_interests_tile_user_unq` ON `tile_interests` (`tile_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `tile_interests_team_idx` ON `tile_interests` (`team_id`);