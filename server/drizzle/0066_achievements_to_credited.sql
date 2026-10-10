-- Backfill: a Submission's Achievements now go to the Player it's credited to, not a teammate who posted it for them
-- (achievementService.recordSubmissionPosted); Partner slayer stays the poster's. In each Live Bingo, a drop posted for
-- someone else becomes their posting activity, and they get the Achievements it now earns them (Strong start, Night owl,
-- Early bird, Regular, Globetrotter, Called it, Moneybags): earned at deploy, popup not yet shown, so it plays on their
-- next visit. Only added: a poster keeps what they already earned. Each counts activity from when it was switched on,
-- and only for a Player on one of the Bingo's Teams, as the live path does. Called it goes by the credited Player's
-- interest as it is now. Audited first, as the live path does (achievementService.tryEarn), while "not earned yet"
-- still tells who's due; search_text is filled on startup.
UPDATE `achievement_activity`
SET `user_id` = (SELECT s.`submitted_by_user_id` FROM `submissions` s WHERE s.`id` = `achievement_activity`.`subject_id`),
	`credited_user_id` = (SELECT s.`submitted_by_user_id` FROM `submissions` s WHERE s.`id` = `achievement_activity`.`subject_id`)
WHERE `kind` = 'posted'
	AND `bingo_id` IN (SELECT `id` FROM `bingos` WHERE `stage` = 'live')
	AND EXISTS (SELECT 1 FROM `submissions` s WHERE s.`id` = `achievement_activity`.`subject_id` AND s.`submitted_by_user_id` != `achievement_activity`.`user_id`);
--> statement-breakpoint
CREATE TEMP TABLE `credited_due` (`bingo_id` TEXT NOT NULL, `user_id` TEXT NOT NULL, `key` TEXT NOT NULL, `name` TEXT NOT NULL);
--> statement-breakpoint
-- Players credited with a drop someone else posted, in a Live Bingo, on one of its Teams: the only ones whose
-- Achievements this moves.
CREATE TEMP TABLE `credited_players` AS
SELECT DISTINCT t.`bingo_id`, s.`submitted_by_user_id` AS `user_id`
FROM `submissions` s
JOIN `teams` t ON t.`id` = s.`team_id`
JOIN `bingos` b ON b.`id` = t.`bingo_id` AND b.`stage` = 'live'
WHERE s.`kind` = 'drop' AND s.`posted_by_user_id` IS NOT NULL AND s.`posted_by_user_id` != s.`submitted_by_user_id`
	AND EXISTS (SELECT 1 FROM `team_members` tm JOIN `teams` tt ON tt.`id` = tm.`team_id` WHERE tt.`bingo_id` = t.`bingo_id` AND tm.`user_id` = s.`submitted_by_user_id`);
