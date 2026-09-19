ALTER TABLE `bingos` ADD `draft_started` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `bingos` ADD `draft_order_locked_until` integer;
