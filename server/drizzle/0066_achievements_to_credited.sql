-- Backfill: a Submission's Achievements now go to the Player it's credited to, not a teammate who posted it for them
-- (achievementService.recordSubmissionPosted); Partner slayer stays the poster's. In each Live Bingo, a drop posted for
-- someone else becomes their posting activity, and they get the Achievements it now earns them (Strong start, Night owl,
-- Early bird, Regular, Globetrotter, Called it, Moneybags): earned at deploy, popup not yet shown, so it plays on their
-- next visit. Only added: a poster keeps what they already earned. Each counts activity from when it was switched on,
-- and only for a Player on one of the Bingo's Teams, as the live path does. Called it goes by the credited Player's
-- interest as it is now. Audited first, as the live path does (achievementService.tryEarn), while "not earned yet"
-- still tells who's due (the same query twice); search_text is filled on startup.
UPDATE `achievement_activity`
SET `user_id` = (SELECT s.`submitted_by_user_id` FROM `submissions` s WHERE s.`id` = `achievement_activity`.`subject_id`),
	`credited_user_id` = (SELECT s.`submitted_by_user_id` FROM `submissions` s WHERE s.`id` = `achievement_activity`.`subject_id`)
WHERE `kind` = 'posted'
	AND `bingo_id` IN (SELECT `id` FROM `bingos` WHERE `stage` = 'live')
	AND EXISTS (SELECT 1 FROM `submissions` s WHERE s.`id` = `achievement_activity`.`subject_id` AND s.`submitted_by_user_id` != `achievement_activity`.`user_id`);
