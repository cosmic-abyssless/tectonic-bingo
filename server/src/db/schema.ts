import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// IDENTITY & PLATFORM
// ---------------------------------------------------------------------------

export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  discordId: text('discord_id').notNull().unique(),
  discordUsername: text('discord_username').notNull(),
  discordGlobalName: text('discord_global_name'),
  discordGuildNick: text('discord_guild_nick'),
  discordAvatar: text('discord_avatar'),
  // Site admins can create bingos and grant mod/admin to others from the admin
  // panel. Bootstrapped via the ADMIN_DISCORD_IDS env var on login.
  isAdmin: integer('is_admin', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// A single bingo instance. Everything below is scoped to one bingoId so the
// platform can run (or have run) many bingos concurrently/historically.
export const bingos = sqliteTable('bingos', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  // Selects the client theme folder (client/src/themes/<theme>). 'default' is
  // the neutral, always-available theme.
  theme: text('theme').notNull().default('default'),
  stage: text('stage', {
    enum: ['planning', 'signup', 'draft', 'reveal', 'live', 'complete'],
  }).notNull().default('planning'),
  boardRows: integer('board_rows').notNull(),
  boardCols: integer('board_cols').notNull(),
  buyinAmount: integer('buyin_amount'), // GP, nullable until decided
  potAmount: integer('pot_amount'), // GP, nullable until confirmed
  rulesMarkdown: text('rules_markdown'),
  // Extra context appended to the AI screenshot-analysis prompt for this bingo
  // (e.g. "This is an Old School RuneScape screenshot...").
  aiHint: text('ai_hint'),
  signupOpensAt: integer('signup_opens_at', { mode: 'timestamp' }),
  draftScheduledAt: integer('draft_scheduled_at', { mode: 'timestamp' }),
  revealScheduledAt: integer('reveal_scheduled_at', { mode: 'timestamp' }),
  startsAt: integer('starts_at', { mode: 'timestamp' }),
  endsAt: integer('ends_at', { mode: 'timestamp' }),
  createdByUserId: text('created_by_user_id').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// Mod is per-bingo, not a global flag — fixes v1's single global isModerator.
export const bingoModerators = sqliteTable('bingo_moderators', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bingoId: text('bingo_id').notNull().references(() => bingos.id),
  userId: text('user_id').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  uniqueIndex('bingo_moderators_bingo_user_unq').on(t.bingoId, t.userId),
]);

// Append-only audit log of stage changes. Feeds the post-bingo timeline view.
export const stageTransitions = sqliteTable('stage_transitions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bingoId: text('bingo_id').notNull().references(() => bingos.id),
  fromStage: text('from_stage', {
    enum: ['planning', 'signup', 'draft', 'reveal', 'live', 'complete'],
  }).notNull(),
  toStage: text('to_stage', {
    enum: ['planning', 'signup', 'draft', 'reveal', 'live', 'complete'],
  }).notNull(),
  changedByUserId: text('changed_by_user_id').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// ---------------------------------------------------------------------------
// SIGNUP & DRAFT
// ---------------------------------------------------------------------------

// Admin-authored signup questions, per bingo. Rendered on the signup form.
export const signupQuestions = sqliteTable('signup_questions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bingoId: text('bingo_id').notNull().references(() => bingos.id),
  prompt: text('prompt').notNull(),
  type: text('type', { enum: ['text', 'textarea', 'select', 'boolean'] }).notNull(),
  optionsJson: text('options_json'), // JSON string array; only for type = 'select'
  required: integer('required', { mode: 'boolean' }).notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const signups = sqliteTable('signups', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bingoId: text('bingo_id').notNull().references(() => bingos.id),
  userId: text('user_id').notNull().references(() => users.id),
  rsn: text('rsn').notNull(), // RuneScape display name (max 12 chars)
  status: text('status', { enum: ['active', 'withdrawn'] }).notNull().default('active'),
  buyinReceivedAt: integer('buyin_received_at', { mode: 'timestamp' }),
  buyinCollectedByUserId: text('buyin_collected_by_user_id').references(() => users.id), // who physically collected the GP
  buyinRecordedByUserId: text('buyin_recorded_by_user_id').references(() => users.id), // the mod who marked it received
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  uniqueIndex('signups_bingo_user_unq').on(t.bingoId, t.userId),
]);

export const signupAnswers = sqliteTable('signup_answers', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  signupId: text('signup_id').notNull().references(() => signups.id),
  questionId: text('question_id').notNull().references(() => signupQuestions.id),
  value: text('value').notNull(), // booleans stored as "true"/"false"
}, (t) => [
  uniqueIndex('signup_answers_signup_question_unq').on(t.signupId, t.questionId),
]);

export const teams = sqliteTable('teams', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bingoId: text('bingo_id').notNull().references(() => bingos.id),
  captainUserId: text('captain_user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  // Unique per bingo. Displayed on the board so players can look it up, and
  // used to assist mod verification of submission screenshots.
  codeword: text('codeword').notNull(),
  color: text('color'), // hex code for UI display, e.g. "#e74c3c" — mod-assigned
  draftOrder: integer('draft_order'), // nullable until the draft starts
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  uniqueIndex('teams_bingo_captain_unq').on(t.bingoId, t.captainUserId),
  uniqueIndex('teams_bingo_codeword_unq').on(t.bingoId, t.codeword),
]);

export const teamMembers = sqliteTable('team_members', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  teamId: text('team_id').notNull().references(() => teams.id),
  userId: text('user_id').notNull().references(() => users.id),
  isCaptain: integer('is_captain', { mode: 'boolean' }).notNull().default(false),
  joinedAt: integer('joined_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  uniqueIndex('team_members_team_user_unq').on(t.teamId, t.userId),
]);

// One row per snake-draft pick. pickedByUserId is normally the captain, but
// mods may pick on a captain's behalf.
export const draftPicks = sqliteTable('draft_picks', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bingoId: text('bingo_id').notNull().references(() => bingos.id),
  pickNumber: integer('pick_number').notNull(), // 1-based, overall draft order
  teamId: text('team_id').notNull().references(() => teams.id),
  userId: text('user_id').notNull().references(() => users.id), // the drafted player
  pickedByUserId: text('picked_by_user_id').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  uniqueIndex('draft_picks_bingo_pick_unq').on(t.bingoId, t.pickNumber),
  uniqueIndex('draft_picks_bingo_user_unq').on(t.bingoId, t.userId),
]);

