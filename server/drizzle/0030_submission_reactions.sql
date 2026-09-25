CREATE TABLE `submission_reactions` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`user_id` text NOT NULL,
	`emoji` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `submission_reactions_submission_user_emoji_unq` ON `submission_reactions` (`submission_id`,`user_id`,`emoji`);--> statement-breakpoint
CREATE INDEX `submission_reactions_submission_idx` ON `submission_reactions` (`submission_id`);