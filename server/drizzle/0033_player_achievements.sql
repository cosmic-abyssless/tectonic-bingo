CREATE TABLE `achievement_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`bingo_id` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`subject_id` text NOT NULL,
	`tile_id` text,
	`credited_user_id` text,
	`team_id` text NOT NULL,
	`local_date` text NOT NULL,
	`local_hour` integer NOT NULL,
	`occurred_at` integer NOT NULL,
	FOREIGN KEY (`bingo_id`) REFERENCES `bingos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `achievement_activity_bingo_user_kind_subject_unq` ON `achievement_activity` (`bingo_id`,`user_id`,`kind`,`subject_id`);--> statement-breakpoint
CREATE INDEX `achievement_activity_bingo_user_kind_idx` ON `achievement_activity` (`bingo_id`,`user_id`,`kind`);--> statement-breakpoint
CREATE TABLE `achievement_earned` (
	`id` text PRIMARY KEY NOT NULL,
	`bingo_id` text NOT NULL,
	`user_id` text NOT NULL,
	`achievement_key` text NOT NULL,
	`earned_at` integer NOT NULL,
	`popup_shown_at` integer,
	FOREIGN KEY (`bingo_id`) REFERENCES `bingos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `achievement_earned_bingo_user_key_unq` ON `achievement_earned` (`bingo_id`,`user_id`,`achievement_key`);--> statement-breakpoint
CREATE TABLE `bingo_achievement_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`bingo_id` text NOT NULL,
	`achievement_key` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`first_switched_on_at` integer NOT NULL,
	FOREIGN KEY (`bingo_id`) REFERENCES `bingos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bingo_achievement_settings_bingo_key_unq` ON `bingo_achievement_settings` (`bingo_id`,`achievement_key`);--> statement-breakpoint
ALTER TABLE `bingos` ADD `achievements_enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
-- Every Achievement in the launch catalogue (CONTEXT.md), switched on for every existing bingo, stamped with this
-- migration's time — matches createBingo's default for a brand-new bingo (achievementService.initializeAchievementSettings).
-- One added to the catalogue after launch arrives switched off instead. The table is brand new in this same migration,
-- so INSERT OR IGNORE is just defensive, not load-bearing.
INSERT OR IGNORE INTO `bingo_achievement_settings` (`id`, `bingo_id`, `achievement_key`, `enabled`, `first_switched_on_at`) SELECT lower(hex(randomblob(16))), `id`, 'strong_start', 1, unixepoch() FROM `bingos`;--> statement-breakpoint
INSERT OR IGNORE INTO `bingo_achievement_settings` (`id`, `bingo_id`, `achievement_key`, `enabled`, `first_switched_on_at`) SELECT lower(hex(randomblob(16))), `id`, 'drop_detective', 1, unixepoch() FROM `bingos`;--> statement-breakpoint
INSERT OR IGNORE INTO `bingo_achievement_settings` (`id`, `bingo_id`, `achievement_key`, `enabled`, `first_switched_on_at`) SELECT lower(hex(randomblob(16))), `id`, 'hypeman', 1, unixepoch() FROM `bingos`;--> statement-breakpoint
INSERT OR IGNORE INTO `bingo_achievement_settings` (`id`, `bingo_id`, `achievement_key`, `enabled`, `first_switched_on_at`) SELECT lower(hex(randomblob(16))), `id`, 'cheerleader', 1, unixepoch() FROM `bingos`;--> statement-breakpoint
INSERT OR IGNORE INTO `bingo_achievement_settings` (`id`, `bingo_id`, `achievement_key`, `enabled`, `first_switched_on_at`) SELECT lower(hex(randomblob(16))), `id`, 'partner_slayer', 1, unixepoch() FROM `bingos`;--> statement-breakpoint
INSERT OR IGNORE INTO `bingo_achievement_settings` (`id`, `bingo_id`, `achievement_key`, `enabled`, `first_switched_on_at`) SELECT lower(hex(randomblob(16))), `id`, 'big_spender', 1, unixepoch() FROM `bingos`;--> statement-breakpoint
INSERT OR IGNORE INTO `bingo_achievement_settings` (`id`, `bingo_id`, `achievement_key`, `enabled`, `first_switched_on_at`) SELECT lower(hex(randomblob(16))), `id`, 'regular', 1, unixepoch() FROM `bingos`;--> statement-breakpoint
INSERT OR IGNORE INTO `bingo_achievement_settings` (`id`, `bingo_id`, `achievement_key`, `enabled`, `first_switched_on_at`) SELECT lower(hex(randomblob(16))), `id`, 'globetrotter', 1, unixepoch() FROM `bingos`;--> statement-breakpoint
INSERT OR IGNORE INTO `bingo_achievement_settings` (`id`, `bingo_id`, `achievement_key`, `enabled`, `first_switched_on_at`) SELECT lower(hex(randomblob(16))), `id`, 'eager_beaver', 1, unixepoch() FROM `bingos`;--> statement-breakpoint
INSERT OR IGNORE INTO `bingo_achievement_settings` (`id`, `bingo_id`, `achievement_key`, `enabled`, `first_switched_on_at`) SELECT lower(hex(randomblob(16))), `id`, 'superfan', 1, unixepoch() FROM `bingos`;--> statement-breakpoint
INSERT OR IGNORE INTO `bingo_achievement_settings` (`id`, `bingo_id`, `achievement_key`, `enabled`, `first_switched_on_at`) SELECT lower(hex(randomblob(16))), `id`, 'popular', 1, unixepoch() FROM `bingos`;--> statement-breakpoint
INSERT OR IGNORE INTO `bingo_achievement_settings` (`id`, `bingo_id`, `achievement_key`, `enabled`, `first_switched_on_at`) SELECT lower(hex(randomblob(16))), `id`, 'leech', 1, unixepoch() FROM `bingos`;--> statement-breakpoint
INSERT OR IGNORE INTO `bingo_achievement_settings` (`id`, `bingo_id`, `achievement_key`, `enabled`, `first_switched_on_at`) SELECT lower(hex(randomblob(16))), `id`, 'long_weekend', 1, unixepoch() FROM `bingos`;--> statement-breakpoint
INSERT OR IGNORE INTO `bingo_achievement_settings` (`id`, `bingo_id`, `achievement_key`, `enabled`, `first_switched_on_at`) SELECT lower(hex(randomblob(16))), `id`, 'diversification', 1, unixepoch() FROM `bingos`;--> statement-breakpoint
INSERT OR IGNORE INTO `bingo_achievement_settings` (`id`, `bingo_id`, `achievement_key`, `enabled`, `first_switched_on_at`) SELECT lower(hex(randomblob(16))), `id`, 'skiller', 1, unixepoch() FROM `bingos`;--> statement-breakpoint
INSERT OR IGNORE INTO `bingo_achievement_settings` (`id`, `bingo_id`, `achievement_key`, `enabled`, `first_switched_on_at`) SELECT lower(hex(randomblob(16))), `id`, 'ragequit', 1, unixepoch() FROM `bingos`;--> statement-breakpoint
INSERT OR IGNORE INTO `bingo_achievement_settings` (`id`, `bingo_id`, `achievement_key`, `enabled`, `first_switched_on_at`) SELECT lower(hex(randomblob(16))), `id`, 'yammma', 1, unixepoch() FROM `bingos`;--> statement-breakpoint
INSERT OR IGNORE INTO `bingo_achievement_settings` (`id`, `bingo_id`, `achievement_key`, `enabled`, `first_switched_on_at`) SELECT lower(hex(randomblob(16))), `id`, 'night_owl', 1, unixepoch() FROM `bingos`;--> statement-breakpoint
INSERT OR IGNORE INTO `bingo_achievement_settings` (`id`, `bingo_id`, `achievement_key`, `enabled`, `first_switched_on_at`) SELECT lower(hex(randomblob(16))), `id`, 'early_bird', 1, unixepoch() FROM `bingos`;--> statement-breakpoint
INSERT OR IGNORE INTO `bingo_achievement_settings` (`id`, `bingo_id`, `achievement_key`, `enabled`, `first_switched_on_at`) SELECT lower(hex(randomblob(16))), `id`, 'main_character', 1, unixepoch() FROM `bingos`;--> statement-breakpoint
INSERT OR IGNORE INTO `bingo_achievement_settings` (`id`, `bingo_id`, `achievement_key`, `enabled`, `first_switched_on_at`) SELECT lower(hex(randomblob(16))), `id`, 'called_it', 1, unixepoch() FROM `bingos`;--> statement-breakpoint
INSERT OR IGNORE INTO `bingo_achievement_settings` (`id`, `bingo_id`, `achievement_key`, `enabled`, `first_switched_on_at`) SELECT lower(hex(randomblob(16))), `id`, 'rules_lawyer', 1, unixepoch() FROM `bingos`;--> statement-breakpoint
INSERT OR IGNORE INTO `bingo_achievement_settings` (`id`, `bingo_id`, `achievement_key`, `enabled`, `first_switched_on_at`) SELECT lower(hex(randomblob(16))), `id`, 'number_cruncher', 1, unixepoch() FROM `bingos`;
