CREATE TABLE `piece_value_other_pieces` (
	`id` text PRIMARY KEY NOT NULL,
	`piece_value_id` text NOT NULL,
	`item_name` text NOT NULL,
	`quantity` integer NOT NULL,
	FOREIGN KEY (`piece_value_id`) REFERENCES `piece_values`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `piece_value_other_pieces_value_item_unq` ON `piece_value_other_pieces` (`piece_value_id`,`item_name`);