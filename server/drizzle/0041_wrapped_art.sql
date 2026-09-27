CREATE TABLE `wrapped_art` (
	`id` text PRIMARY KEY NOT NULL,
	`bingo_id` text NOT NULL,
	`section` text NOT NULL,
	`original_url` text NOT NULL,
	`frame1_url` text NOT NULL,
	`frame2_url` text NOT NULL,
	`key_color` text,
	`key_tolerance` integer,
	`key_softness` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`bingo_id`) REFERENCES `bingos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wrapped_art_bingo_section_unq` ON `wrapped_art` (`bingo_id`,`section`);