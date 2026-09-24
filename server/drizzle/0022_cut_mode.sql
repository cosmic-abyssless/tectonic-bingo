ALTER TABLE `bingos` ADD `cut_mode` text DEFAULT 'even' NOT NULL;--> statement-breakpoint
-- Carry the old setting over: "cut" (the remainder cut) is now "even", "singles" (the remainder drafted last) is "none".
UPDATE `bingos` SET `cut_mode` = CASE `leftover_mode` WHEN 'singles' THEN 'none' ELSE 'even' END;
