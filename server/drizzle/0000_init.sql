CREATE TABLE `bingo_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`bingo_id` text NOT NULL,
	`node_id` text NOT NULL,
	`line_type` text NOT NULL,
	`line_index` integer NOT NULL,
	FOREIGN KEY (`bingo_id`) REFERENCES `bingos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bingo_lines_node_unq` ON `bingo_lines` (`node_id`);--> statement-breakpoint
CREATE TABLE `bingo_moderators` (
	`id` text PRIMARY KEY NOT NULL,
	`bingo_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`bingo_id`) REFERENCES `bingos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bingo_moderators_bingo_user_unq` ON `bingo_moderators` (`bingo_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `bingos` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`theme` text DEFAULT 'default' NOT NULL,
	`stage` text DEFAULT 'planning' NOT NULL,
	`board_rows` integer NOT NULL,
	`board_cols` integer NOT NULL,
	`buyin_amount` integer,
	`bonus_pot_amount` integer DEFAULT 0 NOT NULL,
	`rules_markdown` text,
	`signup_opens_at` integer,
	`draft_scheduled_at` integer,
	`reveal_scheduled_at` integer,
	`starts_at` integer,
	`ends_at` integer,
	`created_by_user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bingos_slug_unique` ON `bingos` (`slug`);--> statement-breakpoint
CREATE TABLE `claims` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`node_id` text NOT NULL,
	`item_name` text,
	`quantity` integer DEFAULT 1 NOT NULL,
	`wildcard_id` text,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`wildcard_id`) REFERENCES `tile_wildcards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `draft_picks` (
	`id` text PRIMARY KEY NOT NULL,
	`bingo_id` text NOT NULL,
	`pick_number` integer NOT NULL,
	`team_id` text NOT NULL,
	`user_id` text NOT NULL,
	`picked_by_user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`bingo_id`) REFERENCES `bingos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`picked_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `draft_picks_bingo_pick_unq` ON `draft_picks` (`bingo_id`,`pick_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `draft_picks_bingo_user_unq` ON `draft_picks` (`bingo_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `item_group_items` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`item_name` text NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `item_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `item_group_items_group_name_unq` ON `item_group_items` (`group_id`,`item_name`);--> statement-breakpoint
CREATE TABLE `item_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `item_groups_name_unique` ON `item_groups` (`name`);--> statement-breakpoint
CREATE TABLE `node_edges` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text NOT NULL,
	`child_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`child_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `node_edges_parent_child_unq` ON `node_edges` (`parent_id`,`child_id`);--> statement-breakpoint
CREATE TABLE `node_item_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`node_id` text NOT NULL,
	`item_group_id` text NOT NULL,
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_group_id`) REFERENCES `item_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `node_item_groups_node_group_unq` ON `node_item_groups` (`node_id`,`item_group_id`);--> statement-breakpoint
CREATE TABLE `node_items` (
	`id` text PRIMARY KEY NOT NULL,
	`node_id` text NOT NULL,
	`item_name` text NOT NULL,
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `node_items_node_name_unq` ON `node_items` (`node_id`,`item_name`);--> statement-breakpoint
CREATE TABLE `nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`bingo_id` text NOT NULL,
	`kind` text NOT NULL,
	`label` text,
	`description` text,
	`notes` text,
	`points` integer DEFAULT 0 NOT NULL,
	`min_count` integer,
	`quantity` integer,
	`distinct_items` integer DEFAULT false NOT NULL,
	`points_gate_node_id` text,
	`submit_gate_node_id` text,
	`allows_pre_load` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`bingo_id`) REFERENCES `bingos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `signup_answers` (
	`id` text PRIMARY KEY NOT NULL,
	`signup_id` text NOT NULL,
	`question_id` text NOT NULL,
	`value` text NOT NULL,
	FOREIGN KEY (`signup_id`) REFERENCES `signups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`question_id`) REFERENCES `signup_questions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `signup_answers_signup_question_unq` ON `signup_answers` (`signup_id`,`question_id`);--> statement-breakpoint
CREATE TABLE `signup_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`bingo_id` text NOT NULL,
	`prompt` text NOT NULL,
	`type` text NOT NULL,
	`options_json` text,
	`required` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`bingo_id`) REFERENCES `bingos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `signups` (
	`id` text PRIMARY KEY NOT NULL,
	`bingo_id` text NOT NULL,
	`user_id` text NOT NULL,
	`rsn` text NOT NULL,
	`wom_id` text,
	`rsn_verified` integer DEFAULT false NOT NULL,
	`wom_data_json` text,
	`rune_profile_data_json` text,
	`stats_fetched_at` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`buyin_received_at` integer,
	`buyin_collected_by_user_id` text,
	`buyin_recorded_by_user_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`bingo_id`) REFERENCES `bingos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`buyin_collected_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`buyin_recorded_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `signups_bingo_user_unq` ON `signups` (`bingo_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `stage_transitions` (
	`id` text PRIMARY KEY NOT NULL,
	`bingo_id` text NOT NULL,
	`from_stage` text NOT NULL,
	`to_stage` text NOT NULL,
	`changed_by_user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`bingo_id`) REFERENCES `bingos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`changed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
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
	`submitted_by_user_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`submitted_at` integer DEFAULT (unixepoch()) NOT NULL,
	`reviewed_at` integer,
	`reviewed_by_user_id` text,
	`reviewer_notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`submitted_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `team_members` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`user_id` text NOT NULL,
	`is_captain` integer DEFAULT false NOT NULL,
	`joined_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_members_team_user_unq` ON `team_members` (`team_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `team_node_state` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`node_id` text NOT NULL,
	`completed_at` integer NOT NULL,
	`points_awarded` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_node_state_team_node_unq` ON `team_node_state` (`team_id`,`node_id`);--> statement-breakpoint
CREATE TABLE `team_point_adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`bingo_id` text NOT NULL,
	`amount` integer NOT NULL,
	`reason` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bingo_id`) REFERENCES `bingos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`bingo_id` text NOT NULL,
	`captain_user_id` text NOT NULL,
	`name` text NOT NULL,
	`codeword` text NOT NULL,
	`color` text,
	`draft_order` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`bingo_id`) REFERENCES `bingos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`captain_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teams_bingo_captain_unq` ON `teams` (`bingo_id`,`captain_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `teams_bingo_codeword_unq` ON `teams` (`bingo_id`,`codeword`);--> statement-breakpoint
CREATE TABLE `tile_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`bingo_id` text NOT NULL,
	`label` text NOT NULL,
	`color_hex` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`bingo_id`) REFERENCES `bingos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tile_wildcards` (
	`id` text PRIMARY KEY NOT NULL,
	`tile_id` text NOT NULL,
	`item_name` text NOT NULL,
	`max_redemptions_per_team` integer DEFAULT 1 NOT NULL,
	`description` text,
	`applicable_node_id` text,
	FOREIGN KEY (`tile_id`) REFERENCES `tiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`applicable_node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tiles` (
	`id` text PRIMARY KEY NOT NULL,
	`bingo_id` text NOT NULL,
	`node_id` text NOT NULL,
	`name` text NOT NULL,
	`image_url` text,
	`category_id` text,
	`board_row` integer NOT NULL,
	`board_col` integer NOT NULL,
	`has_freeze_period` integer DEFAULT false NOT NULL,
	`freeze_duration_minutes` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`bingo_id`) REFERENCES `bingos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `tile_categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tiles_bingo_position_unq` ON `tiles` (`bingo_id`,`board_row`,`board_col`);--> statement-breakpoint
CREATE UNIQUE INDEX `tiles_node_unq` ON `tiles` (`node_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`discord_id` text NOT NULL,
	`discord_username` text NOT NULL,
	`discord_global_name` text,
	`discord_guild_nick` text,
	`discord_avatar` text,
	`is_admin` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_discord_id_unique` ON `users` (`discord_id`);