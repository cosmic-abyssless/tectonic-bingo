CREATE TABLE `pick_ratings` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`signup_id` text NOT NULL,
	`stars` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`signup_id`) REFERENCES `signups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pick_ratings_team_signup_unq` ON `pick_ratings` (`team_id`,`signup_id`);--> statement-breakpoint
ALTER TABLE `bingos` ADD `leftover_mode` text DEFAULT 'cut' NOT NULL;--> statement-breakpoint
ALTER TABLE `bingos` ADD `warn_leftovers` integer DEFAULT false NOT NULL;