--> statement-breakpoint
-- Their posting activity since each Achievement was switched on.
CREATE TEMP VIEW `credited_posts` AS
SELECT a.`bingo_id`, a.`user_id`, a.`subject_id`, a.`tile_id`, a.`local_date`, a.`local_hour`, a.`occurred_at`, st.`achievement_key` AS `key`
FROM `achievement_activity` a
JOIN `credited_players` p ON p.`bingo_id` = a.`bingo_id` AND p.`user_id` = a.`user_id`
JOIN `bingo_achievement_settings` st ON st.`bingo_id` = a.`bingo_id` AND a.`occurred_at` >= st.`first_switched_on_at`
WHERE a.`kind` = 'posted';
--> statement-breakpoint
-- Every node above each leaf those drops claim (the leaf included): a Part with interest marked on it is one of them.
CREATE TEMP TABLE `claimed_up` AS
WITH RECURSIVE `up`(`leaf_id`, `node_id`) AS (
	SELECT DISTINCT c.`node_id`, c.`node_id` FROM `claims` c JOIN `credited_posts` cp ON cp.`subject_id` = c.`submission_id`
	UNION
	SELECT `up`.`leaf_id`, e.`parent_id` FROM `node_edges` e JOIN `up` ON e.`child_id` = `up`.`node_id`
)
SELECT `leaf_id`, `node_id` FROM `up`;
--> statement-breakpoint
INSERT INTO `credited_due` (`bingo_id`, `user_id`, `key`, `name`)
SELECT DISTINCT `bingo_id`, `user_id`, 'strong_start', 'Strong start' FROM `credited_posts` WHERE `key` = 'strong_start'
UNION
SELECT DISTINCT `bingo_id`, `user_id`, 'night_owl', 'Night owl' FROM `credited_posts` WHERE `key` = 'night_owl' AND `local_hour` BETWEEN 2 AND 5
UNION
SELECT DISTINCT `bingo_id`, `user_id`, 'early_bird', 'Early bird' FROM `credited_posts` WHERE `key` = 'early_bird' AND `local_hour` BETWEEN 6 AND 8
UNION
SELECT `bingo_id`, `user_id`, 'regular', 'Regular' FROM `credited_posts` WHERE `key` = 'regular' GROUP BY `bingo_id`, `user_id` HAVING COUNT(DISTINCT `local_date`) >= 5
UNION
SELECT `bingo_id`, `user_id`, 'globetrotter', 'Globetrotter' FROM `credited_posts` WHERE `key` = 'globetrotter' GROUP BY `bingo_id`, `user_id` HAVING COUNT(DISTINCT `tile_id`) >= 5
UNION
-- Called it: a drop claiming under a Part of its Tile they have interest marked on (the Part is the claimed leaf itself
-- or one of its ancestors).
SELECT DISTINCT cp.`bingo_id`, cp.`user_id`, 'called_it', 'Called it'
FROM `credited_posts` cp
JOIN `claims` c ON c.`submission_id` = cp.`subject_id`
JOIN `claimed_up` u ON u.`leaf_id` = c.`node_id`
JOIN `tile_interests` ti ON ti.`user_id` = cp.`user_id` AND ti.`tile_id` = cp.`tile_id` AND ti.`task_id` = u.`node_id`
WHERE cp.`key` = 'called_it'
UNION
-- Moneybags: a drop credited to them whose claims' Drop values come to 25m or more, posted since it was switched on.
SELECT DISTINCT t.`bingo_id`, s.`submitted_by_user_id`, 'big_spender', 'Moneybags'
FROM `submissions` s
JOIN `teams` t ON t.`id` = s.`team_id`
JOIN `credited_players` p ON p.`bingo_id` = t.`bingo_id` AND p.`user_id` = s.`submitted_by_user_id`
JOIN `bingo_achievement_settings` st ON st.`bingo_id` = t.`bingo_id` AND st.`achievement_key` = 'big_spender' AND s.`created_at` >= st.`first_switched_on_at`
WHERE s.`kind` = 'drop' AND (SELECT COALESCE(SUM(c.`gp_value`), 0) FROM `claims` c WHERE c.`submission_id` = s.`id`) >= 25000000;
--> statement-breakpoint
DELETE FROM `credited_due`
WHERE EXISTS (SELECT 1 FROM `achievement_earned` e WHERE e.`bingo_id` = `credited_due`.`bingo_id` AND e.`user_id` = `credited_due`.`user_id` AND e.`achievement_key` = `credited_due`.`key`);
--> statement-breakpoint
INSERT INTO `audit_log` (`bingo_id`, `action`, `visibility`, `actor_type`, `actor_role`, `actor_user_id`, `entity_type`, `entity_id`, `entity_label`, `details`, `created_at`)
SELECT `bingo_id`, 'achievement.earned', 'mods', 'user', 'player', `user_id`, 'achievement', `key`, `name`, json_object('key', `key`, 'name', `name`), unixepoch() * 1000
FROM `credited_due`;
--> statement-breakpoint
INSERT INTO `achievement_earned` (`id`, `bingo_id`, `user_id`, `achievement_key`, `earned_at`, `popup_shown_at`)
SELECT lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))),
	`bingo_id`, `user_id`, `key`, unixepoch(), NULL
FROM `credited_due`;
--> statement-breakpoint
DROP TABLE `claimed_up`;
--> statement-breakpoint
DROP VIEW `credited_posts`;
--> statement-breakpoint
DROP TABLE `credited_players`;
--> statement-breakpoint
DROP TABLE `credited_due`;
