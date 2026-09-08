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
    enum: ['planning', 'signup', 'captains', 'draft', 'reveal', 'live', 'complete'],
  }).notNull().default('planning'),
  boardRows: integer('board_rows').notNull(),
  boardCols: integer('board_cols').notNull(),
  buyinAmount: integer('buyin_amount'), // GP per player, nullable until decided
  // Extra GP added to the pot on top of buy-ins (sponsorships, donations to
  // raise the stakes). The actual pot total is buyinAmount × paid signups +
  // this — computed in bingoService.calculatePotTotal, not stored.
  bonusPotAmount: integer('bonus_pot_amount').notNull().default(0),
  rulesMarkdown: text('rules_markdown'),
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
    enum: ['planning', 'signup', 'captains', 'draft', 'reveal', 'live', 'complete'],
  }).notNull(),
  toStage: text('to_stage', {
    enum: ['planning', 'signup', 'captains', 'draft', 'reveal', 'live', 'complete'],
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
  // Populated when the submitted RSN matched one of the signer's tectonic-api
  // RSNs at signup time. Never set from a client-supplied claim.
  womId: text('wom_id'),
  rsnVerified: integer('rsn_verified', { mode: 'boolean' }).notNull().default(false),
  // Raw WOM (/players/{rsn}) and RuneProfile (/accounts/{rsn}/full) API
  // responses, fetched once at signup time and reused as-is at draft time —
  // no live external calls in the draft room's hot path. May go stale
  // between signup and draft day; that's an accepted tradeoff for a
  // reference-only display. Internal only — never exposed on the shared
  // Signup type / getAllSignups roster; only the draft route parses these
  // into the small summary shape the client actually renders.
  womDataJson: text('wom_data_json'),
  runeProfileDataJson: text('rune_profile_data_json'),
  statsFetchedAt: integer('stats_fetched_at', { mode: 'timestamp' }),
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
// ITEMS
// ---------------------------------------------------------------------------

// Global, reusable named sets of items (e.g. "Cerberus uniques"). Not scoped
// to a bingo so they can be shared across events.
export const itemGroups = sqliteTable('item_groups', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull().unique(),
  description: text('description'),
});

export const itemGroupItems = sqliteTable('item_group_items', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  groupId: text('group_id').notNull().references(() => itemGroups.id),
  itemName: text('item_name').notNull(),
}, (t) => [
  uniqueIndex('item_group_items_group_name_unq').on(t.groupId, t.itemName),
]);

// ---------------------------------------------------------------------------
// NODE GRAPH
//
// Everything scorable — a tile, a task ("Part A"), a line, an item
// requirement — is a node in one DAG per bingo. `kind` is purely logical:
// ALL/ANY/COUNT are composites that fold their children; ITEM/MANUAL are
// leaves that claims attach to. Any node may carry points; a node completes
// (bottom-up, see engine.ts) independent of whether anything points at it.
// A node may have several parents via nodeEdges (a tile sits in a row, a
// column, and maybe a diagonal). See docs/node-graph-model.md.
// ---------------------------------------------------------------------------

export const nodes = sqliteTable('nodes', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bingoId: text('bingo_id').notNull().references(() => bingos.id),
  kind: text('kind', { enum: ['ALL', 'ANY', 'COUNT', 'ITEM', 'MANUAL'] }).notNull(),
  label: text('label'), // e.g. "Part A", "Vorkath", "Row 0" — display name
  description: text('description'),
  notes: text('notes'),
  points: integer('points').notNull().default(0), // awarded once this node completes (subject to pointsGateNodeId)
  minCount: integer('min_count'), // COUNT only
  quantity: integer('quantity'), // ITEM only
  distinctItems: integer('distinct_items', { mode: 'boolean' }).notNull().default(false), // ITEM only
  // Self-references. Plain text, no FK constraint declared (Drizzle can't
  // express a same-table FK cleanly and SQLite won't enforce it across a
  // deferred insert order anyway) — validity (same bingo, not a descendant)
  // is enforced in graphService, same convention as the old
  // requirementNodes.parentId.
  pointsGateNodeId: text('points_gate_node_id'), // this node's points stay 0 until the gate node completes too
  submitGateNodeId: text('submit_gate_node_id'), // submissions targeting a leaf under this node are rejected until the gate node completes
  allowsPreLoad: integer('allows_pre_load', { mode: 'boolean' }).notNull().default(false), // display hint: player may submit an empty-state screenshot beforehand
});

// A node may have several parents (DAG). sortOrder is scoped to one parent —
// a node's position among its siblings can differ per parent.
export const nodeEdges = sqliteTable('node_edges', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  parentId: text('parent_id').notNull().references(() => nodes.id),
  childId: text('child_id').notNull().references(() => nodes.id),
  sortOrder: integer('sort_order').notNull().default(0),
}, (t) => [
  uniqueIndex('node_edges_parent_child_unq').on(t.parentId, t.childId),
]);

