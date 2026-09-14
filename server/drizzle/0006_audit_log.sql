CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bingo_id` text,
	`request_id` text,
	`action` text NOT NULL,
	`visibility` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_role` text NOT NULL,
	`actor_user_id` text,
	`on_behalf_of_user_id` text,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`entity_label` text,
	`team_id` text,
	`details` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`on_behalf_of_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_log_bingo_idx` ON `audit_log` (`bingo_id`,`id`);--> statement-breakpoint
CREATE INDEX `audit_log_bingo_action_idx` ON `audit_log` (`bingo_id`,`action`,`id`);--> statement-breakpoint
CREATE INDEX `audit_log_bingo_team_idx` ON `audit_log` (`bingo_id`,`team_id`,`id`);--> statement-breakpoint
CREATE INDEX `audit_log_bingo_actor_idx` ON `audit_log` (`bingo_id`,`actor_user_id`,`id`);--> statement-breakpoint
CREATE INDEX `audit_log_bingo_created_idx` ON `audit_log` (`bingo_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_log_entity_idx` ON `audit_log` (`entity_type`,`entity_id`);