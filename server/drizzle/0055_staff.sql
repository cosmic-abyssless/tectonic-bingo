CREATE TABLE `bingo_staff` (
	`id` text PRIMARY KEY NOT NULL,
	`bingo_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`bingo_id`) REFERENCES `bingos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bingo_staff_bingo_user_unq` ON `bingo_staff` (`bingo_id`,`user_id`);