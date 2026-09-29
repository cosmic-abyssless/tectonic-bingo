CREATE TABLE `historical_standings` (
	`id` text PRIMARY KEY NOT NULL,
	`bingo_id` text NOT NULL,
	`team_id` text NOT NULL,
	`place` integer NOT NULL,
	`points` integer,
	FOREIGN KEY (`bingo_id`) REFERENCES `bingos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `historical_standings_team_unq` ON `historical_standings` (`team_id`);--> statement-breakpoint
CREATE INDEX `historical_standings_bingo_idx` ON `historical_standings` (`bingo_id`);--> statement-breakpoint
ALTER TABLE `bingos` ADD `historical` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `tiles` ADD `rules_text` text;