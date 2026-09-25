-- More starter Piece values (CONTEXT.md), like 0025: added once with no creator, owned by Admins from here. A piece that
-- already has a Piece value (matched case-insensitively, as the app does) is left alone.

INSERT INTO `piece_values` (`id`, `piece_item_name`, `whole_item_name`, `whole_quantity`, `divisor`) SELECT lower(hex(randomblob(16))), 'Dizana''s quiver', 'Sunfire splinters', 4000, 1 WHERE NOT EXISTS (SELECT 1 FROM `piece_values` WHERE lower(`piece_item_name`) = lower('Dizana''s quiver'));--> statement-breakpoint
INSERT INTO `piece_values` (`id`, `piece_item_name`, `whole_item_name`, `whole_quantity`, `divisor`) SELECT lower(hex(randomblob(16))), 'Mokhaiotl cloth', 'Confliction gauntlets', 1, 1 WHERE NOT EXISTS (SELECT 1 FROM `piece_values` WHERE lower(`piece_item_name`) = lower('Mokhaiotl cloth'));--> statement-breakpoint
INSERT OR IGNORE INTO `piece_value_other_pieces` (`id`, `piece_value_id`, `item_name`, `quantity`) SELECT lower(hex(randomblob(16))), `id`, 'Tormented bracelet', 1 FROM `piece_values` WHERE `piece_item_name` = 'Mokhaiotl cloth' AND `created_by_user_id` IS NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `piece_value_other_pieces` (`id`, `piece_value_id`, `item_name`, `quantity`) SELECT lower(hex(randomblob(16))), `id`, 'Demon tear', 10000 FROM `piece_values` WHERE `piece_item_name` = 'Mokhaiotl cloth' AND `created_by_user_id` IS NULL;--> statement-breakpoint
INSERT INTO `piece_values` (`id`, `piece_item_name`, `whole_item_name`, `whole_quantity`, `divisor`) SELECT lower(hex(randomblob(16))), 'Elder venator fang', 'Etched elder venator fang', 1, 1 WHERE NOT EXISTS (SELECT 1 FROM `piece_values` WHERE lower(`piece_item_name`) = lower('Elder venator fang'));--> statement-breakpoint
INSERT INTO `piece_values` (`id`, `piece_item_name`, `whole_item_name`, `whole_quantity`, `divisor`) SELECT lower(hex(randomblob(16))), 'Noxious point', 'Noxious halberd', 1, 3 WHERE NOT EXISTS (SELECT 1 FROM `piece_values` WHERE lower(`piece_item_name`) = lower('Noxious point'));--> statement-breakpoint
INSERT INTO `piece_values` (`id`, `piece_item_name`, `whole_item_name`, `whole_quantity`, `divisor`) SELECT lower(hex(randomblob(16))), 'Noxious blade', 'Noxious halberd', 1, 3 WHERE NOT EXISTS (SELECT 1 FROM `piece_values` WHERE lower(`piece_item_name`) = lower('Noxious blade'));--> statement-breakpoint
INSERT INTO `piece_values` (`id`, `piece_item_name`, `whole_item_name`, `whole_quantity`, `divisor`) SELECT lower(hex(randomblob(16))), 'Noxious pommel', 'Noxious halberd', 1, 3 WHERE NOT EXISTS (SELECT 1 FROM `piece_values` WHERE lower(`piece_item_name`) = lower('Noxious pommel'));--> statement-breakpoint
INSERT INTO `piece_values` (`id`, `piece_item_name`, `whole_item_name`, `whole_quantity`, `divisor`) SELECT lower(hex(randomblob(16))), 'Bludgeon axon', 'Abyssal bludgeon', 1, 3 WHERE NOT EXISTS (SELECT 1 FROM `piece_values` WHERE lower(`piece_item_name`) = lower('Bludgeon axon'));--> statement-breakpoint
INSERT INTO `piece_values` (`id`, `piece_item_name`, `whole_item_name`, `whole_quantity`, `divisor`) SELECT lower(hex(randomblob(16))), 'Bludgeon claw', 'Abyssal bludgeon', 1, 3 WHERE NOT EXISTS (SELECT 1 FROM `piece_values` WHERE lower(`piece_item_name`) = lower('Bludgeon claw'));--> statement-breakpoint
INSERT INTO `piece_values` (`id`, `piece_item_name`, `whole_item_name`, `whole_quantity`, `divisor`) SELECT lower(hex(randomblob(16))), 'Bludgeon spine', 'Abyssal bludgeon', 1, 3 WHERE NOT EXISTS (SELECT 1 FROM `piece_values` WHERE lower(`piece_item_name`) = lower('Bludgeon spine'));--> statement-breakpoint

-- Araxyte fang: valued as the Etched araxyte fang (on the GE) instead of Amulet of rancour − Amulet of torture. Only
-- the untouched starter from 0025 changes; one an Admin made or pointed elsewhere is left alone.
DELETE FROM `piece_value_other_pieces` WHERE `piece_value_id` IN (SELECT `id` FROM `piece_values` WHERE `piece_item_name` = 'Araxyte fang' AND `created_by_user_id` IS NULL AND `whole_item_name` = 'Amulet of rancour');--> statement-breakpoint
UPDATE `piece_values` SET `whole_item_name` = 'Etched araxyte fang', `updated_at` = unixepoch() WHERE `piece_item_name` = 'Araxyte fang' AND `created_by_user_id` IS NULL AND `whole_item_name` = 'Amulet of rancour';
--> statement-breakpoint

-- The Soulreaper axe also takes 2000 Blood runes to make, so each of its four pieces is (axe − 2000× Blood rune) ÷ 4.
-- Only the untouched starters from 0025 (still axe ÷ 4 with no other pieces) change.
INSERT OR IGNORE INTO `piece_value_other_pieces` (`id`, `piece_value_id`, `item_name`, `quantity`) SELECT lower(hex(randomblob(16))), `id`, 'Blood rune', 2000 FROM `piece_values` WHERE `piece_item_name` IN ('Executioner''s axe head', 'Leviathan''s lure', 'Siren''s staff', 'Eye of the duke') AND `created_by_user_id` IS NULL AND `whole_item_name` = 'Soulreaper axe' AND `divisor` = 4 AND `id` NOT IN (SELECT `piece_value_id` FROM `piece_value_other_pieces`);--> statement-breakpoint

-- 0025 spelled it "Eye of the duke"; the item (and its wiki icon) is "Eye of the Duke". Names match case-insensitively
-- for pricing, but the Piece values page shows and looks up the icon by this name.
UPDATE `piece_values` SET `piece_item_name` = 'Eye of the Duke', `updated_at` = unixepoch() WHERE `piece_item_name` = 'Eye of the duke' AND `created_by_user_id` IS NULL;
