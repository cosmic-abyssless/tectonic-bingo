CREATE TABLE `user_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`board_desktop_mode` text DEFAULT 'fit' NOT NULL,
	`board_desktop_width_percent` integer DEFAULT 100 NOT NULL,
	`board_phone_mode` text DEFAULT 'fit' NOT NULL,
	`board_phone_width_percent` integer DEFAULT 100 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
