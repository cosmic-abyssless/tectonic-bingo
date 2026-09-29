ALTER TABLE `nodes` ADD `requires_proof` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `nodes` ADD `proof_note` text;--> statement-breakpoint
ALTER TABLE `submissions` ADD `kind` text DEFAULT 'drop' NOT NULL;--> statement-breakpoint
ALTER TABLE `submissions` ADD `proof_tile_id` text REFERENCES tiles(id);--> statement-breakpoint
ALTER TABLE `submissions` ADD `proof_task_id` text REFERENCES nodes(id);--> statement-breakpoint
ALTER TABLE `tiles` ADD `requires_proof` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `tiles` ADD `proof_note` text;