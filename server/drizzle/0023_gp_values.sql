CREATE TABLE `piece_values` (
	`id` text PRIMARY KEY NOT NULL,
	`piece_item_name` text NOT NULL,
	`whole_item_name` text NOT NULL,
	`divisor` integer NOT NULL,
	`created_by_user_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `piece_values_piece_item_name_unique` ON `piece_values` (`piece_item_name`);--> statement-breakpoint
CREATE TABLE `unvalued_item_dismissals` (
	`item_name` text PRIMARY KEY NOT NULL,
	`dismissed_by_user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`dismissed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `claims` ADD `gp_value` integer;