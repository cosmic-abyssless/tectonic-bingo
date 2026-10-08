PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_stage_transitions` (
	`id` text PRIMARY KEY NOT NULL,
	`bingo_id` text NOT NULL,
	`from_stage` text NOT NULL,
	`to_stage` text NOT NULL,
	`changed_by_user_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`bingo_id`) REFERENCES `bingos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`changed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_stage_transitions`("id", "bingo_id", "from_stage", "to_stage", "changed_by_user_id", "created_at") SELECT "id", "bingo_id", "from_stage", "to_stage", "changed_by_user_id", "created_at" FROM `stage_transitions`;--> statement-breakpoint
DROP TABLE `stage_transitions`;--> statement-breakpoint
ALTER TABLE `__new_stage_transitions` RENAME TO `stage_transitions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;