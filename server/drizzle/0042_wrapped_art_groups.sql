DROP INDEX `wrapped_art_bingo_section_unq`;--> statement-breakpoint
ALTER TABLE `wrapped_art` ADD `sort_order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `wrapped_art_bingo_section_idx` ON `wrapped_art` (`bingo_id`,`section`);