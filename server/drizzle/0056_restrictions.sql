CREATE TABLE `bingo_restrictions` (
	`id` text PRIMARY KEY NOT NULL,
	`bingo_id` text NOT NULL,
	`user_id` text NOT NULL,
	`action` text NOT NULL,
	`reason` text NOT NULL,
	`applied_by_user_id` text,
	`applied_at` integer NOT NULL,
	FOREIGN KEY (`bingo_id`) REFERENCES `bingos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`applied_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bingo_restrictions_bingo_user_action_unq` ON `bingo_restrictions` (`bingo_id`,`user_id`,`action`);