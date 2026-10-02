-- Feedback answers are anonymous (docs/adr/0002-anonymous-feedback.md): both tables are WITHOUT ROWID, so a row's place
-- in the file is its random id's, not the order the responses came in, and a Player's two responses can't be told apart
-- from the rest by sitting next to each other. Drizzle's schema can't say so, so it is written here.
CREATE TABLE `feedback_answers` (
	`id` text PRIMARY KEY NOT NULL,
	`response_id` text NOT NULL,
	`question_id` text NOT NULL,
	`value` text NOT NULL,
	FOREIGN KEY (`response_id`) REFERENCES `feedback_responses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`question_id`) REFERENCES `signup_questions`(`id`) ON UPDATE no action ON DELETE no action
) WITHOUT ROWID;
--> statement-breakpoint
CREATE UNIQUE INDEX `feedback_answers_response_question_unq` ON `feedback_answers` (`response_id`,`question_id`);--> statement-breakpoint
CREATE TABLE `feedback_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`bingo_id` text NOT NULL,
	`kind` text NOT NULL,
	`respondent_key` text NOT NULL,
	FOREIGN KEY (`bingo_id`) REFERENCES `bingos`(`id`) ON UPDATE no action ON DELETE no action
) WITHOUT ROWID;
--> statement-breakpoint
CREATE UNIQUE INDEX `feedback_responses_respondent_key_unq` ON `feedback_responses` (`respondent_key`);--> statement-breakpoint
CREATE INDEX `feedback_responses_bingo_idx` ON `feedback_responses` (`bingo_id`,`kind`);--> statement-breakpoint
ALTER TABLE `signup_questions` ADD `form` text DEFAULT 'signup' NOT NULL;--> statement-breakpoint
ALTER TABLE `signup_questions` ADD `audience` text DEFAULT 'all' NOT NULL;