-- One item group per Collection log section (Abyssal Sire, Chambers of Xeric, Hard Treasure Trails, ...)
-- so the item picker can expand a boss/category into its drops. Generated from the wiki's
-- Collection_log page; groups are matched by name, so admin edits to other groups are untouched.
INSERT INTO item_groups (id, name, description) VALUES ('1881a7cc-b050-4762-9c0f-45cb7a387205', 'Abyssal Sire', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5487840c-8f40-4656-b4c2-28ab6f2582d5', id, 'Abyssal orphan' FROM item_groups WHERE name = 'Abyssal Sire';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2d9d8edd-75c1-4274-9a52-7fc8c1cfef41', id, 'Unsired' FROM item_groups WHERE name = 'Abyssal Sire';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1f20e148-ea38-43cb-9709-6a9cd2165ad0', id, 'Abyssal head' FROM item_groups WHERE name = 'Abyssal Sire';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'aeecb7f6-9567-4400-a7da-2882f07e1f0c', id, 'Bludgeon spine' FROM item_groups WHERE name = 'Abyssal Sire';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7a2c4f4c-6ff2-4183-b7b9-9ee26004fff8', id, 'Bludgeon claw' FROM item_groups WHERE name = 'Abyssal Sire';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ae352e30-720e-470b-a704-e8b1e773ce15', id, 'Bludgeon axon' FROM item_groups WHERE name = 'Abyssal Sire';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6b6deeef-e099-4add-a867-8a040e613710', id, 'Jar of Miasma' FROM item_groups WHERE name = 'Abyssal Sire';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ddddc608-7e46-475e-9f45-5586a3756057', id, 'Abyssal dagger' FROM item_groups WHERE name = 'Abyssal Sire';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2720d6f9-d2ed-459d-a8f5-6853efb28c5f', id, 'Abyssal whip' FROM item_groups WHERE name = 'Abyssal Sire';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('2bb01bff-11a3-41b5-af24-5d46975ac41a', 'Alchemical Hydra', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9709b5b8-047d-418b-a761-650c0f3a939e', id, 'Ikkle Hydra' FROM item_groups WHERE name = 'Alchemical Hydra';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd7928d7b-2176-4dac-929c-af1c8fb99fa9', id, 'Hydra''s claw' FROM item_groups WHERE name = 'Alchemical Hydra';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9916df8f-dc08-40c7-b743-2a8c603b967f', id, 'Hydra tail' FROM item_groups WHERE name = 'Alchemical Hydra';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '698ebba6-bdf3-4663-82a9-fc960ef40dd4', id, 'Hydra leather' FROM item_groups WHERE name = 'Alchemical Hydra';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a6bd86e8-0a64-4b2d-b37a-393fa034a744', id, 'Hydra''s fang' FROM item_groups WHERE name = 'Alchemical Hydra';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9eb61d48-6e89-46ef-b2c3-8ff0e921fc7e', id, 'Hydra''s eye' FROM item_groups WHERE name = 'Alchemical Hydra';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a3735c58-4f06-4d7b-aa40-536a4f997512', id, 'Hydra''s heart' FROM item_groups WHERE name = 'Alchemical Hydra';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9c90f8f2-b882-4944-90ab-2e1f36792076', id, 'Dragon knife' FROM item_groups WHERE name = 'Alchemical Hydra';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c12965e9-9ece-4838-bc75-1022d7742684', id, 'Dragon thrownaxe' FROM item_groups WHERE name = 'Alchemical Hydra';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd0e305ae-9637-45ee-891e-5c373e1d95c7', id, 'Jar of Chemicals' FROM item_groups WHERE name = 'Alchemical Hydra';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '082ae9e1-fa11-407e-bc0c-6aacfc1aa54a', id, 'Alchemical hydra heads' FROM item_groups WHERE name = 'Alchemical Hydra';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('b87f6df9-1658-42d3-b3b1-a9a52c0c8a37', 'Amoxliatl', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f03dbb22-ba29-4945-b02b-9d9d2fad882b', id, 'Moxi' FROM item_groups WHERE name = 'Amoxliatl';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '180bbdf3-8581-458c-ab64-4cd195e1e32f', id, 'Glacial temotli' FROM item_groups WHERE name = 'Amoxliatl';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8787568f-05dc-4f91-aebd-538681e66e1c', id, 'Pendant of Ates (inert)' FROM item_groups WHERE name = 'Amoxliatl';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6b96de33-75b9-4796-abda-6b22095e7118', id, 'Frozen tear' FROM item_groups WHERE name = 'Amoxliatl';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('272cc79b-f016-490a-8743-c7ec5e35533b', 'Araxxor', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9821c03c-2fca-4cf2-9fa2-60c0b416a650', id, 'Nid' FROM item_groups WHERE name = 'Araxxor';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd2c21567-083c-4a67-a7b0-51c499ec5f1c', id, 'Araxyte venom sac' FROM item_groups WHERE name = 'Araxxor';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '145321a5-3d95-4d7b-bff0-b2c9f6df18fe', id, 'Spider cave teleport' FROM item_groups WHERE name = 'Araxxor';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1c2ae457-8b55-4e68-9fa2-517cd29e5183', id, 'Araxyte fang' FROM item_groups WHERE name = 'Araxxor';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6bc2e891-f76c-4cf7-9fd6-2973fee68063', id, 'Noxious point' FROM item_groups WHERE name = 'Araxxor';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8e3183e2-5456-4683-8e35-734898dff4dd', id, 'Noxious blade' FROM item_groups WHERE name = 'Araxxor';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4be7de84-435b-4f09-b060-b83d45223e32', id, 'Noxious pommel' FROM item_groups WHERE name = 'Araxxor';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7860697e-bfea-4b64-ac1c-e7f4f2a21d7a', id, 'Araxyte head' FROM item_groups WHERE name = 'Araxxor';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'acfe57d5-1111-478f-b1df-b754d3158d51', id, 'Jar of Venom' FROM item_groups WHERE name = 'Araxxor';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c352e208-ecf5-426d-a9fd-a20e222e8a82', id, 'Coagulated venom' FROM item_groups WHERE name = 'Araxxor';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('63f5e12e-8e04-40a7-9f7d-b00fa916a322', 'Barrows Chests', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7bb0b008-91c9-416a-8707-6d7493767aa8', id, 'Karil''s coif' FROM item_groups WHERE name = 'Barrows Chests';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '36d73ed1-af10-472a-908a-8329eb2bdf11', id, 'Karil''s leathertop' FROM item_groups WHERE name = 'Barrows Chests';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '36abad85-0f3d-498c-8ed2-2f178688d59c', id, 'Karil''s leatherskirt' FROM item_groups WHERE name = 'Barrows Chests';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '750cfd18-bf2e-46a2-914f-8436ac0498be', id, 'Karil''s crossbow' FROM item_groups WHERE name = 'Barrows Chests';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c0d930ae-c91e-4e38-bcc6-44927666bcd7', id, 'Ahrim''s hood' FROM item_groups WHERE name = 'Barrows Chests';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '39e499c3-4daf-4f2e-b6e5-bde9a0879a83', id, 'Ahrim''s robetop' FROM item_groups WHERE name = 'Barrows Chests';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2a698b37-2c25-431d-a26e-b49ef67e5312', id, 'Ahrim''s robeskirt' FROM item_groups WHERE name = 'Barrows Chests';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b394fecd-836f-4016-807f-6c9d0f8e0217', id, 'Ahrim''s staff' FROM item_groups WHERE name = 'Barrows Chests';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '54ff83a4-7fe0-4ada-ae2e-b364557a7419', id, 'Dharok''s helm' FROM item_groups WHERE name = 'Barrows Chests';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5a8bdbfb-cb7e-4821-a01b-bab2e5a6c1de', id, 'Dharok''s platebody' FROM item_groups WHERE name = 'Barrows Chests';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b2979787-5b3f-4009-899f-7ae57a99ebe7', id, 'Dharok''s platelegs' FROM item_groups WHERE name = 'Barrows Chests';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1b49494d-2028-4729-a390-fc4442b8432c', id, 'Dharok''s greataxe' FROM item_groups WHERE name = 'Barrows Chests';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4f3ee592-55a8-4df5-a0c6-72be07d5fbff', id, 'Guthan''s helm' FROM item_groups WHERE name = 'Barrows Chests';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1b07ee13-5a54-4a63-b98d-6c0f11c4d828', id, 'Guthan''s platebody' FROM item_groups WHERE name = 'Barrows Chests';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ce4547f4-ef53-4007-b10a-d5d0afcd3c39', id, 'Guthan''s chainskirt' FROM item_groups WHERE name = 'Barrows Chests';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a1caff63-ed09-4686-910b-920ebdca0142', id, 'Guthan''s warspear' FROM item_groups WHERE name = 'Barrows Chests';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4e41ff35-6d53-4743-ada9-bd9552588530', id, 'Torag''s helm' FROM item_groups WHERE name = 'Barrows Chests';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5482c651-7b41-46eb-8ff1-04d36bc3a9ff', id, 'Torag''s platebody' FROM item_groups WHERE name = 'Barrows Chests';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7385e707-7c75-41b6-99d1-1c82ce3bad83', id, 'Torag''s platelegs' FROM item_groups WHERE name = 'Barrows Chests';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '506ad6ee-909a-4ccb-8ac3-a854821e89a2', id, 'Torag''s hammers' FROM item_groups WHERE name = 'Barrows Chests';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'bb6524ec-4086-4b3d-9c33-355dc6e77eb9', id, 'Verac''s helm' FROM item_groups WHERE name = 'Barrows Chests';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8bf8d006-0797-4a9b-a12b-4f2f5695c946', id, 'Verac''s brassard' FROM item_groups WHERE name = 'Barrows Chests';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2a228f62-0e28-4e90-a624-e04a0c90d41a', id, 'Verac''s plateskirt' FROM item_groups WHERE name = 'Barrows Chests';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '196f8b75-dc02-4d7c-a067-982106a00045', id, 'Verac''s flail' FROM item_groups WHERE name = 'Barrows Chests';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e6029afd-013c-42a3-81ec-441d784d447f', id, 'Bolt rack' FROM item_groups WHERE name = 'Barrows Chests';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('37f6f142-b6f6-47f6-b993-bea249054068', 'Brutus', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2f4910d1-28ff-498e-9c41-606a9dd59922', id, 'Beef' FROM item_groups WHERE name = 'Brutus';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '99d070c9-68db-4a96-b79d-eea5b69533fe', id, 'Mooleta' FROM item_groups WHERE name = 'Brutus';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '12e9a646-aa08-410b-b429-3913cdb4aa17', id, 'Bottomless milk bucket (empty)' FROM item_groups WHERE name = 'Brutus';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3acb1b01-40e3-4179-baa9-c9d969919289', id, 'Cow slippers' FROM item_groups WHERE name = 'Brutus';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('be3be445-a2b8-48c0-9a79-2215af7d3768', 'Bryophyta', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'af8a887e-c820-4c78-a3a8-fb01520e9f9a', id, 'Bryophyta''s essence' FROM item_groups WHERE name = 'Bryophyta';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('93c0ff24-c96c-4caa-b894-3d1592ebc427', 'Callisto and Artio', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '23f9ec12-8131-4c83-a7c8-c4d6c850355d', id, 'Callisto cub' FROM item_groups WHERE name = 'Callisto and Artio';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '53b64f2d-6cf2-48c6-8baa-360d1ff7043c', id, 'Tyrannical ring' FROM item_groups WHERE name = 'Callisto and Artio';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'cefca251-aff6-4c30-bc46-65d8da40105a', id, 'Dragon pickaxe' FROM item_groups WHERE name = 'Callisto and Artio';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9189dd34-21bd-41f2-9256-a6707729f210', id, 'Dragon 2h sword' FROM item_groups WHERE name = 'Callisto and Artio';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2a415847-3b34-4e60-a9db-c1c183c9554f', id, 'Claws of Callisto' FROM item_groups WHERE name = 'Callisto and Artio';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2c8bff55-cf5f-4cf3-9e6d-a5ffb3e6d1ae', id, 'Voidwaker hilt' FROM item_groups WHERE name = 'Callisto and Artio';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('bfe83d93-632b-425f-8189-aec14f7ed338', 'Cerberus', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'da176440-feb7-4d79-95f2-20f9eecba538', id, 'Hellpuppy' FROM item_groups WHERE name = 'Cerberus';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '01a5eea1-9ef8-44b8-af33-1e4e7b6f10a8', id, 'Eternal crystal' FROM item_groups WHERE name = 'Cerberus';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4f52a043-9000-47d5-ad35-55cb113694be', id, 'Pegasian crystal' FROM item_groups WHERE name = 'Cerberus';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3836378b-6b54-435b-95d3-bba1d287205e', id, 'Primordial crystal' FROM item_groups WHERE name = 'Cerberus';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '51af66fb-0b7e-4c0a-b018-b09993f7dc67', id, 'Jar of Souls' FROM item_groups WHERE name = 'Cerberus';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '36185864-4c23-4055-bd26-dc168524e7d4', id, 'Smouldering stone' FROM item_groups WHERE name = 'Cerberus';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8e057dc9-9060-4fcf-9b01-99756f9b78c2', id, 'Key master teleport' FROM item_groups WHERE name = 'Cerberus';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('b93eb391-0b89-401e-a3b3-0226050dc2d9', 'Chaos Elemental', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c71ec075-c1e5-4573-8c37-436391dd508d', id, 'Pet Chaos Elemental' FROM item_groups WHERE name = 'Chaos Elemental';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9d8feb4c-cda3-4467-a124-40cd0f1ad51c', id, 'Dragon pickaxe' FROM item_groups WHERE name = 'Chaos Elemental';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'cab97e6f-0e3b-4f46-ac76-7510afdd5164', id, 'Dragon 2h sword' FROM item_groups WHERE name = 'Chaos Elemental';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('ccb86176-e989-4714-967b-3b125d97c10b', 'Chaos Fanatic', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a07a46fd-2d8a-4d4c-bd5f-e98d03ad38d2', id, 'Pet Chaos Elemental' FROM item_groups WHERE name = 'Chaos Fanatic';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1885eab5-d743-4aa0-898c-edfa1662ca26', id, 'Odium shard 1' FROM item_groups WHERE name = 'Chaos Fanatic';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1d503df1-30ee-47bb-8eb8-367039c49a12', id, 'Malediction shard 1' FROM item_groups WHERE name = 'Chaos Fanatic';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('9d5bc8a2-4fcb-48fd-93b9-0cb62f8b4bd9', 'Commander Zilyana', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9cfeae52-fc22-4d1c-8f13-18d7aa6878c5', id, 'Pet Zilyana' FROM item_groups WHERE name = 'Commander Zilyana';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4da059b6-79dc-4c47-bc54-2517fdbaeb9f', id, 'Armadyl crossbow' FROM item_groups WHERE name = 'Commander Zilyana';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'cf18b386-8fea-4413-86fc-3ad12ac39cf4', id, 'Saradomin hilt' FROM item_groups WHERE name = 'Commander Zilyana';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'eaef91b3-447b-4bb0-9ee1-f8333a074fc1', id, 'Saradomin sword' FROM item_groups WHERE name = 'Commander Zilyana';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0779426a-cce0-418f-b8d1-78f0d31ee464', id, 'Saradomin''s light' FROM item_groups WHERE name = 'Commander Zilyana';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '66faacb6-bfd4-4ba3-a91d-96d029bca08c', id, 'Godsword shard 1' FROM item_groups WHERE name = 'Commander Zilyana';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '62bea49b-907f-48c7-8145-e2aab64bdfd4', id, 'Godsword shard 2' FROM item_groups WHERE name = 'Commander Zilyana';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3da44258-2b50-458d-9223-6ec5144886ee', id, 'Godsword shard 3' FROM item_groups WHERE name = 'Commander Zilyana';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('049bcf11-18e5-48d1-b37a-4c0adc3ab0ad', 'Corporeal Beast', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6874badc-3f3e-4aa9-b275-3fd6e4cba760', id, 'Pet dark core' FROM item_groups WHERE name = 'Corporeal Beast';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6332408e-2f7c-4e14-90fa-aa5fac866343', id, 'Elysian sigil' FROM item_groups WHERE name = 'Corporeal Beast';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '306912cc-0f69-449c-ac48-14379ee911ab', id, 'Spectral sigil' FROM item_groups WHERE name = 'Corporeal Beast';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3d37d852-11ab-4c2e-97cb-d82ec1db5dbc', id, 'Arcane sigil' FROM item_groups WHERE name = 'Corporeal Beast';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '26e55b13-c33b-4773-a664-574294c576d7', id, 'Holy elixir' FROM item_groups WHERE name = 'Corporeal Beast';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd3dbd6ad-eb8c-4fd6-86e9-a51b41afc06f', id, 'Spirit shield' FROM item_groups WHERE name = 'Corporeal Beast';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b0b3f86f-d91d-40c7-bf45-5ebad104fa11', id, 'Jar of Spirits' FROM item_groups WHERE name = 'Corporeal Beast';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('720a0b49-194d-4506-8ed8-d6b46b617313', 'Crazy archaeologist', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '713d7ac9-84d6-4f97-be41-2aad7b5bcab6', id, 'Odium shard 2' FROM item_groups WHERE name = 'Crazy archaeologist';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2fec3b7a-ef76-4b8d-93da-21ba7b1664ca', id, 'Malediction shard 2' FROM item_groups WHERE name = 'Crazy archaeologist';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ae9c8166-db5e-495c-b7e0-8e763fe834ff', id, 'Fedora' FROM item_groups WHERE name = 'Crazy archaeologist';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('a10f838c-ea83-4b4e-8386-e8679586615a', 'Dagannoth Kings', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '895efb79-2064-48b5-bb30-283fab65287b', id, 'Pet Dagannoth Prime' FROM item_groups WHERE name = 'Dagannoth Kings';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f8cc9d56-a975-48d6-b88c-5b88693769ab', id, 'Pet Dagannoth Supreme' FROM item_groups WHERE name = 'Dagannoth Kings';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ee1ce51f-0826-49cd-8901-9344a6b27e52', id, 'Pet Dagannoth Rex' FROM item_groups WHERE name = 'Dagannoth Kings';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a2548581-fb04-48f3-bbf2-4eacb4fc7c76', id, 'Berserker ring' FROM item_groups WHERE name = 'Dagannoth Kings';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '43119253-a170-4318-bc57-c804b936da86', id, 'Archers ring' FROM item_groups WHERE name = 'Dagannoth Kings';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '032e5c14-ed9e-428f-a014-bc50b8a8fee6', id, 'Seers ring' FROM item_groups WHERE name = 'Dagannoth Kings';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'acd71cbd-34e0-46dd-9d68-7cbfc1038be1', id, 'Warrior ring' FROM item_groups WHERE name = 'Dagannoth Kings';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd1f94ba2-8307-479d-ad06-a4a5cb54c5a7', id, 'Dragon axe' FROM item_groups WHERE name = 'Dagannoth Kings';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd50d8aaf-66e6-4a97-8ad6-f228ddf74bd3', id, 'Seercull' FROM item_groups WHERE name = 'Dagannoth Kings';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b4139638-38d6-4ae2-b84d-ace596793f0c', id, 'Mud battlestaff' FROM item_groups WHERE name = 'Dagannoth Kings';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('b16e6394-ed28-4044-a1ce-ca6fe1e31b8f', 'Deranged Archaeologist', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '62547fd3-ff3b-4534-8cce-d1d74c86e509', id, 'Steel ring' FROM item_groups WHERE name = 'Deranged Archaeologist';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('62f6ee07-d564-4891-b142-98ef4927fc53', 'Doom of Mokhaiotl', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '43a601c3-a4c9-42a7-a133-f8438d0e83cd', id, 'Dom' FROM item_groups WHERE name = 'Doom of Mokhaiotl';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9d49d9bb-5ffc-417e-9366-4fc6c0ce5faa', id, 'Avernic treads' FROM item_groups WHERE name = 'Doom of Mokhaiotl';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'bb473844-bf82-4dc4-93ac-eb5b65e665c3', id, 'Eye of Ayak (uncharged)' FROM item_groups WHERE name = 'Doom of Mokhaiotl';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '724ef4de-cb0b-416f-adfd-ccdfe624eb81', id, 'Mokhaiotl cloth' FROM item_groups WHERE name = 'Doom of Mokhaiotl';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c84bc412-b434-4595-aef4-f3b2a34d91be', id, 'Mokhaiotl waystone' FROM item_groups WHERE name = 'Doom of Mokhaiotl';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '343e169c-d7e4-4259-ad4f-eb1c554f8bc4', id, 'Demon tear' FROM item_groups WHERE name = 'Doom of Mokhaiotl';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('b2143884-13bf-4f10-9f92-519257815bdc', 'Duke Sucellus', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd17791a2-5b3f-497d-9201-e8522937b833', id, 'Baron' FROM item_groups WHERE name = 'Duke Sucellus';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '36542837-b56f-498d-898c-3d6751a93cfb', id, 'Eye of the Duke' FROM item_groups WHERE name = 'Duke Sucellus';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '75b27189-47b0-4aa7-8b67-d925bd88c469', id, 'Virtus mask' FROM item_groups WHERE name = 'Duke Sucellus';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c6d7150d-7287-45cd-87a5-db682ce6e3c0', id, 'Virtus robe top' FROM item_groups WHERE name = 'Duke Sucellus';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6e756a87-d218-4658-9a4a-17dd4a23539a', id, 'Virtus robe bottom' FROM item_groups WHERE name = 'Duke Sucellus';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0c9a6cdd-b3c3-4d76-911b-2a4f95d69266', id, 'Magus vestige' FROM item_groups WHERE name = 'Duke Sucellus';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '05174804-1612-4d0b-8736-c765cc884520', id, 'Ice quartz' FROM item_groups WHERE name = 'Duke Sucellus';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'de7307a0-cc3d-4250-acbd-7605f865e4ac', id, 'Frozen tablet' FROM item_groups WHERE name = 'Duke Sucellus';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '064bceb5-95d6-466c-9d99-55c13a8f94c2', id, 'Chromium ingot' FROM item_groups WHERE name = 'Duke Sucellus';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'bc9e0c8c-597b-4fc7-ba9d-74eb9992f86f', id, 'Awakener''s orb' FROM item_groups WHERE name = 'Duke Sucellus';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('b19f13c4-7009-41b1-8042-81083c1916bb', 'The Fight Caves', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b41ea892-20f7-47c6-a8d8-054078750724', id, 'TzRek-Jad' FROM item_groups WHERE name = 'The Fight Caves';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c0f04571-29ca-4db3-875c-d3583269b849', id, 'Fire cape' FROM item_groups WHERE name = 'The Fight Caves';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('9d71c837-f522-4bf9-b010-7467cb2b088d', 'Fortis Colosseum', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '483a6ffd-b34b-4f00-b2be-bb8e496d0550', id, 'Smol Heredit' FROM item_groups WHERE name = 'Fortis Colosseum';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '85a17bfd-c030-4b3c-8622-f115f710c74e', id, 'Dizana''s quiver (uncharged)' FROM item_groups WHERE name = 'Fortis Colosseum';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4d05ec68-b25b-4a00-be6e-bf74acfd4a4a', id, 'Sunfire fanatic cuirass' FROM item_groups WHERE name = 'Fortis Colosseum';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '50edf051-e286-4af4-b5e2-6107091b450e', id, 'Sunfire fanatic chausses' FROM item_groups WHERE name = 'Fortis Colosseum';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'db4a0151-9f2f-427f-a41b-e590f26ec20f', id, 'Sunfire fanatic helm' FROM item_groups WHERE name = 'Fortis Colosseum';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd9281cde-3c2c-4293-8f17-96ff5ce57032', id, 'Echo crystal' FROM item_groups WHERE name = 'Fortis Colosseum';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2d658ebd-99e4-4fd5-91ac-133b53eaf87c', id, 'Tonalztics of Ralos (uncharged)' FROM item_groups WHERE name = 'Fortis Colosseum';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '548a3178-2604-45df-9d77-c8358121168e', id, 'Sunfire splinters' FROM item_groups WHERE name = 'Fortis Colosseum';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3db54372-9089-4b2f-98b7-9d1bbf58b5bb', id, 'Uncut onyx' FROM item_groups WHERE name = 'Fortis Colosseum';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('3c21e688-371b-452a-9439-5fb2976710ff', 'The Gauntlet', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '966836fe-78fc-42c5-902d-d8a637cac3a2', id, 'Youngllef' FROM item_groups WHERE name = 'The Gauntlet';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1c059ef8-3e6e-4ca9-8dec-f61f71738ad9', id, 'Crystal armour seed' FROM item_groups WHERE name = 'The Gauntlet';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c9cd8b38-3719-4a15-9342-545999e72d1a', id, 'Crystal weapon seed' FROM item_groups WHERE name = 'The Gauntlet';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b4f86387-cdc0-48b5-b2ca-5c5421d91bf3', id, 'Enhanced crystal weapon seed' FROM item_groups WHERE name = 'The Gauntlet';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5a1d4ba9-f2e3-4426-84e8-76e207d83a87', id, 'Gauntlet cape' FROM item_groups WHERE name = 'The Gauntlet';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('8cefdef3-f1fd-4323-8fed-fbe69d28b8c5', 'General Graardor', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '875fed30-af07-48d5-999a-e013f14dfeed', id, 'Pet General Graardor' FROM item_groups WHERE name = 'General Graardor';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3085aeeb-f634-487b-894d-19f105ffbc30', id, 'Bandos chestplate' FROM item_groups WHERE name = 'General Graardor';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '475ba4ed-ee98-4e33-aa5e-8db70d1755bd', id, 'Bandos tassets' FROM item_groups WHERE name = 'General Graardor';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'eef05236-2fc5-465c-9e36-5af509099ed8', id, 'Bandos boots' FROM item_groups WHERE name = 'General Graardor';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '708b88ce-2517-4cb5-9166-de2b7cbf614b', id, 'Bandos hilt' FROM item_groups WHERE name = 'General Graardor';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e3dfc6b0-e368-4a9b-8be4-feedf1aa7e6b', id, 'Godsword shard 1' FROM item_groups WHERE name = 'General Graardor';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3579b824-dcae-4b8c-89eb-8d3e8d392b03', id, 'Godsword shard 2' FROM item_groups WHERE name = 'General Graardor';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f529ccb1-567b-4a6e-abe8-2e06e9580080', id, 'Godsword shard 3' FROM item_groups WHERE name = 'General Graardor';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('4c87b7c3-ccf7-4261-b95b-a777c1210a22', 'Giant Mole', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '064e465d-2756-40e2-88a1-fd45451bbf88', id, 'Baby Mole' FROM item_groups WHERE name = 'Giant Mole';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'be3365d0-39a6-47a7-83b1-64258081b551', id, 'Mole skin' FROM item_groups WHERE name = 'Giant Mole';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '343c5fee-f385-4685-a765-bb756a92556a', id, 'Mole claw' FROM item_groups WHERE name = 'Giant Mole';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c87c8b41-cf7f-4f7d-9738-ad47a6e36c9c', id, 'Immaculate mole skin' FROM item_groups WHERE name = 'Giant Mole';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('a5e3f564-63a2-4743-a4d5-3bf2565b0390', 'Grotesque Guardians', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'dfaa042a-f613-4aff-b072-b09e32d2149e', id, 'Noon' FROM item_groups WHERE name = 'Grotesque Guardians';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd69a85a4-50e0-4e53-8c54-c21a514e5c66', id, 'Black tourmaline core' FROM item_groups WHERE name = 'Grotesque Guardians';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b1d4b0c4-a366-4720-bd39-ab5e8d1cdbe5', id, 'Granite gloves' FROM item_groups WHERE name = 'Grotesque Guardians';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '172bca57-bab7-40c5-9a66-4021cacb0ee1', id, 'Granite ring' FROM item_groups WHERE name = 'Grotesque Guardians';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a6c22b5d-4612-429d-ae7a-2bde5866b490', id, 'Granite hammer' FROM item_groups WHERE name = 'Grotesque Guardians';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9a2f3a40-2ea3-4b40-ac6d-dc830359b39a', id, 'Jar of Stone' FROM item_groups WHERE name = 'Grotesque Guardians';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'cb59112b-bc54-4377-9126-433b6da99319', id, 'Granite dust' FROM item_groups WHERE name = 'Grotesque Guardians';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('eedae423-775b-4001-83f4-4f577e8d284e', 'Hespori', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '06b29402-35b3-44c1-b203-f2a2e770b3f8', id, 'Bottomless compost bucket' FROM item_groups WHERE name = 'Hespori';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'aa6111b3-ae39-4983-899e-25fa3a436187', id, 'Iasor seed' FROM item_groups WHERE name = 'Hespori';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '279898fd-1908-437e-af88-dc0142b0ba30', id, 'Kronos seed' FROM item_groups WHERE name = 'Hespori';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9ecd17fb-4a23-430a-9422-abc3b802b62f', id, 'Attas seed' FROM item_groups WHERE name = 'Hespori';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('3dec154e-beee-48a9-8a3e-8571da1c8187', 'The Hueycoatl', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'aa23955b-5de7-4f4e-88cf-b08cdc54bc5c', id, 'Huberte' FROM item_groups WHERE name = 'The Hueycoatl';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '890a8e6c-24b7-4f85-8c0b-e3316d1a04ea', id, 'Dragon hunter wand' FROM item_groups WHERE name = 'The Hueycoatl';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b3dc12b7-7fb3-494b-9ea6-47b0eab6e6e7', id, 'Tome of Earth (empty)' FROM item_groups WHERE name = 'The Hueycoatl';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a7abf430-8175-4982-982c-d7d17798ac39', id, 'Soiled page' FROM item_groups WHERE name = 'The Hueycoatl';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '12b7543e-068a-44aa-ba18-e6cbfee35a69', id, 'Hueycoatl hide' FROM item_groups WHERE name = 'The Hueycoatl';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ad3d82e6-4764-4b9c-b11e-7449f13b14dc', id, 'Huasca seed' FROM item_groups WHERE name = 'The Hueycoatl';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('16893018-fcb0-46de-9273-fbe1afdca0ee', 'The Inferno', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '23f781f5-0a12-4e8e-9ea4-9c50d66aa80d', id, 'Jal-Nib-Rek' FROM item_groups WHERE name = 'The Inferno';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '58464e26-20a5-4813-ae0c-fbd2ead3d2a6', id, 'Infernal cape' FROM item_groups WHERE name = 'The Inferno';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('945a166e-eb01-4744-919a-784432997b30', 'Kalphite Queen', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e6a36878-c1da-4949-8e0a-cabfff2cb1dd', id, 'Kalphite Princess' FROM item_groups WHERE name = 'Kalphite Queen';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ab605c44-a639-4f91-b458-9f6656eebe03', id, 'Kq head' FROM item_groups WHERE name = 'Kalphite Queen';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2140c48d-171d-46af-8882-822e00c86e09', id, 'Jar of Sand' FROM item_groups WHERE name = 'Kalphite Queen';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '01308e61-5a70-471b-bee1-e1aca06a69b1', id, 'Dragon 2h sword' FROM item_groups WHERE name = 'Kalphite Queen';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'bf9e6017-c5d3-4453-abe7-c80af2357be9', id, 'Dragon chainbody' FROM item_groups WHERE name = 'Kalphite Queen';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '216ebefc-3eb4-4d6f-8ab3-3f33821da582', id, 'Dragon pickaxe' FROM item_groups WHERE name = 'Kalphite Queen';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('a4af0d85-86a0-4845-ab55-f333211ea7e2', 'King Black Dragon', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4e20f915-2fc2-4d5a-8de7-ca6e6e86bdb1', id, 'Prince Black Dragon' FROM item_groups WHERE name = 'King Black Dragon';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd682b256-5fc2-48f0-947d-a3df34ebe967', id, 'Kbd heads' FROM item_groups WHERE name = 'King Black Dragon';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1c02ce99-9163-4d7a-a546-edbc491ce26f', id, 'Dragon pickaxe' FROM item_groups WHERE name = 'King Black Dragon';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a228a67c-22e7-4e89-a30f-84e3571aad9a', id, 'Draconic visage' FROM item_groups WHERE name = 'King Black Dragon';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('0a448258-bb2c-4181-8fcd-b5bfff65e143', 'Kraken', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f27c9900-f041-4832-8c35-b64ac9e6f281', id, 'Pet Kraken' FROM item_groups WHERE name = 'Kraken';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '658ccda9-a20d-43b4-8542-816d9e999332', id, 'Kraken tentacle' FROM item_groups WHERE name = 'Kraken';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8a4b01ca-4b67-4de0-8cd5-c89d9b54ed6e', id, 'Trident of the Seas' FROM item_groups WHERE name = 'Kraken';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '28ba642d-79a5-442d-8483-5f6de116100d', id, 'Jar of Dirt' FROM item_groups WHERE name = 'Kraken';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('676d28cf-fa56-40c8-8d97-3ae0a79613ed', 'Kree''arra', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2c8e77d3-3807-4fbf-bde2-30f054de0508', id, 'Pet Kree''arra' FROM item_groups WHERE name = 'Kree''arra';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2376e3fc-8665-491e-9865-404385531509', id, 'Armadyl helmet' FROM item_groups WHERE name = 'Kree''arra';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '77c94054-8a4c-4ca6-9927-767ba2b9fdd8', id, 'Armadyl chestplate' FROM item_groups WHERE name = 'Kree''arra';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '40f09de3-d723-4c2b-ab99-1f8825c29cc9', id, 'Armadyl chainskirt' FROM item_groups WHERE name = 'Kree''arra';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '541052bb-fee6-4983-a105-5722c78254b2', id, 'Armadyl hilt' FROM item_groups WHERE name = 'Kree''arra';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '82471ba4-437a-4b6f-a3dd-89c60b5f648f', id, 'Godsword shard 1' FROM item_groups WHERE name = 'Kree''arra';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7042fd1e-0c37-4cf3-a122-96cc5b925304', id, 'Godsword shard 2' FROM item_groups WHERE name = 'Kree''arra';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4652b6b2-a9ba-40d7-afe2-0d049517fe82', id, 'Godsword shard 3' FROM item_groups WHERE name = 'Kree''arra';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('61a45ace-3b87-4d8e-939d-48941f24505c', 'K''ril Tsutsaroth', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e2c45263-8a45-4d35-b3da-fb121237177f', id, 'Pet K''ril Tsutsaroth' FROM item_groups WHERE name = 'K''ril Tsutsaroth';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '47297039-2c82-4985-926e-e6aa8e0814b6', id, 'Staff of the Dead' FROM item_groups WHERE name = 'K''ril Tsutsaroth';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'fce8f12f-c796-4f67-a2f4-b788d56bb55e', id, 'Zamorakian spear' FROM item_groups WHERE name = 'K''ril Tsutsaroth';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '297a036e-8e56-4093-aeae-d2adbb76f058', id, 'Steam battlestaff' FROM item_groups WHERE name = 'K''ril Tsutsaroth';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '84846ba5-e858-4e98-b678-9b58390d6494', id, 'Zamorak hilt' FROM item_groups WHERE name = 'K''ril Tsutsaroth';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '22785f73-9641-4ccf-8fc1-0f3811f773a1', id, 'Godsword shard 1' FROM item_groups WHERE name = 'K''ril Tsutsaroth';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '796de62e-d7df-4f72-bf86-533634482c5e', id, 'Godsword shard 2' FROM item_groups WHERE name = 'K''ril Tsutsaroth';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9cf0b9bf-7190-422f-986b-1342660c059a', id, 'Godsword shard 3' FROM item_groups WHERE name = 'K''ril Tsutsaroth';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('28c7816f-9a62-4460-9175-9acbeaf8ebbd', 'The Leviathan', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '30d0eaa4-8362-48dc-87cc-b2f356cbb1b6', id, 'Lil''viathan' FROM item_groups WHERE name = 'The Leviathan';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0f402efd-1fef-4f3e-9d4f-7a09755eca0b', id, 'Leviathan''s lure' FROM item_groups WHERE name = 'The Leviathan';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9718f202-f5e7-40db-bc17-b7af088487d8', id, 'Virtus mask' FROM item_groups WHERE name = 'The Leviathan';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4763a3e2-f9f3-4a9c-8ba7-650bf536a0fc', id, 'Virtus robe top' FROM item_groups WHERE name = 'The Leviathan';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '110f20d5-64fa-4ce4-b278-ae6807099685', id, 'Virtus robe bottom' FROM item_groups WHERE name = 'The Leviathan';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '70200643-44f9-468b-bed8-edcbfa8d4b48', id, 'Venator vestige' FROM item_groups WHERE name = 'The Leviathan';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1922e384-1d39-443f-9095-12411bb6aec2', id, 'Smoke quartz' FROM item_groups WHERE name = 'The Leviathan';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '90de6705-f30f-43c2-b603-54717bf0699b', id, 'Scarred tablet' FROM item_groups WHERE name = 'The Leviathan';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '599da52d-aa6e-4169-a8be-eb826928e268', id, 'Chromium ingot' FROM item_groups WHERE name = 'The Leviathan';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5627a63c-a4bd-4231-aef5-08133ed8033b', id, 'Awakener''s orb' FROM item_groups WHERE name = 'The Leviathan';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('d6a46b15-76c1-49b8-82fc-37148366b288', 'The Mad Angel', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'bfbbdaa3-e57e-48f3-9622-56a7761b07a3', id, 'Aggy' FROM item_groups WHERE name = 'The Mad Angel';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'bae47f59-20dd-4cb1-a579-7b6e9ab99df0', id, 'Hallowfell' FROM item_groups WHERE name = 'The Mad Angel';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '026e8087-27ef-403f-a9e6-d321fa50d165', id, 'Ardeaglais teleport' FROM item_groups WHERE name = 'The Mad Angel';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f068c111-39f5-434f-94eb-0317ab4ceb9b', id, 'Granite dust' FROM item_groups WHERE name = 'The Mad Angel';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f2b52f45-da82-4d38-bd21-278e229edb27', id, 'Jar of Light' FROM item_groups WHERE name = 'The Mad Angel';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('a8844247-6a93-4642-bb94-b51187ea5dba', 'Maggot King', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '88f25136-aff7-4325-a605-08b8e88fc30f', id, 'Maggot marquess' FROM item_groups WHERE name = 'Maggot King';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '01ae1836-465f-4881-a7d2-a131cd51755e', id, 'Crimson kisten' FROM item_groups WHERE name = 'Maggot King';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '43a7a074-4665-4cc2-83d4-bec125a1c8ed', id, 'Elder venator fang' FROM item_groups WHERE name = 'Maggot King';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('f9562a93-ea00-4c53-911a-88899008ad59', 'Moons of Peril', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '98652449-5f1d-4c18-9c34-3419129c43b1', id, 'Eclipse moon chestplate' FROM item_groups WHERE name = 'Moons of Peril';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f4d13f18-9f6f-466e-9d73-f8506cd90db2', id, 'Eclipse moon tassets' FROM item_groups WHERE name = 'Moons of Peril';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '32480b22-b574-47bf-9ee4-b91844d7f05f', id, 'Eclipse moon helm' FROM item_groups WHERE name = 'Moons of Peril';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '56ec6bf1-c4c9-45fc-9463-76f6bb505243', id, 'Eclipse atlatl' FROM item_groups WHERE name = 'Moons of Peril';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '562b39b5-cf32-41e1-bb28-354d032af1d3', id, 'Blue moon chestplate' FROM item_groups WHERE name = 'Moons of Peril';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0afa498d-74a1-4a71-a28a-056012942b7d', id, 'Blue moon tassets' FROM item_groups WHERE name = 'Moons of Peril';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '315679b5-a35f-4d9d-b8e4-bc4da6e65b48', id, 'Blue moon helm' FROM item_groups WHERE name = 'Moons of Peril';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5d6a18da-447a-4e17-b423-3fc7e1aa6c87', id, 'Blue moon spear' FROM item_groups WHERE name = 'Moons of Peril';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd4dbe19b-6184-44ab-8441-6a1e6e55ce5c', id, 'Blood moon chestplate' FROM item_groups WHERE name = 'Moons of Peril';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f53c341a-0793-44f0-b0cd-e9ec4d7119e8', id, 'Blood moon tassets' FROM item_groups WHERE name = 'Moons of Peril';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6870ac05-73e3-479d-9c40-2c2b4bb26165', id, 'Blood moon helm' FROM item_groups WHERE name = 'Moons of Peril';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '07a41e50-ae29-4bb8-a33e-8edde6a4c192', id, 'Dual macuahuitl' FROM item_groups WHERE name = 'Moons of Peril';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0e3bf2b3-1e07-4bbb-accb-d932b1988475', id, 'Atlatl dart' FROM item_groups WHERE name = 'Moons of Peril';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('317f2b13-62c0-4842-b2b4-cf2b9e23bd7e', 'Nex', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'af50254d-62a0-45a7-a89a-d4efa59fac9b', id, 'Nexling' FROM item_groups WHERE name = 'Nex';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2ff157d9-a1e6-4b78-9239-db2af4d41820', id, 'Ancient hilt' FROM item_groups WHERE name = 'Nex';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '49baffa9-5084-4b3c-8c74-316816bd2b39', id, 'Nihil horn' FROM item_groups WHERE name = 'Nex';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4d4bb75e-cd12-4e42-b3cc-807ccdc8c103', id, 'Zaryte vambraces' FROM item_groups WHERE name = 'Nex';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '548fa045-8d88-415f-8e63-5203752593ff', id, 'Torva full helm (damaged)' FROM item_groups WHERE name = 'Nex';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f17290d6-109a-46cd-aca4-430044b4ee0e', id, 'Torva platebody (damaged)' FROM item_groups WHERE name = 'Nex';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e501c15e-5cd6-4665-8eb6-6173c30c6959', id, 'Torva platelegs (damaged)' FROM item_groups WHERE name = 'Nex';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a1cb22ef-3ed9-4cc4-80e2-3ccf02f43387', id, 'Nihil shard' FROM item_groups WHERE name = 'Nex';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('7a455f48-13b9-4fbe-8f14-32afd0155f32', 'The Nightmare', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd63571e4-b043-4c23-94b5-d55b928fee67', id, 'Little Nightmare' FROM item_groups WHERE name = 'The Nightmare';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'bc4d536b-0f3b-4be4-bed7-0719414f38bc', id, 'Inquisitor''s mace' FROM item_groups WHERE name = 'The Nightmare';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'bcb8621d-6b40-423f-8cba-d6f816a31e1f', id, 'Inquisitor''s great helm' FROM item_groups WHERE name = 'The Nightmare';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '18467ff4-5429-495a-b83c-33e25ef6adb1', id, 'Inquisitor''s hauberk' FROM item_groups WHERE name = 'The Nightmare';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f28f8128-37f8-4205-af18-4627bb1d49a9', id, 'Inquisitor''s plateskirt' FROM item_groups WHERE name = 'The Nightmare';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5dc355ec-d55e-4116-9233-67c9b8f093da', id, 'Nightmare staff' FROM item_groups WHERE name = 'The Nightmare';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'deb2e8f6-1ff9-4dff-b81b-3b86dcc62b98', id, 'Volatile orb' FROM item_groups WHERE name = 'The Nightmare';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd35cecb7-e44d-4e5f-86bf-79c25088dbf1', id, 'Harmonised orb' FROM item_groups WHERE name = 'The Nightmare';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0860ed92-e5a8-408c-82e8-c6dee6149ea5', id, 'Eldritch orb' FROM item_groups WHERE name = 'The Nightmare';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a75d4a41-059c-400f-af29-40350078a898', id, 'Jar of Dreams' FROM item_groups WHERE name = 'The Nightmare';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3e8ca86c-ab41-45d0-b245-5d926d392718', id, 'Slepey tablet' FROM item_groups WHERE name = 'The Nightmare';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '61199700-c1d9-4361-98a8-4d4769ae3837', id, 'Parasitic egg' FROM item_groups WHERE name = 'The Nightmare';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('d82a2153-0e5a-40e0-9110-8a710259d089', 'Obor', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '31884804-87ac-423a-b651-306b76fbee90', id, 'Hill giant club' FROM item_groups WHERE name = 'Obor';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('3624ccbb-83a8-4032-9a22-d89e6eec7c27', 'Phantom Muspah', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c1db55bf-68a7-4cee-b61c-7a1ba5698b67', id, 'Muphin' FROM item_groups WHERE name = 'Phantom Muspah';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'fab72105-8d3e-4f8d-8934-c9c885b42b96', id, 'Venator shard' FROM item_groups WHERE name = 'Phantom Muspah';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '46b8253c-9d81-4050-9635-0935250d0944', id, 'Ancient icon' FROM item_groups WHERE name = 'Phantom Muspah';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '16a79c1a-7da2-4db4-a550-24386d6b893b', id, 'Charged ice' FROM item_groups WHERE name = 'Phantom Muspah';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '651541cd-2fff-4a3e-8354-4c710ab5b5fc', id, 'Frozen cache' FROM item_groups WHERE name = 'Phantom Muspah';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ce329773-aab0-45d5-84c1-b7bc19c32f2a', id, 'Ancient essence' FROM item_groups WHERE name = 'Phantom Muspah';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('6efcea57-01cf-4c53-8793-81c587840109', 'Royal Titans', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8586662a-09b6-4b1d-acd7-98a8ef3ed4e1', id, 'Bran' FROM item_groups WHERE name = 'Royal Titans';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2e145e65-94a6-49ea-bc05-e82c490239b2', id, 'Deadeye prayer scroll' FROM item_groups WHERE name = 'Royal Titans';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'aa506e48-e323-420e-8910-fd3efc69d58c', id, 'Mystic vigour prayer scroll' FROM item_groups WHERE name = 'Royal Titans';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '187026c3-73c3-4935-8e97-295e8f0d5887', id, 'Giantsoul amulet (uncharged)' FROM item_groups WHERE name = 'Royal Titans';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0822651f-e0f0-4510-aeee-c518e5847cbc', id, 'Ice element staff crown' FROM item_groups WHERE name = 'Royal Titans';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4a906a7b-4b25-472d-a65a-899f96e3717b', id, 'Fire element staff crown' FROM item_groups WHERE name = 'Royal Titans';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '282f2497-dddf-4ae6-aab6-03c866528292', id, 'Desiccated page' FROM item_groups WHERE name = 'Royal Titans';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('4fe38e9c-65cf-49c5-8b04-d17ed07d8107', 'Sarachnis', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'fe7bd25a-8df3-48d8-9cb9-49ce130b22ee', id, 'Sraracha' FROM item_groups WHERE name = 'Sarachnis';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '747ceb14-736b-410f-aeac-3843b3277252', id, 'Jar of Eyes' FROM item_groups WHERE name = 'Sarachnis';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '71d54f30-7aec-4b10-8371-3a0b994613cc', id, 'Giant egg sac(full)' FROM item_groups WHERE name = 'Sarachnis';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ef4ceaf1-5327-41c7-9cac-ee0fdcb23f08', id, 'Sarachnis cudgel' FROM item_groups WHERE name = 'Sarachnis';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a0985850-92a0-4fc6-9b4f-01b15f6a0a7f', id, 'Pristine spider silk' FROM item_groups WHERE name = 'Sarachnis';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('be8f854a-5935-4bc6-84eb-e3570353bf7e', 'Scorpia', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0bbcc392-5b68-448b-bc2d-4b41f45fdd35', id, 'Scorpia''s offspring' FROM item_groups WHERE name = 'Scorpia';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '82238ca7-abbb-428d-aca3-ff2d692f6b04', id, 'Odium shard 3' FROM item_groups WHERE name = 'Scorpia';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a818e4df-b723-4cf8-92de-13af7d19e9f5', id, 'Malediction shard 3' FROM item_groups WHERE name = 'Scorpia';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '355e523d-57db-49ed-96f0-31a0db82f61f', id, 'Dragon 2h sword' FROM item_groups WHERE name = 'Scorpia';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('7ad617c4-8395-4213-8033-583687617e25', 'Scurrius', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '78b718c0-89df-463b-bcb9-de5857273d41', id, 'Scurry' FROM item_groups WHERE name = 'Scurrius';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'dd67ff5e-9f19-48cf-9058-833af7999b89', id, 'Scurrius'' spine' FROM item_groups WHERE name = 'Scurrius';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('24460db4-303d-4c31-8044-50c147a90003', 'Shellbane Gryphon', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '11587fff-2970-4e07-9791-3bf189f23310', id, 'Gull (pet)' FROM item_groups WHERE name = 'Shellbane Gryphon';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ea66ee9c-8f7f-4117-a0b7-ae51ff24e8f4', id, 'Jar of Feathers' FROM item_groups WHERE name = 'Shellbane Gryphon';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b891074c-935b-4ff7-9d35-0be56c729475', id, 'Belle''s folly (tarnished)' FROM item_groups WHERE name = 'Shellbane Gryphon';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0da43af9-3611-4466-81ea-2272ebaffe19', id, 'Gryphon feather' FROM item_groups WHERE name = 'Shellbane Gryphon';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('36f4c91e-cfdf-4001-9a98-b389a94ad2c4', 'Skotizo', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0eae422c-d788-44d2-8383-f47142ae0b17', id, 'Skotos' FROM item_groups WHERE name = 'Skotizo';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '312c87b6-3d3c-4cc5-8671-113ea5f5bb0b', id, 'Jar of Darkness' FROM item_groups WHERE name = 'Skotizo';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e5bdba52-333b-4fbb-b8ac-d418a0dbfc8f', id, 'Dark claw' FROM item_groups WHERE name = 'Skotizo';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '51a9f5ab-21b3-4fde-b2ff-3b8687b26d39', id, 'Dark totem' FROM item_groups WHERE name = 'Skotizo';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1675b094-a89d-4f59-afcf-a30ced710eec', id, 'Uncut onyx' FROM item_groups WHERE name = 'Skotizo';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'cade841c-b104-4a4f-85dc-60ce2a3e5f28', id, 'Ancient shard' FROM item_groups WHERE name = 'Skotizo';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('eebbcedb-ebaf-4d94-b850-6b30fe6bf853', 'Tempoross', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '66cb25c2-93cf-4218-9019-2981ef532724', id, 'Tiny tempor' FROM item_groups WHERE name = 'Tempoross';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6b8d64f7-70fc-489e-ba89-2efcb9818641', id, 'Big harpoonfish' FROM item_groups WHERE name = 'Tempoross';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1df4e95a-3d50-421d-8a88-26391f0cd3fa', id, 'Spirit angler headband' FROM item_groups WHERE name = 'Tempoross';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '91c7ad75-b4fb-4d46-910e-fccec5103c6e', id, 'Spirit angler top' FROM item_groups WHERE name = 'Tempoross';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '57106406-8165-4273-8bd5-e477480a9025', id, 'Spirit angler waders' FROM item_groups WHERE name = 'Tempoross';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'bf1f9fc6-a8e5-4392-9e4e-dc4d60fa2533', id, 'Spirit angler boots' FROM item_groups WHERE name = 'Tempoross';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '447331fe-8655-4d8c-83db-e098a6a7f646', id, 'Tome of Water (empty)' FROM item_groups WHERE name = 'Tempoross';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '77313f60-2997-4a9e-8888-7b116d5cf17e', id, 'Soaked page' FROM item_groups WHERE name = 'Tempoross';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9fbacb88-6f2b-48de-8174-bd0ecfe979ef', id, 'Tackle box' FROM item_groups WHERE name = 'Tempoross';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c423f7b5-8a05-45a5-8ee9-942732847d53', id, 'Fish barrel' FROM item_groups WHERE name = 'Tempoross';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c4a41527-33b8-414f-996f-bf51f2be5d35', id, 'Dragon harpoon' FROM item_groups WHERE name = 'Tempoross';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e4fbf724-f168-4292-95c0-adb99f36c4b2', id, 'Spirit flakes' FROM item_groups WHERE name = 'Tempoross';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('bd1770ff-2bef-4b14-ac73-760c49ecb823', 'Thermonuclear smoke devil', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a7c70da6-8858-45c3-ae64-197a69c716d7', id, 'Pet Smoke Devil' FROM item_groups WHERE name = 'Thermonuclear smoke devil';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6e402184-160b-489d-99df-a625fabf827d', id, 'Occult necklace' FROM item_groups WHERE name = 'Thermonuclear smoke devil';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e99ddb5f-d236-4489-a233-92b50e79a0a1', id, 'Smoke battlestaff' FROM item_groups WHERE name = 'Thermonuclear smoke devil';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'af5dae78-2105-40c5-a7ed-075c6249bb26', id, 'Dragon chainbody' FROM item_groups WHERE name = 'Thermonuclear smoke devil';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2d17ceda-7215-439f-a3c5-c3f6b47ac328', id, 'Jar of Smoke' FROM item_groups WHERE name = 'Thermonuclear smoke devil';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('1823573d-4e63-4557-ad8b-d63e12aa1c6c', 'Vardorvis', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6d6289a3-dce4-4927-8fb6-77b1aad223ac', id, 'Butch' FROM item_groups WHERE name = 'Vardorvis';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '859f09a1-3640-48d4-bf3d-81a7f7ca6299', id, 'Executioner''s axe head' FROM item_groups WHERE name = 'Vardorvis';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5db7d6cb-ead4-490e-8e64-ec04ec3f98b6', id, 'Virtus mask' FROM item_groups WHERE name = 'Vardorvis';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd566ff84-965f-4ff5-9d3f-43ebfbb1fb2f', id, 'Virtus robe top' FROM item_groups WHERE name = 'Vardorvis';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7cb065da-2a1b-417b-936a-4baf4cb11fff', id, 'Virtus robe bottom' FROM item_groups WHERE name = 'Vardorvis';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'caa8a002-305a-4464-9f93-bcc86df969f8', id, 'Ultor vestige' FROM item_groups WHERE name = 'Vardorvis';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6c52dbc1-e10a-4ea7-af59-7bc03e266cf7', id, 'Blood quartz' FROM item_groups WHERE name = 'Vardorvis';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'cf5b98ae-bb48-436c-bae2-e482c758db16', id, 'Strangled tablet' FROM item_groups WHERE name = 'Vardorvis';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'af3216e1-a8ce-438d-ab55-dee6ee133bd4', id, 'Chromium ingot' FROM item_groups WHERE name = 'Vardorvis';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '83abc234-90d9-4275-aeea-6d4463221ba2', id, 'Awakener''s orb' FROM item_groups WHERE name = 'Vardorvis';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('cec97819-3d29-4c65-977a-39bbc8532b7b', 'Venenatis and Spindel', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ab8e34b2-ae41-46e0-8241-e11903e8ea35', id, 'Venenatis spiderling' FROM item_groups WHERE name = 'Venenatis and Spindel';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a632b833-9979-4eca-afd6-e9a8318e1d7a', id, 'Treasonous ring' FROM item_groups WHERE name = 'Venenatis and Spindel';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '31b1c9d7-8070-46eb-bcb3-7595428f4b0c', id, 'Dragon pickaxe' FROM item_groups WHERE name = 'Venenatis and Spindel';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ab9b0bf0-c84a-4d22-9df8-78838047b38c', id, 'Dragon 2h sword' FROM item_groups WHERE name = 'Venenatis and Spindel';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c98264f9-9d36-49a8-a57b-46a76b8ef5ac', id, 'Fangs of Venenatis' FROM item_groups WHERE name = 'Venenatis and Spindel';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '76a9286b-1e64-4a72-8e9d-d4b3ada37623', id, 'Voidwaker gem' FROM item_groups WHERE name = 'Venenatis and Spindel';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('dbf9c98d-817b-4bd3-9aaa-409ca71becbe', 'Vet''ion and Calvar''ion', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'fbf5ddb5-bdd4-419e-87b7-fe59643e7c60', id, 'Vet''ion Jr.' FROM item_groups WHERE name = 'Vet''ion and Calvar''ion';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd2fd4eea-8295-45b8-8a77-d6bee2a7e437', id, 'Ring of the gods' FROM item_groups WHERE name = 'Vet''ion and Calvar''ion';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '328b5f10-cf70-42ba-b345-cf58ac27b014', id, 'Dragon pickaxe' FROM item_groups WHERE name = 'Vet''ion and Calvar''ion';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '104fc4ef-7d36-4ee7-8da6-4a729c2b51e3', id, 'Dragon 2h sword' FROM item_groups WHERE name = 'Vet''ion and Calvar''ion';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8dc3d4a1-473d-465f-a507-ed7a60619bd4', id, 'Skull of Vet''ion' FROM item_groups WHERE name = 'Vet''ion and Calvar''ion';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5d3852a9-36f0-4cd3-8e85-cd70496c8dee', id, 'Voidwaker blade' FROM item_groups WHERE name = 'Vet''ion and Calvar''ion';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('3ae6c3e3-3b05-4339-9d6c-8fabd360e04c', 'Vorkath', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '300dbcbd-cbb7-4dac-957f-018414aacfa6', id, 'Vorki' FROM item_groups WHERE name = 'Vorkath';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '87124c98-1cce-469b-976c-00b820e13ad2', id, 'Vorkath''s head' FROM item_groups WHERE name = 'Vorkath';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e7f9f8e6-a0ee-48eb-bffc-ceace21804a3', id, 'Draconic visage' FROM item_groups WHERE name = 'Vorkath';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'bc500868-f3e4-459b-931f-5ac12e2e3fb1', id, 'Skeletal visage' FROM item_groups WHERE name = 'Vorkath';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8548dedc-7bee-4b0b-b08b-43f58587b395', id, 'Jar of Decay' FROM item_groups WHERE name = 'Vorkath';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '85e9a381-7b8b-4a78-a88e-97559c384244', id, 'Dragonbone necklace' FROM item_groups WHERE name = 'Vorkath';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('1a93fcc4-e596-46d5-af07-27a574f15cf9', 'The Whisperer', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ef113a5b-e658-4ddc-96c4-abc9f665f025', id, 'Wisp' FROM item_groups WHERE name = 'The Whisperer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6a4d0232-608d-4a03-83e0-bd6d588f9f83', id, 'Siren''s staff' FROM item_groups WHERE name = 'The Whisperer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9b597f20-55db-41fa-906e-15006ece457f', id, 'Virtus mask' FROM item_groups WHERE name = 'The Whisperer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9daf25ae-92f6-4943-960d-b220d1cc928f', id, 'Virtus robe top' FROM item_groups WHERE name = 'The Whisperer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '42681b89-d488-41bd-9fa6-fb54e88d8c21', id, 'Virtus robe bottom' FROM item_groups WHERE name = 'The Whisperer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd5845aa6-c286-44f0-834d-acd2535eeecc', id, 'Bellator vestige' FROM item_groups WHERE name = 'The Whisperer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '726cb7b8-ec6a-4ac7-a861-2434ba949082', id, 'Shadow quartz' FROM item_groups WHERE name = 'The Whisperer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd3daecee-f29a-4048-82bb-e9467d73a8f9', id, 'Sirenic tablet' FROM item_groups WHERE name = 'The Whisperer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '13196f3b-2796-4bd9-ad22-9a661fe750ac', id, 'Chromium ingot' FROM item_groups WHERE name = 'The Whisperer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '93d10d6a-04a3-49bb-bbb6-a6cd648edf2f', id, 'Awakener''s orb' FROM item_groups WHERE name = 'The Whisperer';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('e5322152-df25-49d8-b57e-cd26942b97a6', 'Wintertodt', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f8d62be8-325e-4bae-b0eb-0fa7e074fe81', id, 'Phoenix' FROM item_groups WHERE name = 'Wintertodt';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd8e75c8c-371c-4600-9324-77497e902fb8', id, 'Tome of Fire (empty)' FROM item_groups WHERE name = 'Wintertodt';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9a96cd46-6ad0-4391-9894-7c95a736a43e', id, 'Burnt page' FROM item_groups WHERE name = 'Wintertodt';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8d5deee4-f48b-4779-80e9-65345115d553', id, 'Pyromancer garb' FROM item_groups WHERE name = 'Wintertodt';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4a1f2d0b-20cc-4d90-953c-968217192e0f', id, 'Pyromancer hood' FROM item_groups WHERE name = 'Wintertodt';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4744a0ae-93c6-4606-9c3d-873c9d075614', id, 'Pyromancer robe' FROM item_groups WHERE name = 'Wintertodt';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a8f22d69-5ebf-49a8-8772-f1c04d85859d', id, 'Pyromancer boots' FROM item_groups WHERE name = 'Wintertodt';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f1377869-87f9-4b0b-9996-b90cd91d0abc', id, 'Warm gloves' FROM item_groups WHERE name = 'Wintertodt';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c1a080a7-66bc-428e-b821-e4fb98a4616f', id, 'Bruma torch' FROM item_groups WHERE name = 'Wintertodt';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8437ed69-dd3d-4e1d-92bd-1db9a0e1820e', id, 'Dragon axe' FROM item_groups WHERE name = 'Wintertodt';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('dcd3825e-2214-4716-aac4-f07fddbd69ae', 'Yama', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e2ad0974-7a93-41d3-ba3a-c1debfc7880b', id, 'Yami' FROM item_groups WHERE name = 'Yama';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '999b0d87-a3dd-4a10-a1fb-3d9e91d1ee03', id, 'Chasm teleport scroll' FROM item_groups WHERE name = 'Yama';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1eaf9b03-e759-4a77-8045-bfde380b2b66', id, 'Oathplate shards' FROM item_groups WHERE name = 'Yama';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f5807018-2d6f-4679-8939-6e090977e747', id, 'Oathplate helm' FROM item_groups WHERE name = 'Yama';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '30cc1c99-e32a-4c5d-a666-9efb52238af0', id, 'Oathplate chest' FROM item_groups WHERE name = 'Yama';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'aace6d3b-280e-4cae-889f-df6bfdd1b6c7', id, 'Oathplate legs' FROM item_groups WHERE name = 'Yama';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b49a30d0-7894-4cdf-b9c2-fe9c1a2c2471', id, 'Soulflame horn' FROM item_groups WHERE name = 'Yama';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '34d1773f-a5b4-407f-a5cd-f9b23eeb9da3', id, 'Rite of vile transference' FROM item_groups WHERE name = 'Yama';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8c6de5c8-41a8-4323-a882-accc8d7d4748', id, 'Forgotten lockbox' FROM item_groups WHERE name = 'Yama';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '60a7b001-75ef-4192-9947-5986e6cd6854', id, 'Dossier' FROM item_groups WHERE name = 'Yama';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e6ce485e-7283-43d9-9421-c80c42c405ba', id, 'Barrel of demonic tallow (full)' FROM item_groups WHERE name = 'Yama';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('e709380e-5b62-4cec-8556-925a73331b1e', 'Zalcano', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3c198f79-a108-4af5-9c0e-ba2ff71252d1', id, 'Smolcano' FROM item_groups WHERE name = 'Zalcano';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '12598283-d831-4a57-8ec5-f6b08a305a68', id, 'Crystal tool seed' FROM item_groups WHERE name = 'Zalcano';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6bf53854-189b-49fb-8e83-6b281f4073fa', id, 'Zalcano shard' FROM item_groups WHERE name = 'Zalcano';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0015012b-c78f-4c63-980f-bd4c2af8c30a', id, 'Uncut onyx' FROM item_groups WHERE name = 'Zalcano';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('d60bb0b2-b035-4083-ad67-e58de6ae94a0', 'Zulrah', 'Collection log · Bosses') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f06add49-619d-49e4-8ce7-db0f885444c9', id, 'Pet Snakeling' FROM item_groups WHERE name = 'Zulrah';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '72082e65-35de-48d3-9140-7185f5934afc', id, 'Tanzanite mutagen' FROM item_groups WHERE name = 'Zulrah';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ca37454d-3ab4-405f-8d3d-26fc0a071118', id, 'Magma mutagen' FROM item_groups WHERE name = 'Zulrah';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4fb43443-dc95-403f-aa2e-196a72d3287d', id, 'Jar of Swamp' FROM item_groups WHERE name = 'Zulrah';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3463719b-fe5a-498d-823c-a090a7429b31', id, 'Magic fang' FROM item_groups WHERE name = 'Zulrah';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '846083ef-f13e-42af-9a27-4e08d3586a1e', id, 'Serpentine visage' FROM item_groups WHERE name = 'Zulrah';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd3ef1491-1982-4723-9f3c-5ca01b554cc4', id, 'Tanzanite fang' FROM item_groups WHERE name = 'Zulrah';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '98598bbc-1107-4ac4-a643-39fd1440b112', id, 'Zul-andra teleport' FROM item_groups WHERE name = 'Zulrah';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '68ec24d9-fe0f-4843-986e-034c1d8a1e8a', id, 'Uncut onyx' FROM item_groups WHERE name = 'Zulrah';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '00d9373b-58ad-46e6-8b69-b3e0ca8ab7f5', id, 'Zulrah''s scales' FROM item_groups WHERE name = 'Zulrah';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('4aab1a1d-cc52-4b09-a7e1-aab441e63b37', 'Chambers of Xeric', 'Collection log · Raids') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7420acd3-bcac-4300-bebd-2d0e9b49025e', id, 'Olmlet' FROM item_groups WHERE name = 'Chambers of Xeric';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f8de71ff-f5a3-4fa8-8233-11f3b552b545', id, 'Metamorphic dust' FROM item_groups WHERE name = 'Chambers of Xeric';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'cd01e979-58c0-4b46-8e48-97f69db58a91', id, 'Twisted bow' FROM item_groups WHERE name = 'Chambers of Xeric';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '51213585-7d72-4a7a-ac52-af1f456b8034', id, 'Elder maul' FROM item_groups WHERE name = 'Chambers of Xeric';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '94eeb0cb-d5c7-44b8-9949-b164324f943e', id, 'Kodai insignia' FROM item_groups WHERE name = 'Chambers of Xeric';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7feb3479-3861-46f3-977f-511b240ee446', id, 'Dragon claws' FROM item_groups WHERE name = 'Chambers of Xeric';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '71d93812-8ebf-4a63-9900-ac79458b616f', id, 'Ancestral hat' FROM item_groups WHERE name = 'Chambers of Xeric';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd9026fe9-e831-4e17-85c5-83d2ad0487ea', id, 'Ancestral robe top' FROM item_groups WHERE name = 'Chambers of Xeric';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '69473dff-ccaa-4c15-8ac6-f9dbfca6e3a2', id, 'Ancestral robe bottom' FROM item_groups WHERE name = 'Chambers of Xeric';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '17f0d987-8888-4298-b27b-d16ceaf3ca3d', id, 'Dinh''s bulwark' FROM item_groups WHERE name = 'Chambers of Xeric';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd578162e-9eac-40ec-b399-f62d825e81cc', id, 'Dexterous prayer scroll' FROM item_groups WHERE name = 'Chambers of Xeric';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '63e68fc0-2077-4e2f-9b48-8a8d3378e40f', id, 'Arcane prayer scroll' FROM item_groups WHERE name = 'Chambers of Xeric';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7c29e895-020f-4940-b344-c16fd90ea29c', id, 'Dragon hunter crossbow' FROM item_groups WHERE name = 'Chambers of Xeric';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0f359264-e42e-4b2a-aa4d-e774465f6ee9', id, 'Twisted buckler' FROM item_groups WHERE name = 'Chambers of Xeric';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '722d7d11-675c-4ba8-962a-f334c9bf8073', id, 'Torn prayer scroll' FROM item_groups WHERE name = 'Chambers of Xeric';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8b52b8f1-ff09-441c-a1d2-91f1729928ba', id, 'Dark relic' FROM item_groups WHERE name = 'Chambers of Xeric';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7003104b-5b97-4a3e-91c3-14051b075923', id, 'Onyx' FROM item_groups WHERE name = 'Chambers of Xeric';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'df64252b-4039-4311-ac4d-16014f502cc3', id, 'Twisted ancestral colour kit' FROM item_groups WHERE name = 'Chambers of Xeric';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '03e2ad6f-c257-4c31-9de7-a741249556dd', id, 'Xeric''s guard' FROM item_groups WHERE name = 'Chambers of Xeric';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8764f85a-24f9-4135-a0c6-f5470f15b50b', id, 'Xeric''s warrior' FROM item_groups WHERE name = 'Chambers of Xeric';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c436ac3a-101d-40b2-927f-7a4a9b7c4f4e', id, 'Xeric''s sentinel' FROM item_groups WHERE name = 'Chambers of Xeric';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '778e4733-84e4-4b6b-8355-4693939039d4', id, 'Xeric''s general' FROM item_groups WHERE name = 'Chambers of Xeric';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7c4953ca-fa85-40d4-bbd8-d3108674e93c', id, 'Xeric''s champion' FROM item_groups WHERE name = 'Chambers of Xeric';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('87dc7e6d-236f-4444-a3a3-bbce4009fa74', 'Theatre of Blood', 'Collection log · Raids') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5f22ae1f-cd23-4416-9b6d-017c18d53768', id, 'Lil'' Zik' FROM item_groups WHERE name = 'Theatre of Blood';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a61fae68-ec49-49bf-8f51-18904838e348', id, 'Scythe of Vitur (uncharged)' FROM item_groups WHERE name = 'Theatre of Blood';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ffbfd84e-b1ad-426f-9cbb-f80a1539798d', id, 'Ghrazi rapier' FROM item_groups WHERE name = 'Theatre of Blood';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2024878d-3fac-4798-8c58-5439fc7dbdf2', id, 'Sanguinesti staff (uncharged)' FROM item_groups WHERE name = 'Theatre of Blood';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4f19128f-1e2f-45ad-aa26-94aa5b733818', id, 'Justiciar faceguard' FROM item_groups WHERE name = 'Theatre of Blood';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a6b1152a-f62f-4cf1-b277-20fb33565b39', id, 'Justiciar chestguard' FROM item_groups WHERE name = 'Theatre of Blood';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6be5422b-cfa6-41f5-a160-957bf01523b2', id, 'Justiciar legguards' FROM item_groups WHERE name = 'Theatre of Blood';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b965ff36-5c20-4e9d-9eb2-eb6bc1c4e570', id, 'Avernic defender hilt' FROM item_groups WHERE name = 'Theatre of Blood';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'bf3c447d-b583-454b-baf5-83d425ee4cc6', id, 'Vial of blood' FROM item_groups WHERE name = 'Theatre of Blood';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0c0d7381-89de-414c-86f0-4bb4eadd005b', id, 'Sinhaza shroud tier 1' FROM item_groups WHERE name = 'Theatre of Blood';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '735145e4-3e84-430d-91f8-871cd77e38fe', id, 'Sinhaza shroud tier 2' FROM item_groups WHERE name = 'Theatre of Blood';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'aafa7064-e586-4118-b54f-afbd289f169c', id, 'Sinhaza shroud tier 3' FROM item_groups WHERE name = 'Theatre of Blood';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9ee4218b-da86-478a-9123-dcebec55c4f9', id, 'Sinhaza shroud tier 4' FROM item_groups WHERE name = 'Theatre of Blood';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7c553ce2-4861-437e-be39-acb69ba2a01d', id, 'Sinhaza shroud tier 5' FROM item_groups WHERE name = 'Theatre of Blood';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e5fe5783-117c-4c18-b9d5-115d3a64ab15', id, 'Sanguine dust' FROM item_groups WHERE name = 'Theatre of Blood';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '955a3303-2716-432d-a940-f9ad0194f4e0', id, 'Holy ornament kit' FROM item_groups WHERE name = 'Theatre of Blood';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ff8ed4fa-bcad-4d10-843d-860b90481b2e', id, 'Sanguine ornament kit' FROM item_groups WHERE name = 'Theatre of Blood';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('790e3e03-e52d-49bd-ae75-c0da22f55b90', 'Tombs of Amascut', 'Collection log · Raids') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6cae32a7-dd6d-45a1-86eb-00bcd2c02afb', id, 'Tumeken''s guardian' FROM item_groups WHERE name = 'Tombs of Amascut';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8633e66a-0afe-4c81-aa31-b9cd72f9f37e', id, 'Tumeken''s shadow (uncharged)' FROM item_groups WHERE name = 'Tombs of Amascut';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '85acda2a-e050-4105-9116-3e64cdc6b434', id, 'Elidinis'' ward' FROM item_groups WHERE name = 'Tombs of Amascut';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e9142a53-ef37-463e-a248-c9f4dc5f66f3', id, 'Masori mask' FROM item_groups WHERE name = 'Tombs of Amascut';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '21efadee-3f81-49d2-947c-2a0f89a17913', id, 'Masori body' FROM item_groups WHERE name = 'Tombs of Amascut';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '98f9ca98-d9e4-44e0-83bd-b6231b268406', id, 'Masori chaps' FROM item_groups WHERE name = 'Tombs of Amascut';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '028f51ca-a90c-4416-8590-a82a9e122516', id, 'Lightbearer' FROM item_groups WHERE name = 'Tombs of Amascut';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'dbdd22fb-87e1-4ffd-ad10-539b4f7e61b6', id, 'Osmumten''s fang' FROM item_groups WHERE name = 'Tombs of Amascut';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd412fe9b-6018-46f0-98e4-924dd7d2e48c', id, 'Thread of Elidinis' FROM item_groups WHERE name = 'Tombs of Amascut';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c6ec3d8e-06bf-410f-9008-2db2961590a2', id, 'Breach of the Scarab' FROM item_groups WHERE name = 'Tombs of Amascut';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f1469bb5-f55a-4140-a7c5-7c675df1ab70', id, 'Eye of the Corruptor' FROM item_groups WHERE name = 'Tombs of Amascut';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b38f58b1-e626-4c00-be40-107dec62c030', id, 'Jewel of the Sun' FROM item_groups WHERE name = 'Tombs of Amascut';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '869752b3-6fe4-4f93-a66b-660248a7011b', id, 'Jewel of Amascut' FROM item_groups WHERE name = 'Tombs of Amascut';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3bf10458-17bf-41c6-8047-5f89a0551c22', id, 'Menaphite ornament kit' FROM item_groups WHERE name = 'Tombs of Amascut';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '20fef4ab-0a12-443b-abac-9dbb55445a7e', id, 'Cursed phalanx' FROM item_groups WHERE name = 'Tombs of Amascut';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '98f69a16-b6e6-4966-a393-fb86090f609e', id, 'Masori crafting kit' FROM item_groups WHERE name = 'Tombs of Amascut';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '24a94f5e-63c7-468c-a8dd-0f8c23871a0e', id, 'Cache of runes' FROM item_groups WHERE name = 'Tombs of Amascut';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8b920a6f-38c7-4646-9871-524cddbbdd22', id, 'Icthlarin''s shroud (tier 1)' FROM item_groups WHERE name = 'Tombs of Amascut';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '99ba96b1-058f-444c-88e7-0a29632009b0', id, 'Icthlarin''s shroud (tier 2)' FROM item_groups WHERE name = 'Tombs of Amascut';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9a611609-5614-4d2e-a2eb-8bb1a4d37718', id, 'Icthlarin''s shroud (tier 3)' FROM item_groups WHERE name = 'Tombs of Amascut';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2f30eda4-6dce-49e4-973a-96752bf44f95', id, 'Icthlarin''s shroud (tier 4)' FROM item_groups WHERE name = 'Tombs of Amascut';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'eddf783d-ba96-4e5e-a412-e4a4b7567612', id, 'Icthlarin''s shroud (tier 5)' FROM item_groups WHERE name = 'Tombs of Amascut';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7843e997-1743-4cdf-9bef-a1d2497992a8', id, 'Remnant of Akkha' FROM item_groups WHERE name = 'Tombs of Amascut';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4a147dc2-8bb0-4620-b91a-82c290fa9921', id, 'Remnant of Ba-Ba' FROM item_groups WHERE name = 'Tombs of Amascut';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1f11addc-7af1-4c24-9ec8-85e19b1e61ac', id, 'Remnant of Kephri' FROM item_groups WHERE name = 'Tombs of Amascut';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c1b41edf-92ef-4eb1-ba0f-39bffb59fc14', id, 'Remnant of Zebak' FROM item_groups WHERE name = 'Tombs of Amascut';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b88471a0-adf1-40b7-a3e6-91413250dfa4', id, 'Ancient remnant' FROM item_groups WHERE name = 'Tombs of Amascut';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('6997dc00-53ba-48e5-9bc7-eaf46453c5a3', 'Beginner Treasure Trails', 'Collection log · Clues') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ffc0dae7-81b7-49bb-b8a1-a6064e79de30', id, 'Mole slippers' FROM item_groups WHERE name = 'Beginner Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '02153cae-e7f8-4174-a477-2c84a4fa2399', id, 'Frog slippers' FROM item_groups WHERE name = 'Beginner Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '23ac1c01-5fbe-4ba0-a8e6-765293a9b18b', id, 'Bear feet' FROM item_groups WHERE name = 'Beginner Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e4fb1fba-c3ae-4349-b703-b0e206396b6d', id, 'Demon feet' FROM item_groups WHERE name = 'Beginner Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '66ec3152-d53e-4d23-8146-b697708e4c6a', id, 'Jester cape' FROM item_groups WHERE name = 'Beginner Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0330e1d9-c1f4-46d3-b08f-48016a01c745', id, 'Shoulder parrot' FROM item_groups WHERE name = 'Beginner Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e2f62f1a-abc4-46ad-b1a6-3d2f24d100b9', id, 'Monk''s robe top (t)' FROM item_groups WHERE name = 'Beginner Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '05cc837f-37fd-46e7-8a15-0b6fd99c80d6', id, 'Monk''s robe (t)' FROM item_groups WHERE name = 'Beginner Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1fee4d95-6b97-45ae-b0b0-6aacdd913484', id, 'Amulet of defence (t)' FROM item_groups WHERE name = 'Beginner Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f57560b0-2aec-40f5-b57c-ff08edf4e131', id, 'Sandwich lady hat' FROM item_groups WHERE name = 'Beginner Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'bab0207f-60b2-434c-80ff-e44f4fe14f78', id, 'Sandwich lady top' FROM item_groups WHERE name = 'Beginner Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '82ba26ab-e34a-40fa-b696-87a3718d357f', id, 'Sandwich lady bottom' FROM item_groups WHERE name = 'Beginner Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'fc17d0d1-b1a4-4e02-aade-b615954dbcfb', id, 'Rune scimitar ornament kit (Guthix)' FROM item_groups WHERE name = 'Beginner Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f27132eb-5b09-43bb-ac40-92bacfa38da3', id, 'Rune scimitar ornament kit (Saradomin)' FROM item_groups WHERE name = 'Beginner Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3d64ec8f-7508-425f-971e-f58b08aa00e8', id, 'Rune scimitar ornament kit (Zamorak)' FROM item_groups WHERE name = 'Beginner Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '226dc3ea-4178-4fb0-a4c7-444e9f5b92b3', id, 'Black pickaxe' FROM item_groups WHERE name = 'Beginner Treasure Trails';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('5045d418-4f5f-4e99-8ee1-76772c74ed53', 'Easy Treasure Trails', 'Collection log · Clues') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ae9ab778-a286-41f5-b938-892b7d10f018', id, 'Team cape zero' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7aa57edc-ae20-4157-9f7c-d633514ef2e3', id, 'Team cape i' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e14b6a51-fdf1-4a3e-980e-a7387aeeebc6', id, 'Team cape x' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'afb467c7-f28c-48d3-98bf-f0423186aaf9', id, 'Cape of skulls' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a60f77ce-5571-4483-90d4-29391782c38a', id, 'Golden chef''s hat' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'dfde6144-8d44-4e22-adf2-e858f39d05ee', id, 'Golden apron' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f25d27ae-ad11-4090-8c9d-1707da2026b4', id, 'Wooden shield (g)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c698b8cf-ca31-4b61-ad7e-00ca3469cc9a', id, 'Black full helm (t)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2df0e15f-7aae-4a72-8ee4-fdb30d0c281a', id, 'Black platebody (t)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ceedbddf-9ad8-426a-b032-68849b19d46d', id, 'Black platelegs (t)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '48fc0046-419b-4d5e-a18a-ac7d6228ba8d', id, 'Black plateskirt (t)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5abe5740-1000-4230-baf2-cac1ff01ffea', id, 'Black kiteshield (t)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '06b27076-7bb4-4d6b-a533-06a2fa73558d', id, 'Black full helm (g)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6e387925-1db1-4681-98bc-7c245c8ab065', id, 'Black platebody (g)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '06d2a9b5-b3d1-4f36-a4a9-b00b3918543e', id, 'Black platelegs (g)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0a58d7fe-4c1c-4a27-93f4-fa5b187607f2', id, 'Black plateskirt (g)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b70a7b37-446c-4619-a5d9-7d27e61bb363', id, 'Black kiteshield (g)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8c74336d-4bad-4179-ba85-9738b904d570', id, 'Black shield (h1)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'fe732250-84bf-4c70-b2c3-5e6ccbcccef9', id, 'Black shield (h2)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '07a72115-2d9f-4cac-b564-86f6d8b2e7d8', id, 'Black shield (h3)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5808b77b-c59c-47dd-95c9-7dd4d93f55b3', id, 'Black shield (h4)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ffc5db75-ba39-4b2c-b752-686de6cee90c', id, 'Black shield (h5)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8880e89f-abdb-49ae-a294-9f01935c0f26', id, 'Black helm (h1)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7f92b4e3-e0af-43aa-8a40-495529ded4d5', id, 'Black helm (h2)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6369dca3-a121-4c41-bcaa-7c390a563baf', id, 'Black helm (h3)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '27bb4361-d0ab-4729-aa5a-c01b2b7de33f', id, 'Black helm (h4)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7ad5a6cc-3bec-4761-a264-8d576cc9bfb4', id, 'Black helm (h5)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c8ba0890-aac1-442c-9d96-81f04c0e580a', id, 'Black platebody (h1)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2a8532a4-ab80-46ac-9eb8-3fe169cd83a1', id, 'Black platebody (h2)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7e5c6b53-da2a-4545-ba74-69c279307e63', id, 'Black platebody (h3)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '195e72b0-7180-46fa-9475-fc5115f04e37', id, 'Black platebody (h4)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5e5b3d70-9ab5-4c72-bfcf-82727823076f', id, 'Black platebody (h5)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '87b73ee1-3b52-442c-891f-72085262a8b4', id, 'Steel full helm (t)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ef747965-cbd8-44be-adb8-e406ce2441ec', id, 'Steel platebody (t)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5358db23-80e0-4d26-9353-cbc35a63ee51', id, 'Steel platelegs (t)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '180dc1cf-178c-471a-803e-2d95c24a1861', id, 'Steel plateskirt (t)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '46629a5f-9f62-4077-94ac-a685a2166b7d', id, 'Steel kiteshield (t)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1d2d6bcf-6c82-4c54-9284-2b3fc7669b75', id, 'Steel full helm (g)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'bd8b4652-514a-456b-8070-2297ef8c2afc', id, 'Steel platebody (g)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4a8c824d-fb4b-4c90-9768-5205859b1655', id, 'Steel platelegs (g)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd1b08664-821f-4875-9f8e-b3aabfbabbf8', id, 'Steel plateskirt (g)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3311f6af-6045-4c4c-afd7-95d27d74c95b', id, 'Steel kiteshield (g)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e32d1aab-efae-4614-9477-6b0ea36b8a1c', id, 'Iron platebody (t)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'bd819804-c839-4f52-9d9c-a54d1f798fc1', id, 'Iron platelegs (t)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4526e804-deff-4e13-97f6-e64b40caaac6', id, 'Iron plateskirt (t)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4df98eaa-8f7b-425d-b012-49644f968665', id, 'Iron kiteshield (t)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5bdd407d-63c1-4ca6-b104-37f3a00f3390', id, 'Iron full helm (t)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ef8f4377-ac82-4274-a64f-197c7ac1f462', id, 'Iron platebody (g)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7d9dc6c2-ae8c-4ded-9585-1ff1624d6d4b', id, 'Iron platelegs (g)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd1280b5e-127b-4787-a13b-b82e389a9c23', id, 'Iron plateskirt (g)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e802db5c-94b6-4daa-a36f-5444a1f45081', id, 'Iron kiteshield (g)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9ccac962-e1de-4a12-a71d-a129e6a1bf48', id, 'Iron full helm (g)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'af8bd713-0686-462e-8163-00a592b68376', id, 'Bronze platebody (t)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '957d319b-64da-46ae-b945-6227030f098b', id, 'Bronze platelegs (t)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b25ec5e8-ae3f-470e-bb9a-efa31c2ab955', id, 'Bronze plateskirt (t)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6bb5b98d-eab1-4790-9f57-b0df82cf9219', id, 'Bronze kiteshield (t)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd2cdfcd5-7c7b-42ff-b388-a3263c05ddcc', id, 'Bronze full helm (t)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '70f38496-72d3-4074-8d00-16f22b7ce67e', id, 'Bronze platebody (g)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '099d0dee-27b1-467a-92c1-e180ec6bd436', id, 'Bronze platelegs (g)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6a685154-c346-45ad-a845-963b9c483823', id, 'Bronze plateskirt (g)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5a5a376f-4e5f-4a40-9d36-1fd70153886a', id, 'Bronze kiteshield (g)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '40ed9cd8-73be-4f08-b070-7e88ea9f39a1', id, 'Bronze full helm (g)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '15c0c753-0994-4d74-9d41-eb1f6e8c2910', id, 'Studded body (g)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8a852e36-c3f8-4a4d-8e45-6dc38fbe3a9a', id, 'Studded chaps (g)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2ff8dd93-5607-4091-9ebc-9f8acac1d4a9', id, 'Studded body (t)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '559924a6-6eb7-4705-a702-cce1e83acfb0', id, 'Studded chaps (t)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5da7d15b-c5e2-4e53-91e8-8c31c8e046f1', id, 'Leather body (g)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f0558a70-5033-457a-8616-8bb313a6d4df', id, 'Leather chaps (g)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8dcd2942-a814-4f2f-984f-3b52a4d8fb0e', id, 'Blue wizard hat (g)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c8a5df0d-7372-4d38-846e-b05a67b4a40f', id, 'Blue wizard robe (g)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4d937492-6222-4136-a10d-255ba4d610cf', id, 'Blue skirt (g)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '840fbb36-3ce5-411a-8449-70a1946192d1', id, 'Blue wizard hat (t)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '198641bf-89e7-4340-be79-a57904731fbf', id, 'Blue wizard robe (t)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b7ea0e0f-b8d2-424c-a8c9-7ef46ffee48f', id, 'Blue skirt (t)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2f676be3-e6cb-4006-9c4a-7d815af52330', id, 'Black wizard hat (g)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '02ba954d-aa0f-44a7-9ef7-3df4008f6dde', id, 'Black wizard robe (g)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6235e991-d475-4ffb-9ab4-c06608376325', id, 'Black skirt (g)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4732e157-e686-4d33-b016-1da83294fa7c', id, 'Black wizard hat (t)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '10c339b6-6812-4983-b0ae-2a55775bf628', id, 'Black wizard robe (t)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1fd9a39e-d856-4e37-ad88-16629a54c3af', id, 'Black skirt (t)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'fe9072af-ed1d-4e34-97eb-f13460acc020', id, 'Monk''s robe top (g)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'adec0f6e-8927-4022-b484-b2bdffef83bc', id, 'Monk''s robe (g)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'fc1467aa-62dc-41a8-8f4d-613a58be5bf2', id, 'Saradomin robe top' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '82099d14-b54e-4e22-83ea-d3ca7799cd70', id, 'Saradomin robe legs' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '43a44f24-70ac-4590-9b35-16228e346c24', id, 'Guthix robe top' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '01e1594c-9b0a-49f6-bcdc-158108fb0a4a', id, 'Guthix robe legs' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '78cda609-62db-4b4b-aa26-6e0bd2e6b22f', id, 'Zamorak robe top' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3dd5e0f8-90d5-4b74-b443-e9294b5ee6c2', id, 'Zamorak robe legs' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '581c938f-59fa-415a-80be-f18de3ec3d3f', id, 'Ancient robe top' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '86122ac6-d7ec-4721-a5b7-24b694206df6', id, 'Ancient robe legs' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c4295c02-2399-4d10-ba7c-96d222075a5d', id, 'Armadyl robe top' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '06a7058e-1156-41ae-b50d-571d9f36ff39', id, 'Armadyl robe legs' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b4c61622-2194-4330-91e3-0a6bdac7e51f', id, 'Bandos robe top' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd6d13adb-2207-48c3-a5fe-1091fb933537', id, 'Bandos robe legs' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c058a343-c7c8-462b-a4cb-d64435520c94', id, 'Bob''s red shirt' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '159f62b4-6e2d-407f-95ea-e3e00b379e3e', id, 'Bob''s green shirt' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd244ac47-0388-4298-8093-9687069b68c7', id, 'Bob''s blue shirt' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '75e713f4-78bd-4623-9462-a2cc73913cea', id, 'Bob''s black shirt' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'bd233621-5ecc-4110-9473-055cfcea8194', id, 'Bob''s purple shirt' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f0aff227-0e06-415b-abcd-32fb20023e49', id, 'Highwayman mask' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b05ade36-cf0a-47c9-add2-1f5b557ca62a', id, 'Blue beret' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4ec0a5cf-ad71-4abb-8683-f04cff787142', id, 'Black beret' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '622e9d24-b3a8-4b98-ae22-597ab5c03e55', id, 'White beret' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '06498ea6-44c4-4f6c-8e65-9db1ed92832e', id, 'Red beret' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6310e2c6-0192-41ec-a8c0-1e68f943c54a', id, 'A powdered wig' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c579d0c1-42e6-4fe0-9253-6bcba0bb3dd3', id, 'Beanie' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0b13d69d-f529-469f-9621-0d323c3e2dbf', id, 'Imp mask' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7d255990-40ba-4165-a2bc-b61324e2180b', id, 'Goblin mask' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f854ef8d-53b9-495b-9b7d-a7313d6e3a8a', id, 'Sleeping cap' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f0e056de-a109-4650-a27a-cdc83b03e622', id, 'Flared trousers' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '530b5a20-fccf-4cc0-97a2-36cbb065ced8', id, 'Pantaloons' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2f0b45e9-99d8-4885-bf09-2bf8f40efa61', id, 'Black cane' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3ea8ab90-bf53-41dd-8c00-6a377fd42e81', id, 'Staff of Bob the Cat' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'febc222f-7209-4f94-8e31-3abe40b9ef5c', id, 'Red elegant shirt' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5bffff46-c391-498a-b515-e693ac441583', id, 'Red elegant blouse' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3cc3f4e6-23cb-487f-8586-c1d5ee67279d', id, 'Red elegant legs' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5b8e2298-8777-463d-94d4-008de312865b', id, 'Red elegant skirt' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '33da0816-ad89-4a18-b2c6-56280ca2d1e0', id, 'Green elegant shirt' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ee71172a-80cf-4de7-b31e-d2401ba77a25', id, 'Green elegant blouse' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '74953b6a-8d7c-49c8-95e6-9c6263fa0f46', id, 'Green elegant legs' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f4818b69-a7d2-4b21-ba00-04c39a76baec', id, 'Green elegant skirt' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f45a8103-f030-475f-8361-87abded920be', id, 'Blue elegant shirt' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9b7d8edf-51b7-4f31-be86-f2c8312f9786', id, 'Blue elegant blouse' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b2e7a60b-96a8-4bc8-b85d-888d53586458', id, 'Blue elegant legs' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4cf01841-465f-4630-ac38-d699e6c9883c', id, 'Blue elegant skirt' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '906112ea-f2b9-4f7c-9430-dbd324044ae1', id, 'Amulet of magic (t)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f65600b7-53a7-472d-993a-9ddb21c65c1e', id, 'Amulet of power (t)' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '197984ce-5d6d-43f2-96b9-71d6ae86093c', id, 'Black pickaxe' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '717d334c-f521-428d-ae34-b4339932b0fd', id, 'Ham joint' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '24fc9cb6-9cc0-44eb-86b4-cd049b761906', id, 'Rain bow' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '38d3e7bb-8e3e-4b02-840a-9ce6c5192570', id, 'Willow comp bow' FROM item_groups WHERE name = 'Easy Treasure Trails';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('d5e956f0-3af2-4486-a860-03ac269dd8f0', 'Medium Treasure Trails', 'Collection log · Clues') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd20fa64a-f552-400b-959d-9c23d53d76b2', id, 'Ranger boots' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '19f39e7c-1986-4856-80e5-138dc828bb97', id, 'Wizard boots' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6b4ef3ba-33f0-47d5-a839-c2a27242f0d9', id, 'Holy sandals' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e3437179-3a24-4aed-9826-5612b1db073a', id, 'Climbing boots (g)' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6ef9c899-1385-437d-b0fd-786e7db63326', id, 'Spiked manacles' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '97005dd1-b753-476d-b82d-9fdca433e79d', id, 'Adamant full helm (t)' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5976e544-f369-4cc5-83ea-b4ca70314928', id, 'Adamant platebody (t)' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '83a5ee09-1cbf-412b-8573-beeb0018b085', id, 'Adamant platelegs (t)' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '67a73b73-1fa5-4fff-8224-14420ee7b96a', id, 'Adamant plateskirt (t)' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '83fbf12b-c946-448b-b8ba-ac295c079951', id, 'Adamant kiteshield (t)' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c0a86d72-8d21-4dd7-ac5c-7e3b722bb964', id, 'Adamant full helm (g)' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e604b489-ef6d-4e59-8a4f-3de25f5b0904', id, 'Adamant platebody (g)' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'bfb776c6-7821-49ad-9669-ffdcc1f23e01', id, 'Adamant platelegs (g)' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9a14f615-db54-4e4d-9d70-4b67cdf34ad8', id, 'Adamant plateskirt (g)' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '043cd0d6-c933-4cf0-810a-dec37d1c3f6a', id, 'Adamant kiteshield (g)' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5dcdd53c-7287-434e-b7d4-fc98138db192', id, 'Adamant shield (h1)' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ab896c61-a95e-471a-8c71-b81130b2910f', id, 'Adamant shield (h2)' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3c701a89-2cb7-4e42-9017-cc8165f0f13a', id, 'Adamant shield (h3)' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ab3a365d-557d-404c-9eeb-50fcf0952d6d', id, 'Adamant shield (h4)' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd2402ab6-d822-4e65-8f9a-350d47a26cba', id, 'Adamant shield (h5)' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6c9e15fc-e6a9-4847-ba5a-5564a9d19dbf', id, 'Adamant helm (h1)' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c8916ea6-43f2-4d83-ad96-b5c72e6c9493', id, 'Adamant helm (h2)' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '28b9ded8-52d8-4f94-b1e4-fad01311680b', id, 'Adamant helm (h3)' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1e21a039-8972-445c-b104-6b026abe5991', id, 'Adamant helm (h4)' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '79f9dec0-637a-4de0-8fef-8be0d5c00b5c', id, 'Adamant helm (h5)' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '34b4d257-a194-489e-b8a7-eb998af74d73', id, 'Adamant platebody (h1)' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3b4b0ccb-1b4d-4afb-a3c9-3b02dcce41bd', id, 'Adamant platebody (h2)' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e83a4d11-4008-4ccd-b99c-2a785caa7ddc', id, 'Adamant platebody (h3)' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b28f5fa3-250e-45bf-b9fc-e75c128d5257', id, 'Adamant platebody (h4)' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '489eefcc-7f7f-4afc-9e53-3103ffa21901', id, 'Adamant platebody (h5)' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7c2bd24f-1a07-46dc-8b6a-c42d35eed350', id, 'Mithril full helm (g)' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '211b517e-5396-41a7-a70a-9c3b46e008e5', id, 'Mithril platebody (g)' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '32bb61d1-7588-4a32-bce4-a9b251e21cc0', id, 'Mithril platelegs (g)' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c063b1f1-2691-445d-8308-30c5aa9a0265', id, 'Mithril plateskirt (g)' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c8a3beb5-ab7a-45b3-8d4b-e2cf3c8b9944', id, 'Mithril kiteshield (g)' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '784b3d76-c5e6-4493-91fa-0de09a7cd23a', id, 'Mithril full helm (t)' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '672888ad-8d2a-4e05-b5b7-2efd65f0d8d4', id, 'Mithril platebody (t)' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b2057857-bd5b-428f-9e3f-5a0b8fc5d52d', id, 'Mithril platelegs (t)' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd5bc312d-6bec-4a63-b68b-8aaf4a434fe9', id, 'Mithril plateskirt (t)' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2a956b27-38b0-4a5b-822b-77ef3bc0bf2b', id, 'Mithril kiteshield (t)' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '992b756e-29cf-46ec-b52e-7f66c9df035d', id, 'Green d''hide body (g)' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1385039f-de61-4524-97a7-cca5795c1bdd', id, 'Green d''hide body (t)' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '13619e38-9a15-44df-aabd-cc23d24bcc18', id, 'Green d''hide chaps (g)' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'bef90160-0904-4f47-9144-43ffb978f844', id, 'Green d''hide chaps (t)' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '924f2071-1615-495a-b2b2-36e10d683b45', id, 'Saradomin mitre' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '734a7bcb-1d0e-4a03-bda8-0e547940e45f', id, 'Saradomin cloak' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6ac1b9eb-2d4f-481e-a465-f6b3ed5cc61a', id, 'Guthix mitre' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ebd34d86-5ba3-4b0d-b6d5-daafbdfb39a8', id, 'Guthix cloak' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7cf23416-1dac-45e0-8b41-104d4565d70b', id, 'Zamorak mitre' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '48e4fe1a-6dc6-4087-944c-f47802a5a443', id, 'Zamorak cloak' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7da1c4cd-ce84-4111-a045-92737305b580', id, 'Ancient mitre' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '91af3eae-5236-4ad2-a2e2-0e1f3f047268', id, 'Ancient cloak' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7f42df42-483f-47af-b157-937a05ce5b66', id, 'Ancient stole' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f44d9cc1-fb85-420d-b52b-6e76a36ad1cf', id, 'Ancient crozier' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '21e0751b-a695-4e36-8c2f-c0adc8b33231', id, 'Armadyl mitre' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4bb3b819-6d04-415f-b5c0-0c4172eac379', id, 'Armadyl cloak' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4baac315-bea9-489f-a433-4ccf1898d3e3', id, 'Armadyl stole' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '52eae55a-c91a-4c1d-b756-bbf62eb6b0a7', id, 'Armadyl crozier' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '275e5f40-d8c2-4d44-a481-308e9f35220e', id, 'Bandos mitre' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b521adab-0001-4c73-8c20-5adfe44bc322', id, 'Bandos cloak' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '72287fcc-4b0e-4a06-ab7f-4d403518b862', id, 'Bandos stole' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1b78aefb-e8c4-4090-9f0d-cc0b3c005196', id, 'Bandos crozier' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4d993383-69b4-426b-97d7-859ad998c8b1', id, 'Red boater' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'dd40dbd1-5907-4433-903b-59ab8c7a4a5c', id, 'Green boater' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8482cc5a-ae53-4db4-abfa-8ff3f323ada0', id, 'Orange boater' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'cf0507ad-48e2-402d-a09e-7d08db206757', id, 'Black boater' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '09244f1d-28e4-4d7e-9209-77b43f7a4dae', id, 'Blue boater' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a636b29e-ef98-4522-af77-91d5e8225bea', id, 'Pink boater' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b39890a7-9e2b-465a-ba0e-97566ee46733', id, 'Purple boater' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1f9636b9-3064-440d-a275-41bc49c46350', id, 'White boater' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f64ca3a2-008d-44d4-87e3-2b6971874e1f', id, 'Red headband' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd95598c9-efc3-4028-ac1d-f0a2aa26b895', id, 'Black headband' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1d4598b2-a8a1-46fb-b34a-9e706de1d63e', id, 'Brown headband' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'bc49f8d1-5a38-45de-af39-fc8f9c02507c', id, 'White headband' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'cdf86879-df8d-4262-be8e-c8de12202154', id, 'Blue headband' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'fc27bd64-28dc-4b16-a7a0-5e114df47957', id, 'Gold headband' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd85dd9c2-a4fc-442a-bd44-6165d20e5094', id, 'Pink headband' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7d7bd77e-4f1d-4e8d-9a4e-bcafa925348c', id, 'Green headband' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '92b3db86-60b4-40f6-8907-655f7b8ad700', id, 'Crier hat' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '294aa239-7736-4909-a9c4-3eef32ea159c', id, 'Crier coat' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'faf34057-22ae-493d-b9b9-bddc5e00f967', id, 'Crier bell' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b31db0ef-eca2-4e0c-a26e-8db9fd70e930', id, 'Adamant cane' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '228352b2-792f-4c33-96aa-69cbfdfaab6b', id, 'Arceuus banner' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '34d06d2c-b7d7-4738-8ea8-0018cc5f1c76', id, 'Piscarilius banner' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '03ae0c61-04a0-4dd2-9ff3-34414b949fa6', id, 'Hosidius banner' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'db8a009a-750f-4583-ba62-4ed85d3b222e', id, 'Shayzien banner' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f1a54165-4b7f-465a-9afb-36e9c7112c20', id, 'Lovakengj banner' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2d31930d-8c74-4785-a438-203cb85967b3', id, 'Cabbage round shield' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'fad1b1d1-5ce9-4e7f-bddb-57e2da67f40e', id, 'Black unicorn mask' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2a879ee4-7ba1-4321-81a6-9e0ce11c1e90', id, 'White unicorn mask' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f98a0a77-eb2c-4a9d-a484-c342002437c8', id, 'Cat mask' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6dcee4e3-37f5-45df-9d95-ebc4f8083fed', id, 'Penguin mask' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '301d7a58-8ce6-4e74-913f-6ef717910b38', id, 'Leprechaun hat' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '723deb83-9a1f-4b9c-90b3-c087a38cb327', id, 'Black leprechaun hat' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '67fd951e-d3ba-4c86-aa88-65298aa0274c', id, 'Wolf mask' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'dc537024-693f-4977-a6d9-c5cebf661d76', id, 'Wolf cloak' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '12cb9cd1-8862-4d34-a3ac-05729d705ade', id, 'Purple elegant shirt' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2ef968da-e762-4e57-a445-2e7a6cdab83f', id, 'Purple elegant blouse' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4be96136-c2eb-45a1-9345-b65d2a967b9e', id, 'Purple elegant legs' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '292bdf35-4665-40c3-ae7f-9d7304a22192', id, 'Purple elegant skirt' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '745f0ae6-20e6-475a-b35b-fa21faea04a9', id, 'Black elegant shirt' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '595915be-5038-454a-87b8-319660856392', id, 'White elegant blouse' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e268d78f-ed37-4bff-b5f6-13eb6edd10fa', id, 'Black elegant legs' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '24d68076-0565-48f3-99f1-f60873353fce', id, 'White elegant skirt' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '84a6e1de-418f-456e-b120-28379ae92b99', id, 'Pink elegant shirt' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a13e6e9f-51e9-4330-ace5-55e51d9f7726', id, 'Pink elegant blouse' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '82252c57-6393-48f3-b111-7640c9e721e7', id, 'Pink elegant legs' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ccd1e5e1-323e-4436-a390-c0b95878ef9d', id, 'Pink elegant skirt' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '94253d42-ee21-465e-8a51-54ff5200680f', id, 'Gold elegant shirt' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e676acc7-0946-479f-a15d-9dad1e1868a2', id, 'Gold elegant blouse' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f8a1bcc7-cd50-4c49-90f0-4ca5f617af22', id, 'Gold elegant legs' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd032be9d-c00d-4859-9cc9-1d3098f09d97', id, 'Gold elegant skirt' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8ac78582-9496-4c39-9615-92f4b1323a5c', id, 'Gnomish firelighter' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9d64d2a6-e461-44c7-92a5-37319ea561fa', id, 'Strength amulet (t)' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '87956094-2f51-4b2a-95bc-909430202ce1', id, 'Yew comp bow' FROM item_groups WHERE name = 'Medium Treasure Trails';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('b86b74f3-a7d8-4dbf-a341-a3e8628bf2cd', 'Hard Treasure Trails', 'Collection log · Clues') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3da22582-eeb3-4f71-ac24-855cea7f665f', id, 'Robin hood hat' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '59b75176-dfe6-4eba-9699-61efb82bf05e', id, 'Dragon boots ornament kit' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '64692c25-b1d7-402c-82fd-2d8cf1634c38', id, 'Rune defender ornament kit' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd3707058-0856-4f8a-a56b-321c30d190c0', id, 'Tzhaar-ket-om ornament kit' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '12a9dc0c-0658-485f-8624-a35dc55425ef', id, 'Berserker necklace ornament kit' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '346e1884-48b2-4a3f-9554-92ca1b992437', id, 'Rune full helm (t)' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '424567ed-d90e-4fa3-bad5-1899433c6667', id, 'Rune platebody (t)' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '154eefe5-20df-46c5-b486-796806569d04', id, 'Rune platelegs (t)' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '950b301b-175c-43af-aa89-6b6081151dc1', id, 'Rune plateskirt (t)' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a3516ba4-2299-4d69-9389-3cf5815dd1fd', id, 'Rune kiteshield (t)' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '20c11d0b-e00d-4a5f-91dc-dc317af12ac1', id, 'Rune full helm (g)' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '66c514cd-6be1-4629-8636-89940aa13983', id, 'Rune platebody (g)' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9238eb8c-b0a2-45f6-9e7c-1b853a5d2588', id, 'Rune platelegs (g)' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'bc61302c-664e-4031-9573-7a98f15daef9', id, 'Rune plateskirt (g)' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0f058d74-d523-4c03-bc6e-3d248d38beec', id, 'Rune kiteshield (g)' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1d0eaf09-e8d8-45dd-83b9-12a179e6d9f0', id, 'Zamorak full helm' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ecf65023-e050-4331-93e1-0ee2b5bd6c04', id, 'Zamorak platebody' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '75dbc5ae-2a68-4a3a-bddf-85d44376c8d9', id, 'Zamorak platelegs' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ffaa81fa-43b7-47ae-9f75-f92833731532', id, 'Zamorak plateskirt' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '869a4ee6-61c7-4d8d-9631-db5bcd76badb', id, 'Zamorak kiteshield' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8ca7a1bb-2edf-4377-90ab-d2cbdad66603', id, 'Guthix full helm' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '01c0aef2-65cf-45fa-acaa-9df0eef1166f', id, 'Guthix platebody' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f3690242-37f2-4373-887c-8581528e69ea', id, 'Guthix platelegs' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b10deafe-332d-4378-b36d-1cd22c264ada', id, 'Guthix plateskirt' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '59827710-eebc-47e9-81e0-f656ae85394d', id, 'Guthix kiteshield' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'eace9077-2bb9-4db0-b50c-39b892111ed6', id, 'Saradomin full helm' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a7c4ab25-67d3-4b71-aa78-71618df9264b', id, 'Saradomin platebody' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '864f48aa-fabf-4881-941d-d7d46a6fe609', id, 'Saradomin platelegs' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9dbc406f-d7f2-4964-b0a9-6f8e225f24a2', id, 'Saradomin plateskirt' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '93c6e7c2-f847-49c0-9d44-430e60cd73f5', id, 'Saradomin kiteshield' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '11576322-ae24-40a5-a0b2-77cd0aefa0a9', id, 'Ancient full helm' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '71733941-d01a-4e44-8791-35bfccd34dad', id, 'Ancient platebody' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '08e39c2e-e04b-4772-a9df-380bb7936808', id, 'Ancient platelegs' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '24fccb94-84ab-4874-bf8e-90c124ebfb30', id, 'Ancient plateskirt' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '46c9ce9a-99ba-499c-9c25-a61baec3d110', id, 'Ancient kiteshield' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1442e350-80a1-48d1-be37-2929d3a00a41', id, 'Armadyl full helm' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'bbe29c56-b74a-4ea0-8c76-3b039ec55380', id, 'Armadyl platebody' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'dc743a69-1a06-4f6c-95d3-f21804488dca', id, 'Armadyl platelegs' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3477dee3-2ede-464b-a84e-aaca26fb3429', id, 'Armadyl plateskirt' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ee899ab8-1857-4ca1-92ab-e8fe9f8aac88', id, 'Armadyl kiteshield' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c02f2f5e-c69b-4167-8923-7c8b98c36fde', id, 'Bandos full helm' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4d4a03db-dab0-4622-8102-cb878f4a7810', id, 'Bandos platebody' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '03c50c5d-6d4c-44bd-ba39-dc14474e8aa8', id, 'Bandos platelegs' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'aecb06c6-0ae2-48d6-9f39-0c04c89f9a46', id, 'Bandos plateskirt' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9688ad30-ac69-4adf-8add-19cc835fdbd4', id, 'Bandos kiteshield' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9afec42f-5cb1-4465-afab-49f1219ffa26', id, 'Rune shield (h1)' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd7fb3422-32a5-4892-879e-9cb7fed85079', id, 'Rune shield (h2)' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e144edda-6481-49c0-b6ac-19e3baa3f247', id, 'Rune shield (h3)' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd3a8978e-e428-4452-b4b0-9e5d2f65e21b', id, 'Rune shield (h4)' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '18faabb1-39db-41aa-b360-26fdc39ee259', id, 'Rune shield (h5)' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4464a09c-1cab-4672-a6e6-55350384f52d', id, 'Rune helm (h1)' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '879eba0a-a85d-4945-9096-d7759f128163', id, 'Rune helm (h2)' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'edcf144a-9f00-42bd-a2cf-ce030cd1e304', id, 'Rune helm (h3)' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0b6409e8-2383-4557-b796-d8392e1b8604', id, 'Rune helm (h4)' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6ec0f47f-52a6-4c91-b87d-1e0708e114e8', id, 'Rune helm (h5)' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f303e36d-bf5a-469c-8f93-1eabd67d8814', id, 'Rune platebody (h1)' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7b484c1e-1a09-4441-8d87-3d939a73c02e', id, 'Rune platebody (h2)' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5d7f478d-ff35-4a02-a7f5-3c7c0a44aee7', id, 'Rune platebody (h3)' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c646b4e0-3d8b-4caa-8a0f-bf1394758cd9', id, 'Rune platebody (h4)' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3740d045-9a6f-4450-9755-250a294ecb6c', id, 'Rune platebody (h5)' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6a716bb2-de5d-4089-a322-77ed59ebf068', id, 'Saradomin coif' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f6e83db7-078a-4853-ad02-f1dc7b7a96e1', id, 'Saradomin d''hide body' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9ce9a1fe-cdd9-4bec-8f1e-0fd36dda7748', id, 'Saradomin chaps' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd858e9ec-a6ae-43f2-bfab-0f066334169d', id, 'Saradomin bracers' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '332ce144-8461-4052-8bb6-2f77581275b5', id, 'Saradomin d''hide boots' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ca5e4689-c6fb-4f61-b2c2-396834f6ae14', id, 'Saradomin d''hide shield' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ffff723b-cea7-4b6a-b735-96d2f5a74282', id, 'Guthix coif' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '53d7c141-b6a3-4660-8b6c-9661e683300d', id, 'Guthix d''hide body' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '12bcd7b5-0258-4c39-8fa6-0b85aecde464', id, 'Guthix chaps' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '66bfed56-4f36-4f60-819b-16e9f2538304', id, 'Guthix bracers' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a1ec3fd6-3d6f-43f5-8e34-1334cda153e3', id, 'Guthix d''hide boots' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f8a14d12-0838-4999-aab7-33fabcad4f09', id, 'Guthix d''hide shield' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9c6aa71e-7fc9-40e4-94ee-6fa4d607f75d', id, 'Zamorak coif' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '842e1110-afad-4146-974b-334b67624d97', id, 'Zamorak d''hide body' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '53d74887-99f6-4c38-9a7a-7d2aa75838f6', id, 'Zamorak chaps' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a1ab9008-b19b-44e7-969a-64ba21fa5a81', id, 'Zamorak bracers' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd267a9e7-2452-4d2b-bf1f-5a8e191e521c', id, 'Zamorak d''hide boots' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5af2cbbc-b0be-4f50-82b8-7269f36be68f', id, 'Zamorak d''hide shield' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7d0ba939-0428-4505-bc5b-76e3897280da', id, 'Bandos coif' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8936feee-74d8-4a79-86ea-ec15b35742d7', id, 'Bandos d''hide body' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '85a650a1-4450-4b62-b133-fad94db39a0e', id, 'Bandos chaps' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b8ac1b08-1ec8-4a0d-9ff8-4598e20b8e8a', id, 'Bandos bracers' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '10dad0d7-89c3-412d-9970-d1d0d3488f7e', id, 'Bandos d''hide boots' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '76315abb-afff-4a86-94b9-81c8a009fb8c', id, 'Bandos d''hide shield' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8bc87591-1213-413e-b338-edaad5b9307b', id, 'Armadyl coif' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'edbc4fdf-eafb-442d-933a-01610380945a', id, 'Armadyl d''hide body' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '12754a22-f296-4db7-846c-52c52d66a991', id, 'Armadyl chaps' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8e2efc47-8ec2-4e7d-a4c2-568a2ae37267', id, 'Armadyl bracers' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c64d430e-3c36-4af9-87a4-d19a2ca41485', id, 'Armadyl d''hide boots' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '267b4bdf-c5c9-4ec7-96a2-21b035c2441e', id, 'Armadyl d''hide shield' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ccbd138c-5abd-40a6-a20c-cec4fee416d7', id, 'Ancient coif' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '57330e6e-ecd6-498c-b80f-ca9e1d951394', id, 'Ancient d''hide body' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '21f357df-8763-4b47-8b0c-47ac709575e2', id, 'Ancient chaps' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5485a0ec-43b5-4cd4-bebc-0416c3f665e2', id, 'Ancient bracers' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2f330366-50e5-41c5-996e-092d02207ef5', id, 'Ancient d''hide boots' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'cc296e85-553b-4cac-9597-ef6b49be1f9f', id, 'Ancient d''hide shield' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '80adc340-f32a-4cdb-8369-11813e22bb54', id, 'Red d''hide body (t)' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'fe4cb7e6-c139-4ed9-b583-ddead827780c', id, 'Red d''hide chaps (t)' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd98083c6-5a66-47f3-b794-916e8fe22e11', id, 'Red d''hide body (g)' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '82eaaa26-1349-4bf2-beea-b67b8aa6793c', id, 'Red d''hide chaps (g)' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '21d057e9-28f1-4ea2-89a0-02d0b9a37a14', id, 'Blue d''hide body (t)' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '012f4a9f-7d44-4cca-b36d-393d136648d5', id, 'Blue d''hide chaps (t)' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8fe4cdeb-d922-4d03-a1ec-90ac9a66ff05', id, 'Blue d''hide body (g)' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '013fde18-ac99-4bb5-b864-af20eb4ae3c3', id, 'Blue d''hide chaps (g)' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '84b1b7af-1cec-441d-bbd1-9d6d3e00e5ec', id, 'Enchanted hat' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '93e2c35a-1d2b-4b8c-9cb3-be636cac290a', id, 'Enchanted top' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '86913f1e-986f-4648-80ca-c1b0d31183d4', id, 'Enchanted robe' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2ca68d12-b418-41d3-90b1-02cf10cd1afb', id, 'Saradomin stole' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a60e0db3-7b22-4ebb-bb1b-994e5ac1ec03', id, 'Saradomin crozier' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a7a4cdd7-ce2c-41c9-9aea-a653b7b33278', id, 'Guthix stole' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f6093a9c-110b-4edd-974a-747e64c70d3c', id, 'Guthix crozier' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7f2b1cb9-292e-461a-8f81-bed7a0e687c4', id, 'Zamorak stole' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f1462e29-4854-408f-ba90-bd259315e8b0', id, 'Zamorak crozier' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '73b174d9-59fa-4030-8935-f4cc151677ac', id, 'Zombie head (Treasure Trails)' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '52b24e1f-8c0e-4256-8b2b-4613f0ea08c8', id, 'Cyclops head' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b22057af-bb95-4cb0-8588-751206ff747e', id, 'Pirate''s hat' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'bbf101fb-1d3e-45c7-ac6b-67cff2f5724d', id, 'Red cavalier' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '821a0384-c54b-4fdb-a770-7d8fe0e7e6fa', id, 'White cavalier' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e8d0659d-f2b0-45d9-85de-4bdd95cc6ba5', id, 'Navy cavalier' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5bd765b1-f32b-4fa7-8225-a9822cf551ea', id, 'Tan cavalier' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7de0ae18-9392-41ae-a1c8-8baeac5e60bb', id, 'Dark cavalier' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'bb479616-d11f-4040-93f2-009594dc95b2', id, 'Black cavalier' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1fdebe10-7fb5-4cac-a089-29499cee01a6', id, 'Pith helmet' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3218c4f9-a613-419a-b841-afeccd383c4e', id, 'Explorer backpack' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '33a1a859-63b5-46c2-b967-05a63034eab5', id, 'Thieving bag' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '923f37c6-00c3-451f-b34d-4ff90897519b', id, 'Green dragon mask' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'bb7a9048-6654-44ab-b655-e000bce28d43', id, 'Blue dragon mask' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f9047166-cdd4-4eb7-b615-8c72c96c3677', id, 'Red dragon mask' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e0be9a6d-38fc-43ef-866d-d9d497f43a39', id, 'Black dragon mask' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'dd07aca5-363f-4b10-b7d9-86a9c6ac2d21', id, 'Nunchaku' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0404e954-77fd-4c74-b082-767fab7de2dd', id, 'Dual sai' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a4e316c7-bc9e-4092-8e3a-c1e4f0d6de2a', id, 'Rune cane' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9de7e888-aa95-4925-8b24-1a7fd802aa59', id, 'Amulet of glory (t)' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '200bfc58-9660-41d8-88f4-1d9c048ce5aa', id, 'Magic comp bow' FROM item_groups WHERE name = 'Hard Treasure Trails';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('9672a102-be9d-4219-82db-fc713fa83d3f', 'Elite Treasure Trails', 'Collection log · Clues') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '20528700-8eef-4eb0-a8b4-2c2e56f6e488', id, 'Ring of 3rd Age' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a95ec4ae-afb4-49c7-972e-691774fcfc08', id, 'Fury ornament kit' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a6d9eccc-1559-46d7-bffd-3a3ee1d6d373', id, 'Dragon chainbody ornament kit' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c657b25c-c972-4c9b-b272-42dac449af35', id, 'Dragon legs/skirt ornament kit' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a36f7d38-6f29-45bb-8938-cc3eb99db2b7', id, 'Dragon sq shield ornament kit' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9c65c4e4-ad74-4b86-be80-9fef300b679c', id, 'Dragon full helm ornament kit' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2dd6c055-8425-44d1-b386-79e032771b38', id, 'Dragon scimitar ornament kit' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ed4c68b8-ac96-4011-8955-6b92f40c94f4', id, 'Light infinity colour kit' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8592cec6-a5f1-489c-a216-f8ec13100c7b', id, 'Dark infinity colour kit' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '70b63964-5509-481d-b3b0-334473d036c2', id, 'Holy wraps' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '02b9006a-964b-436f-a0c2-98bb3ff51147', id, 'Ranger gloves' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '88ea4d72-7d26-48e7-8bbf-bd31056eb2f4', id, 'Rangers'' tunic' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '88c92804-237f-4424-8d49-ae45c054bd45', id, 'Rangers'' tights' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd4de14b9-1506-48cf-82b8-a9a3713199db', id, 'Black d''hide body (g)' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'cb578ec0-f267-4bd0-8a26-e6b179996352', id, 'Black d''hide chaps (g)' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4a1e8cd0-a558-41c3-838c-62c245e351ee', id, 'Black d''hide body (t)' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2276f1ba-e6b4-4512-9157-0171b577fd63', id, 'Black d''hide chaps (t)' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ed5835d5-b386-46f2-af79-7a06eaa0ce1f', id, 'Royal crown' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '445bd8af-428e-44a9-9ebd-d81b0474049a', id, 'Royal sceptre' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3fb2c328-8a29-4938-8a5f-9aa04cfdcd95', id, 'Royal gown top' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8c7d9f37-7e64-4dc7-b1b1-0b5b9d9deb93', id, 'Royal gown bottom' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'fa519357-0539-43af-ac84-fcd42101f5be', id, 'Musketeer hat' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '006b611c-b683-4275-8fc4-4d59814313cf', id, 'Musketeer tabard' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '414d32bd-60d1-4c65-9716-d2e50fe018e2', id, 'Musketeer pants' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1b02538f-9899-4435-8e89-a36a1c7ea003', id, 'Dark tuxedo jacket' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '211347b5-fcb6-4a5c-92f3-d0dbd4ed886b', id, 'Dark trousers' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a59d3cb3-ca55-4b5b-9233-a290b78d0ede', id, 'Dark tuxedo shoes' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'aff31216-57de-4155-b73c-6c63cd0f3fba', id, 'Dark tuxedo cuffs' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2a0f26eb-4b20-48c0-b80b-4f6eb0ee2f87', id, 'Dark bow tie' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '69af344b-5cd7-498e-8f1b-ccffd98c408e', id, 'Light tuxedo jacket' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6083719f-1766-4b8b-a4c8-50130ffc0384', id, 'Light trousers' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '615b6d99-601a-460f-a410-be6ce0c8d8fd', id, 'Light tuxedo shoes' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8866beec-fff9-4273-b628-3a8d7abc4a47', id, 'Light tuxedo cuffs' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1968b4f3-de53-47ab-b918-055002aab13a', id, 'Light bow tie' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c8397928-8e10-4d25-8ccf-c6edb6070bb6', id, 'Arceuus scarf' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a192b8e8-1a12-48a7-8bd8-3c5daafa22f3', id, 'Hosidius scarf' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5f661b85-1fa9-47bc-b197-3716a244c54a', id, 'Piscarilius scarf' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8ba97d7b-c481-46a3-b6b2-ac79a1318fad', id, 'Shayzien scarf' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'cab0bc93-809b-4f77-a667-25654030ace5', id, 'Lovakengj scarf' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c4f67fcb-dc08-48cd-ac48-89ccd49f545d', id, 'Bronze dragon mask' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '58e3403e-dc89-4e69-9410-cdd815e9e137', id, 'Iron dragon mask' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '82d766b0-201e-4ebc-9b27-c5172d79b9e9', id, 'Steel dragon mask' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7876ca29-5560-400f-ba72-2b33ce3c8a40', id, 'Mithril dragon mask' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'cd840ec0-ebf7-4ab9-a8a9-eee2bcc294ff', id, 'Adamant dragon mask' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c946554a-8e42-4849-bcfa-7642a736605e', id, 'Rune dragon mask' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '91572373-1d0d-4c90-9895-40b01873932b', id, 'Katana' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6c2041cc-413f-4b0b-b3fa-1f7de3ffb76d', id, 'Dragon cane' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '78ac55b0-9e6d-4be6-965e-f72d97373dde', id, 'Briefcase' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5d8839ff-a3ba-4aa0-96e7-bc94b2526408', id, 'Bucket helm' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3edee0d4-8d28-448f-b53e-77fa5f8c0d72', id, 'Blacksmith''s helm' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9b71f96a-0ca5-4237-b378-362103a3a299', id, 'Deerstalker' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '73faf162-ca14-434c-bad9-9dc61e533d3c', id, 'Afro' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'fd6d65aa-c1da-413e-9955-b04eb8ae092d', id, 'Big pirate hat' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '03e1d42a-70f8-4785-8953-20393afb941a', id, 'Top hat' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '76884c16-0066-4d00-87b2-1068aacd2e7b', id, 'Monocle' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5f0c70d3-567b-4953-9466-5d4988318249', id, 'Sagacious spectacles' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4ec6897a-3848-4e6c-9a13-31449ea93284', id, 'Fremennik kilt' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'cf4f8900-d279-4e43-a094-ea4bc207e8b0', id, 'Giant boot' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0753b8e5-acc8-4e88-8c2f-56b791a0853c', id, 'Uri''s hat' FROM item_groups WHERE name = 'Elite Treasure Trails';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('f89816d0-ebdb-4ac1-9a44-baa1944cfd89', 'Master Treasure Trails', 'Collection log · Clues') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3f50f754-dd1d-4e47-a2d0-d49ede43148e', id, 'Bloodhound' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8291f16c-9141-4fbb-9965-39b5586c7436', id, 'Ring of 3rd Age' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e0f153ad-b072-4823-ba69-6d51885d8115', id, 'Armadyl godsword ornament kit' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9d9d3bea-8c94-4d64-9e2f-b4b755633180', id, 'Bandos godsword ornament kit' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '696d18b4-f23e-4e8d-aa3c-fa6e0e3d4998', id, 'Saradomin godsword ornament kit' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '86df4c7a-4b1e-467e-9225-964192caf839', id, 'Zamorak godsword ornament kit' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b66d99ae-c83e-46dd-98af-a7aec246fdf1', id, 'Occult ornament kit' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '58cd00b3-a3c9-417b-845d-8cba758e2527', id, 'Torture ornament kit' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'fad0c067-f037-4c2e-bfb3-e8a3dd57950c', id, 'Anguish ornament kit' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c6b99cb1-cb1d-4722-a6f6-8bf2cd87e58a', id, 'Dragon defender ornament kit' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f434e33f-397e-4d50-8b07-33cea9c4d5c4', id, 'Dragon kiteshield ornament kit' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e75f7d3d-bfaa-456c-ba82-011a42157d86', id, 'Dragon platebody ornament kit' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f4af4365-8fa4-4f66-932d-6dea99d2b223', id, 'Tormented ornament kit' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '23eedcee-7032-45e7-b025-7733a5cc67a1', id, 'Hood of darkness' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7b36f34b-5411-407c-8f18-bf0fb11ad475', id, 'Robe top of darkness' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '671824f3-951b-4440-b3f3-c60c7dfcb04d', id, 'Robe bottom of darkness' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6d983a24-319e-4613-af78-6868ef2ca5e5', id, 'Gloves of darkness' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'fad950d4-6284-4686-9326-74185ad491fd', id, 'Boots of darkness' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd13be23d-1bcb-483f-9b41-ec7b7762e76e', id, 'Samurai kasa' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd9259eba-6c79-48e4-bc5c-2b86db1b982e', id, 'Samurai shirt' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4cf32d1a-ba66-48dd-b6d7-232cb141823d', id, 'Samurai greaves' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2085e183-594f-44e4-a143-0f07cd2f10ae', id, 'Samurai boots' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '83b71710-0a49-48b0-8494-3bda626b041f', id, 'Samurai gloves' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '64141aa5-d97c-4d70-afb8-c60232193373', id, 'Ankou mask' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5ab7884d-7d0f-4682-8541-265e44762450', id, 'Ankou top' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0fbbb1b2-4981-476b-b1f6-8b4eadf95840', id, 'Ankou gloves' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '84b63924-d387-4143-94c1-865b1322c2d5', id, 'Ankou socks' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7dfdf004-1db9-4b91-819b-219d1e7d7e83', id, 'Ankou''s leggings' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8d2e42e7-5dfb-4848-a8b5-f4f30b3fea80', id, 'Mummy''s head' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '603993aa-a373-4d61-90c6-1ff65b71a0e8', id, 'Mummy''s feet' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4fe27376-03e2-4691-bcdf-3c8cf13e2c42', id, 'Mummy''s hands' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '104852d1-c1e5-49be-899a-d3c8cfe16196', id, 'Mummy''s legs' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1cf987ff-64ab-4eb9-9c02-a61f6ef00ec0', id, 'Mummy''s body' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '735c9863-8937-4c96-8880-1cd5a365c601', id, 'Shayzien hood' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '49704757-b742-4a10-baae-4d23dc4a5e72', id, 'Hosidius hood' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '813ad529-3f40-433f-b8cc-1fd6d486ca9f', id, 'Arceuus hood' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3afcbf3b-5f57-4fcd-a7dc-46191c63f957', id, 'Piscarilius hood' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5485c866-006b-4a4d-866a-f0b1f60aec45', id, 'Lovakengj hood' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '28e7be51-a352-4d28-bbda-3abd24d2aa5a', id, 'Lesser demon mask' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b33f704a-42a1-4fa0-a0a1-d74fd01fb01f', id, 'Greater demon mask' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8b0e8e8e-7eed-4a7a-afe1-cd0a58e0a4d3', id, 'Black demon mask' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '93f61362-6e44-4010-a8cb-7f4172871a2d', id, 'Jungle demon mask' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd340e718-c6c4-4545-bea0-376f0bfe303d', id, 'Old demon mask' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '57196a74-4fb7-4803-ac36-78929f48aa71', id, 'Left eye patch' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0c76a2b1-7f3d-4736-822e-936a79424611', id, 'Bowl wig' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0a9bc964-6ba1-450e-b5ad-96faa78b1f20', id, 'Ale of the gods' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b77b573d-d9b4-41ea-9a9e-6d784e9db968', id, 'Obsidian cape (r)' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '95e7f4c7-a637-46d5-92e5-ae85fd7612b9', id, 'Half moon spectacles' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '02c4ded5-2b18-4e08-8225-a39091e94d6c', id, 'Fancy tiara' FROM item_groups WHERE name = 'Master Treasure Trails';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('80d17043-40da-460a-8838-fa5ae990a08f', 'Hard Treasure Trail Rewards (Rare)', 'Collection log · Clues') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e5abe329-2c7b-4fd8-924b-bd90bf0fd56c', id, '3rd Age range coif' FROM item_groups WHERE name = 'Hard Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '64be2d12-e045-4cd5-b62d-d1cb16166363', id, '3rd Age range top' FROM item_groups WHERE name = 'Hard Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7b5bb63a-feba-404e-9139-687b11a14069', id, '3rd Age range legs' FROM item_groups WHERE name = 'Hard Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2976e41c-8ff9-439c-b5fe-a64cfc02de06', id, '3rd Age vambraces' FROM item_groups WHERE name = 'Hard Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'aa8799ba-6ba2-4761-9360-c02139d016f7', id, '3rd Age robe top' FROM item_groups WHERE name = 'Hard Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a6d97fae-0f68-4658-b864-f0a1bb75f213', id, '3rd Age robe' FROM item_groups WHERE name = 'Hard Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7786f4f5-7fe5-46ab-a7f0-ace5041766c8', id, '3rd Age mage hat' FROM item_groups WHERE name = 'Hard Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c9413f4d-83b9-4e5c-8807-6d9eda1aad1b', id, '3rd Age amulet' FROM item_groups WHERE name = 'Hard Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b57b8404-6f4f-453d-a7bc-f35692a10772', id, '3rd Age plateskirt' FROM item_groups WHERE name = 'Hard Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'fe4a9a1e-3207-4431-8a31-9f3c2c1382e0', id, '3rd Age platelegs' FROM item_groups WHERE name = 'Hard Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7c7346da-e138-483f-ab0e-9c13cb7c8df1', id, '3rd Age platebody' FROM item_groups WHERE name = 'Hard Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '35731063-14f6-42bd-8bca-fd9f3e583bfd', id, '3rd Age full helmet' FROM item_groups WHERE name = 'Hard Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4107cd25-8e60-4eda-b250-718962e1b3ea', id, '3rd Age kiteshield' FROM item_groups WHERE name = 'Hard Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3ad49109-fc6f-4588-b000-45726e4f3524', id, 'Gilded platebody' FROM item_groups WHERE name = 'Hard Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3e2fb8f3-9140-4dcc-8a46-3774aaf154cc', id, 'Gilded platelegs' FROM item_groups WHERE name = 'Hard Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '07f01148-912d-44ed-8f7f-dba1e5b13117', id, 'Gilded plateskirt' FROM item_groups WHERE name = 'Hard Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7fa26ca3-1571-4fac-9b55-b931aa914880', id, 'Gilded full helm' FROM item_groups WHERE name = 'Hard Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'eceb258b-ae73-4430-b699-cae8b1f27249', id, 'Gilded kiteshield' FROM item_groups WHERE name = 'Hard Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9646c074-31e1-48f2-83ad-2c0b7404b7d8', id, 'Gilded med helm' FROM item_groups WHERE name = 'Hard Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e8d99732-bc4b-4c74-8292-c126cf58938c', id, 'Gilded chainbody' FROM item_groups WHERE name = 'Hard Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b9a321e4-3a9d-4edb-b466-604bcc26d9a5', id, 'Gilded sq shield' FROM item_groups WHERE name = 'Hard Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5de200e3-677b-4692-81f7-4271b2acfd85', id, 'Gilded 2h sword' FROM item_groups WHERE name = 'Hard Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '41cda5e1-cb02-4990-bd54-382f9d54a4cc', id, 'Gilded spear' FROM item_groups WHERE name = 'Hard Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4961c10c-9dbf-4a72-acb9-b147ab47d1f6', id, 'Gilded hasta' FROM item_groups WHERE name = 'Hard Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('da683434-ddec-4d09-97a7-4ae6b6e36adf', 'Elite Treasure Trail Rewards (Rare)', 'Collection log · Clues') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c7394a34-702f-43ad-95d1-306c2eeb5690', id, '3rd Age longsword' FROM item_groups WHERE name = 'Elite Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8a3de0f1-269d-4377-a9c3-c9610ea7418f', id, '3rd Age wand' FROM item_groups WHERE name = 'Elite Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd55dfeca-b4ed-4b79-b003-34dbfe29f817', id, '3rd Age cloak' FROM item_groups WHERE name = 'Elite Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '33f25673-b46f-4d98-9987-51003cf6d216', id, '3rd Age bow' FROM item_groups WHERE name = 'Elite Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b6eca97b-9447-4259-aa34-9a6f9f9eceaf', id, '3rd Age range coif' FROM item_groups WHERE name = 'Elite Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '347a64c8-e41d-4ca2-a814-779f145eb9dc', id, '3rd Age range top' FROM item_groups WHERE name = 'Elite Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2f3a6317-e3fb-43e5-8686-68c108f1fdce', id, '3rd Age range legs' FROM item_groups WHERE name = 'Elite Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a275b0c2-a810-48c5-9fd9-aaf31106b10c', id, '3rd Age vambraces' FROM item_groups WHERE name = 'Elite Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '906c45a9-d60e-48aa-be06-a97735da71de', id, '3rd Age robe top' FROM item_groups WHERE name = 'Elite Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a99e5c1f-c529-4048-8818-8b06176b2b8d', id, '3rd Age robe' FROM item_groups WHERE name = 'Elite Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '15fdff3b-02ac-4dcd-8b27-942d04936132', id, '3rd Age mage hat' FROM item_groups WHERE name = 'Elite Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4ff06a54-7b98-44c9-b5ac-5202c12f9e95', id, '3rd Age amulet' FROM item_groups WHERE name = 'Elite Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ef1d059f-03c6-43af-8bb1-a1023662dca8', id, '3rd Age plateskirt' FROM item_groups WHERE name = 'Elite Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8e5ffc46-d4cc-443f-9921-6c0a3932646d', id, '3rd Age platelegs' FROM item_groups WHERE name = 'Elite Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1029c169-20cb-4118-a06f-d441840771e6', id, '3rd Age platebody' FROM item_groups WHERE name = 'Elite Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a4313562-06ae-470c-acb9-e978a024a535', id, '3rd Age full helmet' FROM item_groups WHERE name = 'Elite Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8f04fe3a-765b-45f8-81d4-fd9b2580e71a', id, '3rd Age kiteshield' FROM item_groups WHERE name = 'Elite Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4b49f8b2-9610-417e-b879-1c2915d19535', id, 'Gilded scimitar' FROM item_groups WHERE name = 'Elite Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '20a38041-c17e-4334-b0c4-0a7634ec639a', id, 'Gilded boots' FROM item_groups WHERE name = 'Elite Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a83b9dec-5116-4d23-b4cc-38331bb05e22', id, 'Gilded platebody' FROM item_groups WHERE name = 'Elite Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8e09635f-70a7-4a9a-ad21-1961fb8d98a4', id, 'Gilded platelegs' FROM item_groups WHERE name = 'Elite Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '599bd017-0544-4ff2-9d54-1ea8ae4d6086', id, 'Gilded plateskirt' FROM item_groups WHERE name = 'Elite Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e2676f98-c5a8-417d-b9bb-69aec6e69ded', id, 'Gilded full helm' FROM item_groups WHERE name = 'Elite Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '345ea417-6a44-47cd-b0ee-f557d34a8ca3', id, 'Gilded kiteshield' FROM item_groups WHERE name = 'Elite Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '166464d4-bc3e-4f49-9268-e7da294b1818', id, 'Gilded med helm' FROM item_groups WHERE name = 'Elite Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5f67a6c0-e564-4559-a56e-86434c925ddc', id, 'Gilded chainbody' FROM item_groups WHERE name = 'Elite Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4e5e5341-41bd-436a-8ce0-7da4bc34e722', id, 'Gilded sq shield' FROM item_groups WHERE name = 'Elite Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'fad6f590-486f-4a5f-a3c1-814f41b2792f', id, 'Gilded 2h sword' FROM item_groups WHERE name = 'Elite Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a950f4ec-a69d-4ad5-a1e2-9a3da9e7e0cb', id, 'Gilded spear' FROM item_groups WHERE name = 'Elite Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ab73528b-5581-4569-a69f-6071a644fabc', id, 'Gilded hasta' FROM item_groups WHERE name = 'Elite Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '01798961-ffd4-4133-beaa-dd1305dfcb58', id, 'Gilded coif' FROM item_groups WHERE name = 'Elite Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1eda4e45-6413-4f20-bf85-9912c938d618', id, 'Gilded d''hide vambraces' FROM item_groups WHERE name = 'Elite Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5990c5f8-e5ca-4086-834a-2737b717cc92', id, 'Gilded d''hide body' FROM item_groups WHERE name = 'Elite Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3fa1a7be-45fd-4ecd-8ee5-cbf6c67676c5', id, 'Gilded d''hide chaps' FROM item_groups WHERE name = 'Elite Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'bf98de64-a70f-4d67-a621-b13a360f9689', id, 'Gilded pickaxe' FROM item_groups WHERE name = 'Elite Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7923ef3c-7978-4f5f-8451-19c78b59c843', id, 'Gilded axe' FROM item_groups WHERE name = 'Elite Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '592fa328-b289-4d1c-abd7-a697ba20d643', id, 'Gilded spade' FROM item_groups WHERE name = 'Elite Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'fd1eb76c-ac2f-4ff5-9523-f98f4c63e243', id, 'Ring of nature' FROM item_groups WHERE name = 'Elite Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '69b8d708-6989-4f87-ad8b-d6f1d960b474', id, 'Lava dragon mask' FROM item_groups WHERE name = 'Elite Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('92e922a0-4710-4024-9569-61b191ebe77e', 'Master Treasure Trail Rewards (Rare)', 'Collection log · Clues') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c6457f42-c74d-4cbe-8672-df1cc133a96f', id, '3rd Age pickaxe' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2ad6a8b7-b423-43c7-8f17-0f00866e0184', id, '3rd Age axe' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f891de3a-6ddc-495b-a038-a925dc768aa7', id, '3rd Age longsword' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '324f20ee-a2ae-4998-aaf6-c553643dba86', id, '3rd Age wand' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1c3cf121-2db4-49c9-8b82-624a490885ca', id, '3rd Age cloak' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6aa2e110-9f38-4136-925b-e50729debc06', id, '3rd Age bow' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1b4f62a1-ea69-46b0-95f0-47f6739cffeb', id, '3rd Age range coif' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4ed569e0-98da-4e87-a692-e6ee1afe517d', id, '3rd Age range top' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'efbb1dc1-c00e-45eb-84a8-2e524b27e402', id, '3rd Age range legs' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9aa27150-bab4-464d-af17-80d6b3532329', id, '3rd Age vambraces' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6eba0a0b-1e31-4341-a47d-11c6673b43f2', id, '3rd Age robe top' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8477aced-6f44-44bc-804f-c41b8f1fa7c9', id, '3rd Age robe' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '68a179f1-e45d-4b64-b73d-67f7cf7d9481', id, '3rd Age mage hat' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'da8a0b2b-4965-4547-a9b3-104e842d4434', id, '3rd Age amulet' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '16dde758-8f98-480e-9345-9b1eae3bbd91', id, '3rd Age plateskirt' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0cb1c45f-3561-4561-8ce1-f300187c0911', id, '3rd Age platelegs' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'bc503648-e784-47b1-ba26-347261840efb', id, '3rd Age platebody' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5180653b-a5d2-46c9-b20b-981f71417e4a', id, '3rd Age full helmet' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'bc106609-0e7e-44ac-8b3c-169be8483462', id, '3rd Age kiteshield' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b968d039-d49b-40d2-ac5b-303532329aa6', id, '3rd Age druidic robe bottoms' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '01ee90f4-c5ac-41df-8300-72ad58c42a68', id, '3rd Age druidic robe top' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '938e08fa-0196-4119-930a-0fc2d2a19e35', id, '3rd Age druidic staff' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'fb67b4a9-45c0-4c1d-bcbd-a058cad09744', id, '3rd Age druidic cloak' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0e919339-4297-4eff-a4f1-aa89774c56f7', id, 'Gilded scimitar' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'eb3ba723-fbed-4636-9d81-27360f1a1c29', id, 'Gilded boots' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a66c4899-0770-4c19-b2d9-53b4e4ed242e', id, 'Gilded platebody' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'bc938be3-f2e2-42b2-8f5f-f06d33273c0a', id, 'Gilded platelegs' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '822bf8b1-2401-4915-a0b5-3d3c05e1ba1b', id, 'Gilded plateskirt' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '604f741c-0d98-4afd-aa20-c5a18f6479f1', id, 'Gilded full helm' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7c1e5722-175c-465a-9641-f652b5b38375', id, 'Gilded kiteshield' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c3227b81-ac1b-47f0-a40d-6a817370cf0c', id, 'Gilded med helm' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '41e2588a-5640-4eda-a536-8ad63c94a839', id, 'Gilded chainbody' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'daa1e4cf-c85f-418f-9649-badfc7c38089', id, 'Gilded sq shield' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2de6803c-9066-4e4b-a813-d59e24c7030b', id, 'Gilded 2h sword' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'bc65c4d2-154c-46e3-afca-113bb163308b', id, 'Gilded spear' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c24f68b4-b21f-489a-bf65-ca9a651956f6', id, 'Gilded hasta' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2f6d8485-f14d-4185-bf99-9c3d0432a1f5', id, 'Gilded coif' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '734d10dd-a788-43d3-8388-17f4a959fec3', id, 'Gilded d''hide vambraces' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2132bc42-9551-42d4-91e9-1f358af2506e', id, 'Gilded d''hide body' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f20aac9c-a6cd-400a-ada2-2c5ec7fef40b', id, 'Gilded d''hide chaps' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '095ffd5d-1f45-43f6-80f2-bbf2bba3203b', id, 'Gilded pickaxe' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '32665044-5bf8-40c0-acef-09634daa7c8e', id, 'Gilded axe' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd29f9d5c-70ae-4adf-9db8-699ada345a63', id, 'Gilded spade' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ac39aa79-608a-44e1-82e2-0e22e24e78e4', id, 'Bucket helm (g)' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c8412e38-cff3-49fa-a589-c64520359738', id, 'Ring of coins' FROM item_groups WHERE name = 'Master Treasure Trail Rewards (Rare)';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('9c368188-a42e-444d-b73f-e3f15cb526e2', 'Shared Treasure Trail Rewards', 'Collection log · Clues') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3c7200e1-a358-4347-9db5-72119ed99bfc', id, 'Saradomin page 1' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2b8a1134-5683-43d5-ae60-3e96a69160bf', id, 'Saradomin page 2' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '217e6d58-79ac-451c-a4e0-10a352c823f2', id, 'Saradomin page 3' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '63933d4c-a44c-4255-949d-015dc8187505', id, 'Saradomin page 4' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '82c99079-eea1-4a9a-95d6-9302e28fa009', id, 'Zamorak page 1' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'dcd6427e-89ef-4285-82ed-c25e397eecf1', id, 'Zamorak page 2' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '49b90b3a-aa01-4701-940b-e9504ba519da', id, 'Zamorak page 3' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '23a837f7-5e3d-4fc3-88ff-7c6a2e590e43', id, 'Zamorak page 4' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6dc49d35-c7bd-4a1a-9d5b-4748f7833fe6', id, 'Guthix page 1' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e5be2932-a321-4409-a43f-da3a73b2889c', id, 'Guthix page 2' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'fd15e778-4b19-492c-bc91-dd996d4ac128', id, 'Guthix page 3' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e16cba73-0fcc-4a2f-9bf4-a01b2eaa8426', id, 'Guthix page 4' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd1f625f7-f71c-4a9e-bfab-44e4174e8762', id, 'Bandos page 1' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a72e9d1a-9458-4d5a-bf99-17ec7b56c660', id, 'Bandos page 2' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'bd18c798-d44e-44ee-9910-6b5100db2e5c', id, 'Bandos page 3' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8a5bc53b-9ace-47a2-9752-6fb5eecffda7', id, 'Bandos page 4' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7a6d9864-f992-46a5-979d-1a4904a09d64', id, 'Armadyl page 1' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd51ce06f-aa8e-416f-97c6-e21ebc1e231d', id, 'Armadyl page 2' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'aa812951-0c1c-4a79-ac3f-d2d097720965', id, 'Armadyl page 3' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1eccdd12-2381-49d9-b290-367193d05874', id, 'Armadyl page 4' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'eb7a4a38-07a8-465b-9c66-303bc619de27', id, 'Ancient page 1' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8f59b684-fa9c-4e2d-8fc4-afa070daa005', id, 'Ancient page 2' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '547ab81a-65fd-466c-948f-118739fb0fa3', id, 'Ancient page 3' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '65c4cb06-844d-4880-ae8d-8450402dff69', id, 'Ancient page 4' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a3815db7-1f8f-4d51-bffb-95d43f3c38fc', id, 'Holy blessing' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'de5e1f37-1873-4580-bb34-d49197918837', id, 'Unholy blessing' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd6717f83-4c90-4fa1-a6ec-728d9d09895b', id, 'Peaceful blessing' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '423a4ee4-5394-49b0-817d-a3083c8794b2', id, 'War blessing' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c3673f07-7fe3-4328-9371-5db3371db79f', id, 'Honourable blessing' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'bf7a70ec-d299-4ba5-85f0-96936f434cba', id, 'Ancient blessing' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4c5f45cc-fb11-43d3-8e1a-49397568b001', id, 'Nardah teleport' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'eda6c5b6-b031-4dfb-9971-ee9da42e2efa', id, 'Mos le''harmless teleport' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '35d1b16a-f106-4040-b8da-390117fc1b39', id, 'Mort''ton teleport' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'abef31a0-3609-4e43-ba82-b4b1c9b59a9f', id, 'Feldip hills teleport' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6a22f5ac-4bf9-4c01-9bb1-152a3d12186e', id, 'Lunar isle teleport' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '520826ff-4479-4f23-bfa5-e412c9e20129', id, 'Digsite teleport' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5f953b29-ba31-4bf3-8552-5ba93782d518', id, 'Piscatoris teleport' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '734bdf94-6046-4db3-8c20-683f2841c82c', id, 'Pest control teleport' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c9d89bcf-6fc9-48f3-ab2f-ff7fca5f1230', id, 'Tai bwo wannai teleport' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '533df1be-3c40-4b85-9429-30f3bf13bc36', id, 'Lumberyard teleport' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '64b9242f-dc79-4b77-98ed-2ef5f5c45627', id, 'Iorwerth camp teleport' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b6909801-221a-440a-9bde-5283b8e77dad', id, 'Master scroll book' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2452aaa9-4a6e-4c1b-807b-1381806ccb89', id, 'Red firelighter' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '23696959-9384-4650-8729-9ff4e41dfdf3', id, 'Green firelighter' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '22783c78-36cb-49e1-bf4d-285444049d75', id, 'Blue firelighter' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '15c774b4-52e3-4889-a84b-69e5d5c4a35f', id, 'Purple firelighter' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'dc43cb4d-7d29-4484-abf4-baf3e9b914a2', id, 'White firelighter' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '894be2d0-5c28-4374-ba96-a2685ebff19e', id, 'Charge dragonstone jewellery scroll' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8fc15ae9-e0e3-4806-ad68-7aa90cf4addc', id, 'Purple sweets' FROM item_groups WHERE name = 'Shared Treasure Trail Rewards';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('0daa9036-4f2b-4a2a-b498-447fa109a53e', 'Scroll Cases', 'Collection log · Clues') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '37ecbeb4-6db8-4389-a6b0-d4cfc97e51d6', id, 'Minor beginner scroll case' FROM item_groups WHERE name = 'Scroll Cases';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '67df9d63-0fe6-40c9-92f9-e87628262175', id, 'Major beginner scroll case' FROM item_groups WHERE name = 'Scroll Cases';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'fd76a9f7-57d9-4b98-80b2-820f87c7584a', id, 'Minor easy scroll case' FROM item_groups WHERE name = 'Scroll Cases';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0dc87f23-411f-4280-b9b4-097d7aee3d80', id, 'Major easy scroll case' FROM item_groups WHERE name = 'Scroll Cases';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '58d51326-7a30-432b-99df-e9a4c8c3524f', id, 'Minor medium scroll case' FROM item_groups WHERE name = 'Scroll Cases';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '92c9f435-ad47-49a8-8a70-3ae3a89280e2', id, 'Major medium scroll case' FROM item_groups WHERE name = 'Scroll Cases';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '548adbb6-98ee-4792-b300-efd149012ede', id, 'Minor hard scroll case' FROM item_groups WHERE name = 'Scroll Cases';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8a25acc6-ed19-482e-b2a6-15bf1998af61', id, 'Major hard scroll case' FROM item_groups WHERE name = 'Scroll Cases';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '935a1a47-8a35-47a7-977e-b6c45e4428f1', id, 'Minor elite scroll case' FROM item_groups WHERE name = 'Scroll Cases';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '03e68a30-00f8-4b10-9bc4-f6513c7c73cb', id, 'Major elite scroll case' FROM item_groups WHERE name = 'Scroll Cases';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1dc17c69-9074-4964-9756-407ebadf8072', id, 'Minor master scroll case' FROM item_groups WHERE name = 'Scroll Cases';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b07784ea-cf5d-4ed6-93ff-6b2bfa63321f', id, 'Major master scroll case' FROM item_groups WHERE name = 'Scroll Cases';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'dc8228f5-df3d-44f8-add4-2d2f0ee7ffcc', id, 'Mimic scroll case' FROM item_groups WHERE name = 'Scroll Cases';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('b54e526e-8d7b-4e22-9a47-d9d99cbd89a6', 'Barbarian Assault', 'Collection log · Minigames') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5f1f2cda-bf59-4369-9295-e23b5735f2ef', id, 'Pet Penance Queen' FROM item_groups WHERE name = 'Barbarian Assault';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c6f0b87d-7522-40d9-a76d-396f2d0ca10b', id, 'Fighter hat' FROM item_groups WHERE name = 'Barbarian Assault';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f1adffd9-9be1-4a52-bcaa-94125430dd43', id, 'Ranger hat' FROM item_groups WHERE name = 'Barbarian Assault';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6906d4d3-4f55-4de8-880b-fd170356948d', id, 'Runner hat' FROM item_groups WHERE name = 'Barbarian Assault';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'aa7fab6e-2a72-4c55-9b50-88b992cae811', id, 'Healer hat' FROM item_groups WHERE name = 'Barbarian Assault';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9162fa9b-787d-4bdd-b617-a4e66908700e', id, 'Fighter torso' FROM item_groups WHERE name = 'Barbarian Assault';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'dca8df59-c38d-4717-bf41-74256c7ef960', id, 'Penance skirt' FROM item_groups WHERE name = 'Barbarian Assault';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '663dbd07-d6db-4c52-993c-0d0b5133b24d', id, 'Runner boots' FROM item_groups WHERE name = 'Barbarian Assault';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e5aa1865-6809-4137-9d12-f9f4a108a09c', id, 'Penance gloves' FROM item_groups WHERE name = 'Barbarian Assault';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'faf8ad11-ac63-4fa7-8d18-89f24bd50ec2', id, 'Granite helm' FROM item_groups WHERE name = 'Barbarian Assault';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f7987bee-ddcb-4bae-a537-e5d9872af41c', id, 'Granite body' FROM item_groups WHERE name = 'Barbarian Assault';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('0a1d79a8-dc8a-4641-a572-277abf6dd1e4', 'Barracuda Trials', 'Collection log · Minigames') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8c6563d8-185f-414b-a6e4-2743f55a899a', id, 'Stormy key' FROM item_groups WHERE name = 'Barracuda Trials';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'be35e06e-0564-4f28-907f-4448e2dc49d6', id, 'Barrel stand' FROM item_groups WHERE name = 'Barracuda Trials';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '40f26585-11f5-4a70-8e9a-b3cd2e04e43c', id, 'Ralph''s fabric roll' FROM item_groups WHERE name = 'Barracuda Trials';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0d04b587-a933-4773-9989-23400b1091e4', id, 'Fetid key' FROM item_groups WHERE name = 'Barracuda Trials';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6f415477-f3a1-4743-8912-75bd8441619f', id, 'Captured wind mote' FROM item_groups WHERE name = 'Barracuda Trials';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '53824b21-42ea-44cf-9e1c-d23ab571346d', id, 'Gurtob''s fabric roll' FROM item_groups WHERE name = 'Barracuda Trials';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ceb3be2a-4a2d-4a24-b230-0dcafac0403f', id, 'Serrated key' FROM item_groups WHERE name = 'Barracuda Trials';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '45d69840-c6ac-4bb8-81ff-6e95aa834063', id, 'Heart of Ithell' FROM item_groups WHERE name = 'Barracuda Trials';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '057c715d-6ec0-4dad-99e0-f5c27271d67d', id, 'Gwyna''s fabric roll' FROM item_groups WHERE name = 'Barracuda Trials';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('e1fd47b7-6ea8-4f08-a96c-f8b2864536a8', 'Brimhaven Agility Arena', 'Collection log · Minigames') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '812b808b-655e-49a8-9fc0-2e21f698a497', id, 'Agility arena ticket' FROM item_groups WHERE name = 'Brimhaven Agility Arena';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'cf4f40a3-be80-4742-8e50-3ad9f1077570', id, 'Brimhaven voucher' FROM item_groups WHERE name = 'Brimhaven Agility Arena';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a4b209ab-bb6d-40b3-89da-8bc8d0f9ddda', id, 'Pirate''s hook' FROM item_groups WHERE name = 'Brimhaven Agility Arena';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '80adeb5f-08f6-43e1-8bf3-6e9c11a4845b', id, 'Graceful hood (Agility Arena)' FROM item_groups WHERE name = 'Brimhaven Agility Arena';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8d28bc72-757e-4a6d-b68a-ad7c1cdd8998', id, 'Graceful top (Agility Arena)' FROM item_groups WHERE name = 'Brimhaven Agility Arena';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'affd0184-a793-415a-9236-6531e27481cb', id, 'Graceful legs (Agility Arena)' FROM item_groups WHERE name = 'Brimhaven Agility Arena';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3bb38fab-4147-4260-ab85-635afb909b3e', id, 'Graceful gloves (Agility Arena)' FROM item_groups WHERE name = 'Brimhaven Agility Arena';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ad26e2a9-1b73-4b21-b4d3-eb308ef0be50', id, 'Graceful boots (Agility Arena)' FROM item_groups WHERE name = 'Brimhaven Agility Arena';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5e07315a-7b6a-4433-ad18-9c70767bb5ac', id, 'Graceful cape (Agility Arena)' FROM item_groups WHERE name = 'Brimhaven Agility Arena';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('7cf44f94-48d4-4d61-9b73-37fb647b0494', 'Castle Wars', 'Collection log · Minigames') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4ec56a01-4223-416e-b08a-fc44e31bf288', id, 'Decorative helm (red)' FROM item_groups WHERE name = 'Castle Wars';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a3a12684-e8f9-4d72-b05e-61ec1c7bb548', id, 'Decorative full helm (red)' FROM item_groups WHERE name = 'Castle Wars';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd806dcc1-4ccc-4e51-9ff1-303adc43ec20', id, 'Decorative armour (red platebody)' FROM item_groups WHERE name = 'Castle Wars';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd104835e-e20d-4441-9c79-0b9b4a9e4ca6', id, 'Decorative sword (red)' FROM item_groups WHERE name = 'Castle Wars';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'fac1631a-fd91-40c6-966f-f8b854dcea22', id, 'Decorative shield (red)' FROM item_groups WHERE name = 'Castle Wars';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0cdacede-905a-4865-bed0-77caacc814b8', id, 'Decorative armour (red platelegs)' FROM item_groups WHERE name = 'Castle Wars';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5b2b6188-3093-4088-807c-718791bfb27a', id, 'Decorative armour (red plateskirt)' FROM item_groups WHERE name = 'Castle Wars';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e2c6ef03-97e7-404a-b3c0-45a1d4c99b9c', id, 'Decorative boots (red)' FROM item_groups WHERE name = 'Castle Wars';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9f555db2-7582-42b9-bf3b-c9f69adb0a48', id, 'Decorative helm (white)' FROM item_groups WHERE name = 'Castle Wars';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3b83d59b-6fc5-4e9a-9639-0ed769a805eb', id, 'Decorative full helm (white)' FROM item_groups WHERE name = 'Castle Wars';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c344406e-c45a-4f9a-b075-dada01049547', id, 'Decorative armour (white platebody)' FROM item_groups WHERE name = 'Castle Wars';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '049602f4-5cdb-4596-8bf5-7ec5d008f632', id, 'Decorative sword (white)' FROM item_groups WHERE name = 'Castle Wars';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '16de5dfc-2edd-4b47-941d-10b2789dce39', id, 'Decorative shield (white)' FROM item_groups WHERE name = 'Castle Wars';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '481bf7e6-f9ff-4476-80cd-dc0792dac4eb', id, 'Decorative armour (white platelegs)' FROM item_groups WHERE name = 'Castle Wars';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'bdb26dbd-a79c-4b6e-b1d1-cd02b27e0623', id, 'Decorative armour (white plateskirt)' FROM item_groups WHERE name = 'Castle Wars';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3d2801f6-860d-4028-b3c0-a6ccc819f9cd', id, 'Decorative boots (white)' FROM item_groups WHERE name = 'Castle Wars';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a1d53129-39a5-43e9-b058-c188d6c61926', id, 'Decorative helm (gold)' FROM item_groups WHERE name = 'Castle Wars';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c48f2fd5-fd3e-45db-b08a-c77ac4a18e05', id, 'Decorative full helm (gold)' FROM item_groups WHERE name = 'Castle Wars';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '02ced689-9ea7-42ec-a169-9eaf6419862a', id, 'Decorative armour (gold platebody)' FROM item_groups WHERE name = 'Castle Wars';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a69c06b5-017f-4947-a1bd-0dec7a589e35', id, 'Decorative sword (gold)' FROM item_groups WHERE name = 'Castle Wars';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9ca2514a-e213-482e-9755-d4c6dac44bcd', id, 'Decorative shield (gold)' FROM item_groups WHERE name = 'Castle Wars';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '89bd9e4b-8cbd-49f4-ac78-4a2ea4f1c5e4', id, 'Decorative armour (gold platelegs)' FROM item_groups WHERE name = 'Castle Wars';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7379dcf9-190d-42a1-af69-1985ab7c55ae', id, 'Decorative armour (gold plateskirt)' FROM item_groups WHERE name = 'Castle Wars';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ff44fe68-b861-494a-bda1-4efa0c548892', id, 'Decorative boots (gold)' FROM item_groups WHERE name = 'Castle Wars';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '08d10de6-203f-4f87-a651-60686b74479f', id, 'Castlewars hood (Saradomin)' FROM item_groups WHERE name = 'Castle Wars';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0743eef6-97ab-4239-8d3f-2be8592b6eb9', id, 'Castlewars cloak (Saradomin)' FROM item_groups WHERE name = 'Castle Wars';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3a49b904-63e4-421e-89d0-6e7ae4ef2348', id, 'Castlewars hood (Zamorak)' FROM item_groups WHERE name = 'Castle Wars';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'aadd7c42-4fcc-4eb0-9c27-fd01d0b9c764', id, 'Castlewars cloak (Zamorak)' FROM item_groups WHERE name = 'Castle Wars';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b197b72c-7ee8-47b8-8de1-99c28c6028c4', id, 'Saradomin banner' FROM item_groups WHERE name = 'Castle Wars';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a9574e4c-f7ae-4dd5-befc-7275f0be451d', id, 'Zamorak banner' FROM item_groups WHERE name = 'Castle Wars';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '85ee7ef8-5610-43f0-a3c4-5b54344cfe3d', id, 'Decorative armour (magic hat)' FROM item_groups WHERE name = 'Castle Wars';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f9ffe7a3-83a3-4757-8b35-c5eeb5b32495', id, 'Decorative armour (magic top)' FROM item_groups WHERE name = 'Castle Wars';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '20753b0f-fefb-4342-9740-3b0d453363c3', id, 'Decorative armour (magic legs)' FROM item_groups WHERE name = 'Castle Wars';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e418bd7c-4571-46e7-94fb-9b719b0ef0f4', id, 'Decorative armour (ranged top)' FROM item_groups WHERE name = 'Castle Wars';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '53dafa68-768d-440d-bcb9-8df524196379', id, 'Decorative armour (ranged legs)' FROM item_groups WHERE name = 'Castle Wars';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd37e31a8-cb30-4b8d-938d-4ce13721d351', id, 'Decorative armour (quiver)' FROM item_groups WHERE name = 'Castle Wars';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6a95928d-a815-41bc-932c-2d1dcb727b7f', id, 'Saradomin halo' FROM item_groups WHERE name = 'Castle Wars';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a3dad1ff-e9e7-4ead-ba5a-6dce122f57b9', id, 'Zamorak halo' FROM item_groups WHERE name = 'Castle Wars';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8370bd30-cdf2-44a0-b54a-3f145fd9e4f8', id, 'Guthix halo' FROM item_groups WHERE name = 'Castle Wars';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('f4c7ba14-880e-43a4-878d-50971444aa5f', 'Fishing Trawler', 'Collection log · Minigames') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'cbd9a5c7-4f5d-4ebd-9bae-60a6c8934bbe', id, 'Angler hat' FROM item_groups WHERE name = 'Fishing Trawler';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6f68bc65-86e9-429c-a5a4-8dafe6095e8c', id, 'Angler top' FROM item_groups WHERE name = 'Fishing Trawler';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2dd7f918-1c94-4169-9ce6-932f852718f1', id, 'Angler waders' FROM item_groups WHERE name = 'Fishing Trawler';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4b2e7690-7b7f-483d-8278-d0696f9c3ea6', id, 'Angler boots' FROM item_groups WHERE name = 'Fishing Trawler';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('b3e4e147-805c-4b2c-97af-9fcb63cfb4c9', 'Giants'' Foundry', 'Collection log · Minigames') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '159ce48a-821b-48c1-a8ee-d2c2ed0fd6c6', id, 'Smiths tunic' FROM item_groups WHERE name = 'Giants'' Foundry';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '82266b97-0c6d-4ec2-8ebe-64a2f042279b', id, 'Smiths trousers' FROM item_groups WHERE name = 'Giants'' Foundry';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0cb4c97a-f620-4bba-b377-aafc2ed6a1c0', id, 'Smiths boots' FROM item_groups WHERE name = 'Giants'' Foundry';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'afb2c72d-1249-4684-823c-30c1167a32fd', id, 'Smiths gloves' FROM item_groups WHERE name = 'Giants'' Foundry';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '61cb8608-48dd-4a0e-a721-95b16bd35235', id, 'Colossal blade' FROM item_groups WHERE name = 'Giants'' Foundry';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9645b994-4a91-4729-ab87-8c30f07cec91', id, 'Double ammo mould' FROM item_groups WHERE name = 'Giants'' Foundry';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'fcb52047-66cd-4c0d-b759-083f0dd4799f', id, 'Kovac''s grog' FROM item_groups WHERE name = 'Giants'' Foundry';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'bfdc24c8-16ea-4222-84f2-1d5ad1fda2d8', id, 'Smithing catalyst' FROM item_groups WHERE name = 'Giants'' Foundry';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6d331bf0-cacd-4b67-be52-505aebd9fea0', id, 'Ore pack (Giants'' Foundry)' FROM item_groups WHERE name = 'Giants'' Foundry';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('e17606ac-f468-48cf-87b3-b018aedbbf91', 'Gnome Restaurant', 'Collection log · Minigames') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ebe5b5b3-98b4-41b7-881e-3d665a35d90c', id, 'Grand seed pod' FROM item_groups WHERE name = 'Gnome Restaurant';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9c34025d-ab61-4fc4-ba94-54e8bc67df86', id, 'Gnome scarf' FROM item_groups WHERE name = 'Gnome Restaurant';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'daecf213-a0b6-4aee-b6b2-e6f85d427384', id, 'Gnome goggles' FROM item_groups WHERE name = 'Gnome Restaurant';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b9a1bb5a-44d9-4685-96ee-17bb977dcf5a', id, 'Mint cake' FROM item_groups WHERE name = 'Gnome Restaurant';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('42a693c4-ee0e-4b9e-873c-8f5d86cb0416', 'Guardians of the Rift', 'Collection log · Minigames') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8d549dc4-9230-4b62-8d2e-f91f578904a6', id, 'Abyssal protector' FROM item_groups WHERE name = 'Guardians of the Rift';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '53eb7936-c2ca-4db5-a2c0-eeb1f09f8fe8', id, 'Abyssal pearls' FROM item_groups WHERE name = 'Guardians of the Rift';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0f9dd84a-291b-4ba5-9dc4-8271ee74bc24', id, 'Catalytic talisman' FROM item_groups WHERE name = 'Guardians of the Rift';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4c197b9e-3e3b-4ff1-b75d-681857353391', id, 'Abyssal needle' FROM item_groups WHERE name = 'Guardians of the Rift';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'da72f2c6-6f54-4f9b-8a8d-6e98f4dea6be', id, 'Abyssal green dye' FROM item_groups WHERE name = 'Guardians of the Rift';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e432ea4c-4780-415d-b70b-c519f4637342', id, 'Abyssal blue dye' FROM item_groups WHERE name = 'Guardians of the Rift';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1dbf32bb-67bc-4e1b-8744-39925e77de3f', id, 'Abyssal red dye' FROM item_groups WHERE name = 'Guardians of the Rift';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1423be2e-b593-4102-8404-46c435fcdae1', id, 'Hat of the Eye' FROM item_groups WHERE name = 'Guardians of the Rift';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4924580a-7566-4e9b-a41a-251a07af1975', id, 'Robe top of the Eye' FROM item_groups WHERE name = 'Guardians of the Rift';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '34a8dcb2-ec4c-4256-93c2-d66521a18980', id, 'Robe bottoms of the Eye' FROM item_groups WHERE name = 'Guardians of the Rift';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f21e32a5-da89-436a-b89f-ec50aa512085', id, 'Boots of the Eye' FROM item_groups WHERE name = 'Guardians of the Rift';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ad121c04-ef07-46db-be98-aadca60ea4ee', id, 'Ring of the elements' FROM item_groups WHERE name = 'Guardians of the Rift';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8ce2a038-6605-4a64-9e59-d7982970ed29', id, 'Abyssal lantern' FROM item_groups WHERE name = 'Guardians of the Rift';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0ebe19e2-7383-44b7-965f-b38482524d5d', id, 'Guardian''s eye' FROM item_groups WHERE name = 'Guardians of the Rift';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '516fde2a-72de-4a30-965a-c3c3a4b883b3', id, 'Intricate pouch' FROM item_groups WHERE name = 'Guardians of the Rift';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '638ee841-88f4-43b4-b2e3-bb32639fc860', id, 'Lost bag' FROM item_groups WHERE name = 'Guardians of the Rift';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '98a39b2c-8f5c-4f53-941e-bc7bb33a4ae0', id, 'Tarnished locket' FROM item_groups WHERE name = 'Guardians of the Rift';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('80a86bf7-36b6-4aa9-9636-46557eb70a9c', 'Hallowed Sepulchre', 'Collection log · Minigames') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'fae07d95-5230-42a8-a716-1fd232546cb7', id, 'Hallowed mark' FROM item_groups WHERE name = 'Hallowed Sepulchre';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd1e955d3-c6e6-41ff-b361-5a7cdc5ea2aa', id, 'Hallowed token' FROM item_groups WHERE name = 'Hallowed Sepulchre';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5a54ca7d-3705-411d-b1b8-e5cf5aadcdc2', id, 'Hallowed grapple' FROM item_groups WHERE name = 'Hallowed Sepulchre';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ae2c4f20-8382-4046-90cf-f0562127a68a', id, 'Hallowed focus' FROM item_groups WHERE name = 'Hallowed Sepulchre';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'bb36ea48-7a05-4db4-add9-7686b1850fef', id, 'Hallowed symbol' FROM item_groups WHERE name = 'Hallowed Sepulchre';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '627b6051-8b0b-412a-93d6-7fdd59ef8db3', id, 'Hallowed hammer' FROM item_groups WHERE name = 'Hallowed Sepulchre';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ea851170-e0c8-4874-bb25-b4d01758f4ab', id, 'Hallowed ring' FROM item_groups WHERE name = 'Hallowed Sepulchre';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f0e54adc-8bb9-41ab-bf79-bcf36fe963d7', id, 'Dark dye' FROM item_groups WHERE name = 'Hallowed Sepulchre';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '46e6c900-1b0a-47e0-ae9d-39a1e1e43562', id, 'Dark acorn' FROM item_groups WHERE name = 'Hallowed Sepulchre';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ee7d0593-bf84-47fe-955c-88bfa2cb8d2e', id, 'Strange old lockpick' FROM item_groups WHERE name = 'Hallowed Sepulchre';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e9c69e43-5c25-4108-b688-10241b03a334', id, 'Ring of endurance' FROM item_groups WHERE name = 'Hallowed Sepulchre';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1817bb9a-e15c-4f49-90b7-744ea84ddffc', id, 'Mysterious page' FROM item_groups WHERE name = 'Hallowed Sepulchre';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('15c2e577-cf31-4d50-bd74-d2e39e9dd213', 'Last Man Standing', 'Collection log · Minigames') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'df718662-d906-4fff-93b5-b16dad8e27fb', id, 'Deadman''s chest#Cosmetic' FROM item_groups WHERE name = 'Last Man Standing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7d5a9ec2-4ee5-45af-846f-ec2f981c1477', id, 'Deadman''s legs#Cosmetic' FROM item_groups WHERE name = 'Last Man Standing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '15e4ec41-b82c-4007-8af0-bd04e60de87a', id, 'Deadman''s cape#Cosmetic' FROM item_groups WHERE name = 'Last Man Standing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'eabd7367-9859-4e1d-96b4-6c2346664d05', id, 'Armadyl halo' FROM item_groups WHERE name = 'Last Man Standing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ff632fe1-0def-4e23-82e7-f3750a027a1d', id, 'Bandos halo' FROM item_groups WHERE name = 'Last Man Standing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9dad8d13-6098-46b7-9e33-1849b053801f', id, 'Seren halo' FROM item_groups WHERE name = 'Last Man Standing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6d741e47-50f7-4906-94ef-b998952b8ea3', id, 'Ancient halo' FROM item_groups WHERE name = 'Last Man Standing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0ed09b7e-80f9-4a49-852f-1b07540fd21e', id, 'Brassica halo' FROM item_groups WHERE name = 'Last Man Standing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6c687f31-dfe1-4090-bdde-239d5ac35ff1', id, 'Animation overrides#Godswords' FROM item_groups WHERE name = 'Last Man Standing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ba865e47-0a9d-498e-a534-cfdc99557f99', id, 'Victor''s cape (1)' FROM item_groups WHERE name = 'Last Man Standing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'dc7d6f55-b509-4cbb-8575-2281591538ec', id, 'Victor''s cape (10)' FROM item_groups WHERE name = 'Last Man Standing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '15f37d9a-7730-4d43-9344-27a7cdade05b', id, 'Victor''s cape (50)' FROM item_groups WHERE name = 'Last Man Standing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0ed1be2c-f089-49de-926c-72e9bc0453cf', id, 'Victor''s cape (100)' FROM item_groups WHERE name = 'Last Man Standing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4214077f-37e0-4c88-ac27-6f6b9014b61d', id, 'Victor''s cape (500)' FROM item_groups WHERE name = 'Last Man Standing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '66623083-a845-4b09-bf6b-f6311df79adb', id, 'Victor''s cape (1000)' FROM item_groups WHERE name = 'Last Man Standing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '276d7a14-bd45-4c6e-9f2a-933671d65732', id, 'Granite clamp' FROM item_groups WHERE name = 'Last Man Standing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '995816f7-db7a-4ad6-b868-907526af1103', id, 'Ornate maul handle' FROM item_groups WHERE name = 'Last Man Standing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '511e68d8-0c59-4e2d-a2c0-c3b9516729bd', id, 'Steam staff upgrade kit' FROM item_groups WHERE name = 'Last Man Standing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '80a8b491-efc3-48d4-972c-aa11dd33fca5', id, 'Lava staff upgrade kit' FROM item_groups WHERE name = 'Last Man Standing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '68f21ee0-4c2e-4add-aeff-3fcb4b586e22', id, 'Dragon pickaxe upgrade kit' FROM item_groups WHERE name = 'Last Man Standing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '36cac5b1-ecc6-4c42-8bd9-a50c3e5ffcf2', id, 'Ward upgrade kit' FROM item_groups WHERE name = 'Last Man Standing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7fe21b07-ef7c-49ae-b28c-326453ec7517', id, 'Green dark bow paint' FROM item_groups WHERE name = 'Last Man Standing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'edd62746-672b-4201-a3ef-e6290e806f60', id, 'Yellow dark bow paint' FROM item_groups WHERE name = 'Last Man Standing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '32c4ad0c-fe09-4362-bce3-104c112567bf', id, 'White dark bow paint' FROM item_groups WHERE name = 'Last Man Standing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd20a3912-32ed-456c-bb26-794987774624', id, 'Blue dark bow paint' FROM item_groups WHERE name = 'Last Man Standing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '15fdc09a-cfd6-4ed9-8fe9-fd77ca110133', id, 'Volcanic whip mix' FROM item_groups WHERE name = 'Last Man Standing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '33451998-f47c-4802-8aff-edcd0f132150', id, 'Frozen whip mix' FROM item_groups WHERE name = 'Last Man Standing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '56fe9b02-ba24-4f7b-850f-96eaa8e4f7b1', id, 'Guthixian icon' FROM item_groups WHERE name = 'Last Man Standing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '874e4ff1-5ea0-4ae3-b4d2-1e5575eaca95', id, 'Swift blade' FROM item_groups WHERE name = 'Last Man Standing';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('49af6cf7-9544-43ce-ac03-fcfe3b511df6', 'Magic Training Arena', 'Collection log · Minigames') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8536423b-f39d-4f79-9a3d-0645646bf41b', id, 'Beginner wand' FROM item_groups WHERE name = 'Magic Training Arena';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8cdacfdd-c34b-4bf0-a90a-93c77749cbd5', id, 'Apprentice wand' FROM item_groups WHERE name = 'Magic Training Arena';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7bdfa1c3-2ea4-4511-b0b1-4455b5508570', id, 'Teacher wand' FROM item_groups WHERE name = 'Magic Training Arena';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c38c81cc-28b4-4105-97de-b3f7a218dc94', id, 'Master wand' FROM item_groups WHERE name = 'Magic Training Arena';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f51d13b4-5d42-4b96-959c-3745b139cdd4', id, 'Infinity hat' FROM item_groups WHERE name = 'Magic Training Arena';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '96b2d039-3c71-4c74-abb4-560f08af7e26', id, 'Infinity top' FROM item_groups WHERE name = 'Magic Training Arena';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c236f14d-049f-4708-9961-3d7c1f231d20', id, 'Infinity bottoms' FROM item_groups WHERE name = 'Magic Training Arena';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0d1a6976-70b4-43e7-869b-932ac43f4ffd', id, 'Infinity boots' FROM item_groups WHERE name = 'Magic Training Arena';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '73dec4ee-d4ba-46d2-814b-d92f303f3d50', id, 'Infinity gloves' FROM item_groups WHERE name = 'Magic Training Arena';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd0f65f41-2491-4c1b-9237-f724888eb794', id, 'Mage''s book' FROM item_groups WHERE name = 'Magic Training Arena';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '90537361-c332-472c-9c3d-12db48ff3205', id, 'Bones to peaches' FROM item_groups WHERE name = 'Magic Training Arena';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('62d35c3d-09b2-4b3b-86b4-6a4c35f2ad79', 'Mahogany Homes', 'Collection log · Minigames') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'bb3db56f-0cb5-41dc-8d55-07d3b334c168', id, 'Supply crate (Mahogany Homes)' FROM item_groups WHERE name = 'Mahogany Homes';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6f36fe2c-6cfc-4548-b005-8b88df15666b', id, 'Carpenter''s helmet' FROM item_groups WHERE name = 'Mahogany Homes';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e2deb8f3-dbb6-451e-9928-7f6c55fba55f', id, 'Carpenter''s shirt' FROM item_groups WHERE name = 'Mahogany Homes';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '40d43b80-52b3-4309-a783-792767966fbf', id, 'Carpenter''s trousers' FROM item_groups WHERE name = 'Mahogany Homes';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9f5b44a5-58a3-4285-a7ff-4946820afcc0', id, 'Carpenter''s boots' FROM item_groups WHERE name = 'Mahogany Homes';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c8f8bf10-44fe-423c-8208-d7b2f2a9f032', id, 'Amy''s saw' FROM item_groups WHERE name = 'Mahogany Homes';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '451580dc-850b-4d93-a6a6-1a8d932e86ed', id, 'Plank sack' FROM item_groups WHERE name = 'Mahogany Homes';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '165f3b92-ef7a-4d68-879b-60a99b17d727', id, 'Hosidius blueprints' FROM item_groups WHERE name = 'Mahogany Homes';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('4bb365e6-b45a-4ed4-bf8a-72f607f44c73', 'Mastering Mixology', 'Collection log · Minigames') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '69e8c542-be3a-4a6e-9ba5-0af7b2f48b28', id, 'Prescription goggles' FROM item_groups WHERE name = 'Mastering Mixology';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'dd70e328-927d-4fa6-be97-8b27ea4c793d', id, 'Alchemist labcoat' FROM item_groups WHERE name = 'Mastering Mixology';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3fe5ee0c-a141-455c-bf52-1835f04fef4c', id, 'Alchemist pants' FROM item_groups WHERE name = 'Mastering Mixology';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9165953c-3622-44ba-b220-b88bc4917e8d', id, 'Alchemist gloves' FROM item_groups WHERE name = 'Mastering Mixology';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '40190252-1c5e-4157-a0d4-2fb8010e5a24', id, 'Alchemist''s amulet' FROM item_groups WHERE name = 'Mastering Mixology';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '18a03bb2-487b-4689-a81f-a4c69c8f6931', id, 'Reagent pouch' FROM item_groups WHERE name = 'Mastering Mixology';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c4725ba9-a977-443d-bbdd-1f6b8ecb9e4d', id, 'Chugging barrel (disassembled)' FROM item_groups WHERE name = 'Mastering Mixology';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('c999d1b7-0644-4c9e-8fc0-dd3b067f33c0', 'Pest Control', 'Collection log · Minigames') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '25e49498-78d8-451a-b990-21cb33026f3d', id, 'Void knight mace' FROM item_groups WHERE name = 'Pest Control';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '85cd963d-0a2a-4892-9c93-18d888bcca91', id, 'Void knight top' FROM item_groups WHERE name = 'Pest Control';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4c7aa7fb-0a71-4688-8c03-a3253ca7f1ce', id, 'Void knight robe' FROM item_groups WHERE name = 'Pest Control';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '74b51b80-00b0-4fca-948f-1e74eb1e3c41', id, 'Void knight gloves' FROM item_groups WHERE name = 'Pest Control';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '73da6bf3-db2a-4489-bb2e-45de263e81fb', id, 'Void mage helm' FROM item_groups WHERE name = 'Pest Control';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6fee649a-7b19-457f-84c0-629478decd76', id, 'Void melee helm' FROM item_groups WHERE name = 'Pest Control';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '938dac15-ac98-4638-b76c-8e4e55e0e63d', id, 'Void ranger helm' FROM item_groups WHERE name = 'Pest Control';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'cfb1f0ce-f40b-46ac-beda-3956fb1e39b9', id, 'Void seal(8)' FROM item_groups WHERE name = 'Pest Control';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8da1f051-1e1d-4f9a-a878-c0908a9f9c7f', id, 'Elite void top' FROM item_groups WHERE name = 'Pest Control';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f7cac18a-37da-4109-9e9a-e5abdd6bf427', id, 'Elite void robe' FROM item_groups WHERE name = 'Pest Control';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('cc2d6cf6-5e00-4423-b1f4-e80b28c25e08', 'Rogues'' Den', 'Collection log · Minigames') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6c1ed335-08de-4218-a5fe-fd388b06c697', id, 'Rogue mask' FROM item_groups WHERE name = 'Rogues'' Den';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ae5f5d09-9c90-401f-9e27-ece432d8d34b', id, 'Rogue top' FROM item_groups WHERE name = 'Rogues'' Den';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5e373f61-04a1-4f7c-854c-37734a394141', id, 'Rogue trousers' FROM item_groups WHERE name = 'Rogues'' Den';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '06cffecd-8b86-49d6-af7c-530034201082', id, 'Rogue boots' FROM item_groups WHERE name = 'Rogues'' Den';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '18714004-42b0-4e11-bb3d-15c8849dc354', id, 'Rogue gloves' FROM item_groups WHERE name = 'Rogues'' Den';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('910a406a-3614-4c7c-8982-35ad4d497fe0', 'Shades of Mort''ton', 'Collection log · Minigames') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f28a7c1a-1392-4e31-9e02-ab2cd9ae0233', id, 'Amulet of the Damned' FROM item_groups WHERE name = 'Shades of Mort''ton';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '76f017d2-510b-43e8-836d-f87a869d71ce', id, 'Flamtaer bag' FROM item_groups WHERE name = 'Shades of Mort''ton';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '22db4ee2-0b69-47dd-833b-36132cd453d2', id, 'Fine cloth' FROM item_groups WHERE name = 'Shades of Mort''ton';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '198543ca-adef-47e7-9baa-01692c100c67', id, 'Bronze locks' FROM item_groups WHERE name = 'Shades of Mort''ton';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1da7c01a-3b6d-46ae-a0d8-6093846babd1', id, 'Steel locks' FROM item_groups WHERE name = 'Shades of Mort''ton';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f421b602-a857-44bf-85b4-283b55bdc499', id, 'Black locks' FROM item_groups WHERE name = 'Shades of Mort''ton';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '87282405-30f4-4e85-92a9-0a656ddf76fe', id, 'Silver locks' FROM item_groups WHERE name = 'Shades of Mort''ton';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3b157cdf-919e-4f35-b7b8-e1d2a8c495c2', id, 'Gold locks' FROM item_groups WHERE name = 'Shades of Mort''ton';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '09e59621-27b2-414d-b8cd-5dfc09240a85', id, 'Zealot''s helm' FROM item_groups WHERE name = 'Shades of Mort''ton';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f61b83c5-a5fd-4909-8629-159013898f5c', id, 'Zealot''s robe top' FROM item_groups WHERE name = 'Shades of Mort''ton';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4e4a4e31-623e-4b5b-8d5e-a62c3296dd2b', id, 'Zealot''s robe bottom' FROM item_groups WHERE name = 'Shades of Mort''ton';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3e8cb0b6-3941-4b92-98c4-c0df651111f5', id, 'Zealot''s boots' FROM item_groups WHERE name = 'Shades of Mort''ton';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '48badaa4-55ab-4b17-957a-8537ab31f3fd', id, 'Tree wizards'' journal' FROM item_groups WHERE name = 'Shades of Mort''ton';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '30ac3096-d011-4f62-8447-0cd8ecdbfb54', id, 'Bloody notes' FROM item_groups WHERE name = 'Shades of Mort''ton';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('1177fd6b-8d78-4773-b8af-90c3d11aec54', 'Soul Wars', 'Collection log · Minigames') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'fd26204b-af40-4c8a-8b95-dd3278f66002', id, 'Lil'' Creator' FROM item_groups WHERE name = 'Soul Wars';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a71d5997-774c-436e-a049-133c414168a9', id, 'Soul cape' FROM item_groups WHERE name = 'Soul Wars';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0afe85d4-ff12-4ffd-a70a-483c5a5fa605', id, 'Ectoplasmator' FROM item_groups WHERE name = 'Soul Wars';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('dcbc85f7-f5ad-4522-a651-3c293868f289', 'Temple Trekking', 'Collection log · Minigames') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '44eb6961-2f03-4d31-b8a5-0fe3456fa7c0', id, 'Lumberjack hat' FROM item_groups WHERE name = 'Temple Trekking';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '20a73668-38a1-44fd-b500-2ce0dd33b87c', id, 'Lumberjack top' FROM item_groups WHERE name = 'Temple Trekking';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2bbd1307-f59f-444c-a371-05e4916a64a4', id, 'Lumberjack legs' FROM item_groups WHERE name = 'Temple Trekking';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0508b9cc-eb2a-481f-97e9-b53016e054bc', id, 'Lumberjack boots' FROM item_groups WHERE name = 'Temple Trekking';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('f4c532fa-50e9-4785-9d4c-f9bebe365cce', 'Tithe Farm', 'Collection log · Minigames') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f5a26b23-74af-4bc7-9411-d356abfcc90f', id, 'Farmer''s strawhat' FROM item_groups WHERE name = 'Tithe Farm';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '009513bc-721a-44ce-9d69-b5cc4fd39147', id, 'Farmer''s jacket' FROM item_groups WHERE name = 'Tithe Farm';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '21f2106e-3954-4cae-a7b7-dd037f77898a', id, 'Farmer''s boro trousers' FROM item_groups WHERE name = 'Tithe Farm';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd6a21709-702f-424b-966d-50943dfb0e08', id, 'Farmer''s boots' FROM item_groups WHERE name = 'Tithe Farm';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'fece4aef-8e2f-4ea8-8fca-44bb347c872b', id, 'Seed box' FROM item_groups WHERE name = 'Tithe Farm';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'de9a11d1-2caa-4419-a595-933fb0bfcf51', id, 'Gricoller''s can' FROM item_groups WHERE name = 'Tithe Farm';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c82c4dc9-4c94-454f-8611-23b037751672', id, 'Herb sack' FROM item_groups WHERE name = 'Tithe Farm';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('912661bf-38d0-44da-b808-382721d6cb19', 'Trouble Brewing', 'Collection log · Minigames') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c17af44b-370e-4ce8-a979-8d75089d8a02', id, 'Blue naval shirt' FROM item_groups WHERE name = 'Trouble Brewing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f2127437-ec8e-409e-9c96-ba46f0828c88', id, 'Blue tricorn hat' FROM item_groups WHERE name = 'Trouble Brewing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'db859ba3-5d31-4a17-b053-1d34488cef72', id, 'Blue navy slacks' FROM item_groups WHERE name = 'Trouble Brewing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8d1a73d7-19b9-4a11-9dcf-9ce1cbcc096e', id, 'Green naval shirt' FROM item_groups WHERE name = 'Trouble Brewing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'bc39a461-a613-4310-aedf-1c579f0306ce', id, 'Green tricorn hat' FROM item_groups WHERE name = 'Trouble Brewing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '77a76612-46fc-4588-a86d-4e8d684a4453', id, 'Green navy slacks' FROM item_groups WHERE name = 'Trouble Brewing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '20d09937-28bf-432f-9263-5519ae4e5b45', id, 'Red naval shirt' FROM item_groups WHERE name = 'Trouble Brewing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4b7f5a7e-78e9-4071-b46a-45f74dd0be8d', id, 'Red tricorn hat' FROM item_groups WHERE name = 'Trouble Brewing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '00a9c7e1-70de-4c54-baf1-6ce9a10d5f58', id, 'Red navy slacks' FROM item_groups WHERE name = 'Trouble Brewing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '787a1b81-61ec-4a06-8910-b43d075fd13e', id, 'Brown naval shirt' FROM item_groups WHERE name = 'Trouble Brewing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a485d767-98bc-4768-a52c-3218a6bc450e', id, 'Brown tricorn hat' FROM item_groups WHERE name = 'Trouble Brewing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '52588271-00f9-44a6-8f04-013cb98aa617', id, 'Brown navy slacks' FROM item_groups WHERE name = 'Trouble Brewing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '26bfa317-51af-4c81-89fb-1de00accb898', id, 'Black naval shirt' FROM item_groups WHERE name = 'Trouble Brewing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '02355782-f8d4-4be9-a300-d214d855bcf1', id, 'Black tricorn hat' FROM item_groups WHERE name = 'Trouble Brewing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '49e5d6a3-b9d9-43ad-8209-c5ef721b6cb2', id, 'Black navy slacks' FROM item_groups WHERE name = 'Trouble Brewing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c22290c2-942e-44dd-8029-82282f730604', id, 'Purple naval shirt' FROM item_groups WHERE name = 'Trouble Brewing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4625ce0b-fcbf-459c-88b7-01f73363ffef', id, 'Purple tricorn hat' FROM item_groups WHERE name = 'Trouble Brewing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '00444b72-0229-4f87-86c6-d8f1f551365f', id, 'Purple navy slacks' FROM item_groups WHERE name = 'Trouble Brewing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8bf83490-c715-4572-b811-c3046ee9b9cd', id, 'Grey naval shirt' FROM item_groups WHERE name = 'Trouble Brewing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6a93c479-0383-4e47-a976-52b1f87d3ef6', id, 'Grey tricorn hat' FROM item_groups WHERE name = 'Trouble Brewing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a94cd490-2dc1-46da-8d47-f51123c58f9c', id, 'Grey navy slacks' FROM item_groups WHERE name = 'Trouble Brewing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c652bbb6-62a6-4e6f-ad24-bbecef2ef135', id, 'Cutthroat flag' FROM item_groups WHERE name = 'Trouble Brewing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '399652d2-0878-4042-bf60-22a54896523d', id, 'Gilded smile flag' FROM item_groups WHERE name = 'Trouble Brewing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2b49e996-4c89-424e-864d-8e867540e5f0', id, 'Bronze fist flag' FROM item_groups WHERE name = 'Trouble Brewing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5d6fdab7-8014-4864-a58c-5ac4527ebbc2', id, 'Lucky shot flag' FROM item_groups WHERE name = 'Trouble Brewing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e09ccbe3-abfa-479f-ab0f-358131054c58', id, 'Treasure flag' FROM item_groups WHERE name = 'Trouble Brewing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '02499c32-08ef-49ef-ad08-996a037443c5', id, 'Phasmatys flag' FROM item_groups WHERE name = 'Trouble Brewing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2fdb61c7-d88b-4ae1-90c2-04a3408a2195', id, 'The stuff' FROM item_groups WHERE name = 'Trouble Brewing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '759e0d94-1fa3-4c01-8910-cdd6fbfda70c', id, 'Rum (red)' FROM item_groups WHERE name = 'Trouble Brewing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2432a716-1b4d-4065-9104-e1816096e1c8', id, 'Rum (blue)' FROM item_groups WHERE name = 'Trouble Brewing';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('e688c11c-d1e5-4189-aa94-daa6094f149d', 'Vale Totems', 'Collection log · Minigames') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7585fdc8-9812-43b1-9178-22cb1523abff', id, 'Fletching knife' FROM item_groups WHERE name = 'Vale Totems';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b33182cb-acbe-4073-ad29-14cc60b33ecd', id, 'Bow string spool' FROM item_groups WHERE name = 'Vale Totems';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'af8911aa-4c3e-4921-979d-2c15fc805906', id, 'Ent branch' FROM item_groups WHERE name = 'Vale Totems';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ffc15999-f65e-4732-acd3-fe23d632173d', id, 'Greenman mask' FROM item_groups WHERE name = 'Vale Totems';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('08fd1f72-844d-4367-9db4-1f724f2cf5fc', 'Volcanic Mine', 'Collection log · Minigames') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e86d832c-a2b2-4864-8cbe-27fedc4c558f', id, 'Ash covered tome' FROM item_groups WHERE name = 'Volcanic Mine';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6a2ba45d-233e-4ffd-a4ba-60493b0a6543', id, 'Large water container' FROM item_groups WHERE name = 'Volcanic Mine';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4c87474e-dac4-40a2-a5ed-6294e39b4c43', id, 'Volcanic mine teleport' FROM item_groups WHERE name = 'Volcanic Mine';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '62550374-cf16-457f-8e90-a5898dccf7b4', id, 'Dragon pickaxe (broken)' FROM item_groups WHERE name = 'Volcanic Mine';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f8e5752f-c0a5-44a9-8f8b-6e5e41e0bda6', id, 'Prospector helmet' FROM item_groups WHERE name = 'Volcanic Mine';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9d9a82c5-a51b-471d-9130-b337f9d71f2d', id, 'Prospector jacket' FROM item_groups WHERE name = 'Volcanic Mine';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c0b9eac5-72b4-4eb9-973e-a8efd56e274d', id, 'Prospector legs' FROM item_groups WHERE name = 'Volcanic Mine';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '89d10c72-cc03-40c4-ac66-95c51a05126d', id, 'Prospector boots' FROM item_groups WHERE name = 'Volcanic Mine';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('1b56a142-3f57-46c3-91ff-9bf504343fa4', 'Aerial Fishing', 'Collection log · Other') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e7245954-8193-4af4-b027-f9e6b41ba23c', id, 'Golden tench' FROM item_groups WHERE name = 'Aerial Fishing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '27adb4a4-814e-4522-9490-53abe9f5b9c4', id, 'Pearl fishing rod' FROM item_groups WHERE name = 'Aerial Fishing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8642f087-90b3-45e0-8306-42af18488cba', id, 'Pearl fly fishing rod' FROM item_groups WHERE name = 'Aerial Fishing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f6d6f558-ee99-41a7-8679-d481372cdfc6', id, 'Pearl barbarian rod' FROM item_groups WHERE name = 'Aerial Fishing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9fee84c3-4996-4db7-a871-0e7e364862c1', id, 'Fish sack' FROM item_groups WHERE name = 'Aerial Fishing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3050b6e3-5e14-4430-b8e3-fd660da46e92', id, 'Angler hat' FROM item_groups WHERE name = 'Aerial Fishing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5ed49279-835f-41e1-8a68-39374097953d', id, 'Angler top' FROM item_groups WHERE name = 'Aerial Fishing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '95693832-da66-4c0b-946b-20138ebf5af4', id, 'Angler waders' FROM item_groups WHERE name = 'Aerial Fishing';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3375ba84-74bb-42eb-a6ca-e55e7cbc4905', id, 'Angler boots' FROM item_groups WHERE name = 'Aerial Fishing';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('1a618f12-b64f-4251-ba1e-8ab2a9ff50be', 'All Pets', 'Collection log · Other') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'aff242e4-229e-4b34-bb5b-c197d7256171', id, 'Abyssal orphan' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3b425778-4dec-4c26-8864-d1929f590c89', id, 'Ikkle Hydra' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '97bd0c44-87ab-4150-ae9f-9d4e193ef363', id, 'Callisto cub' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a2b75d61-9b37-4ba4-8861-0b2efb70ab37', id, 'Hellpuppy' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'cecd4104-3c8c-4448-a545-59a951bf4c93', id, 'Pet Chaos Elemental' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2b5e0d02-a7be-4736-99cc-d1236187c611', id, 'Pet Zilyana' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '53b7dcf0-a95e-4853-acaa-c61b8dfbc1d2', id, 'Pet dark core' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ca6cf16e-0304-43af-8907-94fc9cb9f272', id, 'Pet Dagannoth Prime' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b411041e-ec6a-48e6-86bf-09babe3cee78', id, 'Pet Dagannoth Supreme' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f2d45676-155a-422a-bdbe-1a3976a1517a', id, 'Pet Dagannoth Rex' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9cf458e3-5019-4492-ba49-b48278c4984a', id, 'TzRek-Jad' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '64dd53e9-4f37-41c5-bd20-5cf6dc387a0e', id, 'Pet General Graardor' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4e086e80-971a-44bc-b1b0-7eebc7b4a5e6', id, 'Baby Mole' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5eb1477c-5317-4375-b797-6b085e7037ea', id, 'Noon' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '710e4b88-245c-4afa-8194-b63e75e0bdca', id, 'Jal-Nib-Rek' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c43b9f8a-ab2e-4843-9216-2ddb9632f8ac', id, 'Kalphite Princess' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd1ebc396-fc4e-41b4-be52-2b77073b8171', id, 'Prince Black Dragon' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c7c1ca44-94ae-4022-ba5d-d92ee6b47281', id, 'Pet Kraken' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'babdc3a8-4696-4f76-b377-9c2e961212dd', id, 'Pet Kree''arra' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4093326d-c8ae-439b-99e3-cff56a52eb36', id, 'Pet K''ril Tsutsaroth' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'da8ef153-2910-4f42-b793-53d3e97500ed', id, 'Scorpia''s offspring' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7f899f15-3fa1-41e0-b697-5d100bbc7230', id, 'Skotos' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0a763a37-8b6c-41b4-8c53-e93e1a29325e', id, 'Pet Smoke Devil' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f1413c54-9854-4532-a701-b2cf9b95a7c2', id, 'Venenatis spiderling' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2bf940a6-95f0-46e8-acd0-f8937c503340', id, 'Vet''ion Jr.' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6e1fd126-e904-4790-8a3e-836a72912f89', id, 'Vorki' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2a563117-af51-493a-80ae-47acd983eb57', id, 'Phoenix' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b03fc79c-0dfa-4a62-a041-ac4d1f5531e1', id, 'Pet Snakeling' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '134b728b-3ee1-411c-a8ad-e9d259c9aa4b', id, 'Olmlet' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ff104bf2-33e6-4aa2-bd6f-3b0683cf0349', id, 'Lil'' Zik' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd02d5b2d-e139-4618-8607-04da00215421', id, 'Bloodhound' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8466b7d3-aa8b-4d3a-a4b0-da7e667f928b', id, 'Pet Penance Queen' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'df6ff7d5-6e86-44db-ad62-22e1760a87fc', id, 'Heron' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e468edba-d26b-45b8-ad1d-9b11f96e86de', id, 'Rock golem' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b3bfd277-706a-4cab-947e-f10e2fd2b80f', id, 'Beaver' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '335bd1c1-e61c-4289-b8d9-e274a927a045', id, 'Baby chinchompa' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ecb4fbf1-aacc-4207-8a90-c026a60f7c4a', id, 'Giant Squirrel' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b8e01b23-465b-40f2-b2a4-e9e50e267988', id, 'Tangleroot' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd5b5be84-5661-45cb-aea0-a053de0f9546', id, 'Rocky' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f922c80a-27b0-4e23-8d4d-8fda2ccba496', id, 'Rift guardian' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '14c29c64-3a69-4cac-b690-825cad8ad8fa', id, 'Herbi' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'df23e97c-23de-49a3-804e-8ef20f4b6dfb', id, 'Chompy chick' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0b54ec25-bea2-4039-bf0c-d0f171d3aa3b', id, 'Sraracha' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0912eaba-5681-4178-93e2-d93b393371a3', id, 'Smolcano' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a37d90fe-33f3-4049-82b9-907b7e66afa8', id, 'Youngllef' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3db4f437-cb02-481a-aecf-f18fd9869f98', id, 'Little Nightmare' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9a727c5f-214c-4503-af77-4dee7381be72', id, 'Lil'' Creator' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0bce29df-be24-465b-9907-1bdd21690161', id, 'Tiny tempor' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b4ef265c-c159-46ca-b89e-8f9076e0cc5f', id, 'Nexling' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ec876991-d918-4443-acac-5ccfc54ea8a7', id, 'Abyssal protector' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '24999956-7407-4dcd-84a5-67942865b07a', id, 'Tumeken''s guardian' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '885519d2-42a6-4bb7-867a-393c7b304e92', id, 'Muphin' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '00d280d9-8d0a-4900-8dae-03b495f1dd11', id, 'Wisp' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b95697b9-adcd-4547-a8bb-45542feec607', id, 'Baron' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5b03549a-6a1e-4a52-9595-90e1112fea29', id, 'Butch' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '74bb8d1e-6309-44ce-90fe-c424d6bd2641', id, 'Lil''viathan' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5eb90c88-7792-4e38-8aa1-2d5b8b001da1', id, 'Scurry' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7eb53b56-60ef-44db-a16a-32ddca1f1b7f', id, 'Smol Heredit' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7c3cc6aa-2322-4b85-83b4-dae721f331ed', id, 'Quetzin' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7c46e7ca-35d2-43ae-b77b-388081f7836e', id, 'Nid' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b6768868-43fe-4fd4-be02-47c57fe87578', id, 'Huberte' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '10077af4-d69e-4d3a-9f45-a103ac0dd39b', id, 'Moxi' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '95133899-29c1-44b4-a803-b5fd9151c543', id, 'Bran' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'cefedf37-a234-4785-a17d-e5948667b021', id, 'Yami' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'bad04d42-dedd-418b-be70-127e858a2a9b', id, 'Dom' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd7e7cab4-aa23-47ea-89a7-e3bccd7b6922', id, 'Soup' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd3f78653-bfea-4806-b176-e810b4177c6b', id, 'Gull (pet)' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1d0dd0a5-a1eb-466c-a79d-a7ddd6bfc0d2', id, 'Beef' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9d81bce4-c5ba-4b7c-90e2-18af844e58b8', id, 'Maggot marquess' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f86ad778-2eef-4ed8-b61c-0c08581d15e4', id, 'Mr McGroot' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b06a1d2e-143a-415f-9891-fc183aab0645', id, 'Aggy' FROM item_groups WHERE name = 'All Pets';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('2fe032b6-ec16-457c-baba-d4950960e30d', 'Boat Paints', 'Collection log · Other') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '25a7bbc3-3154-4afe-9a58-bcbe21268572', id, 'Barracuda paint' FROM item_groups WHERE name = 'Boat Paints';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '551a0279-fc08-4a99-b801-7a3356e4e851', id, 'Shark paint' FROM item_groups WHERE name = 'Boat Paints';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ec32de95-513b-46b6-80ed-42b203f5ce05', id, 'Inky paint' FROM item_groups WHERE name = 'Boat Paints';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '56b0e710-4e25-4221-a05a-4590eaae9dc8', id, 'Angler''s paint' FROM item_groups WHERE name = 'Boat Paints';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c25863e3-1830-4b5d-9496-24b56a0e4a9d', id, 'Salvor''s paint' FROM item_groups WHERE name = 'Boat Paints';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5170ce06-1497-465d-b9eb-b9acfd5a83bb', id, 'Armadylean paint' FROM item_groups WHERE name = 'Boat Paints';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ea2f9f2f-051d-47db-abd2-ba257396be14', id, 'Zamorakian paint' FROM item_groups WHERE name = 'Boat Paints';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f78765e0-2ea2-4097-8669-8857e3ed4931', id, 'Guthixian paint' FROM item_groups WHERE name = 'Boat Paints';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f9133693-5675-4953-9464-364a5d91d19d', id, 'Saradominist paint' FROM item_groups WHERE name = 'Boat Paints';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '815b7638-05a2-4c8a-be18-b7715cca221d', id, 'Merchant''s paint' FROM item_groups WHERE name = 'Boat Paints';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a5df5e89-5948-4d1a-9000-cfd7f40ebacc', id, 'Sandy paint' FROM item_groups WHERE name = 'Boat Paints';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('fbfb5ab5-734f-4cd7-8ae3-4fb67388b9f0', 'Camdozaal', 'Collection log · Other') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a87f7294-0d23-41dc-9eca-d73076d30e1b', id, 'Barronite mace' FROM item_groups WHERE name = 'Camdozaal';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5747467a-301c-47c9-a998-94d86ff33389', id, 'Barronite head' FROM item_groups WHERE name = 'Camdozaal';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '42e97e5c-8541-46be-8c3a-b654972d6149', id, 'Barronite handle' FROM item_groups WHERE name = 'Camdozaal';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6706d8a5-a79c-4f15-8817-e866c4288777', id, 'Barronite guard' FROM item_groups WHERE name = 'Camdozaal';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0cad6354-72cd-4449-b287-7f2a71388ca4', id, 'Ancient globe' FROM item_groups WHERE name = 'Camdozaal';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '63c8ea05-4518-4c05-98bb-656529b8c612', id, 'Ancient ledger' FROM item_groups WHERE name = 'Camdozaal';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7d49a829-a11c-43e5-abb5-42bfee8c034c', id, 'Ancient astroscope' FROM item_groups WHERE name = 'Camdozaal';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '476cefc4-8ae5-4f66-b090-c5134ed31ff6', id, 'Ancient treatise' FROM item_groups WHERE name = 'Camdozaal';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '357f6fbd-d294-4209-a608-bd7c88ade560', id, 'Ancient carcanet' FROM item_groups WHERE name = 'Camdozaal';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7d29b80c-32f0-4aa0-9ab8-133250d6d9da', id, 'Imcando hammer' FROM item_groups WHERE name = 'Camdozaal';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('b0c91ec8-7b09-45cb-bafd-3afcbe73834f', 'Champion''s Challenge', 'Collection log · Other') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '82ea6308-bad1-41f6-a3d6-3557594491c1', id, 'Earth warrior champion scroll' FROM item_groups WHERE name = 'Champion''s Challenge';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'df59346d-de13-4786-8e92-4bcdc4c5648f', id, 'Ghoul champion scroll' FROM item_groups WHERE name = 'Champion''s Challenge';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd98f5c6d-48a6-4aef-9220-2d7aca144882', id, 'Giant champion scroll' FROM item_groups WHERE name = 'Champion''s Challenge';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5190a840-3f2b-436a-b009-12bbd3c67c90', id, 'Goblin champion scroll' FROM item_groups WHERE name = 'Champion''s Challenge';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '679158f8-da78-4c38-a3e0-df1c6fba0c89', id, 'Hobgoblin champion scroll' FROM item_groups WHERE name = 'Champion''s Challenge';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '50dfe9e1-241e-45fa-956e-c1dc17419416', id, 'Imp champion scroll' FROM item_groups WHERE name = 'Champion''s Challenge';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '231bcb1f-4f6a-49c7-88a5-bea4b35e2a27', id, 'Jogre champion scroll' FROM item_groups WHERE name = 'Champion''s Challenge';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9e975c80-e025-44ea-a90d-0a0c13d2db35', id, 'Lesser demon champion scroll' FROM item_groups WHERE name = 'Champion''s Challenge';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c1a9ab59-0696-474f-a8fb-0be33beb49cb', id, 'Skeleton champion scroll' FROM item_groups WHERE name = 'Champion''s Challenge';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd13ce833-9fd2-4cb6-aa30-4ef8f0ffa929', id, 'Zombie champion scroll' FROM item_groups WHERE name = 'Champion''s Challenge';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5b991e68-661a-400d-90ff-3eb3720b6198', id, 'Champion''s cape' FROM item_groups WHERE name = 'Champion''s Challenge';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('985c5ff7-5d52-4cc1-9c7f-cc122b645f72', 'Chompy Bird Hunting', 'Collection log · Other') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a05cbfb4-0b72-436b-a508-1ae4461454a7', id, 'Chompy chick' FROM item_groups WHERE name = 'Chompy Bird Hunting';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1d55d568-377f-49f0-abc0-b1e1701bc3fe', id, 'Chompy bird hat (ogre bowman)' FROM item_groups WHERE name = 'Chompy Bird Hunting';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '76c0fdb2-96f8-4fa8-b356-a70404db2913', id, 'Chompy bird hat (bowman)' FROM item_groups WHERE name = 'Chompy Bird Hunting';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '77743b92-c6b7-4476-a8a9-78d9fb51646d', id, 'Chompy bird hat (ogre yeoman)' FROM item_groups WHERE name = 'Chompy Bird Hunting';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5305bca7-2364-4102-b9b3-e826340fc890', id, 'Chompy bird hat (yeoman)' FROM item_groups WHERE name = 'Chompy Bird Hunting';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e04b7ea6-344d-40fc-b320-62e1205aecba', id, 'Chompy bird hat (ogre marksman)' FROM item_groups WHERE name = 'Chompy Bird Hunting';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e721c5ea-54d0-4bbe-8e25-5a41c98f7df2', id, 'Chompy bird hat (marksman)' FROM item_groups WHERE name = 'Chompy Bird Hunting';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '12131494-24d2-400a-aa62-787b153f7a4b', id, 'Chompy bird hat (ogre woodsman)' FROM item_groups WHERE name = 'Chompy Bird Hunting';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8c264611-ba04-4ebe-8ada-4f25f096ee5f', id, 'Chompy bird hat (woodsman)' FROM item_groups WHERE name = 'Chompy Bird Hunting';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '515a2548-23dc-40e3-889a-99e8f0307c43', id, 'Chompy bird hat (ogre forester)' FROM item_groups WHERE name = 'Chompy Bird Hunting';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8bbb1edf-9bb0-41e4-945e-96661ccc9213', id, 'Chompy bird hat (forester)' FROM item_groups WHERE name = 'Chompy Bird Hunting';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '19bd7f3d-3b70-48fe-ad92-c6138a8e9f40', id, 'Chompy bird hat (ogre bowmaster)' FROM item_groups WHERE name = 'Chompy Bird Hunting';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '000d5144-9ca5-4f83-9579-ab3c0d2ea4a3', id, 'Chompy bird hat (bowmaster)' FROM item_groups WHERE name = 'Chompy Bird Hunting';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2ba93666-8097-4d53-9d0f-e7f3f25ebae5', id, 'Chompy bird hat (ogre expert)' FROM item_groups WHERE name = 'Chompy Bird Hunting';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4f375bb7-cf3b-4c24-970a-40e84896228d', id, 'Chompy bird hat (expert)' FROM item_groups WHERE name = 'Chompy Bird Hunting';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e9502887-f02b-499f-8670-211f4303ae1d', id, 'Chompy bird hat (ogre dragon archer)' FROM item_groups WHERE name = 'Chompy Bird Hunting';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4e7a4dfa-1f55-458c-b9b8-967661b41ae1', id, 'Chompy bird hat (dragon archer)' FROM item_groups WHERE name = 'Chompy Bird Hunting';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b275aeac-0db5-4b30-bc32-b1c4338a04f7', id, 'Chompy bird hat (expert ogre dragon archer)' FROM item_groups WHERE name = 'Chompy Bird Hunting';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a6d67cb6-764b-4bd5-9504-2a3e14e58aac', id, 'Chompy bird hat (expert dragon archer)' FROM item_groups WHERE name = 'Chompy Bird Hunting';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('0e9c0d3b-1f25-440b-bdb4-fc1d42c09d29', 'Colossal Wyrm Agility', 'Collection log · Other') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '02a0a9c7-394f-4883-a655-a5a487c03895', id, 'Colossal wyrm teleport scroll' FROM item_groups WHERE name = 'Colossal Wyrm Agility';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2102e843-30c2-4288-be83-49ba0b56b0dd', id, 'Calcified acorn' FROM item_groups WHERE name = 'Colossal Wyrm Agility';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'fdef0cfb-e751-49b7-be2d-453836407712', id, 'Graceful hood (Varlamore)' FROM item_groups WHERE name = 'Colossal Wyrm Agility';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8042e3ba-c934-4849-8b66-2fc8a8de2aca', id, 'Graceful top (Varlamore)' FROM item_groups WHERE name = 'Colossal Wyrm Agility';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '46863dbc-205e-4ef6-8efb-eca7c30a5fa0', id, 'Graceful legs (Varlamore)' FROM item_groups WHERE name = 'Colossal Wyrm Agility';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0c8823f0-2102-42ea-acb0-9f531245600f', id, 'Graceful gloves (Varlamore)' FROM item_groups WHERE name = 'Colossal Wyrm Agility';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1e7314ab-bf2f-469c-9b9e-38b326ce80e2', id, 'Graceful boots (Varlamore)' FROM item_groups WHERE name = 'Colossal Wyrm Agility';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'de3eb0ec-ac10-4248-a58b-24ba31d4b651', id, 'Graceful cape (Varlamore)' FROM item_groups WHERE name = 'Colossal Wyrm Agility';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('aab67a08-40a3-427f-b0e9-6bc4770c7f2d', 'Creature Creation', 'Collection log · Other') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'eff50f70-d622-45e1-9204-69375b8224fd', id, 'Tea flask' FROM item_groups WHERE name = 'Creature Creation';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '696006a0-9a6c-4e44-8b78-9ae1f2c5e274', id, 'Plain satchel' FROM item_groups WHERE name = 'Creature Creation';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e1f7327e-30e8-4b46-bab3-5d6b5f0aeb2c', id, 'Green satchel' FROM item_groups WHERE name = 'Creature Creation';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0cd750d1-236c-4db0-a8cb-72463ae1c1ba', id, 'Red satchel' FROM item_groups WHERE name = 'Creature Creation';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '84b8f55a-5312-4750-b02d-8b7af79d53da', id, 'Black satchel' FROM item_groups WHERE name = 'Creature Creation';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f978a305-0e98-4957-86bf-e1006c702366', id, 'Gold satchel' FROM item_groups WHERE name = 'Creature Creation';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd9978bf9-1503-4c5f-8e14-b88127a45896', id, 'Rune satchel' FROM item_groups WHERE name = 'Creature Creation';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('ba1f5054-5bbf-4950-b350-b60e37a4ed1f', 'Cyclopes', 'Collection log · Other') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'fdaf5aed-5713-4d45-b0c9-824b25405c96', id, 'Bronze defender' FROM item_groups WHERE name = 'Cyclopes';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '353844e5-1d80-4112-b834-1adfd90df7b0', id, 'Iron defender' FROM item_groups WHERE name = 'Cyclopes';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'fdaa713b-66e6-487e-be63-ee1fd4c65b1e', id, 'Steel defender' FROM item_groups WHERE name = 'Cyclopes';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '26a2f769-132b-4573-af56-6b572c17ccd5', id, 'Black defender' FROM item_groups WHERE name = 'Cyclopes';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '59a65d03-c236-458b-aed0-6148d77b2aee', id, 'Mithril defender' FROM item_groups WHERE name = 'Cyclopes';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '91289356-c678-4809-b1b5-6b9a8980f9cd', id, 'Adamant defender' FROM item_groups WHERE name = 'Cyclopes';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3f67c72a-2c60-4088-9a0c-b74a176eeda9', id, 'Rune defender' FROM item_groups WHERE name = 'Cyclopes';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd8e60c61-c54d-4e36-8a46-be75a202c3fc', id, 'Dragon defender' FROM item_groups WHERE name = 'Cyclopes';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('cbdbfa9a-2437-484f-83b9-8d3c2b0e3651', 'Elder Chaos Druids', 'Collection log · Other') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd59c3d67-5987-46aa-8021-e58b40a0105e', id, 'Elder chaos top' FROM item_groups WHERE name = 'Elder Chaos Druids';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '553e876c-a97f-4893-bfdf-910a97918f6e', id, 'Elder chaos robe' FROM item_groups WHERE name = 'Elder Chaos Druids';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3996e7fd-07a7-4373-989e-54eedc8f3660', id, 'Elder chaos hood' FROM item_groups WHERE name = 'Elder Chaos Druids';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('1f177fbd-05be-4166-aa67-f6e70fb48a02', 'Forestry', 'Collection log · Other') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c2042571-2892-4227-be72-110fa334756d', id, 'Fox whistle' FROM item_groups WHERE name = 'Forestry';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8667e411-c3f9-45fe-bb1d-7a1d09179de0', id, 'Golden pheasant egg' FROM item_groups WHERE name = 'Forestry';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '110843d4-94f6-4e3f-b7fd-ed3d7706b92b', id, 'Lumberjack hat' FROM item_groups WHERE name = 'Forestry';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c983a29f-ea0b-4a45-b370-0dd2998a707d', id, 'Lumberjack top' FROM item_groups WHERE name = 'Forestry';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4de38dcd-dde8-4e50-9e32-eef237dd0038', id, 'Lumberjack legs' FROM item_groups WHERE name = 'Forestry';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8f8bd785-a9f5-4c24-989d-d7bda04f2f9e', id, 'Lumberjack boots' FROM item_groups WHERE name = 'Forestry';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2621b951-d57e-44c5-bfa9-a036a90b6616', id, 'Forestry hat' FROM item_groups WHERE name = 'Forestry';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b1ffa6d9-518a-4e31-90fb-0a4bbc9fbd6a', id, 'Forestry top' FROM item_groups WHERE name = 'Forestry';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c2662c9e-d10c-431f-8458-95d3dc0c2ec1', id, 'Forestry legs' FROM item_groups WHERE name = 'Forestry';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '48f77715-8c8e-4605-bb80-0393d7af15c6', id, 'Forestry boots' FROM item_groups WHERE name = 'Forestry';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'db753809-d21b-49f9-b940-2ed56a92476a', id, 'Twitcher''s gloves' FROM item_groups WHERE name = 'Forestry';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd4bfe398-40a6-4b1a-9990-570b20a3fcd9', id, 'Funky shaped log' FROM item_groups WHERE name = 'Forestry';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c1f6185d-7c12-484d-86bb-943ec0edd282', id, 'Log basket' FROM item_groups WHERE name = 'Forestry';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '50cf7d7c-fa66-4e95-a97c-6a11314b1442', id, 'Log brace' FROM item_groups WHERE name = 'Forestry';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c8f57c4d-cd30-4eeb-bcf2-1d2912e6db61', id, 'Clothes pouch blueprint' FROM item_groups WHERE name = 'Forestry';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd110b506-be1b-48fb-9e4a-df9357df9fa5', id, 'Cape pouch' FROM item_groups WHERE name = 'Forestry';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2e84f5e4-9c2d-44f9-8a93-6a5d8c588e6d', id, 'Felling axe handle' FROM item_groups WHERE name = 'Forestry';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b9f6a741-ad13-492a-8b90-cd1ff3a7dcfb', id, 'Pheasant hat' FROM item_groups WHERE name = 'Forestry';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '255c9eff-2ebe-4c82-a437-a82a56b0d5f9', id, 'Pheasant legs' FROM item_groups WHERE name = 'Forestry';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'cdb0a3ae-4d5e-455c-ae91-8b03b5397280', id, 'Pheasant boots' FROM item_groups WHERE name = 'Forestry';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e3a875ba-4930-4183-9066-c7ce9f82b460', id, 'Pheasant cape' FROM item_groups WHERE name = 'Forestry';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '83a4ea73-c670-4ff1-bf52-a61573e7b023', id, 'Petal garland' FROM item_groups WHERE name = 'Forestry';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'da80bbbe-f5e7-4618-92a8-2e1f5a8cf21f', id, 'Sturdy beehive parts' FROM item_groups WHERE name = 'Forestry';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('7bf0ebf5-9d2a-499e-b7e2-7133b3f8c80d', 'Fossil Island Notes', 'Collection log · Other') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'bc0ab22b-5513-4e70-975f-ede10c637bd3', id, 'Scribbled note' FROM item_groups WHERE name = 'Fossil Island Notes';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'df40bba2-bf4c-41d4-a2fc-5d733af38e32', id, 'Partial note' FROM item_groups WHERE name = 'Fossil Island Notes';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '441a8a6c-8aa4-4bc2-91bc-397a09d6c774', id, 'Ancient note' FROM item_groups WHERE name = 'Fossil Island Notes';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '413bf7c7-3157-4956-ad07-6a45f5aba094', id, 'Ancient writings' FROM item_groups WHERE name = 'Fossil Island Notes';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'bfa5cf8f-ec0c-4fa7-9d07-c19a51575e8c', id, 'Experimental note' FROM item_groups WHERE name = 'Fossil Island Notes';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0808d0f3-cd62-4a5a-97f9-9c760f38c5a5', id, 'Paragraph of text' FROM item_groups WHERE name = 'Fossil Island Notes';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2a73b443-8ebc-4ddf-9c71-ba7784e1ce5e', id, 'Musty smelling note' FROM item_groups WHERE name = 'Fossil Island Notes';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '69df2e63-012b-4348-a169-91d5efd52ef1', id, 'Hastily scrawled note' FROM item_groups WHERE name = 'Fossil Island Notes';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd8f39ebd-3a71-4684-9177-0cee661d6aa2', id, 'Old writing' FROM item_groups WHERE name = 'Fossil Island Notes';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3fcc98c1-1432-4268-9416-9137c6d5b381', id, 'Short note' FROM item_groups WHERE name = 'Fossil Island Notes';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('01253703-183e-4337-a693-ea847fb8fcd8', 'Glough''s Experiments', 'Collection log · Other') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '045d3f77-84be-4f97-97c2-6011779feb5c', id, 'Zenyte shard' FROM item_groups WHERE name = 'Glough''s Experiments';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '22ac2703-44d6-4f38-a32e-9ff30236d648', id, 'Light frame' FROM item_groups WHERE name = 'Glough''s Experiments';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9c635f5b-b7ec-4f3a-be94-48e4b785de61', id, 'Heavy frame' FROM item_groups WHERE name = 'Glough''s Experiments';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1be2ee74-709d-447a-ac78-521aacf97dcf', id, 'Ballista limbs' FROM item_groups WHERE name = 'Glough''s Experiments';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e84969cd-31ee-48b7-a179-9af35c141026', id, 'Monkey tail' FROM item_groups WHERE name = 'Glough''s Experiments';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4baaab3d-9202-4473-b828-4e4ae046b83a', id, 'Ballista spring' FROM item_groups WHERE name = 'Glough''s Experiments';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('0bc10249-38c3-4ff4-9e3a-651d93e99404', 'Hunter Guild', 'Collection log · Other') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '360955ec-24fd-4eb4-8c4c-5981e10cb1cd', id, 'Quetzin' FROM item_groups WHERE name = 'Hunter Guild';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'afaa1013-34ba-4b92-8d77-60ca9a521c7c', id, 'Huntsman''s kit' FROM item_groups WHERE name = 'Hunter Guild';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8b7df6e9-1ff1-4ab5-8ec3-7b1cf3519cc8', id, 'Guild hunter headwear' FROM item_groups WHERE name = 'Hunter Guild';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7e8ad84c-8dc4-4508-a543-1145d71142fa', id, 'Guild hunter top' FROM item_groups WHERE name = 'Hunter Guild';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '31f79db7-572f-4119-bbc1-e4516d32eff6', id, 'Guild hunter legs' FROM item_groups WHERE name = 'Hunter Guild';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9d03ac40-5f51-4aa1-a571-7b31fedeff50', id, 'Guild hunter boots' FROM item_groups WHERE name = 'Hunter Guild';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('bda45499-6656-4ce9-8756-d2af05a4ddc9', 'Lost Schematics', 'Collection log · Other') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ca063a9b-5dff-4652-8f56-7d58513d33af', id, 'Salvaging station schematic' FROM item_groups WHERE name = 'Lost Schematics';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c7f8e0d0-62bc-4ef1-8f28-4f5322a8355b', id, 'Gale catcher schematic' FROM item_groups WHERE name = 'Lost Schematics';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '19a5fd43-f231-428b-a486-681b720ed687', id, 'Eternal brazier schematic' FROM item_groups WHERE name = 'Lost Schematics';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '40118a3e-1ea2-4717-b16d-bc9b3eeb2db5', id, 'Rosewood cargo hold schematic' FROM item_groups WHERE name = 'Lost Schematics';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0b7612e6-38ae-4e1b-a63e-e93f47ac34ee', id, 'Rosewood hull schematic' FROM item_groups WHERE name = 'Lost Schematics';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e5effb53-d7e7-4b7d-8521-516ef2f4bc2c', id, 'Rosewood & cotton sails schematic' FROM item_groups WHERE name = 'Lost Schematics';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c6ef5758-e9ce-4da6-9c41-435df2fc0af4', id, 'Dragon helm schematic' FROM item_groups WHERE name = 'Lost Schematics';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ee826306-c857-477b-8b89-a65557242e1a', id, 'Dragon keel schematic' FROM item_groups WHERE name = 'Lost Schematics';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f1dcd946-b161-495a-8ddb-5b07c1b67be8', id, 'Dragon salvaging hook schematic' FROM item_groups WHERE name = 'Lost Schematics';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ed3f5bde-788b-4347-afad-0c49001ac028', id, 'Dragon cannon schematic' FROM item_groups WHERE name = 'Lost Schematics';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '96b34357-69b8-46d3-bb2c-1f5c763035be', id, 'Ballistic attractor schematic' FROM item_groups WHERE name = 'Lost Schematics';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b25df279-5624-4375-b23c-ee8e7e2c4da2', id, 'Bosun''s workbench schematic' FROM item_groups WHERE name = 'Lost Schematics';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('f662a38e-1559-43f5-831a-4c84427bb686', 'Monkey Backpacks', 'Collection log · Other') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '20f1a2bc-dda0-4421-bcc5-749081594a6e', id, 'Karamjan monkey (item)' FROM item_groups WHERE name = 'Monkey Backpacks';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '57e92ef9-f9cf-4b1c-8987-ad82922076fb', id, 'Kruk jr' FROM item_groups WHERE name = 'Monkey Backpacks';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6c0503ed-1df5-45f2-b985-964c150c29bc', id, 'Maniacal monkey (item)' FROM item_groups WHERE name = 'Monkey Backpacks';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '93b114af-b846-4af7-9d29-6ccc57873890', id, 'Princely monkey' FROM item_groups WHERE name = 'Monkey Backpacks';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '49cf2748-566c-4cb2-9e79-86e1f7537382', id, 'Skeleton monkey (item)' FROM item_groups WHERE name = 'Monkey Backpacks';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9e6b9d4b-ef34-4703-adcd-a85a99a218e5', id, 'Zombie monkey (item)' FROM item_groups WHERE name = 'Monkey Backpacks';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('7b2369bd-8bdf-4d85-a0c5-604048ec9087', 'Motherlode Mine', 'Collection log · Other') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'afcf7e2e-87ee-4d81-a542-b1a913f884d6', id, 'Coal bag' FROM item_groups WHERE name = 'Motherlode Mine';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'bf3fb444-e08f-4037-b7c7-6484c81ced51', id, 'Gem bag' FROM item_groups WHERE name = 'Motherlode Mine';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8b95c88e-e16d-46eb-9b16-2d0a903c6d1a', id, 'Prospector helmet' FROM item_groups WHERE name = 'Motherlode Mine';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'fc72eddc-4422-40d3-bf71-337362c8d8ed', id, 'Prospector jacket' FROM item_groups WHERE name = 'Motherlode Mine';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9e5b2bbe-2886-4020-9a44-f0214969e5b4', id, 'Prospector legs' FROM item_groups WHERE name = 'Motherlode Mine';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '775d5822-c1ee-427d-9503-573c888ed29d', id, 'Prospector boots' FROM item_groups WHERE name = 'Motherlode Mine';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('ea1dbc1e-b8bd-4ee0-889d-e9d341427d61', 'My Notes', 'Collection log · Other') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ae581da7-06ee-4180-b9a4-a377a561bf13', id, 'Ancient page' FROM item_groups WHERE name = 'My Notes';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('7d398e1e-dfde-409b-bc54-f34b5087e971', 'Ocean Encounters', 'Collection log · Other') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '27d82661-ffdf-4810-9881-46b6abc6713c', id, 'Tiny pearl' FROM item_groups WHERE name = 'Ocean Encounters';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '49b74581-6b9d-419c-927e-2c5c10281a8a', id, 'Small pearl' FROM item_groups WHERE name = 'Ocean Encounters';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8107c987-6a29-4b4e-87cb-836004974e75', id, 'Shiny pearl' FROM item_groups WHERE name = 'Ocean Encounters';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '785f1d9f-1a28-42c2-a63d-c9f3fb883cad', id, 'Bright pearl' FROM item_groups WHERE name = 'Ocean Encounters';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'acc12322-cd2c-43ec-ab14-b8a52ad32810', id, 'Big pearl' FROM item_groups WHERE name = 'Ocean Encounters';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5a95349b-a211-4f1a-9f2b-f0d3ca0f2d32', id, 'Huge pearl' FROM item_groups WHERE name = 'Ocean Encounters';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5f8e3274-9491-4545-a474-e8cefb073fac', id, 'Enormous pearl' FROM item_groups WHERE name = 'Ocean Encounters';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ddfbfdb1-3dec-492e-8a39-e59670525267', id, 'Shimmering pearl' FROM item_groups WHERE name = 'Ocean Encounters';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '08e26df6-26d0-49ca-a46d-1def820615ec', id, 'Glistening pearl' FROM item_groups WHERE name = 'Ocean Encounters';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5e885e65-d4be-4830-a4a0-ae628998cbc0', id, 'Brilliant pearl' FROM item_groups WHERE name = 'Ocean Encounters';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3700409e-fee1-4445-b513-5e04d8e6a15d', id, 'Radiant pearl' FROM item_groups WHERE name = 'Ocean Encounters';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('b54463c8-2438-4352-a63f-041c4d7d89fb', 'Random Events', 'Collection log · Other') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9d2f3f3c-c1aa-463a-a381-66051132760a', id, 'Camo top' FROM item_groups WHERE name = 'Random Events';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '840dc86d-36fc-4f4f-99bc-499dedd20b3d', id, 'Camo bottoms' FROM item_groups WHERE name = 'Random Events';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'babdb31b-68e7-4df6-ae21-45dc696f14a7', id, 'Camo helmet' FROM item_groups WHERE name = 'Random Events';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7bc68dd6-6cd3-43d3-beef-20004cbf55b5', id, 'Lederhosen top' FROM item_groups WHERE name = 'Random Events';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '823cf9cc-5828-417d-a4c6-14d17c8211d4', id, 'Lederhosen shorts' FROM item_groups WHERE name = 'Random Events';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'fb8e0b79-faf5-46e7-b71b-8a0c642d2496', id, 'Lederhosen hat' FROM item_groups WHERE name = 'Random Events';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '44fafeaa-8999-4eed-89ed-41ba4c49a9da', id, 'Zombie shirt' FROM item_groups WHERE name = 'Random Events';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '359c697b-c82c-4a6a-9354-1362b9d068c7', id, 'Zombie trousers' FROM item_groups WHERE name = 'Random Events';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'fdcd4311-3883-4256-b38d-c362402ff05c', id, 'Zombie mask' FROM item_groups WHERE name = 'Random Events';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9fbe2230-f54a-4ba0-b7ec-0a4b4ef605fc', id, 'Zombie gloves' FROM item_groups WHERE name = 'Random Events';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '561eaa5f-a7b6-4c5d-ad3d-326ab7f0ee16', id, 'Zombie boots' FROM item_groups WHERE name = 'Random Events';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '32280bda-ef1e-4137-8669-f8060b8f4c70', id, 'Mime mask' FROM item_groups WHERE name = 'Random Events';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9430138d-0347-48ad-bcc6-a56f18070fbd', id, 'Mime top' FROM item_groups WHERE name = 'Random Events';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '73313af0-36fd-41f5-b6dd-66fc3d2f4907', id, 'Mime legs' FROM item_groups WHERE name = 'Random Events';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a228a35d-fff4-4c69-be83-58d16587d8d3', id, 'Mime gloves' FROM item_groups WHERE name = 'Random Events';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4a076fcd-05aa-44d8-93ce-807fd486874b', id, 'Mime boots' FROM item_groups WHERE name = 'Random Events';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2ddabe75-1ed6-45c7-843f-4b0f430a9342', id, 'Frog token' FROM item_groups WHERE name = 'Random Events';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '70d38731-8d73-4552-937f-0c5f9f112299', id, 'Stale baguette' FROM item_groups WHERE name = 'Random Events';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2e17da2e-962e-4c5c-9266-93bcb014539b', id, 'Beekeeper''s hat' FROM item_groups WHERE name = 'Random Events';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f23a256e-5854-41c6-b782-8f52b2ce851b', id, 'Beekeeper''s top' FROM item_groups WHERE name = 'Random Events';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '272b1d53-fe58-45c7-aa63-10fa551350a1', id, 'Beekeeper''s legs' FROM item_groups WHERE name = 'Random Events';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6fc0cd5b-953f-4d68-986f-320ba6f7662a', id, 'Beekeeper''s gloves' FROM item_groups WHERE name = 'Random Events';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1ad70bcb-9962-4ff7-8e25-2329b75535b4', id, 'Beekeeper''s boots' FROM item_groups WHERE name = 'Random Events';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('6cfd9651-6af9-44d8-8a7c-34ccd7dc7992', 'Revenants', 'Collection log · Other') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd91bb837-95a0-4e66-81c9-c2d9496df4d2', id, 'Viggora''s chainmace (u)' FROM item_groups WHERE name = 'Revenants';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd13e2aff-7e8a-4c8e-87ee-d50d255a4d67', id, 'Craw''s bow (u)' FROM item_groups WHERE name = 'Revenants';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7275fd3b-9fb2-4f9b-851b-bab879c18e70', id, 'Thammaron''s sceptre (u)' FROM item_groups WHERE name = 'Revenants';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd08964b6-604c-4c22-be24-bc3aa099493d', id, 'Amulet of avarice' FROM item_groups WHERE name = 'Revenants';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a96ca265-704e-4742-9c99-ec0b1b9d4431', id, 'Bracelet of ethereum (uncharged)' FROM item_groups WHERE name = 'Revenants';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a61c6934-03ad-4909-b7c8-7b2ef2c770ea', id, 'Ancient crystal' FROM item_groups WHERE name = 'Revenants';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '815eb8ac-aac2-4ad9-af04-8bf4da5105dc', id, 'Ancient relic' FROM item_groups WHERE name = 'Revenants';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '487cf698-02d7-4813-a2c3-7a523c61050f', id, 'Ancient effigy' FROM item_groups WHERE name = 'Revenants';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4e35f206-93e6-40fa-b37c-7d71ca01c81e', id, 'Ancient medallion' FROM item_groups WHERE name = 'Revenants';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '996058af-3e13-452f-8744-3ae594508fe0', id, 'Ancient statuette' FROM item_groups WHERE name = 'Revenants';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ec43c097-907f-48cd-aad1-c064afe184b8', id, 'Ancient totem' FROM item_groups WHERE name = 'Revenants';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f7da52a7-2337-49ce-b349-aae47e1e619f', id, 'Ancient emblem' FROM item_groups WHERE name = 'Revenants';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c1e7e9be-a4cc-4732-9b96-745805856fa2', id, 'Revenant cave teleport' FROM item_groups WHERE name = 'Revenants';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '79054557-e422-4959-b162-922669f494ea', id, 'Revenant ether' FROM item_groups WHERE name = 'Revenants';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('58250b58-be68-4b01-bac5-1d28c9b203da', 'Rooftop Agility', 'Collection log · Other') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '341d5bb4-a79f-4687-bffc-1c278e5adb7c', id, 'Mark of Grace' FROM item_groups WHERE name = 'Rooftop Agility';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6a4dcffd-e0d3-4d60-adcd-a739ec8c013e', id, 'Graceful hood' FROM item_groups WHERE name = 'Rooftop Agility';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '54b99d77-6ac4-42e7-bf79-e6187c430a78', id, 'Graceful cape' FROM item_groups WHERE name = 'Rooftop Agility';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd867cdb2-8c84-4b94-be8a-704a703d7341', id, 'Graceful top' FROM item_groups WHERE name = 'Rooftop Agility';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1c33a257-bf56-44bd-822b-d83c7f6ac6a9', id, 'Graceful legs' FROM item_groups WHERE name = 'Rooftop Agility';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ee0c555f-ee25-47f1-adf9-1b37bc1e2503', id, 'Graceful gloves' FROM item_groups WHERE name = 'Rooftop Agility';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7c6e7eed-6e79-4e3b-89e7-44dccfc8b1cf', id, 'Graceful boots' FROM item_groups WHERE name = 'Rooftop Agility';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('59b18876-f93a-4a15-ac5f-9a75fc4db116', 'Sailing Miscellaneous', 'Collection log · Other') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0ac417ca-5755-4578-b0e8-d92505ecc701', id, 'Dragon metal sheet' FROM item_groups WHERE name = 'Sailing Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '20f2cb40-32ce-4c62-b497-b3def24058b5', id, 'Dragon nails' FROM item_groups WHERE name = 'Sailing Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'dbd23166-42b3-4bcf-9687-c8f49f837c0e', id, 'Dragon cannonball' FROM item_groups WHERE name = 'Sailing Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5ce75700-277e-41d7-acb8-8cf3bd52a75e', id, 'Echo pearl' FROM item_groups WHERE name = 'Sailing Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8e30ccd8-2555-45b8-afbc-9570902bf9f8', id, 'Swift albatross feather' FROM item_groups WHERE name = 'Sailing Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e4cd9d52-081a-4676-a0ab-1925503e1fc1', id, 'Narwhal horn' FROM item_groups WHERE name = 'Sailing Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8b96a2d1-8371-40cf-a0e4-cdfe991c78ec', id, 'Ray barbs' FROM item_groups WHERE name = 'Sailing Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'cb13c668-ee47-4f4e-b151-99df71de1895', id, 'Broken dragon hook' FROM item_groups WHERE name = 'Sailing Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '32d888b6-1e47-49c9-b9f3-4226612dd972', id, 'Bottled storm' FROM item_groups WHERE name = 'Sailing Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7b948988-8cc1-46a5-b9c3-9dffc030f818', id, 'Dragon cannon barrel' FROM item_groups WHERE name = 'Sailing Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd570a779-b443-4960-8478-3f1fd0ef6cfa', id, 'Boat bottle (empty)' FROM item_groups WHERE name = 'Sailing Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '71fdf0ba-7bc1-4e3e-9994-710da4f7b3b4', id, 'Facility bottle (empty)' FROM item_groups WHERE name = 'Sailing Miscellaneous';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('a68b9836-c1ab-490c-878e-56b7dda9bc07', 'Sea Treasures', 'Collection log · Other') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ca1ae72c-2fee-4aab-8a39-b370a84fe880', id, 'Medallion fragment' FROM item_groups WHERE name = 'Sea Treasures';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '654f9dbb-61f4-4f10-bf51-faf0f296fb09', id, 'Sailors'' amulet' FROM item_groups WHERE name = 'Sea Treasures';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '83f34838-7bbc-408c-8d23-21979520fd37', id, 'Rusty locket' FROM item_groups WHERE name = 'Sea Treasures';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8c2982e7-9632-49b5-a97a-3b472c6980d1', id, 'Mouldy block' FROM item_groups WHERE name = 'Sea Treasures';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ce63958e-ef0d-4f8e-aa67-811c2fe2e084', id, 'Dull knife' FROM item_groups WHERE name = 'Sea Treasures';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '038b2e3e-d403-4b76-b4c6-aaae69ee7aa2', id, 'Broken compass' FROM item_groups WHERE name = 'Sea Treasures';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a7fec6ab-5719-473d-9dcf-9bf7bbed6d2b', id, 'Rusty coin' FROM item_groups WHERE name = 'Sea Treasures';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '406bb0a1-d4de-4180-b769-07292278939a', id, 'Broken sextant' FROM item_groups WHERE name = 'Sea Treasures';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9860dafd-7cdf-439d-84f3-473095269cbd', id, 'Mouldy doll' FROM item_groups WHERE name = 'Sea Treasures';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '310ed1fd-fba1-434d-bf51-cd685f03a944', id, 'Smashed mirror' FROM item_groups WHERE name = 'Sea Treasures';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('d8fce1d5-c097-4c24-b0df-f8514ac901d8', 'Shayzien Armour', 'Collection log · Other') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e8ff7fce-5ef5-488f-9688-2b1aa5b3bf2b', id, 'Shayzien gloves (1)' FROM item_groups WHERE name = 'Shayzien Armour';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b4d41259-7f12-40af-ae69-72f67487144a', id, 'Shayzien boots (1)' FROM item_groups WHERE name = 'Shayzien Armour';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4ea78a41-9174-47e9-b47c-621e4954baca', id, 'Shayzien helm (1)' FROM item_groups WHERE name = 'Shayzien Armour';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '303853cb-aa8b-4cfc-972a-a48ecf1570c7', id, 'Shayzien greaves (1)' FROM item_groups WHERE name = 'Shayzien Armour';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f55c9b98-8289-49de-b8ab-f0287f28fc49', id, 'Shayzien platebody (1)' FROM item_groups WHERE name = 'Shayzien Armour';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7649fad0-7ff0-4cf7-a484-48a76a7d9ab2', id, 'Shayzien gloves (2)' FROM item_groups WHERE name = 'Shayzien Armour';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6bae2ab9-0c53-407a-af61-3d98c5c3a9a6', id, 'Shayzien boots (2)' FROM item_groups WHERE name = 'Shayzien Armour';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'fe4cb543-8b49-4c22-8775-a0a99a28371f', id, 'Shayzien helm (2)' FROM item_groups WHERE name = 'Shayzien Armour';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '07eb80bc-dd74-4c38-8338-3d5032d2fc7d', id, 'Shayzien greaves (2)' FROM item_groups WHERE name = 'Shayzien Armour';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '44222451-61fe-43d1-9046-e35040db511d', id, 'Shayzien platebody (2)' FROM item_groups WHERE name = 'Shayzien Armour';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'fd373446-ebde-42c6-b247-cc2f774fcd72', id, 'Shayzien gloves (3)' FROM item_groups WHERE name = 'Shayzien Armour';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '66b320c8-dc59-4daa-9fe0-6c3491a0f6b7', id, 'Shayzien boots (3)' FROM item_groups WHERE name = 'Shayzien Armour';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e1b71b5c-2464-4bb8-b4cb-9dd2d85350ea', id, 'Shayzien helm (3)' FROM item_groups WHERE name = 'Shayzien Armour';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd04cc51f-7072-4df2-8ffa-8a5f4e50f424', id, 'Shayzien greaves (3)' FROM item_groups WHERE name = 'Shayzien Armour';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1463b43c-be6c-456b-ac4c-9f4bed718460', id, 'Shayzien platebody (3)' FROM item_groups WHERE name = 'Shayzien Armour';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '530b6708-1b4b-408b-8df3-208e256d7998', id, 'Shayzien gloves (4)' FROM item_groups WHERE name = 'Shayzien Armour';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '03eacb95-c9d6-411b-b06b-92f057c8e939', id, 'Shayzien boots (4)' FROM item_groups WHERE name = 'Shayzien Armour';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a449851a-86b0-4d5d-8d6f-9f30a570d7ae', id, 'Shayzien helm (4)' FROM item_groups WHERE name = 'Shayzien Armour';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4160a4f9-2ffc-4705-b366-158ca6cf0a1e', id, 'Shayzien greaves (4)' FROM item_groups WHERE name = 'Shayzien Armour';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f7af7062-4791-4c8e-9d3e-33fadb8f896d', id, 'Shayzien platebody (4)' FROM item_groups WHERE name = 'Shayzien Armour';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd46ac9ee-34fd-4abc-9df5-d79c84eaedbc', id, 'Shayzien gloves (5)' FROM item_groups WHERE name = 'Shayzien Armour';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ee0167c2-4710-44ef-8afa-ffe2264905fa', id, 'Shayzien boots (5)' FROM item_groups WHERE name = 'Shayzien Armour';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '37ad6cc6-dfb1-4923-b419-430be9178ead', id, 'Shayzien helm (5)' FROM item_groups WHERE name = 'Shayzien Armour';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '607a84c4-9565-4bb2-931b-551974b9018b', id, 'Shayzien greaves (5)' FROM item_groups WHERE name = 'Shayzien Armour';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'fb0cf984-f3a7-45a9-8b16-74b5efa55bcb', id, 'Shayzien body (5)' FROM item_groups WHERE name = 'Shayzien Armour';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('aa10ad7a-9bf6-4ce4-bffc-6638929ef0a3', 'Shooting Stars', 'Collection log · Other') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '31a638cc-2e8b-406e-b42d-0feed582728b', id, 'Celestial ring (uncharged)' FROM item_groups WHERE name = 'Shooting Stars';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '217af071-0dca-4fd7-906a-7a76aff28a2c', id, 'Star fragment' FROM item_groups WHERE name = 'Shooting Stars';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('49655424-db4c-411e-9a9e-478100da65f7', 'Skilling Pets', 'Collection log · Other') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'cfeba928-b255-4b01-a282-8444c8917a19', id, 'Heron' FROM item_groups WHERE name = 'Skilling Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ed575518-a8f3-4751-927f-fcf65f364593', id, 'Rock golem' FROM item_groups WHERE name = 'Skilling Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c634ad96-a15e-4a80-bbfb-0fcb8f338e20', id, 'Beaver' FROM item_groups WHERE name = 'Skilling Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'cf49e15e-6e1b-40cf-8d60-2803f7f48296', id, 'Baby chinchompa' FROM item_groups WHERE name = 'Skilling Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6e88c64e-863f-4de8-b149-5b64298d3748', id, 'Giant Squirrel' FROM item_groups WHERE name = 'Skilling Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ed021d64-5a12-4121-8998-0b7289714bef', id, 'Tangleroot' FROM item_groups WHERE name = 'Skilling Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9cf3f10f-887d-4fc7-82d4-bebc6641375d', id, 'Rocky' FROM item_groups WHERE name = 'Skilling Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7da65bab-4d47-4c0d-9ec0-88e7275d3956', id, 'Rift guardian' FROM item_groups WHERE name = 'Skilling Pets';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2fa913c3-3890-4da3-aa6b-d411912dafb3', id, 'Soup' FROM item_groups WHERE name = 'Skilling Pets';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('3638f1b9-1088-4cc2-92bc-bd8abbe80b05', 'Slayer', 'Collection log · Other') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7fe73f69-0d79-4b71-a685-76e6071daeeb', id, 'Crawling hand (item)' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd722d459-c54e-4d49-9460-cf9c94e0da20', id, 'Cockatrice head' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'cd7876b3-7fc0-4963-86c6-5911a92f6eb7', id, 'Basilisk head' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'be42fad5-6a56-4b6d-a0d2-16581fd431d4', id, 'Kurask head' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'bfa9b34d-c1f2-4a3c-a241-f27c8d3ba5d3', id, 'Abyssal head' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9f0451b5-d7ec-4763-808e-b201fabaca2a', id, 'Imbued heart' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c81eb5ec-c3aa-4d31-aab0-7497bceddbff', id, 'Eternal gem' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3491329a-8e0f-420f-bbf7-2df442279a0b', id, 'Dust battlestaff' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2eb6f533-5f1a-420f-bd2e-8938e63b7ccc', id, 'Mist battlestaff' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0d24e3a9-70e9-4bf3-a839-697bd349340f', id, 'Abyssal whip' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8e0943d8-47db-4eeb-8b68-2042d45e55dd', id, 'Granite maul' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd23ae3fa-63bb-401f-ba69-a33822c64a8e', id, 'Mudskipper hat' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'feaa8a2a-7382-41d3-a84d-9ba9584a2fcb', id, 'Flippers' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '280f5915-d95a-4345-ab07-f8fb810b2313', id, 'Brine sabre' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '001e1546-a64d-479d-8042-17bf23639fac', id, 'Leaf-bladed sword' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6abbc1b1-6948-4cdd-9275-a3ca93b3324c', id, 'Necklace of fangs' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9e718aef-afc6-4c50-a1cb-5fb9d1c9cd01', id, 'Leaf-bladed battleaxe' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd0871a65-a346-4a5b-9d38-a4c87cee5863', id, 'Black mask (10)' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3a80c390-b20e-4572-b612-ac86f476559d', id, 'Granite longsword' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '608e56fa-0be4-44de-a4ff-f84cf82bc956', id, 'Granite boots' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7c3e5ab6-3d3f-4a15-8463-dc848badc98e', id, 'Wyvern visage' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '49955bb7-fc07-4f26-8177-db2ab35b2d96', id, 'Granite legs' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f21dd703-ffbf-4081-ba0d-a68df1c68e54', id, 'Granite helm' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1111af04-8040-41c1-888a-efefc9e8a726', id, 'Draconic visage' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c3ec6bc0-f741-4b80-bec3-79d0310777b9', id, 'Bronze boots' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2b170265-8e96-4579-b9c8-f549dc74735f', id, 'Iron boots' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3e34e59a-6170-4262-8c9e-63065f5acaa8', id, 'Steel boots' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2de5a800-2d5c-4621-9576-1655d8fb748b', id, 'Black boots' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2fd14b34-8640-4bb4-87fc-3964ae1acbab', id, 'Mithril boots' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8175c9d2-0d1e-4755-8498-5e77ab7c5340', id, 'Adamant boots' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'faeea392-5603-41ad-8224-fe26efc46fd5', id, 'Rune boots' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '94afd15f-c37a-40c7-a302-899381ec3e82', id, 'Dragon boots' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '124dfb4e-6390-47f5-ab71-bcdf3c072c07', id, 'Abyssal dagger' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd1223952-e919-44d4-81bf-6800a18ff845', id, 'Uncharged trident' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '85be8ff8-aaba-4b24-85e9-95015659704e', id, 'Kraken tentacle' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '10947f5d-5ae0-49c7-9066-48cf49e0236c', id, 'Dark bow' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9ec3e249-2fb4-40ad-8fbe-42b92315b06b', id, 'Occult necklace' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '202f3af2-3868-4e97-b776-846e0812a9ef', id, 'Dragon chainbody' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'df667b6b-0977-4c8c-8b84-f8bb07291fce', id, 'Dragon thrownaxe' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ac9df8f9-f0dc-44a6-9843-2600cc580194', id, 'Dragon harpoon' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6005f202-c1c1-4cec-ab22-2abfd0d8f3b3', id, 'Dragon sword' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1041815b-f7c8-4681-bf03-4ab393d78b64', id, 'Dragon knife' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0079ec95-33fa-45ca-8065-62a752d300c5', id, 'Broken dragon hasta' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'cc1e7505-0af3-417e-975f-5bd5c59e2426', id, 'Drake''s tooth' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '693769ac-e48e-4469-883b-df7eae4ca58b', id, 'Drake''s claw' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7bc2427b-2ee3-4989-915a-e1f55d73f1a6', id, 'Hydra tail' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'aa719e1d-e444-4882-b401-46ce1cac4724', id, 'Hydra''s fang' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b6dc20b8-2f46-4c81-8a48-c9ba79b18f54', id, 'Hydra''s eye' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '274bf922-371c-4a88-b747-0ebd43761a81', id, 'Hydra''s heart' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9a5c7115-7ce6-4309-ba0d-39114ff50afe', id, 'Mystic hat (light)' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '22f8672f-cd0f-4695-a6b4-1eea2d45f411', id, 'Mystic robe top (light)' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '89640867-0a2b-4c18-8595-8409c76742d8', id, 'Mystic robe bottom (light)' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5a6a6c47-d584-4518-80cf-3a50d38083bc', id, 'Mystic gloves (light)' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ab3d119c-2aa9-4c5a-8035-d56eb6d32119', id, 'Mystic boots (light)' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'bbefe49d-7629-49f2-b6ac-a5f6eebe279e', id, 'Mystic hat (dark)' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '80201b23-46ea-4401-af76-9fc82ecb7787', id, 'Mystic robe top (dark)' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'fa9e6cd6-414f-4d3a-a91d-a6b47d4147d8', id, 'Mystic robe bottom (dark)' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b186f1e1-8f14-470a-ac55-c06998c9a9ff', id, 'Mystic gloves (dark)' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4d70de89-2c76-4330-bb1a-895f63ae2573', id, 'Mystic boots (dark)' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'aafe7ec6-ac41-4973-809e-432f1bdb06cf', id, 'Mystic hat (dusk)' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '078ad340-12f1-4f4f-a7be-a6715f0da3b1', id, 'Mystic robe top (dusk)' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f19d2afa-26bc-4050-a88c-06c506732bbe', id, 'Mystic robe bottom (dusk)' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '54496c3a-daff-4274-82d5-b18f58f42328', id, 'Mystic gloves (dusk)' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '75997694-3303-473c-a744-ef60925181e0', id, 'Mystic boots (dusk)' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '86d056f8-a3d2-4e3c-a8bb-0fb582015fc0', id, 'Basilisk jaw' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a4386dac-c56d-4435-923f-19ba8119b88a', id, 'Aquanite tendon' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '579773ef-d214-4c42-aedf-bf30c5f01e47', id, 'Dagon''hai hat' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '990caacb-369f-436e-b654-2c6c94559a0a', id, 'Dagon''hai robe top' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '297e82fc-cd96-4895-a4ff-d8e159eb9c08', id, 'Dagon''hai robe bottom' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7b78b831-8da4-4276-868b-a6b1cde4aeb1', id, 'Blood shard' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8b5ecc14-152a-47d1-a8a9-87e627954a8b', id, 'Ancient ceremonial mask' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '618cc316-bb41-4be0-9fd9-9acabace0cc5', id, 'Ancient ceremonial top' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ca7c950c-c9b7-423d-b02a-f235f91d3d7f', id, 'Ancient ceremonial legs' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2b15ff32-5031-4127-b237-29ac235e048e', id, 'Ancient ceremonial gloves' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f5859d5c-a98b-46f8-8d52-faa1742cfe7e', id, 'Ancient ceremonial boots' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '17dd8985-338e-4cd8-a71d-349ffb6c2cfd', id, 'Warped sceptre (uncharged)' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4a1781d5-402a-4dd5-8843-ac85c075b43e', id, 'Sulphur blades' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '74c5eedc-b0d8-492f-ba4d-e3aea7f9dd79', id, 'Teleport anchoring scroll' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '17a5e36b-eb01-461f-8cae-4706f43400da', id, 'Aranea boots' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a5fea457-6957-4abe-a665-6be20f2b75f5', id, 'Glacial temotli' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '92e6100c-3d6d-4ce3-a5c0-7119c75bbf93', id, 'Pendant of Ates (inert)' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1acf0179-654c-4fa5-9d14-6fb4f27d6bf2', id, 'Frozen tear' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7799624b-65f4-41f2-ba12-96038eabfc85', id, 'Earthbound tecpatl' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b8efda45-1849-4ddc-9a91-ab5ed51a84e0', id, 'Antler guard' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '68e485fd-ea90-4c3d-a9c0-18ed513dd39f', id, 'Alchemist''s signet' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0e787afa-4a1e-4cd9-8454-2f8a0888e1ce', id, 'Broken antler' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '11cabf90-3039-4289-8120-be978411538e', id, 'Dragon metal sheet' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '18fafab4-6bfc-4fbe-974e-305ba22e4487', id, 'Horn of Plenty (empty)' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4e7a202d-d122-4d45-bd44-3a62a29004d1', id, 'Gryphon feather' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e9909d09-4933-427a-9eca-92852587635c', id, 'Venator tooth' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2dc7b432-1d2f-47df-944c-45686e170161', id, 'Venator fang' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ac073bf0-8cc0-43d9-bb5d-90550070884d', id, 'Air diamond' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7721f55e-f898-4aec-b9d5-97d5fbb52c74', id, 'Water sapphire' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '43c8d2e6-fb3f-4ae5-8f77-45985573ef6b', id, 'Earth emerald' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3377add9-9f29-4e07-9f48-3d72ee05bdf1', id, 'Fire ruby' FROM item_groups WHERE name = 'Slayer';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('078ccd06-d310-4032-af20-c0186018331c', 'Tormented Demons', 'Collection log · Other') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '46d8987f-d734-4825-97f1-943761b03fd3', id, 'Tormented synapse' FROM item_groups WHERE name = 'Tormented Demons';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b15ae0ff-827c-4ce9-8ccc-6576d006e891', id, 'Burning claw' FROM item_groups WHERE name = 'Tormented Demons';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1b4b93fa-f90f-4380-9f23-071cc78f3625', id, 'Guthixian temple teleport' FROM item_groups WHERE name = 'Tormented Demons';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('6fe03c6c-b2ac-4326-91d9-0c2096dfb3c5', 'TzHaar', 'Collection log · Other') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f394c798-01b8-4421-a006-807c69e201f9', id, 'Obsidian cape' FROM item_groups WHERE name = 'TzHaar';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1e306c42-8675-4604-a7b2-ba89118374bc', id, 'Toktz-ket-xil' FROM item_groups WHERE name = 'TzHaar';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '73310226-0c02-4ccf-8d30-eef37d565365', id, 'Tzhaar-ket-om' FROM item_groups WHERE name = 'TzHaar';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '71fcb034-726b-48cf-8c89-589d5fa021e5', id, 'Toktz-xil-ak' FROM item_groups WHERE name = 'TzHaar';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9a5d2a49-38d8-4c07-9333-5318a5004d47', id, 'Toktz-xil-ek' FROM item_groups WHERE name = 'TzHaar';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2108a3a3-7ea7-474b-90e1-e506d5768a1c', id, 'Toktz-mej-tal' FROM item_groups WHERE name = 'TzHaar';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '4cdbff38-37da-46d2-af44-0b0a87bc2e38', id, 'Toktz-xil-ul' FROM item_groups WHERE name = 'TzHaar';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f98d87ab-7640-4849-a1fb-a01820a14ff8', id, 'Obsidian helmet' FROM item_groups WHERE name = 'TzHaar';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'fdd8df37-c5c7-4cfe-b134-c780ea840f2a', id, 'Obsidian platebody' FROM item_groups WHERE name = 'TzHaar';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '425d125d-4760-4d54-a9d8-86a41f20b334', id, 'Obsidian platelegs' FROM item_groups WHERE name = 'TzHaar';
--> statement-breakpoint
INSERT INTO item_groups (id, name, description) VALUES ('a5449369-3af5-49dd-918b-b00f7418c20f', 'Miscellaneous', 'Collection log · Other') ON CONFLICT(name) DO UPDATE SET description = excluded.description;
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '15262982-e5be-478b-939d-734740f7ae4f', id, 'Herbi' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9f6e0edd-5251-411b-b16c-13bf51aeef4e', id, 'Chompy chick' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd81bfcf2-3382-4135-8bd5-339ab2e6b739', id, 'Dragon warhammer' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '91c76bb0-27a8-4ff3-b0ef-219b69d3f4da', id, 'Big swordfish' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '01674b13-fa7e-4092-afbd-5191b605d239', id, 'Big shark' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7fea019e-76e7-48a8-b85c-1b0c4f303495', id, 'Big bass' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '218b8dc9-a3db-436e-b877-4dd4dee5c3b4', id, 'Giant blue krill' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b425f228-f201-4e83-9d22-d9fbcef9b6b7', id, 'Golden haddock' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '425a60f1-deb6-4316-8516-47664744f6eb', id, 'Orangefin' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '504bda68-3405-4e65-b5e7-b86bcab87130', id, 'Huge halibut' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6ec3be33-685a-442a-815f-86b1fa932015', id, 'Purplefin' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8f51c2fb-7e92-49ee-bc31-b8575b40eb46', id, 'Swift marlin' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'fb440bf3-657e-41ea-b91d-33a436d9ff6b', id, 'Long bone' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ab650d85-3d83-4a5a-a35e-11e5393c2cf6', id, 'Curved bone' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7ea0563b-be2d-4592-9fd1-ec12d0c7ea37', id, 'Ecumenical key' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3d7b2d44-8e18-4a23-b59d-a09fc4d32293', id, 'Pharaoh''s sceptre (uncharged)' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0eaf5193-27c6-4423-a3f9-ca97d02248dc', id, 'Dark totem base' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '65e3c6a9-2ecd-43dc-b145-af7187d1b05c', id, 'Dark totem middle' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '40ca8667-2edd-45b1-bdb5-4b1fe8a6185f', id, 'Dark totem top' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8b01aadc-8d34-463b-a5f5-df29ef69aec1', id, 'Chewed bones' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'f08cd524-acad-4cc6-9af8-b6e4fa4d1662', id, 'Dragon full helm' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b3da8438-7bd3-4447-87cd-00d9e16fd1f2', id, 'Shield left half' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '28e8309c-b0dc-41f4-aa92-0315f400f085', id, 'Dragon metal slice' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '70cad445-3311-4e2e-abb2-5ecbc496bbe9', id, 'Dragon metal lump' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '1776a0ac-14e3-4938-8f3a-7afa22b7c83e', id, 'Dragon limbs' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a754ae60-d09a-413f-8504-5b3df4c54a0f', id, 'Dragon spear' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5bfa9de0-b8d2-4da8-a38e-29e5057460b2', id, 'Amulet of eternal glory' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2cba42e5-fdd2-40aa-ac3a-54928c85b897', id, 'Shaman mask' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '65102ca1-eb5e-440d-8297-3d596145e0ed', id, 'Evil chicken head' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ebb31aef-49d7-4341-9c69-30de4321eeae', id, 'Evil chicken wings' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '2fbef914-c5bc-4dba-93da-981c1c1ccb72', id, 'Evil chicken legs' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b71594d7-0e69-4a24-997b-6658ecd2da57', id, 'Evil chicken feet' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd3ed3093-33b1-4e41-86fa-7aacfa57edff', id, 'Mining gloves' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5aa57577-c2ed-4f30-b9da-bc4d8fc020db', id, 'Superior mining gloves' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '5639f8ca-5e2f-4692-85e4-d76ef31261de', id, 'Expert mining gloves' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '11b20260-d85c-490d-b554-7c10cbeb90f5', id, 'Right skull half' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '8f931dff-3b14-4519-92ed-d4b00322ffa7', id, 'Left skull half' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '7c4c0f77-d63a-40bc-a402-f5e6d6284be9', id, 'Top of sceptre' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c5c64ff0-32ac-47b0-b8d1-a670347f68ee', id, 'Bottom of sceptre' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'ba467282-a95b-4c30-8945-c303e72be02f', id, 'Mossy key' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'd9176083-2231-4b27-8a43-4e8342fbae34', id, 'Giant key' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0d13d7f2-c090-4b02-a227-79cad92f9233', id, 'Hespori seed' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'fe2dc26f-27db-41a6-86d4-b4cf6b98b090', id, 'Fresh crab claw' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e1b3b9bb-e50e-4db9-ae84-e5797cda9aae', id, 'Fresh crab shell' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'a81915e5-c4d0-4d17-8f70-6dbc760764e2', id, 'Xeric''s talisman (inert)' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '20f697f1-f5ae-439b-8b5c-ed589d119e7a', id, 'Mask of Ranul' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b8daef54-a6cc-4a99-a0e8-86812f8f6c2d', id, 'Elven signet' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b341e2f3-7ada-40d7-b9ba-7b971c30f6c2', id, 'Crystal grail' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'fbee1463-a657-464f-b7db-d3bf0dd969c6', id, 'Enhanced crystal teleport seed' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'c4af586e-bc1b-4226-9f3c-957ea5ff2bcc', id, 'Dragonstone full helm' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '25e2450c-343b-4be7-aeba-a8cd326fbf29', id, 'Dragonstone platebody' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '76abd5ea-ba17-40e2-be1e-67d188b11b6a', id, 'Dragonstone platelegs' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'e52f0fa2-ecd7-47c5-8801-e4733da41d4e', id, 'Dragonstone gauntlets' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '0e6bfe1f-f07f-4cfd-8015-f9d043d86ea2', id, 'Dragonstone boots' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'fa77a6e4-f0d6-480a-9123-05a63af13fdd', id, 'Uncut onyx' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '3f3c1aaf-aa3b-4aeb-9e9d-b5947c2211c2', id, 'Merfolk trident' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'efba89ea-71d7-4192-b9d0-8ad0671ed8dc', id, 'Orange egg sac' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '9c52bfc1-4cb9-422b-b58e-2479f1f30e60', id, 'Blue egg sac' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b028224d-18f4-4128-9202-93e2cd6c6bcd', id, 'Broken zombie axe' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '71055f3a-5b8e-4118-9ba2-1dd4bad8c6bd', id, 'Broken zombie helmet' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'b86b005a-3d4e-4226-ad54-c8e9b8432ba2', id, 'Helmet of the moon' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT '6045bc31-2d39-40c1-917d-9e5a1ad4ac0c', id, 'Squid beak' FROM item_groups WHERE name = 'Miscellaneous';
--> statement-breakpoint
INSERT OR IGNORE INTO item_group_items (id, group_id, item_name) SELECT 'bdfded4b-c31a-490f-906d-a178cf54823d', id, 'Jeweller''s chisel' FROM item_groups WHERE name = 'Miscellaneous';
