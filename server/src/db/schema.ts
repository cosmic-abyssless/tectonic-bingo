import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// USERS & AUTH
// ---------------------------------------------------------------------------

export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  discordId: text('discord_id').notNull().unique(),
  discordUsername: text('discord_username').notNull(),
  discordGlobalName: text('discord_global_name'),
  discordGuildNick: text('discord_guild_nick'),
  discordAvatar: text('discord_avatar'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// ---------------------------------------------------------------------------
// BINGO EVENTS
// ---------------------------------------------------------------------------

export const bingoEvents = sqliteTable('bingo_events', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  startsAt: integer('starts_at', { mode: 'timestamp' }).notNull(),
  endsAt: integer('ends_at', { mode: 'timestamp' }).notNull(),
  potAmount: integer('pot_amount'), // GP, nullable until confirmed
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const eventModerators = sqliteTable('event_moderators', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bingoEventId: text('bingo_event_id').notNull().references(() => bingoEvents.id),
  userId: text('user_id').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  uniqueIndex('event_moderators_event_user_unq').on(t.bingoEventId, t.userId),
]);

// ---------------------------------------------------------------------------
// TEAMS & MEMBERS
// ---------------------------------------------------------------------------

export const teams = sqliteTable('teams', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bingoEventId: text('bingo_event_id').notNull().references(() => bingoEvents.id),
  name: text('name').notNull(),
  // Unique per event. Displayed on the bingo board so players can look it up
  // at any time, and stored here to support future AI screenshot scraping that
  // reads the codeword from submission screenshots to assist mod verification.
  codeword: text('codeword').notNull(),
  color: text('color'), // hex code for UI display, e.g. "#e74c3c"
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  uniqueIndex('teams_event_codeword_unq').on(t.bingoEventId, t.codeword),
]);

export const teamMembers = sqliteTable('team_members', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  teamId: text('team_id').notNull().references(() => teams.id),
  userId: text('user_id').notNull().references(() => users.id),
  rsn: text('rsn').notNull(), // RuneScape display name (max 12 chars)
  isCaptain: integer('is_captain', { mode: 'boolean' }).notNull().default(false),
  joinedAt: integer('joined_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  uniqueIndex('team_members_team_user_unq').on(t.teamId, t.userId),
]);

// ---------------------------------------------------------------------------
// TILES
// ---------------------------------------------------------------------------

export const tiles = sqliteTable('tiles', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bingoEventId: text('bingo_event_id').notNull().references(() => bingoEvents.id),
  name: text('name').notNull(), // e.g. "DOOM OF MOKHAIOTL"
  badgeCategory: text('badge_category', {
    enum: ['demonic', 'draconic', 'spectral', 'animalistic', 'god_wars', 'vampyric', 'desert'],
  }).notNull(),
  boardRow: integer('board_row').notNull(), // 0–6
  boardCol: integer('board_col').notNull(), // 0–6
  totalPoints: integer('total_points').notNull(),
  hasFreezePeriod: integer('has_freeze_period', { mode: 'boolean' }).notNull().default(false),
  freezeDurationMinutes: integer('freeze_duration_minutes').notNull().default(0), // 120 for raids/colosseum/doom
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  uniqueIndex('tiles_event_position_unq').on(t.bingoEventId, t.boardRow, t.boardCol),
]);

// Part A and Part B for each tile.
// Part B points are only awarded once Part A is also completed.
export const tileSides = sqliteTable('tile_sides', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  tileId: text('tile_id').notNull().references(() => tiles.id),
  side: text('side', { enum: ['A', 'B'] }).notNull(),
  points: integer('points').notNull(),
  description: text('description').notNull(),
  requiresNoDuplicates: integer('requires_no_duplicates', { mode: 'boolean' }).notNull().default(false),
  allowsPreviouslyAcquired: integer('allows_previously_acquired', { mode: 'boolean' }).notNull().default(false),
  allowsPreLoad: integer('allows_pre_load', { mode: 'boolean' }).notNull().default(false),
  notes: text('notes'),
}, (t) => [
  uniqueIndex('tile_sides_tile_side_unq').on(t.tileId, t.side),
]);

// Individual items/tasks that make up a tile side's requirement.
// Items sharing the same options_group are treated as interchangeable alternatives
// (e.g. "obtain a heavy frame OR a monkey tail" → both share the same group).
// Items with no options_group are all individually required.
export const tileSideItems = sqliteTable('tile_side_items', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  tileSideId: text('tile_side_id').notNull().references(() => tileSides.id),
  itemName: text('item_name').notNull(),
  quantity: integer('quantity').notNull().default(1),
  optionsGroup: text('options_group'), // null = required individually; set = pick-any-one-of
  sortOrder: integer('sort_order').notNull().default(0),
});

// Wildcard items (usually boss jars / special drops) that can substitute for
// a required item. Capped at max_redemptions_per_team uses per team.
export const tileWildcards = sqliteTable('tile_wildcards', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  tileId: text('tile_id').notNull().references(() => tiles.id),
  itemName: text('item_name').notNull(), // e.g. "Cerberus jar"
  maxRedemptionsPerTeam: integer('max_redemptions_per_team').notNull().default(1),
  description: text('description'),
  applicableToSide: text('applicable_to_side', { enum: ['A', 'B'] }), // null = either side
});

