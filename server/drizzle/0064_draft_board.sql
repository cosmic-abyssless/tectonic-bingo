CREATE TABLE `board_drafts` (
	`bingo_id` text PRIMARY KEY NOT NULL,
	`revision` text NOT NULL,
	`exclusivity_rules_json` text DEFAULT '[]' NOT NULL,
	`rules_markdown` text,
	`updated_by_user_id` text,
	`updated_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`bingo_id`) REFERENCES `bingos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `draft_bingo_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`bingo_id` text NOT NULL,
	`node_id` text NOT NULL,
	`line_type` text NOT NULL,
	`line_index` integer NOT NULL,
	FOREIGN KEY (`bingo_id`) REFERENCES `bingos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`node_id`) REFERENCES `draft_nodes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `draft_bingo_lines_node_unq` ON `draft_bingo_lines` (`node_id`);--> statement-breakpoint
CREATE TABLE `draft_node_edges` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text NOT NULL,
	`child_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `draft_nodes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`child_id`) REFERENCES `draft_nodes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `draft_node_edges_parent_child_unq` ON `draft_node_edges` (`parent_id`,`child_id`);--> statement-breakpoint
CREATE TABLE `draft_nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`bingo_id` text NOT NULL,
	`kind` text NOT NULL,
	`label` text,
	`description` text,
	`notes` text,
	`points` integer DEFAULT 0 NOT NULL,
	`min_count` integer,
	`quantity` integer,
	`item_name` text,
	`counts_as` integer DEFAULT 1 NOT NULL,
	`points_gate_node_id` text,
	`submit_gate_node_id` text,
	`allows_pre_load` integer DEFAULT false NOT NULL,
	`valued_as_item_name` text,
	`valued_as_divisor` integer,
	`valued_as_source` text,
	`requires_proof` integer DEFAULT false NOT NULL,
	`proof_note` text,
	FOREIGN KEY (`bingo_id`) REFERENCES `bingos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `draft_nodes_bingo_idx` ON `draft_nodes` (`bingo_id`);--> statement-breakpoint
CREATE TABLE `draft_tile_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`bingo_id` text NOT NULL,
	`label` text NOT NULL,
	`color_hex` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`bingo_id`) REFERENCES `bingos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `draft_tiles` (
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
	`requires_proof` integer DEFAULT false NOT NULL,
	`proof_note` text,
	`rules_text` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`bingo_id`) REFERENCES `bingos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`node_id`) REFERENCES `draft_nodes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `draft_tile_categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `draft_tiles_bingo_position_unq` ON `draft_tiles` (`bingo_id`,`board_row`,`board_col`);--> statement-breakpoint
CREATE UNIQUE INDEX `draft_tiles_node_unq` ON `draft_tiles` (`node_id`);--> statement-breakpoint
ALTER TABLE `nodes` ADD `removed_at` integer;