// ---------------------------------------------------------------------------
// BOARD & RULES
// ---------------------------------------------------------------------------

// Optional per-bingo row/category labels (replaces v1's hardcoded 7-category
// enum). A bingo can leave this empty and just use raw grid positions.
export const tileCategories = sqliteTable('tile_categories', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bingoId: text('bingo_id').notNull().references(() => bingos.id),
  label: text('label').notNull(),
  colorHex: text('color_hex'),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const tiles = sqliteTable('tiles', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bingoId: text('bingo_id').notNull().references(() => bingos.id),
  name: text('name').notNull(),
  imageUrl: text('image_url'), // uploaded via the admin panel
  categoryId: text('category_id').references(() => tileCategories.id),
  boardRow: integer('board_row').notNull(), // 0-indexed
  boardCol: integer('board_col').notNull(), // 0-indexed
  hasFreezePeriod: integer('has_freeze_period', { mode: 'boolean' }).notNull().default(false),
  freezeDurationMinutes: integer('freeze_duration_minutes').notNull().default(0),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  uniqueIndex('tiles_bingo_position_unq').on(t.bingoId, t.boardRow, t.boardCol),
]);

// A tile has N ordered tasks (v1's hardcoded Part A / Part B is now just the
// two-task common case). sortOrder determines the task chain: "the previous
// task" means the task with the next-lower sortOrder on the same tile.
export const tileTasks = sqliteTable('tile_tasks', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  tileId: text('tile_id').notNull().references(() => tiles.id),
  label: text('label').notNull(), // e.g. "Part A"
  sortOrder: integer('sort_order').notNull().default(0),
  points: integer('points').notNull(),
  description: text('description').notNull(),
  // Server rejects a submission for this task until the previous task in the
  // chain is completed.
  submitRequiresPrevious: integer('submit_requires_previous', { mode: 'boolean' }).notNull().default(false),
  // This task can be completed and approved early, but its points stay
  // withheld (0) until the previous task in the chain completes.
  pointsRequirePrevious: integer('points_require_previous', { mode: 'boolean' }).notNull().default(false),
  requiresNoDuplicates: integer('requires_no_duplicates', { mode: 'boolean' }).notNull().default(false),
  // Approved claims from the previous task fold into this task's tally too
  // (e.g. a Cerberus jar claimed on task 1 also counts toward task 2).
  allowsPreviouslyAcquired: integer('allows_previously_acquired', { mode: 'boolean' }).notNull().default(false),
  allowsPreLoad: integer('allows_pre_load', { mode: 'boolean' }).notNull().default(false),
  // Minimum number of approved submissions required before this task is
  // marked complete (covers "2 different drops" where each is qty=1).
  minSubmissions: integer('min_submissions').notNull().default(1),
  // When true, completion requires ALL items in at least ONE options group to
  // be approved (a complete matching set), rather than any one per group.
  requiresCompleteSet: integer('requires_complete_set', { mode: 'boolean' }).notNull().default(false),
  notes: text('notes'),
}, (t) => [
  uniqueIndex('tile_tasks_tile_sort_unq').on(t.tileId, t.sortOrder),
]);

