DROP TABLE `event_moderators`;--> statement-breakpoint
ALTER TABLE `users` ADD `is_moderator` integer DEFAULT false NOT NULL;