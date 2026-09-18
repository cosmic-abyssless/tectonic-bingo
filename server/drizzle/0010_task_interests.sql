-- Interest moves from "the whole tile" to "one part (task) of a tile". There is
-- no sensible way to map an old tile-wide hand to a specific part, so existing
-- rows are dropped; players re-raise their hand on the part they mean.
DELETE FROM `tile_interests`;--> statement-breakpoint
DROP INDEX `tile_interests_tile_user_unq`;--> statement-breakpoint
ALTER TABLE `tile_interests` ADD `task_id` text NOT NULL REFERENCES nodes(id);--> statement-breakpoint
CREATE UNIQUE INDEX `tile_interests_task_user_unq` ON `tile_interests` (`task_id`,`user_id`);