// Individual items/tasks that make up a task's requirement. Items sharing the
// same optionsGroup are interchangeable alternatives; items with no group are
// all individually required.
export const tileTaskItems = sqliteTable('tile_task_items', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  taskId: text('task_id').notNull().references(() => tileTasks.id),
  itemName: text('item_name').notNull(),
  quantity: integer('quantity').notNull().default(1),
  optionsGroup: text('options_group'), // null = required individually; set = pick-any-one-of
  sortOrder: integer('sort_order').notNull().default(0),
});

// Wildcard items that can substitute for a required item, capped at
// maxRedemptionsPerTeam uses per team (enforced in the approval transaction).
export const tileWildcards = sqliteTable('tile_wildcards', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  tileId: text('tile_id').notNull().references(() => tiles.id),
  itemName: text('item_name').notNull(),
  maxRedemptionsPerTeam: integer('max_redemptions_per_team').notNull().default(1),
  description: text('description'),
  applicableTaskId: text('applicable_task_id').references(() => tileTasks.id), // null = any task on the tile
});

// All possible lines on the board (rows + cols + diagonals, generated from
// bingos.boardRows/boardCols; diagonals only when the board is square).
export const bingoLines = sqliteTable('bingo_lines', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bingoId: text('bingo_id').notNull().references(() => bingos.id),
  lineType: text('line_type', { enum: ['row', 'column', 'diagonal', 'custom'] }).notNull(),
  lineIndex: integer('line_index').notNull(),
  points: integer('points').notNull().default(15),
});

export const bingoLineTiles = sqliteTable('bingo_line_tiles', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bingoLineId: text('bingo_line_id').notNull().references(() => bingoLines.id),
  tileId: text('tile_id').notNull().references(() => tiles.id),
}, (t) => [
  uniqueIndex('bingo_line_tiles_line_tile_unq').on(t.bingoLineId, t.tileId),
]);

// ---------------------------------------------------------------------------
// PROGRESS & SUBMISSIONS
// ---------------------------------------------------------------------------