// ---------------------------------------------------------------------------
// TEAM PROGRESS
// ---------------------------------------------------------------------------

// Aggregated completion state per team per tile.
// Updated whenever a submission is approved.
// side_b_points_awarded stays 0 until both A and B are completed.
export const teamTileProgress = sqliteTable('team_tile_progress', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  teamId: text('team_id').notNull().references(() => teams.id),
  tileId: text('tile_id').notNull().references(() => tiles.id),
  sideAStatus: text('side_a_status', {
    enum: ['not_started', 'in_progress', 'pending_approval', 'completed'],
  }).notNull().default('not_started'),
  sideAPointsAwarded: integer('side_a_points_awarded').notNull().default(0),
  sideACompletedAt: integer('side_a_completed_at', { mode: 'timestamp' }),
  sideBStatus: text('side_b_status', {
    enum: ['not_started', 'in_progress', 'pending_approval', 'completed'],
  }).notNull().default('not_started'),
  sideBPointsAwarded: integer('side_b_points_awarded').notNull().default(0),
  sideBCompletedAt: integer('side_b_completed_at', { mode: 'timestamp' }),
}, (t) => [
  uniqueIndex('team_tile_progress_team_tile_unq').on(t.teamId, t.tileId),
]);

// ---------------------------------------------------------------------------
// SUBMISSIONS
// ---------------------------------------------------------------------------

export const submissions = sqliteTable('submissions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  teamId: text('team_id').notNull().references(() => teams.id),
  tileSideId: text('tile_side_id').notNull().references(() => tileSides.id),
  submittedByUserId: text('submitted_by_user_id').notNull().references(() => users.id),
  status: text('status', {
    enum: ['pending', 'approved', 'rejected', 'needs_more_info'],
  }).notNull().default('pending'),
  submittedAt: integer('submitted_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  reviewedAt: integer('reviewed_at', { mode: 'timestamp' }),
  reviewedByUserId: text('reviewed_by_user_id').references(() => users.id),
  reviewerNotes: text('reviewer_notes'),
  pointsAwarded: integer('points_awarded'), // set by moderator on approval
  isWildcardRedemption: integer('is_wildcard_redemption', { mode: 'boolean' }).notNull().default(false),
  wildcardId: text('wildcard_id').references(() => tileWildcards.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// One submission can have multiple screenshots (main + pre-screenshot, bank, etc.).
// The scrape_* fields are populated asynchronously by a future AI scraping job
// that reads visible text from screenshots and checks for the team's codeword.
export const submissionScreenshots = sqliteTable('submission_screenshots', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  submissionId: text('submission_id').notNull().references(() => submissions.id),
  screenshotType: text('screenshot_type', {
    enum: ['main', 'pre_screenshot', 'bank', 'collection_log', 'other'],
  }).notNull().default('main'),
  storageUrl: text('storage_url').notNull(),
  // AI scraping fields — null until the async job processes this screenshot
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
  tileSideItemId: text('tile_side_item_id').references(() => tileSideItems.id),
});

// Tracks which wildcards a team has spent.
// The unique constraint enforces the 1x redemption cap per team per wildcard.
// Special case: Shadow (TOA 1 / TOA 2) is two separate wildcard rows so each
// TOA tile naturally gets one redemption.
export const teamWildcardUsage = sqliteTable('team_wildcard_usage', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  teamId: text('team_id').notNull().references(() => teams.id),
  tileWildcardId: text('tile_wildcard_id').notNull().references(() => tileWildcards.id),
  submissionId: text('submission_id').notNull().references(() => submissions.id),
  usedAt: integer('used_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  uniqueIndex('team_wildcard_usage_team_wildcard_unq').on(t.teamId, t.tileWildcardId),
]);

// ---------------------------------------------------------------------------
// BINGO LINES & SCORING
// ---------------------------------------------------------------------------

// All 16 possible lines on the 7×7 board (7 rows + 7 cols + 2 diagonals).
// Each line is worth 15 points.
export const bingoLines = sqliteTable('bingo_lines', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bingoEventId: text('bingo_event_id').notNull().references(() => bingoEvents.id),
  lineType: text('line_type', { enum: ['row', 'column', 'diagonal'] }).notNull(),
  lineIndex: integer('line_index').notNull(), // 0–6 for row/col; 0 = TL diagonal, 1 = TR diagonal
  points: integer('points').notNull().default(15),
});

export const bingoLineTiles = sqliteTable('bingo_line_tiles', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bingoLineId: text('bingo_line_id').notNull().references(() => bingoLines.id),
  tileId: text('tile_id').notNull().references(() => tiles.id),
}, (t) => [
  uniqueIndex('bingo_line_tiles_line_tile_unq').on(t.bingoLineId, t.tileId),
]);

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
  bingoEventId: text('bingo_event_id').notNull().references(() => bingoEvents.id),
  amount: integer('amount').notNull(),
  reason: text('reason').notNull(),
  createdByUserId: text('created_by_user_id').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});
