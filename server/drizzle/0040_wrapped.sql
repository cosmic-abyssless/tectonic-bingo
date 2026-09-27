CREATE TABLE `bingo_wrapped` (
	`bingo_id` text PRIMARY KEY NOT NULL,
	`published_at` integer NOT NULL,
	`published_by_user_id` text,
	`data_json` text NOT NULL,
	FOREIGN KEY (`bingo_id`) REFERENCES `bingos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`published_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `player_wrapped` (
	`id` text PRIMARY KEY NOT NULL,
	`bingo_id` text NOT NULL,
	`user_id` text NOT NULL,
	`data_json` text NOT NULL,
	FOREIGN KEY (`bingo_id`) REFERENCES `bingos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `player_wrapped_bingo_user_unq` ON `player_wrapped` (`bingo_id`,`user_id`);--> statement-breakpoint
ALTER TABLE `bingos` ADD `publish_wrapped_on_finish` integer DEFAULT false NOT NULL;