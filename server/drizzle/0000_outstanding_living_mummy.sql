CREATE TABLE `bingo_events` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`pot_amount` integer,
	`is_active` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bingo_line_tiles` (
	`id` text PRIMARY KEY NOT NULL,
	`bingo_line_id` text NOT NULL,
	`tile_id` text NOT NULL,
	FOREIGN KEY (`bingo_line_id`) REFERENCES `bingo_lines`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tile_id`) REFERENCES `tiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bingo_line_tiles_line_tile_unq` ON `bingo_line_tiles` (`bingo_line_id`,`tile_id`);--> statement-breakpoint
CREATE TABLE `bingo_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`bingo_event_id` text NOT NULL,
	`line_type` text NOT NULL,
	`line_index` integer NOT NULL,
	`points` integer DEFAULT 15 NOT NULL,
	FOREIGN KEY (`bingo_event_id`) REFERENCES `bingo_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `event_moderators` (
	`id` text PRIMARY KEY NOT NULL,
	`bingo_event_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`bingo_event_id`) REFERENCES `bingo_events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_moderators_event_user_unq` ON `event_moderators` (`bingo_event_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `submission_item_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`item_name` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`tile_side_item_id` text,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tile_side_item_id`) REFERENCES `tile_side_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `submission_screenshots` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`screenshot_type` text DEFAULT 'main' NOT NULL,
	`storage_url` text NOT NULL,
	`scrape_status` text DEFAULT 'pending' NOT NULL,
	`extracted_text` text,
	`codeword_verified` integer,
	`scraped_at` integer,
	`uploaded_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`tile_side_id` text NOT NULL,
	`submitted_by_user_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`submitted_at` integer DEFAULT (unixepoch()) NOT NULL,
	`reviewed_at` integer,
	`reviewed_by_user_id` text,
	`reviewer_notes` text,
	`points_awarded` integer,
	`is_wildcard_redemption` integer DEFAULT false NOT NULL,
	`wildcard_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tile_side_id`) REFERENCES `tile_sides`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`submitted_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`wildcard_id`) REFERENCES `tile_wildcards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `team_completed_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`bingo_line_id` text NOT NULL,
	`completed_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bingo_line_id`) REFERENCES `bingo_lines`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_completed_lines_team_line_unq` ON `team_completed_lines` (`team_id`,`bingo_line_id`);--> statement-breakpoint
CREATE TABLE `team_members` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`user_id` text NOT NULL,
	`rsn` text NOT NULL,
	`is_captain` integer DEFAULT false NOT NULL,
	`joined_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_members_team_user_unq` ON `team_members` (`team_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `team_point_adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`bingo_event_id` text NOT NULL,
	`amount` integer NOT NULL,
	`reason` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bingo_event_id`) REFERENCES `bingo_events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `team_tile_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`tile_id` text NOT NULL,
	`side_a_status` text DEFAULT 'not_started' NOT NULL,
	`side_a_points_awarded` integer DEFAULT 0 NOT NULL,
	`side_a_completed_at` integer,
	`side_b_status` text DEFAULT 'not_started' NOT NULL,
	`side_b_points_awarded` integer DEFAULT 0 NOT NULL,
	`side_b_completed_at` integer,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tile_id`) REFERENCES `tiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_tile_progress_team_tile_unq` ON `team_tile_progress` (`team_id`,`tile_id`);--> statement-breakpoint
CREATE TABLE `team_wildcard_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`tile_wildcard_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`used_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tile_wildcard_id`) REFERENCES `tile_wildcards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_wildcard_usage_team_wildcard_unq` ON `team_wildcard_usage` (`team_id`,`tile_wildcard_id`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`bingo_event_id` text NOT NULL,
	`name` text NOT NULL,
	`codeword` text NOT NULL,
	`color` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`bingo_event_id`) REFERENCES `bingo_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teams_event_codeword_unq` ON `teams` (`bingo_event_id`,`codeword`);--> statement-breakpoint
CREATE TABLE `tile_side_items` (
	`id` text PRIMARY KEY NOT NULL,
	`tile_side_id` text NOT NULL,
	`item_name` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`options_group` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`tile_side_id`) REFERENCES `tile_sides`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tile_sides` (
	`id` text PRIMARY KEY NOT NULL,
	`tile_id` text NOT NULL,
	`side` text NOT NULL,
	`points` integer NOT NULL,
	`description` text NOT NULL,
	`requires_no_duplicates` integer DEFAULT false NOT NULL,
	`allows_previously_acquired` integer DEFAULT false NOT NULL,
	`allows_pre_load` integer DEFAULT false NOT NULL,
	`notes` text,
	FOREIGN KEY (`tile_id`) REFERENCES `tiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tile_sides_tile_side_unq` ON `tile_sides` (`tile_id`,`side`);--> statement-breakpoint
CREATE TABLE `tile_wildcards` (
	`id` text PRIMARY KEY NOT NULL,
	`tile_id` text NOT NULL,
	`item_name` text NOT NULL,
	`max_redemptions_per_team` integer DEFAULT 1 NOT NULL,
	`description` text,
	`applicable_to_side` text,
	FOREIGN KEY (`tile_id`) REFERENCES `tiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tiles` (
	`id` text PRIMARY KEY NOT NULL,
	`bingo_event_id` text NOT NULL,
	`name` text NOT NULL,
	`badge_category` text NOT NULL,
	`board_row` integer NOT NULL,
	`board_col` integer NOT NULL,
	`total_points` integer NOT NULL,
	`has_freeze_period` integer DEFAULT false NOT NULL,
	`freeze_duration_minutes` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`bingo_event_id`) REFERENCES `bingo_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tiles_event_position_unq` ON `tiles` (`bingo_event_id`,`board_row`,`board_col`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`discord_id` text NOT NULL,
	`discord_username` text NOT NULL,
	`discord_avatar` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_discord_id_unique` ON `users` (`discord_id`);