-- Backfill (#464): Eager beaver is now earnable from Board revealed. Players who already marked Task interest in a
-- Bingo that's in Board revealed or Live get it now (earned at deploy, popup not yet shown, so it plays on their next
-- visit), where it's switched on and they're on one of the Bingo's Teams. Audited first, as the live path does
-- (achievementService.tryEarn), while "not earned yet" still tells who's due; search_text is filled on startup.
INSERT INTO `audit_log` (`bingo_id`, `action`, `visibility`, `actor_type`, `actor_role`, `actor_user_id`, `entity_type`, `entity_id`, `entity_label`, `details`, `created_at`)
SELECT DISTINCT b.`id`, 'achievement.earned', 'mods', 'user', 'player', ti.`user_id`, 'achievement', 'eager_beaver', 'Eager beaver', '{"key":"eager_beaver","name":"Eager beaver"}', unixepoch() * 1000
FROM `bingos` b
JOIN `bingo_achievement_settings` s ON s.`bingo_id` = b.`id` AND s.`achievement_key` = 'eager_beaver' AND s.`enabled` = 1
JOIN `tiles` t ON t.`bingo_id` = b.`id`
JOIN `tile_interests` ti ON ti.`tile_id` = t.`id`
WHERE b.`stage` IN ('reveal', 'live')
	AND EXISTS (SELECT 1 FROM `team_members` tm JOIN `teams` tt ON tt.`id` = tm.`team_id` WHERE tt.`bingo_id` = b.`id` AND tm.`user_id` = ti.`user_id`)
	AND NOT EXISTS (SELECT 1 FROM `achievement_earned` e WHERE e.`bingo_id` = b.`id` AND e.`user_id` = ti.`user_id` AND e.`achievement_key` = 'eager_beaver');
--> statement-breakpoint
INSERT INTO `achievement_earned` (`id`, `bingo_id`, `user_id`, `achievement_key`, `earned_at`, `popup_shown_at`)
SELECT lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))),
	due.`bingo_id`, due.`user_id`, 'eager_beaver', unixepoch(), NULL
FROM (
	SELECT DISTINCT b.`id` AS `bingo_id`, ti.`user_id`
	FROM `bingos` b
	JOIN `bingo_achievement_settings` s ON s.`bingo_id` = b.`id` AND s.`achievement_key` = 'eager_beaver' AND s.`enabled` = 1
	JOIN `tiles` t ON t.`bingo_id` = b.`id`
	JOIN `tile_interests` ti ON ti.`tile_id` = t.`id`
	WHERE b.`stage` IN ('reveal', 'live')
		AND EXISTS (SELECT 1 FROM `team_members` tm JOIN `teams` tt ON tt.`id` = tm.`team_id` WHERE tt.`bingo_id` = b.`id` AND tm.`user_id` = ti.`user_id`)
		AND NOT EXISTS (SELECT 1 FROM `achievement_earned` e WHERE e.`bingo_id` = b.`id` AND e.`user_id` = ti.`user_id` AND e.`achievement_key` = 'eager_beaver')
) due;