// Aggregated completion state per team per task. Updated by scoringService
// whenever a submission is approved.
export const teamTaskProgress = sqliteTable('team_task_progress', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  teamId: text('team_id').notNull().references(() => teams.id),
  taskId: text('task_id').notNull().references(() => tileTasks.id),
  status: text('status', {
    enum: ['not_started', 'in_progress', 'pending_approval', 'completed'],
  }).notNull().default('not_started'),
  pointsAwarded: integer('points_awarded').notNull().default(0),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
}, (t) => [
  uniqueIndex('team_task_progress_team_task_unq').on(t.teamId, t.taskId),
]);

export const submissions = sqliteTable('submissions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  teamId: text('team_id').notNull().references(() => teams.id),
  taskId: text('task_id').notNull().references(() => tileTasks.id),
  submittedByUserId: text('submitted_by_user_id').notNull().references(() => users.id),
  status: text('status', {
    enum: ['pending', 'approved', 'rejected'],
  }).notNull().default('pending'),
  submittedAt: integer('submitted_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  reviewedAt: integer('reviewed_at', { mode: 'timestamp' }),
  reviewedByUserId: text('reviewed_by_user_id').references(() => users.id),
  reviewerNotes: text('reviewer_notes'),
  pointsAwarded: integer('points_awarded'), // set by moderator on approval; may override the task's default
  isWildcardRedemption: integer('is_wildcard_redemption', { mode: 'boolean' }).notNull().default(false),
  wildcardId: text('wildcard_id').references(() => tileWildcards.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// One submission can have multiple screenshots (main + pre-screenshot, bank,
// etc.). The scrape_* fields are populated by the AI screenshot-analysis job.
export const submissionScreenshots = sqliteTable('submission_screenshots', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  submissionId: text('submission_id').notNull().references(() => submissions.id),
  screenshotType: text('screenshot_type', {
    enum: ['main', 'pre_screenshot', 'bank', 'collection_log', 'other'],
  }).notNull().default('main'),
  storageUrl: text('storage_url').notNull(),
  scrapeStatus: text('scrape_status', {
    enum: ['pending', 'processing', 'completed', 'failed'],
  }).notNull().default('pending'),
  extractedText: text('extracted_text'),
  codewordVerified: integer('codeword_verified', { mode: 'boolean' }),
  scrapedAt: integer('scraped_at', { mode: 'timestamp' }),
  uploadedAt: integer('uploaded_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// The specific items a player claims within a submission.
export const submissionItemClaims = sqliteTable('submission_item_claims', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  submissionId: text('submission_id').notNull().references(() => submissions.id),
  itemName: text('item_name').notNull(),
  quantity: integer('quantity').notNull().default(1),
  taskItemId: text('task_item_id').references(() => tileTaskItems.id),
});

// Tracks which wildcards a team has spent. The row is written on submission
// APPROVAL (not submission) so a rejected wildcard submission doesn't burn a
// redemption. No unique index — the per-team cap is enforced by counting
// rows inside the approval transaction, so maxRedemptionsPerTeam > 1 works.
export const teamWildcardUsage = sqliteTable('team_wildcard_usage', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  teamId: text('team_id').notNull().references(() => teams.id),
  tileWildcardId: text('tile_wildcard_id').notNull().references(() => tileWildcards.id),
  submissionId: text('submission_id').notNull().references(() => submissions.id),
  usedAt: integer('used_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const teamCompletedLines = sqliteTable('team_completed_lines', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  teamId: text('team_id').notNull().references(() => teams.id),
  bingoLineId: text('bingo_line_id').notNull().references(() => bingoLines.id),
  completedAt: integer('completed_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  uniqueIndex('team_completed_lines_team_line_unq').on(t.teamId, t.bingoLineId),
]);

// Manual point adjustments applied by moderators.
// Use negative amounts for penalties (e.g. -100 for hiding outside clan chat).
export const teamPointAdjustments = sqliteTable('team_point_adjustments', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  teamId: text('team_id').notNull().references(() => teams.id),
  bingoId: text('bingo_id').notNull().references(() => bingos.id),
  amount: integer('amount').notNull(),
  reason: text('reason').notNull(),
  createdByUserId: text('created_by_user_id').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});
