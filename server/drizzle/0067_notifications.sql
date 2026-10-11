CREATE TABLE `bingo_presence` (
	`user_id` text NOT NULL,
	`bingo_id` text NOT NULL,
	`last_seen_at` integer NOT NULL,
	`visit_started_at` integer NOT NULL,
	`window_from` integer,
	`catch_up_dismissed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bingo_presence_user_bingo_unq` ON `bingo_presence` (`user_id`,`bingo_id`);--> statement-breakpoint
CREATE TABLE `notification_cursor` (
	`key` text PRIMARY KEY NOT NULL,
	`last_audit_id` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notification_dm_log` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`bingo_id` text,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	`sink` integer DEFAULT false NOT NULL,
	`sent_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notification_dm_log_sent_idx` ON `notification_dm_log` (`sent_at`);--> statement-breakpoint
CREATE TABLE `notification_dm_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`bingo_id` text,
	`kind` text NOT NULL,
	`notification_ids_json` text NOT NULL,
	`first_event_at` integer NOT NULL,
	`send_at` integer NOT NULL,
	`dev_clock` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notification_dm_queue_send_idx` ON `notification_dm_queue` (`send_at`);--> statement-breakpoint
CREATE INDEX `notification_dm_queue_user_idx` ON `notification_dm_queue` (`user_id`);--> statement-breakpoint
CREATE TABLE `notification_offers` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`bingo_id` text,
	`offer` text NOT NULL,
	`status` text DEFAULT 'shown' NOT NULL,
	`created_at` integer NOT NULL,
	`answered_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notification_offers_user_idx` ON `notification_offers` (`user_id`,`bingo_id`);--> statement-breakpoint
CREATE TABLE `notification_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`level` text DEFAULT 'off' NOT NULL,
	`kinds_json` text DEFAULT '{}' NOT NULL,
	`queue_threshold_minutes` integer DEFAULT 60 NOT NULL,
	`catch_up_enabled` integer DEFAULT false NOT NULL,
	`discord_unreachable_since` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`bingo_id` text,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`link` text,
	`data_json` text DEFAULT '{}' NOT NULL,
	`dedupe_key` text,
	`created_at` integer NOT NULL,
	`read_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notifications_user_created_idx` ON `notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_user_dedupe_unq` ON `notifications` (`user_id`,`dedupe_key`);--> statement-breakpoint
CREATE INDEX `notifications_created_idx` ON `notifications` (`created_at`);