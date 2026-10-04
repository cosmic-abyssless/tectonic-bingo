CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`bingo_id` text NOT NULL,
	`tile_id` text,
	`node_id` text,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	`boss_tag_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`bingo_id`) REFERENCES `bingos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tile_id`) REFERENCES `tiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tags_bingo_idx` ON `tags` (`bingo_id`);