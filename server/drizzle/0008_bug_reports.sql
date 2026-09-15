CREATE TABLE `bug_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`bingo_id` text,
	`reporter_user_id` text NOT NULL,
	`description` text NOT NULL,
	`page_url` text,
	`user_agent` text,
	`status` text DEFAULT 'open' NOT NULL,
	`resolved_by_user_id` text,
	`resolved_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`reporter_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resolved_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
