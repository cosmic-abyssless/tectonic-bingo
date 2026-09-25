CREATE TABLE `wom_reads` (
	`id` text PRIMARY KEY NOT NULL,
	`bingo_id` text NOT NULL,
	`user_id` text NOT NULL,
	`rsn` text NOT NULL,
	`read_at` integer,
	`read_through` integer,
	`last_error` text,
	`last_error_at` integer,
	FOREIGN KEY (`bingo_id`) REFERENCES `bingos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wom_reads_bingo_user_unq` ON `wom_reads` (`bingo_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `wom_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`bingo_id` text NOT NULL,
	`user_id` text NOT NULL,
	`taken_at` integer NOT NULL,
	`ehb` real,
	`ehp` real,
	`clues` integer,
	`boss_kills_json` text NOT NULL,
	FOREIGN KEY (`bingo_id`) REFERENCES `bingos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wom_snapshots_bingo_user_taken_unq` ON `wom_snapshots` (`bingo_id`,`user_id`,`taken_at`);