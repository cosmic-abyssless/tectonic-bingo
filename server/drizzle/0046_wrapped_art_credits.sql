ALTER TABLE `bingos` ADD `wrapped_art_credits_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `wrapped_art` ADD `credit_name` text;--> statement-breakpoint
ALTER TABLE `wrapped_art` ADD `credit_role` text;--> statement-breakpoint
-- Credits (#281) move off the Bingo-wide list onto the art: the Outro used to caption its images with the list in
-- order (the first credit on the first image), so each of those images keeps its credit, and what was left over (more
-- credits than images) becomes the Outro's additional credits.
WITH `outro` AS (
	SELECT `wrapped_art`.`id`, `bingos`.`wrapped_credits_json` AS `credits`,
		row_number() OVER (PARTITION BY `wrapped_art`.`bingo_id` ORDER BY `wrapped_art`.`sort_order`, `wrapped_art`.`rowid`) - 1 AS `pos`
	FROM `wrapped_art` JOIN `bingos` ON `bingos`.`id` = `wrapped_art`.`bingo_id`
	WHERE `wrapped_art`.`section` = 'outro' AND json_valid(`bingos`.`wrapped_credits_json`)
)
UPDATE `wrapped_art` SET
	`credit_name` = (SELECT nullif(trim(json_extract(`credits`, '$[' || `pos` || '].name')), '') FROM `outro` WHERE `outro`.`id` = `wrapped_art`.`id`),
	`credit_role` = (SELECT nullif(trim(json_extract(`credits`, '$[' || `pos` || '].role')), '') FROM `outro` WHERE `outro`.`id` = `wrapped_art`.`id`)
WHERE `id` IN (SELECT `id` FROM `outro`);
--> statement-breakpoint
UPDATE `wrapped_art` SET `credit_role` = NULL WHERE `credit_name` IS NULL;
--> statement-breakpoint
UPDATE `bingos` SET `wrapped_art_credits_json` = json_object('outro', (
	SELECT json_group_array(json_object('name', trim(json_extract(`value`, '$.name')), 'role', nullif(trim(json_extract(`value`, '$.role')), '')))
	FROM (
		SELECT `value` FROM json_each(`bingos`.`wrapped_credits_json`)
		WHERE `key` >= (SELECT count(*) FROM `wrapped_art` WHERE `wrapped_art`.`bingo_id` = `bingos`.`id` AND `wrapped_art`.`section` = 'outro')
			AND trim(coalesce(json_extract(`value`, '$.name'), '')) <> ''
		ORDER BY `key`
	)
))
WHERE json_valid(`wrapped_credits_json`) AND json_array_length(`wrapped_credits_json`) > (SELECT count(*) FROM `wrapped_art` WHERE `wrapped_art`.`bingo_id` = `bingos`.`id` AND `wrapped_art`.`section` = 'outro');
