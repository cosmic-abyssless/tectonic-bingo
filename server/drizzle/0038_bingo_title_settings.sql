CREATE TABLE `bingo_title_settings` (
	`bingo_id` text PRIMARY KEY NOT NULL,
	`settings_json` text NOT NULL,
	`title_ids_json` text NOT NULL,
	`frozen_at` integer NOT NULL,
	FOREIGN KEY (`bingo_id`) REFERENCES `bingos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
-- Backfill (#221): every Bingo already Finished keeps the Title settings in force now, resolved against today's
-- defaults (shared/titles.ts, written out here), and today's Titles. titleSettingsService reads it forgivingly.
INSERT INTO `bingo_title_settings` (`bingo_id`, `settings_json`, `title_ids_json`, `frozen_at`)
SELECT b.`id`,
	json_object(
		'minimums', json_patch('{"on_fire":10,"carry":1,"closer":1,"grinder":10,"butterfingers":2,"sniper":3,"collector":3,"tourist":3,"specialist":3,"hoarder":10,"postman":2,"overachiever":5}', json(coalesce(json_extract(s.`value_json`, '$.minimums'), '{}'))),
		'disabled', json(coalesce(json_extract(s.`value_json`, '$.disabled'), '[]')),
		'luck', json_patch('{"spoonDecay":0.5,"spoonMinLuck":1,"dryMinLuck":1,"clutchMinLuck":1}', json(coalesce(json_extract(s.`value_json`, '$.luck'), '{}')))
	),
	'["on_fire","carry","closer","clutch","grinder","spoon","butterfingers","dry","sniper","collector","tourist","specialist","hoarder","postman","overachiever"]',
	unixepoch()
FROM `bingos` b
LEFT JOIN `site_settings` s ON s.`key` = 'titles'
WHERE b.`stage` = 'complete';
