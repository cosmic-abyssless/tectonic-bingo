CREATE TABLE `phone_login_links` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `phone_login_links_token_hash_unique` ON `phone_login_links` (`token_hash`);--> statement-breakpoint
CREATE INDEX `phone_login_links_user_idx` ON `phone_login_links` (`user_id`);