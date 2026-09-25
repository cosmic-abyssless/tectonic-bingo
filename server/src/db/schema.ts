import { sqliteTable, text, integer, real, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
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
  // Whether the user was a member of DISCORD_GUILD_ID at their last Discord
  // login. Non-members are locked out of every bingo route. Defaults to true
  // because only a real OAuth login can observe membership — dev-login and
  // seeded users never go through one.
  inGuild: integer('in_guild', { mode: 'boolean' }).notNull().default(true),
  // Site admins can create bingos and grant mod/admin to others from the admin
  // panel. Bootstrapped via the ADMIN_DISCORD_IDS env var on login.
  isAdmin: integer('is_admin', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// One-time links a logged-in browser makes to log the same account in on a phone: shown as a QR code the phone
// scans, so the phone never meets Discord's web login. Only a hash of the link's token is kept; a link works once,
// for a couple of minutes (phoneLoginService).
export const phoneLoginLinks = sqliteTable('phone_login_links', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  tokenHash: text('token_hash').notNull().unique(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  usedAt: integer('used_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [index('phone_login_links_user_idx').on(t.userId)]);

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
  // 'duo': players pair up during signup and are drafted as a unit. Only
  // changeable while the bingo has no signups.
  signupMode: text('signup_mode', { enum: ['solo', 'duo'] }).notNull().default('solo'),
  // Replaced by cutMode (kept only so the column can be dropped in a later deploy, per the additive-migration rule
  // in docs/zero-downtime-deploy-plan.md). Nothing reads or writes it.
  leftoverMode: text('leftover_mode', { enum: ['cut', 'singles'] }).notNull().default('cut'),
  // Who makes the draft so teams come out the same shape: "even" (every team the same number of pairs and of
  // singles; the newest that don't split evenly are cut), "pairs_only" (duo: pairs only, split evenly; every single is
  // cut) or "none" (everyone drafted, any order, teams may be uneven). See CutMode in shared and draftService.
  cutMode: text('cut_mode', { enum: ['even', 'pairs_only', 'none'] }).notNull().default('even'),
  // Show at-risk signups a notice on the signup page.
  warnLeftovers: integer('warn_leftovers', { mode: 'boolean' }).notNull().default(false),
  buyinAmount: integer('buyin_amount'), // GP per player, nullable until decided
  // Extra GP added to the pot on top of buy-ins (sponsorships, donations to
  // raise the stakes). The actual pot total is buyinAmount × paid signups +
  // this — computed in bingoService.calculatePotTotal, not stored.
  bonusPotAmount: integer('bonus_pot_amount').notNull().default(0),
  rulesMarkdown: text('rules_markdown'),
  // Items a team may use in one place only (docs/exclusive-items-plan.md): a JSON array of
  // ExclusivityRule, parsed by bingoService.parseExclusivityRules and exposed as `exclusivityRules`.
  exclusivityRulesJson: text('exclusivity_rules_json').notNull().default('[]'),
  signupOpensAt: integer('signup_opens_at', { mode: 'timestamp' }),
  draftScheduledAt: integer('draft_scheduled_at', { mode: 'timestamp' }),
  revealScheduledAt: integer('reveal_scheduled_at', { mode: 'timestamp' }),
  startsAt: integer('starts_at', { mode: 'timestamp' }),
  endsAt: integer('ends_at', { mode: 'timestamp' }),
  // Wise Old Man integration (womCompetitionService.ts): when enabled, a WOM
  // group competition is created for this bingo's teams once the draft
  // finishes, and kept in sync when a captain renames their team.
  // womGroupVerificationCode is a secret (it authorizes editing/deleting the
  // group's competitions on WOM) — it must NEVER be serialized into a client
  // response. bingoService.toPublicBingo() strips it; every route that sends
  // a bingo to a client must go through it.
  womEnabled: integer('wom_enabled', { mode: 'boolean' }).notNull().default(false),
  womGroupId: text('wom_group_id'),
  womGroupVerificationCode: text('wom_group_verification_code'),
  // Set once syncWomCompetitionAfterDraft successfully creates the
  // competition; later renames edit this same competition instead of
  // creating a new one.
  womCompetitionId: integer('wom_competition_id'),
  // Last WOM sync failure (create or edit), surfaced in the admin settings
  // panel. Cleared on the next successful sync.
  womSyncError: text('wom_sync_error'),
  // Set by Site Admin Start draft. Writing draftOrder is not starting —
  // captains cannot pick until this is true and the shuffle reveal lock
  // (draftOrderLockedUntil) has expired.
  draftStarted: integer('draft_started', { mode: 'boolean' }).notNull().default(false),
  draftOrderLockedUntil: integer('draft_order_locked_until', { mode: 'timestamp' }),
  createdByUserId: text('created_by_user_id').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  // Achievements master switch (CONTEXT.md "Achievement"): off hides every Achievement from reads, counts and
  // popups, but earning keeps happening in the background — see achievementService.ts and bingoAchievementSettings.
  achievementsEnabled: integer('achievements_enabled', { mode: 'boolean' }).notNull().default(true),
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

// Append-only audit log (docs/audit-log-plan.md). Deliberately breaks three
// table conventions used everywhere else: an autoincrement integer id (total
// insertion order gives a cheap keyset cursor), millisecond timestamps
// (entries can land faster than 1s apart), and no FK on bingoId/teamId (a
// site-level entry has bingoId = null, and entries must outlive
// bingoService.deleteBingo's cascade).
export const auditLog = sqliteTable('audit_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  bingoId: text('bingo_id'),
  requestId: text('request_id'),
  action: text('action').notNull(),
  visibility: text('visibility', { enum: ['mods', 'team', 'public'] }).notNull(),
  actorType: text('actor_type', { enum: ['user', 'system', 'dev'] }).notNull(),
  actorRole: text('actor_role', { enum: ['admin', 'mod', 'player', 'system'] }).notNull(),
  actorUserId: text('actor_user_id').references(() => users.id),
  onBehalfOfUserId: text('on_behalf_of_user_id').references(() => users.id),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  entityLabel: text('entity_label'),
  teamId: text('team_id'),
  details: text('details').notNull().default('{}'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (t) => [
  index('audit_log_bingo_idx').on(t.bingoId, t.id),
  index('audit_log_bingo_action_idx').on(t.bingoId, t.action, t.id),
  index('audit_log_bingo_team_idx').on(t.bingoId, t.teamId, t.id),
  index('audit_log_bingo_actor_idx').on(t.bingoId, t.actorUserId, t.id),
  index('audit_log_bingo_created_idx').on(t.bingoId, t.createdAt),
  index('audit_log_entity_idx').on(t.entityType, t.entityId),
]);

// ---------------------------------------------------------------------------
// SIGNUP & DRAFT
// ---------------------------------------------------------------------------

// Admin-authored signup questions, per bingo. Rendered on the signup form.
export const signupQuestions = sqliteTable('signup_questions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bingoId: text('bingo_id').notNull().references(() => bingos.id),
  prompt: text('prompt').notNull(),
  // Optional plain-text note shown under the question on the signup form.
  helperText: text('helper_text'),
  type: text('type', { enum: ['text', 'textarea', 'select', 'multiselect', 'boolean'] }).notNull(), // select = one choice, multiselect = several
  optionsJson: text('options_json'), // JSON string array; only for type = 'select' or 'multiselect'
  required: integer('required', { mode: 'boolean' }).notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  // Who besides the answerer sees the answers: 'captains' (and up), 'mods' (and site admins), or 'admins' only.
  visibility: text('visibility', { enum: ['captains', 'mods', 'admins'] }).notNull().default('captains'),
});

export const signups = sqliteTable('signups', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bingoId: text('bingo_id').notNull().references(() => bingos.id),
  userId: text('user_id').notNull().references(() => users.id),
  rsn: text('rsn').notNull(), // RuneScape display name (max 12 chars)
  // IANA zone name ("America/New_York"). Required on new signups (the form pre-fills it from the browser); null for
  // signups from before it was asked, until the player confirms it or a mod sets it from the roster.
  timezone: text('timezone'),
  // Populated when the submitted RSN matched one of the signer's tectonic-api
  // RSNs at signup time. Never set from a client-supplied claim.
  womId: text('wom_id'),
  rsnVerified: integer('rsn_verified', { mode: 'boolean' }).notNull().default(false),
  // Raw WOM (/players/{rsn}) and RuneProfile (/accounts/{rsn}/full) API
  // responses, fetched at signup (and on mod refresh) and reused as-is at
  // draft time — no live external calls in the draft room's hot path. May
  // go stale between signup and draft day; that's an accepted tradeoff for
  // a reference-only display. Internal only — never exposed on the shared
  // Signup type / getAllSignups roster; only the draft route parses the
  // blobs. Derived CA snapshots (caCurrentJson/caPeakJson) are small and
  // are selected onto the roster and signup form.
  womDataJson: text('wom_data_json'),
  runeProfileDataJson: text('rune_profile_data_json'),
  statsFetchedAt: integer('stats_fetched_at', { mode: 'timestamp' }),
  // Derived OSRS Combat Achievement reward-tier snapshots. Current is the
  // signed-up RSN; peak is the max across currently Tectonic-linked RSNs.
  // Small JSON ({tier, points}) so roster/draft reads never pull the raw
  // RuneProfile blob. Alt RP responses are not persisted.
  caCurrentJson: text('ca_current_json'),
  caPeakJson: text('ca_peak_json'),
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

// Duo-mode partner requests. The target is keyed by Discord id because a
// player may request a clan member who hasn't logged in yet; the request
// resolves to a user row once they do. A pair is a row with status
// 'accepted'; 'dissolved' means one half withdrew their signup afterwards.
export const signupPairings = sqliteTable('signup_pairings', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bingoId: text('bingo_id').notNull().references(() => bingos.id),
  requesterUserId: text('requester_user_id').notNull().references(() => users.id),
  targetDiscordId: text('target_discord_id').notNull(),
  // 'dissolved': a signup withdrew (dissolveForUser) or a mod split the pair (unpair). 'left': a player ended
  // an accepted pairing themselves while both signups stay active (leavePairing) — a distinct status, not a
  // cause flag on 'dissolved', so getPairingState's lastOutcome can tell players something true either way.
  status: text('status', { enum: ['pending', 'accepted', 'declined', 'cancelled', 'dissolved', 'left'] })
    .notNull()
    .default('pending'),
  // Set when a mod paired the two players by hand instead of a player request.
  createdByUserId: text('created_by_user_id').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  respondedAt: integer('responded_at', { mode: 'timestamp' }),
});

export const teams = sqliteTable('teams', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bingoId: text('bingo_id').notNull().references(() => bingos.id),
  captainUserId: text('captain_user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  // Unique per bingo. Displayed on the board so players can look it up, and
  // used to assist mod verification of submission screenshots.
  codeword: text('codeword').notNull(),
  color: text('color'), // hex code for UI display, e.g. "#e74c3c" — mod-assigned
  draftOrder: integer('draft_order'), // nullable until pick order is set
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
  // Duo mode: the captain's partner. Shares the captain's permissions
  // (drafting, renaming) and can't be removed from the team.
  isCoCaptain: integer('is_co_captain', { mode: 'boolean' }).notNull().default(false),
  joinedAt: integer('joined_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  uniqueIndex('team_members_team_user_unq').on(t.teamId, t.userId),
]);

// One row per drafted player. pickedByUserId is normally the captain, but
// mods may pick on a captain's behalf. In duo mode a pick drafts a pair, so
// two rows share the same pickNumber.
export const draftPicks = sqliteTable('draft_picks', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bingoId: text('bingo_id').notNull().references(() => bingos.id),
  pickNumber: integer('pick_number').notNull(), // 1-based, overall draft order
  teamId: text('team_id').notNull().references(() => teams.id),
  userId: text('user_id').notNull().references(() => users.id), // the drafted player
  pickedByUserId: text('picked_by_user_id').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  uniqueIndex('draft_picks_bingo_user_unq').on(t.bingoId, t.userId),
]);

// "I want to do this part" — a player's hand raised on one task of a tile,
// visible to their own team so work can be split up without a side channel.
// One row per (task, user); the tile and team are denormalised so the board
// read path can load a team's interests in one query and tile deletion can
// sweep them without walking the node tree.
export const tileInterests = sqliteTable('tile_interests', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  tileId: text('tile_id').notNull().references(() => tiles.id),
  taskId: text('task_id').notNull().references(() => nodes.id),
  teamId: text('team_id').notNull().references(() => teams.id),
  userId: text('user_id').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  uniqueIndex('tile_interests_task_user_unq').on(t.taskId, t.userId),
  index('tile_interests_team_idx').on(t.teamId),
]);

// A team's private notes on a signup while scouting before/during the draft.
// Shared between captain and co-captain; visible to mods.
export const pickRatings = sqliteTable('pick_ratings', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  teamId: text('team_id').notNull().references(() => teams.id),
  signupId: text('signup_id').notNull().references(() => signups.id),
  stars: integer('stars').notNull(), // 0-3; 0 with a note = note only
  note: text('note').notNull().default(''),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  uniqueIndex('pick_ratings_team_signup_unq').on(t.teamId, t.signupId),
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
// WOM SNAPSHOTS DURING A BINGO (issue #182)
// ---------------------------------------------------------------------------

// Every Wise Old Man snapshot of a Player during a Bingo, from shortly before it started, read by womReadService.
// Titles take EHB, EHP and clue gains from them, and luck (#195) takes each boss's kill counts over time. Only what
// WOM already has is read; the site never asks WOM to update a Player.
export const womSnapshots = sqliteTable('wom_snapshots', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bingoId: text('bingo_id').notNull().references(() => bingos.id),
  userId: text('user_id').notNull().references(() => users.id),
  takenAt: integer('taken_at', { mode: 'timestamp' }).notNull(),
  // Null while below the hiscores' minimum (WOM's -1), as parseSnapshots reads them.
  ehb: real('ehb'),
  ehp: real('ehp'),
  clues: integer('clues'),
  // { [WOM boss metric]: kills | null }
  bossKillsJson: text('boss_kills_json').notNull(),
}, (t) => [
  uniqueIndex('wom_snapshots_bingo_user_taken_unq').on(t.bingoId, t.userId, t.takenAt),
]);

// Where each Player's snapshot reads stand: the next read starts from the last stored snapshot, and one that
// has read through the Bingo's end is never read again.
export const womReads = sqliteTable('wom_reads', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bingoId: text('bingo_id').notNull().references(() => bingos.id),
  userId: text('user_id').notNull().references(() => users.id),
  rsn: text('rsn').notNull(),
  // When the last successful read happened, and the end of its range: nothing up to readThrough is missing.
  readAt: integer('read_at', { mode: 'timestamp' }),
  readThrough: integer('read_through', { mode: 'timestamp' }),
  lastError: text('last_error'),
  lastErrorAt: integer('last_error_at', { mode: 'timestamp' }),
}, (t) => [
  uniqueIndex('wom_reads_bingo_user_unq').on(t.bingoId, t.userId),
]);

// ---------------------------------------------------------------------------
// WOM PAST COMPETITIONS (issue #128)
// ---------------------------------------------------------------------------

// A snapshot of one Wise Old Man competition's final results, persisted so
// per-player EHP/EHB gains from a bingo survive after WOM's own record of it
// (which the platform doesn't control) changes or disappears. Not scoped to
// a bingo row: guildId + womId is the natural key, so a pre-platform bingo's
// competition (added by hand from the admin panel) can be stored the same
// way as one this platform ran itself.
export const womPastCompetitions = sqliteTable('wom_past_competitions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  // DISCORD_GUILD_ID at fetch time — forward-looking scoping column for a
  // still-hypothetical multi-guild deployment; every row today shares one value.
  guildId: text('guild_id').notNull(),
  womId: integer('wom_id').notNull(),
  // Set only when this competition was auto-archived from a platform bingo
  // reaching `complete` (bingoService/routes/mod.ts). Null for one an admin
  // added by hand for a bingo that predates (or never used) this platform.
  bingoId: text('bingo_id').references(() => bingos.id),
  title: text('title').notNull(),
  metric: text('metric').notNull(),
  startsAt: integer('starts_at', { mode: 'timestamp' }).notNull(),
  endsAt: integer('ends_at', { mode: 'timestamp' }).notNull(),
  participantCount: integer('participant_count').notNull().default(0),
  // Verbatim GET /competitions/{id} response (participations with each
  // player's gained EHP/EHB) — parsed by whatever future feature displays
  // it, same convention as signups.womDataJson.
  dataJson: text('data_json').notNull(),
  fetchedAt: integer('fetched_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  // Who triggered a manual add; null for an automatic archive (actor "system").
  addedByUserId: text('added_by_user_id').references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  uniqueIndex('wom_past_competitions_guild_wom_unq').on(t.guildId, t.womId),
]);

// Site-wide bug reports, submitted from the header button on any page. Not
// scoped to a bingo — a bug can happen anywhere in the app.
export const bugReports = sqliteTable('bug_reports', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  // Best-effort tag: the bingo whose pages the reporter's URL was under at
  // submit time (resolved server-side from pageUrl), or null off-bingo
  // (bingo list, site admin). No FK, same convention as auditLog.bingoId —
  // a report should survive that bingo's later deletion.
  bingoId: text('bingo_id'),
  reporterUserId: text('reporter_user_id').notNull().references(() => users.id),
  description: text('description').notNull(),
  pageUrl: text('page_url'), // window.location.pathname at submit time — debugging context
  userAgent: text('user_agent'), // navigator.userAgent — same
  palette: text('palette'), // theme + palette + colour scheme in effect (e.g. "comic · Blackout (dark)") — for reproducing visual bugs
  // 'resolved' = fixed; 'closed' = deliberately not implemented (usually with a reason in resolutionMessage).
  status: text('status', { enum: ['open', 'resolved', 'closed'] }).notNull().default('open'),
  resolvedByUserId: text('resolved_by_user_id').references(() => users.id),
  resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
  // Optional note from whoever resolved/closed it, shown to the reporter; cleared on reopen.
  resolutionMessage: text('resolution_message'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// ---------------------------------------------------------------------------
// NODE GRAPH
//
// Everything scorable — a tile, a task ("Part A"), a line, an item
// requirement — is a node in one DAG per bingo. `kind` is purely logical:
// ALL/ANY/COUNT/SUM are composites that fold their children; ITEM/MANUAL are
// leaves that claims attach to. Any node may carry points; a node completes
// (bottom-up, see engine.ts) independent of whether anything points at it.
// A node may have several parents via nodeEdges (a tile sits in a row, a
// column, and maybe a diagonal). See docs/node-graph-model.md and
// docs/item-quantity-model.md (ITEM/SUM/quantity revision).
//
// ITEM is a single-name leaf (`itemName`) with no quantity of its own — it is
// complete as soon as one approved claim targets it. Every quantitative
// decision lives one level up: SUM sums approved-claim quantities across its
// ITEM children against its own `quantity` target; COUNT (already existed)
// counts how many children are complete, which also covers what a removed
// `distinctItems` flag used to mean ("N distinct names" = COUNT(N) over N
// single-name leaves). See docs/item-quantity-model.md §2.
// ---------------------------------------------------------------------------

export const nodes = sqliteTable('nodes', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bingoId: text('bingo_id').notNull().references(() => bingos.id),
  kind: text('kind', { enum: ['ALL', 'ANY', 'COUNT', 'SUM', 'ITEM', 'MANUAL'] }).notNull(),
  label: text('label'), // e.g. "Part A", "Vorkath", "Row 0" — display name
  description: text('description'),
  notes: text('notes'),
  points: integer('points').notNull().default(0), // awarded once this node completes (subject to pointsGateNodeId)
  minCount: integer('min_count'), // COUNT only
  quantity: integer('quantity'), // SUM only — target total of children's approved-claim quantities
  itemName: text('item_name'), // ITEM only — the single accepted name
  // Self-references. Plain text, no FK constraint declared (Drizzle can't
  // express a same-table FK cleanly and SQLite won't enforce it across a
  // deferred insert order anyway) — validity (same bingo, not a descendant)
  // is enforced in graphService, same convention as the old
  // requirementNodes.parentId.
  pointsGateNodeId: text('points_gate_node_id'), // this node's points stay 0 until the gate node completes too
  submitGateNodeId: text('submit_gate_node_id'), // submissions targeting a leaf under this node are rejected until the gate node completes
  allowsPreLoad: integer('allows_pre_load', { mode: 'boolean' }).notNull().default(false),
  // ITEM only, optional (CONTEXT.md "Valued as"): claims on this leaf get their GP value from this item ÷ divisor
  // instead of their own item's price, e.g. a DT2 page's Gold ring valued as Magus vestige ÷ 3. Both set or both null.
  valuedAsItemName: text('valued_as_item_name'),
  valuedAsDivisor: integer('valued_as_divisor'),
  // Optional, with Valued as: where these claims come from ("Vardorvis"), shown next to the item so players see why
  // an ordinary-looking item has a value.
  valuedAsSource: text('valued_as_source'), // display hint: player may submit an empty-state screenshot beforehand
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
  // The player the drop belongs to: credited for it in the stats and on the board.
  submittedByUserId: text('submitted_by_user_id').notNull().references(() => users.id),
  // Set only when someone else uploaded the screenshot for that player (a teammate at a PC for a drop on mobile, or a
  // mod). Null means the player posted it themselves. The audit log's actor is whoever posted.
  postedByUserId: text('posted_by_user_id').references(() => users.id),
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

// A teammate's emoji on a submission (SUBMISSION_REACTIONS). A player can leave several different ones on the same
// submission, each once. Only the submission's own team reacts (and sees them, with mods).
export const submissionReactions = sqliteTable('submission_reactions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  submissionId: text('submission_id').notNull().references(() => submissions.id),
  userId: text('user_id').notNull().references(() => users.id),
  emoji: text('emoji').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  uniqueIndex('submission_reactions_submission_user_emoji_unq').on(t.submissionId, t.userId, t.emoji),
  index('submission_reactions_submission_idx').on(t.submissionId),
]);

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
  /** Matched item's name, or null if OCR found no bingo item in the text — see textMatchService.findBestMatch. */
  detectedItemName: text('detected_item_name'),
  scrapedAt: integer('scraped_at', { mode: 'timestamp' }),
  uploadedAt: integer('uploaded_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// One row per drop a player allocates to a requirement leaf. itemName is null
// for MANUAL leaves; for an ITEM leaf it must match the leaf's own itemName
// (validated in submissionService, not enforced here — see
// docs/item-quantity-model.md §8).
export const claims = sqliteTable('claims', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  submissionId: text('submission_id').notNull().references(() => submissions.id),
  nodeId: text('node_id').notNull().references(() => nodes.id),
  itemName: text('item_name'),
  quantity: integer('quantity').notNull().default(1),
  // What the drop was worth in GP when submitted (CONTEXT.md "GP value"): unit price × quantity. Null for MANUAL
  // claims, items with no GE price or Piece value, or until the price table loads (gpValueService fills it in).
  // Never changed once set, and never used for scoring.
  gpValue: integer('gp_value'),
});

// Site-wide Piece values (CONTEXT.md): an item piece priced as its whole item's GE price ÷ divisor, e.g.
// Bludgeon axon = Abyssal bludgeon ÷ 3. Item names are matched case-insensitively.
export const pieceValues = sqliteTable('piece_values', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  pieceItemName: text('piece_item_name').notNull().unique(),
  wholeItemName: text('whole_item_name').notNull(),
  // How many of the whole item the piece is valued from, before other pieces come off: Dizana's quiver is 4000×
  // Sunfire splinters. Usually 1.
  wholeQuantity: integer('whole_quantity').notNull().default(1),
  divisor: integer('divisor').notNull(),
  // Null for the starter Piece values a migration added (0025), which no one person created.
  createdByUserId: text('created_by_user_id').references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// A Piece value's Other pieces (CONTEXT.md): the other items in its whole item, subtracted (× quantity) from the
// whole item's price before it's divided, e.g. Ultor vestige = (Ultor ring − Berserker ring − 3× Chromium ingot) ÷ 1.
export const pieceValueOtherPieces = sqliteTable('piece_value_other_pieces', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  pieceValueId: text('piece_value_id').notNull().references(() => pieceValues.id, { onDelete: 'cascade' }),
  itemName: text('item_name').notNull(),
  quantity: integer('quantity').notNull(),
}, (t) => [
  uniqueIndex('piece_value_other_pieces_value_item_unq').on(t.pieceValueId, t.itemName),
]);

// Item names an Admin chose to leave without a GP value (pets and the like), hidden from the Piece values page's
// list of unvalued items.
export const unvaluedItemDismissals = sqliteTable('unvalued_item_dismissals', {
  itemName: text('item_name').primaryKey(),
  dismissedByUserId: text('dismissed_by_user_id').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
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

// ---------------------------------------------------------------------------
// ACHIEVEMENTS (CONTEXT.md "Achievement"): a just-for-fun layer, never read by
// scoring/board/review code. See server/src/services/achievementService.ts.
// ---------------------------------------------------------------------------

// Per (bingo, achievement key): whether it's currently switched on, and when it was FIRST switched on for this
// bingo — never moves once set, so switching off and back on doesn't reset counting. No row for a key in a bingo
// means that Achievement has never been switched on there, and it is never earned (achievementService.tryEarn).
export const bingoAchievementSettings = sqliteTable('bingo_achievement_settings', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bingoId: text('bingo_id').notNull().references(() => bingos.id),
  // An AchievementKey (shared/src/achievements.ts) — plain text, not an enum column, so a key added to the
  // catalogue later needs no migration.
  achievementKey: text('achievement_key').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  firstSwitchedOnAt: integer('first_switched_on_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  uniqueIndex('bingo_achievement_settings_bingo_key_unq').on(t.bingoId, t.achievementKey),
]);

// One row per player action Achievements care about. Written only while the bingo is Live and only for an
// eligible player (a Team member acting on their own Team's concern), whether or not any Achievement is currently
// switched on — so a later switch-on can count activity that happened while it was off, back to the moment it was
// FIRST switched on. `subjectId`/`tileId`/`creditedUserId` are populated per `kind` (see achievementService.ts):
//   posted          — subjectId: submission id, tileId: the tile, creditedUserId: who the drop belongs to
//   reacted         — subjectId: submission id, creditedUserId: who the submission belongs to
//   interest_marked — subjectId: the Part (task) id, tileId: the tile
//   tile_opened     — subjectId: the tile id, tileId: the same tile id
//   rules_opened / stats_opened — subjectId: a constant ("rules"/"stats"); there's only one per bingo
// Upserted on (bingoId, userId, kind, subjectId): page opens are de-duplicated this way, keeping the latest time
// (all that Drop detective/Rules lawyer/Number cruncher need); other kinds just avoid a duplicate row for a
// resubmitted request.
export const achievementActivity = sqliteTable('achievement_activity', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bingoId: text('bingo_id').notNull().references(() => bingos.id),
  userId: text('user_id').notNull().references(() => users.id),
  kind: text('kind', { enum: ['posted', 'reacted', 'interest_marked', 'tile_opened', 'rules_opened', 'stats_opened'] }).notNull(),
  subjectId: text('subject_id').notNull(),
  tileId: text('tile_id'),
  creditedUserId: text('credited_user_id'),
  teamId: text('team_id').notNull().references(() => teams.id),
  // Device-local (CONTEXT.md "Achievement" > time of day), from the request's X-Client-Timezone header.
  localDate: text('local_date').notNull(), // YYYY-MM-DD
  localHour: integer('local_hour').notNull(), // 0-23
  occurredAt: integer('occurred_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  uniqueIndex('achievement_activity_bingo_user_kind_subject_unq').on(t.bingoId, t.userId, t.kind, t.subjectId),
  index('achievement_activity_bingo_user_kind_idx').on(t.bingoId, t.userId, t.kind),
]);

// One row per (bingo, player, achievement) ever earned. Never deleted or updated except popupShownAt — earning is
// never re-evaluated once a row exists (CONTEXT.md "never revisited"): not by a rejection, an un-react, a change of
// credited player, a re-price, or an Achievement being switched off and on again.
export const achievementEarned = sqliteTable('achievement_earned', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bingoId: text('bingo_id').notNull().references(() => bingos.id),
  userId: text('user_id').notNull().references(() => users.id),
  achievementKey: text('achievement_key').notNull(),
  earnedAt: integer('earned_at', { mode: 'timestamp' }).notNull(),
  // Empty until the player's device reports the unlock popup played (POST mark popups shown).
  popupShownAt: integer('popup_shown_at', { mode: 'timestamp' }),
}, (t) => [
  uniqueIndex('achievement_earned_bingo_user_key_unq').on(t.bingoId, t.userId, t.achievementKey),
]);
