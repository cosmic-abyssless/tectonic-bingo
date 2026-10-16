CREATE TABLE `draft_effort_bosses` (
	`id` text PRIMARY KEY NOT NULL,
	`bingo_id` text NOT NULL,
	`tile_id` text,
	`node_id` text,
	`metric` text NOT NULL,
	`mode` text NOT NULL,
	FOREIGN KEY (`bingo_id`) REFERENCES `bingos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tile_id`) REFERENCES `draft_tiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`node_id`) REFERENCES `draft_nodes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `draft_effort_bosses_tile_metric_unq` ON `draft_effort_bosses` (`bingo_id`,`tile_id`,`metric`);--> statement-breakpoint
CREATE UNIQUE INDEX `draft_effort_bosses_node_metric_unq` ON `draft_effort_bosses` (`bingo_id`,`node_id`,`metric`);--> statement-breakpoint
CREATE TABLE `effort_bosses` (
	`id` text PRIMARY KEY NOT NULL,
	`bingo_id` text NOT NULL,
	`tile_id` text,
	`node_id` text,
	`metric` text NOT NULL,
	`mode` text NOT NULL,
	FOREIGN KEY (`bingo_id`) REFERENCES `bingos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tile_id`) REFERENCES `tiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `effort_bosses_tile_metric_unq` ON `effort_bosses` (`bingo_id`,`tile_id`,`metric`);--> statement-breakpoint
CREATE UNIQUE INDEX `effort_bosses_node_metric_unq` ON `effort_bosses` (`bingo_id`,`node_id`,`metric`);--> statement-breakpoint
ALTER TABLE `wom_snapshots` ADD `boss_ehb_json` text;