// Inline accepted item names for an ITEM leaf (in addition to any groups).
export const nodeItems = sqliteTable('node_items', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  nodeId: text('node_id').notNull().references(() => nodes.id),
  itemName: text('item_name').notNull(),
}, (t) => [
  uniqueIndex('node_items_node_name_unq').on(t.nodeId, t.itemName),
]);

// Item groups referenced by an ITEM leaf (in addition to any inline names) —
// a leaf can reference several groups at once, same shape as nodeItems.
export const nodeItemGroups = sqliteTable('node_item_groups', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  nodeId: text('node_id').notNull().references(() => nodes.id),
  itemGroupId: text('item_group_id').notNull().references(() => itemGroups.id),
}, (t) => [
  uniqueIndex('node_item_groups_node_group_unq').on(t.nodeId, t.itemGroupId),
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

// A tile is a presentation/submission wrapper (grid position, image, freeze
// window) around one node — its tasks are that node's children.
export const tiles = sqliteTable('tiles', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bingoId: text('bingo_id').notNull().references(() => bingos.id),
  nodeId: text('node_id').notNull().references(() => nodes.id),
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
  uniqueIndex('tiles_node_unq').on(t.nodeId),
]);

// Wildcard items that can substitute for a required item, capped at
// maxRedemptionsPerTeam approved claims per team.
export const tileWildcards = sqliteTable('tile_wildcards', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  tileId: text('tile_id').notNull().references(() => tiles.id),
  itemName: text('item_name').notNull(),
  maxRedemptionsPerTeam: integer('max_redemptions_per_team').notNull().default(1),
  description: text('description'),
  applicableNodeId: text('applicable_node_id').references(() => nodes.id), // null = any leaf on the tile
});

// All possible lines on the board (rows + cols + diagonals, generated from
// bingos.boardRows/boardCols; diagonals only when the board is square). Each
// line is a presentation wrapper around a node whose children are the line's
// tile nodes (an ALL by convention) and whose points are the line bonus.
export const bingoLines = sqliteTable('bingo_lines', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bingoId: text('bingo_id').notNull().references(() => bingos.id),
  nodeId: text('node_id').notNull().references(() => nodes.id),
  lineType: text('line_type', { enum: ['row', 'column', 'diagonal', 'custom'] }).notNull(),
  lineIndex: integer('line_index').notNull(),
}, (t) => [
  uniqueIndex('bingo_lines_node_unq').on(t.nodeId),
]);

// ---------------------------------------------------------------------------
// PROGRESS & SUBMISSIONS
// ---------------------------------------------------------------------------

// Derived cache: one row per node currently COMPLETE for a team. Rebuilt in
// full for the affected team inside every approve/reject transaction by
// re-running the engine (engine.ts) over the bingo's graph — this table is
// never patched incrementally. Soft statuses (in_progress/pending_approval)
// are not stored; they're derived at read time from the team's submissions.
export const teamNodeState = sqliteTable('team_node_state', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  teamId: text('team_id').notNull().references(() => teams.id),
  nodeId: text('node_id').notNull().references(() => nodes.id),
  completedAt: integer('completed_at', { mode: 'timestamp' }).notNull(),
  pointsAwarded: integer('points_awarded').notNull().default(0),
}, (t) => [
  uniqueIndex('team_node_state_team_node_unq').on(t.teamId, t.nodeId),
]);

// A submission is a screenshot plus the claims a player makes against
// requirement leaves. It is not bound to a task — its claims may span several
// leaves (typically the sides of one tile). Points are never stored here —
// see teamNodeState / teamPointAdjustments.
export const submissions = sqliteTable('submissions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  teamId: text('team_id').notNull().references(() => teams.id),
  submittedByUserId: text('submitted_by_user_id').notNull().references(() => users.id),
  status: text('status', {
    enum: ['pending', 'approved', 'rejected'],
  }).notNull().default('pending'),
  submittedAt: integer('submitted_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  reviewedAt: integer('reviewed_at', { mode: 'timestamp' }),
  reviewedByUserId: text('reviewed_by_user_id').references(() => users.id),
  reviewerNotes: text('reviewer_notes'),
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

// One row per drop a player allocates to a requirement leaf. itemName is null
// for MANUAL leaves. wildcardId marks the claim as a wildcard redemption; the
// per-team cap is enforced by counting approved claims per wildcard.
export const claims = sqliteTable('claims', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  submissionId: text('submission_id').notNull().references(() => submissions.id),
  nodeId: text('node_id').notNull().references(() => nodes.id),
  itemName: text('item_name'),
  quantity: integer('quantity').notNull().default(1),
  wildcardId: text('wildcard_id').references(() => tileWildcards.id),
});

// Manual point adjustments applied by moderators. Also the only way to hand
// out points outside the node graph (e.g. correcting a mistake) since nodes
// no longer accept a per-submission points override.
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