--> statement-breakpoint
INSERT INTO `audit_log` (`bingo_id`, `action`, `visibility`, `actor_type`, `actor_role`, `actor_user_id`, `entity_type`, `entity_id`, `entity_label`, `details`, `created_at`)
WITH RECURSIVE
-- Players credited with a drop someone else posted, in a Live Bingo, on one of its Teams: the only ones whose
-- Achievements this moves.
`players` AS (
	SELECT DISTINCT t.`bingo_id`, s.`submitted_by_user_id` AS `user_id`
	FROM `submissions` s
	JOIN `teams` t ON t.`id` = s.`team_id`
	JOIN `bingos` b ON b.`id` = t.`bingo_id` AND b.`stage` = 'live'
	WHERE s.`kind` = 'drop' AND s.`posted_by_user_id` IS NOT NULL AND s.`posted_by_user_id` != s.`submitted_by_user_id`
		AND EXISTS (SELECT 1 FROM `team_members` tm JOIN `teams` tt ON tt.`id` = tm.`team_id` WHERE tt.`bingo_id` = t.`bingo_id` AND tm.`user_id` = s.`submitted_by_user_id`)
),
-- Their posting activity, once per Achievement switched on before it.
`posts` AS (
	SELECT a.`bingo_id`, a.`user_id`, a.`subject_id`, a.`tile_id`, a.`local_date`, a.`local_hour`, st.`achievement_key` AS `key`
	FROM `achievement_activity` a
	JOIN `players` p ON p.`bingo_id` = a.`bingo_id` AND p.`user_id` = a.`user_id`
	JOIN `bingo_achievement_settings` st ON st.`bingo_id` = a.`bingo_id` AND a.`occurred_at` >= st.`first_switched_on_at`
	WHERE a.`kind` = 'posted'
),
-- Every node above each leaf those drops claim (the leaf included): a Part with interest marked on it is one of them.
`up`(`leaf_id`, `node_id`) AS (
	SELECT DISTINCT c.`node_id`, c.`node_id` FROM `claims` c JOIN `posts` cp ON cp.`subject_id` = c.`submission_id`
	UNION
	SELECT `up`.`leaf_id`, e.`parent_id` FROM `node_edges` e JOIN `up` ON e.`child_id` = `up`.`node_id`
),
`due`(`bingo_id`, `user_id`, `key`, `name`) AS (
	SELECT DISTINCT `bingo_id`, `user_id`, 'strong_start', 'Strong start' FROM `posts` WHERE `key` = 'strong_start'
	UNION
	SELECT DISTINCT `bingo_id`, `user_id`, 'night_owl', 'Night owl' FROM `posts` WHERE `key` = 'night_owl' AND `local_hour` BETWEEN 2 AND 5
	UNION
	SELECT DISTINCT `bingo_id`, `user_id`, 'early_bird', 'Early bird' FROM `posts` WHERE `key` = 'early_bird' AND `local_hour` BETWEEN 6 AND 8
	UNION
	SELECT `bingo_id`, `user_id`, 'regular', 'Regular' FROM `posts` WHERE `key` = 'regular' GROUP BY `bingo_id`, `user_id` HAVING COUNT(DISTINCT `local_date`) >= 5
	UNION
	SELECT `bingo_id`, `user_id`, 'globetrotter', 'Globetrotter' FROM `posts` WHERE `key` = 'globetrotter' GROUP BY `bingo_id`, `user_id` HAVING COUNT(DISTINCT `tile_id`) >= 5
	UNION
	-- Called it: a drop claiming under a Part of its Tile they have interest marked on.
	SELECT DISTINCT cp.`bingo_id`, cp.`user_id`, 'called_it', 'Called it'
	FROM `posts` cp
	JOIN `claims` c ON c.`submission_id` = cp.`subject_id`
	JOIN `up` u ON u.`leaf_id` = c.`node_id`
	JOIN `tile_interests` ti ON ti.`user_id` = cp.`user_id` AND ti.`tile_id` = cp.`tile_id` AND ti.`task_id` = u.`node_id`
	WHERE cp.`key` = 'called_it'
	UNION
	-- Moneybags: a drop credited to them whose claims' Drop values come to 25m or more, posted since it was switched on.
	SELECT DISTINCT t.`bingo_id`, s.`submitted_by_user_id`, 'big_spender', 'Moneybags'
	FROM `submissions` s
	JOIN `teams` t ON t.`id` = s.`team_id`
	JOIN `players` p ON p.`bingo_id` = t.`bingo_id` AND p.`user_id` = s.`submitted_by_user_id`
	JOIN `bingo_achievement_settings` st ON st.`bingo_id` = t.`bingo_id` AND st.`achievement_key` = 'big_spender' AND s.`created_at` >= st.`first_switched_on_at`
	WHERE s.`kind` = 'drop' AND (SELECT COALESCE(SUM(c.`gp_value`), 0) FROM `claims` c WHERE c.`submission_id` = s.`id`) >= 25000000
)
SELECT d.`bingo_id`, 'achievement.earned', 'mods', 'user', 'player', d.`user_id`, 'achievement', d.`key`, d.`name`, json_object('key', d.`key`, 'name', d.`name`), unixepoch() * 1000
FROM `due` d
WHERE NOT EXISTS (SELECT 1 FROM `achievement_earned` e WHERE e.`bingo_id` = d.`bingo_id` AND e.`user_id` = d.`user_id` AND e.`achievement_key` = d.`key`);
--> statement-breakpoint
INSERT INTO `achievement_earned` (`id`, `bingo_id`, `user_id`, `achievement_key`, `earned_at`, `popup_shown_at`)
WITH RECURSIVE
-- Players credited with a drop someone else posted, in a Live Bingo, on one of its Teams: the only ones whose
-- Achievements this moves.
`players` AS (
	SELECT DISTINCT t.`bingo_id`, s.`submitted_by_user_id` AS `user_id`
	FROM `submissions` s
	JOIN `teams` t ON t.`id` = s.`team_id`
	JOIN `bingos` b ON b.`id` = t.`bingo_id` AND b.`stage` = 'live'
	WHERE s.`kind` = 'drop' AND s.`posted_by_user_id` IS NOT NULL AND s.`posted_by_user_id` != s.`submitted_by_user_id`
		AND EXISTS (SELECT 1 FROM `team_members` tm JOIN `teams` tt ON tt.`id` = tm.`team_id` WHERE tt.`bingo_id` = t.`bingo_id` AND tm.`user_id` = s.`submitted_by_user_id`)
),
-- Their posting activity, once per Achievement switched on before it.
`posts` AS (
	SELECT a.`bingo_id`, a.`user_id`, a.`subject_id`, a.`tile_id`, a.`local_date`, a.`local_hour`, st.`achievement_key` AS `key`
	FROM `achievement_activity` a
	JOIN `players` p ON p.`bingo_id` = a.`bingo_id` AND p.`user_id` = a.`user_id`
	JOIN `bingo_achievement_settings` st ON st.`bingo_id` = a.`bingo_id` AND a.`occurred_at` >= st.`first_switched_on_at`
	WHERE a.`kind` = 'posted'
),
-- Every node above each leaf those drops claim (the leaf included): a Part with interest marked on it is one of them.
`up`(`leaf_id`, `node_id`) AS (
	SELECT DISTINCT c.`node_id`, c.`node_id` FROM `claims` c JOIN `posts` cp ON cp.`subject_id` = c.`submission_id`
	UNION
	SELECT `up`.`leaf_id`, e.`parent_id` FROM `node_edges` e JOIN `up` ON e.`child_id` = `up`.`node_id`
),
`due`(`bingo_id`, `user_id`, `key`, `name`) AS (
	SELECT DISTINCT `bingo_id`, `user_id`, 'strong_start', 'Strong start' FROM `posts` WHERE `key` = 'strong_start'
	UNION
	SELECT DISTINCT `bingo_id`, `user_id`, 'night_owl', 'Night owl' FROM `posts` WHERE `key` = 'night_owl' AND `local_hour` BETWEEN 2 AND 5
	UNION
	SELECT DISTINCT `bingo_id`, `user_id`, 'early_bird', 'Early bird' FROM `posts` WHERE `key` = 'early_bird' AND `local_hour` BETWEEN 6 AND 8
	UNION
	SELECT `bingo_id`, `user_id`, 'regular', 'Regular' FROM `posts` WHERE `key` = 'regular' GROUP BY `bingo_id`, `user_id` HAVING COUNT(DISTINCT `local_date`) >= 5
	UNION
	SELECT `bingo_id`, `user_id`, 'globetrotter', 'Globetrotter' FROM `posts` WHERE `key` = 'globetrotter' GROUP BY `bingo_id`, `user_id` HAVING COUNT(DISTINCT `tile_id`) >= 5
	UNION
	-- Called it: a drop claiming under a Part of its Tile they have interest marked on.
	SELECT DISTINCT cp.`bingo_id`, cp.`user_id`, 'called_it', 'Called it'
	FROM `posts` cp
	JOIN `claims` c ON c.`submission_id` = cp.`subject_id`
	JOIN `up` u ON u.`leaf_id` = c.`node_id`
	JOIN `tile_interests` ti ON ti.`user_id` = cp.`user_id` AND ti.`tile_id` = cp.`tile_id` AND ti.`task_id` = u.`node_id`
	WHERE cp.`key` = 'called_it'
	UNION
	-- Moneybags: a drop credited to them whose claims' Drop values come to 25m or more, posted since it was switched on.
	SELECT DISTINCT t.`bingo_id`, s.`submitted_by_user_id`, 'big_spender', 'Moneybags'
	FROM `submissions` s
	JOIN `teams` t ON t.`id` = s.`team_id`
	JOIN `players` p ON p.`bingo_id` = t.`bingo_id` AND p.`user_id` = s.`submitted_by_user_id`
	JOIN `bingo_achievement_settings` st ON st.`bingo_id` = t.`bingo_id` AND st.`achievement_key` = 'big_spender' AND s.`created_at` >= st.`first_switched_on_at`
	WHERE s.`kind` = 'drop' AND (SELECT COALESCE(SUM(c.`gp_value`), 0) FROM `claims` c WHERE c.`submission_id` = s.`id`) >= 25000000
)
SELECT lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))),
	d.`bingo_id`, d.`user_id`, d.`key`, unixepoch(), NULL
FROM `due` d
WHERE NOT EXISTS (SELECT 1 FROM `achievement_earned` e WHERE e.`bingo_id` = d.`bingo_id` AND e.`user_id` = d.`user_id` AND e.`achievement_key` = d.`key`);
