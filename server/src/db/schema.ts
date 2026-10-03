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
  // When the account finished or skipped the Tutorial (CONTEXT.md); null until then. Per account, so it's seen on
  // every device; replaying it from the ☰ menu never changes it.
  tutorialSeenAt: integer('tutorial_seen_at', { mode: 'timestamp' }),
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

// The admin MCP server's OAuth authorization server (server/src/mcp, docs in #289/#290). Claude's apps register
// themselves here (Dynamic Client Registration), an Admin approves one, and it gets tokens for /mcp.

// A registered app. `client_secret` is kept as issued because the SDK's token endpoint compares it directly; public
// clients (Claude Code) have none. Registrations nobody finishes signing in with are pruned (oauthProvider.ts).
export const oauthClients = sqliteTable('oauth_clients', {
  clientId: text('client_id').primaryKey(),
  clientSecret: text('client_secret'),
  // The registration as the app sent it plus what we issued (RFC 7591 client information), as JSON.
  metadataJson: text('metadata_json').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// An authorization code between an Admin's approval and the app's token request: single-use, 10 minutes, hash only.
export const oauthCodes = sqliteTable('oauth_codes', {
  codeHash: text('code_hash').primaryKey(),
  clientId: text('client_id').notNull().references(() => oauthClients.clientId, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  codeChallenge: text('code_challenge').notNull(),
  redirectUri: text('redirect_uri').notNull(),
  resource: text('resource').notNull(),
  scope: text('scope').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [index('oauth_codes_client_idx').on(t.clientId)]);

// One connection: an Admin's approval of one app. Its access token (1 hour) and refresh token are replaced together on
// every refresh, so only hashes of the current pair are kept; the connection lapses 30 days after it was last used.
export const oauthTokens = sqliteTable('oauth_tokens', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  accessTokenHash: text('access_token_hash').notNull().unique(),
  refreshTokenHash: text('refresh_token_hash').notNull().unique(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  clientId: text('client_id').notNull().references(() => oauthClients.clientId, { onDelete: 'cascade' }),
  scope: text('scope').notNull(),
  resource: text('resource').notNull(),
  accessExpiresAt: integer('access_expires_at', { mode: 'timestamp' }).notNull(),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp' }).notNull(),
  revokedAt: integer('revoked_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [index('oauth_tokens_user_idx').on(t.userId), index('oauth_tokens_client_idx').on(t.clientId)]);

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
  // When the one bulk "update all participants" request was sent to the competition, at start + 6h
  // (womCompetitionService.sendDueWomBulkUpdates): set once, so a restart neither repeats nor skips it.
  womBulkUpdateSentAt: integer('wom_bulk_update_sent_at', { mode: 'timestamp' }),
  // Set by Site Admin Start draft. Writing draftOrder is not starting —
  // captains cannot pick until this is true and the shuffle reveal lock
  // (draftOrderLockedUntil) has expired.
  draftStarted: integer('draft_started', { mode: 'boolean' }).notNull().default(false),
  draftOrderLockedUntil: integer('draft_order_locked_until', { mode: 'timestamp' }),
  // Set by a Cut review apply (CONTEXT.md "Cut review") to a hash of the draft pool's unit composition, Team count
  // and cutMode at that moment — see cutReviewService.ts. Moving into the Draft stage while any cut is Avoidable
  // compares this against the current hash: a mismatch means the roster changed since, so the review is stale.
  cutReviewFingerprint: text('cut_review_fingerprint'),
  createdByUserId: text('created_by_user_id').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  // Achievements master switch (CONTEXT.md "Achievement"): off hides every Achievement from reads, counts and
  // popups, but earning keeps happening in the background — see achievementService.ts and bingoAchievementSettings.
  achievementsEnabled: integer('achievements_enabled', { mode: 'boolean' }).notNull().default(true),
  // Sealed Tiles (CONTEXT.md): during Board revealed, Players and Captains see each Tile's art, name and Category
  // only and can't open it. No effect in any other stage. See bingoService.areTilesSealed.
  sealedTiles: integer('sealed_tiles', { mode: 'boolean' }).notNull().default(false),
  // During Board revealed, the rules text is held back from Players and Captains. Independent of sealedTiles.
  // See bingoService.areRulesHidden.
  hideRules: integer('hide_rules', { mode: 'boolean' }).notNull().default(false),
  // "Show screenshots once Finished" (CONTEXT.md "Player"): once the bingo is Finished every clan member can read
  // every team's submissions; off, other teams' screenshot images are left out for anyone but Moderators. Admins only.
  showScreenshotsWhenFinished: integer('show_screenshots_when_finished', { mode: 'boolean' }).notNull().default(true),
  // "Publish Wrapped when the Bingo finishes" (CONTEXT.md "Wrapped"): moving to Finished publishes it on its own.
  publishWrappedOnFinish: integer('publish_wrapped_on_finish', { mode: 'boolean' }).notNull().default(false),
  // Replaced by per-image credits on wrapped_art and wrappedArtCreditsJson (#281; migration 0048 moved its entries onto
  // the Outro's art). Kept only so the column can be dropped in a later deploy, per the additive-migration rule in
  // docs/zero-downtime-deploy-plan.md. Nothing reads or writes it.
  wrappedCreditsJson: text('wrapped_credits_json').notNull().default('[]'),
  // Credits (CONTEXT.md): each Wrapped art category's additional credits (ones with no image), a JSON object of
  // WrappedCredit arrays keyed by section. Parsed by wrappedArtService.parseAdditionalCredits.
  wrappedArtCreditsJson: text('wrapped_art_credits_json').notNull().default('{}'),
  // Historical Bingo (CONTEXT.md, docs/historical-bingos-plan.md): a past Bingo run on another website, imported so its
  // history lives here. Always Finished and read-only (requireBingo refuses every write to it); what it never recorded
  // shows as not recorded (historicalService.getRecorded). Set only by the historical importer.
  historical: integer('historical', { mode: 'boolean' }).notNull().default(false),
  // Discord team sync (discordTeamService.ts): when on, every Team gets a Discord role (its name, color and members)
  // and its own channels, under a category named after the Bingo (or discordCategoryName), from the moment the Draft
  // finishes. Needs DISCORD_BOT_TOKEN and DISCORD_GUILD_ID on the server. What it made is tracked in discord_resources.
  discordEnabled: integer('discord_enabled', { mode: 'boolean' }).notNull().default(false),
  discordCategoryName: text('discord_category_name'),
  // An existing category in the Discord server to put every Team's channels in, instead of one the sync makes (and
  // names discordCategoryName). The sync never edits or deletes it.
  discordCategoryId: text('discord_category_id'),
  // Dev servers only (isDevModeActive): another Discord server to sync to instead of DISCORD_GUILD_ID, for trying it
  // out on a test server. Ignored elsewhere. Can't change while anything made in the old one is left.
  discordGuildId: text('discord_guild_id'),
  // The channels every Team gets: a JSON array of DiscordChannelTemplate (shared/src/discord.ts), parsed by
  // bingoService.parseDiscordChannels and exposed as `discordChannels`. Starts as a text and a voice channel.
  discordChannelsJson: text('discord_channels_json').notNull().default('[{"key":"chat","type":"text","name":"{team}"},{"key":"voice","type":"voice","name":"{team}"}]'),
  // Last sync failure, surfaced in the settings panel; cleared by the next successful sync.
  discordSyncError: text('discord_sync_error'),
  discordSyncedAt: integer('discord_synced_at', { mode: 'timestamp' }),
});

// A Historical Bingo's final standings, as the old site or the maintainers recorded them: one row per Team, its place
// and its points when they're known. A Bingo run here has none (its standings come from scoring).
export const historicalStandings = sqliteTable('historical_standings', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bingoId: text('bingo_id').notNull().references(() => bingos.id),
  teamId: text('team_id').notNull().references(() => teams.id),
  place: integer('place').notNull(),
  points: integer('points'),
}, (t) => [
  uniqueIndex('historical_standings_team_unq').on(t.teamId),
  index('historical_standings_bingo_idx').on(t.bingoId),
]);

// Mod is per-bingo, not a global flag — fixes v1's single global isModerator.
export const bingoModerators = sqliteTable('bingo_moderators', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bingoId: text('bingo_id').notNull().references(() => bingos.id),
  userId: text('user_id').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  uniqueIndex('bingo_moderators_bingo_user_unq').on(t.bingoId, t.userId),
]);

// A Bingo's Staff (CONTEXT.md "Staff"): clan leadership who collect its Buy-ins. Granted per Bingo by Admins, like
// its Moderators.
export const bingoStaff = sqliteTable('bingo_staff', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bingoId: text('bingo_id').notNull().references(() => bingos.id),
  userId: text('user_id').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  uniqueIndex('bingo_staff_bingo_user_unq').on(t.bingoId, t.userId),
]);

// One Action (or a wildcard of them) taken from one user in one Bingo, with a reason (CONTEXT.md "Restriction";
// @bingo/shared RESTRICTABLE_ACTIONS). Lasts until lifted, which deletes the row: the audit log keeps the history.
export const bingoRestrictions = sqliteTable('bingo_restrictions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bingoId: text('bingo_id').notNull().references(() => bingos.id),
  userId: text('user_id').notNull().references(() => users.id),
  action: text('action').notNull(),
  reason: text('reason').notNull(),
  appliedByUserId: text('applied_by_user_id').references(() => users.id),
  appliedAt: integer('applied_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  uniqueIndex('bingo_restrictions_bingo_user_action_unq').on(t.bingoId, t.userId, t.action),
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
  actorRole: text('actor_role', { enum: ['admin', 'mod', 'staff', 'player', 'system'] }).notNull(),
  actorUserId: text('actor_user_id').references(() => users.id),
  onBehalfOfUserId: text('on_behalf_of_user_id').references(() => users.id),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  entityLabel: text('entity_label'),
  teamId: text('team_id'),
  details: text('details').notNull().default('{}'),
  // Lower-cased text the row shows (title, rendered sentence, Team), for the log's search. Null until filled: audit()
  // fills it on write, fillAuditSearchText backfills older rows on startup (and refills any cleared after a rewording).
  searchText: text('search_text'),
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

// Admin-authored questions, per bingo, on one of its two forms: the signup form, or the Feedback form of a Finished
// Bingo (CONTEXT.md "Feedback form"). Both are built from the same settings, so they share this table and its builder.
export const signupQuestions = sqliteTable('signup_questions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bingoId: text('bingo_id').notNull().references(() => bingos.id),
  // Which form it's on. `visibility` is signup-only and `audience` feedback-only (the other keeps its default).
  form: text('form', { enum: ['signup', 'feedback'] }).notNull().default('signup'),
  // Feedback questions only: who answers it. 'captains' is a Captain's separate Captain response.
  audience: text('audience', { enum: ['all', 'captains'] }).notNull().default('all'),
  prompt: text('prompt').notNull(),
  // Optional plain-text note shown under the question on the signup form.
  helperText: text('helper_text'),
  type: text('type', { enum: ['text', 'textarea', 'select', 'multiselect', 'boolean', 'member'] }).notNull(), // select = one choice, multiselect = several, member = Member pick
  optionsJson: text('options_json'), // JSON string array; only for type = 'select' or 'multiselect'
  // Choice questions only: an extra Other choice with the player's own text (see shared/src/signupAnswers.ts).
  allowOther: integer('allow_other', { mode: 'boolean' }).notNull().default(false),
  // Member pick only: several members may be picked (else one), and with several the most that may be (null: no limit).
  multiplePicks: integer('multiple_picks', { mode: 'boolean' }).notNull().default(false),
  maxPicks: integer('max_picks'),
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

// A Finished Bingo's Feedback form answers (CONTEXT.md "Feedback response", docs/adr/0002-anonymous-feedback.md).
// Anonymous to everyone, the database's readers included: a response stores no user id, no timestamp, and nothing that
// links a Player's Feedback response to their Captain response. Its Player finds it again by `respondentKey`, an HMAC
// of (user id, Bingo id, kind) made with FEEDBACK_SECRET (services/feedbackService.ts). Both tables are WITHOUT ROWID
// (the migration), so rows sit in primary-key (random id) order and their storage order says nothing of when they came.
export const feedbackResponses = sqliteTable('feedback_responses', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bingoId: text('bingo_id').notNull().references(() => bingos.id),
  // 'player': the Feedback response (the All Players questions). 'captain': a Captain's Captain response.
  kind: text('kind', { enum: ['player', 'captain'] }).notNull(),
  respondentKey: text('respondent_key').notNull(),
  // Which FEEDBACK_SECRET keyed this response: an HMAC of a fixed label with it, the same for every response keyed with the
  // same secret, so it says nothing of whose a response is. A Bingo whose responses carry another value is refused new
  // answers rather than given a second response from every Player who already answered (services/feedbackService.ts).
  keyCheck: text('key_check').notNull(),
}, (t) => [
  uniqueIndex('feedback_responses_respondent_key_unq').on(t.respondentKey),
  index('feedback_responses_bingo_idx').on(t.bingoId, t.kind),
]);

export const feedbackAnswers = sqliteTable('feedback_answers', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  responseId: text('response_id').notNull().references(() => feedbackResponses.id),
  questionId: text('question_id').notNull().references(() => signupQuestions.id),
  value: text('value').notNull(), // the signup answer format (shared/src/signupAnswers.ts); booleans as "true"/"false"
}, (t) => [
  uniqueIndex('feedback_answers_response_question_unq').on(t.responseId, t.questionId),
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

// What the Discord team sync (discordTeamService.ts) made in the guild: one row per Discord object, so it can be updated
// or deleted later. No foreign keys on purpose: a row outlives its Team or Bingo being deleted, so the sync can still
// delete the role and channels left behind. `applied_json` is what was last sent (name, color, permissions, and for a
// role its members), compared with what's wanted so only real changes reach Discord: it allows a channel only two
// renames per 10 minutes.
export const discordResources = sqliteTable('discord_resources', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bingoId: text('bingo_id').notNull(),
  // The Discord server it was made in, so it's always edited and deleted there.
  guildId: text('guild_id').notNull(),
  // Null for the Bingo's category.
  teamId: text('team_id'),
  kind: text('kind', { enum: ['category', 'role', 'text_channel', 'voice_channel'] }).notNull(),
  // A channel's entry in bingos.discord_channels_json (its `key`); null for the category and a role.
  channelKey: text('channel_key'),
  discordId: text('discord_id').notNull(),
  appliedJson: text('applied_json').notNull().default('{}'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  index('discord_resources_bingo_idx').on(t.bingoId),
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

// Superlative (CONTEXT.md): a per-Bingo award category, admin-managed, e.g. "Team MVP". Not locked to any stage — can
// be added, renamed, reordered or deleted any time, including during Live with votes cast (a rename keeps its votes,
// a delete drops them). No default list.
export const superlativeCategories = sqliteTable('superlative_categories', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bingoId: text('bingo_id').notNull().references(() => bingos.id),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

// One Player's pick for one category: teamId is redundant with a join through teamMembers, kept here so a vote can
// still be tallied and dropped by Team even after the voter (or the nominee) leaves it. Votes are secret — nobody,
// Moderators and Admins included, ever reads who voted for whom; the server keeps the voter only to enforce one vote
// per category and let it change. Unique per (categoryId, voterUserId): one pick each, updated in place to change it.
export const superlativeVotes = sqliteTable('superlative_votes', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  categoryId: text('category_id').notNull().references(() => superlativeCategories.id),
  teamId: text('team_id').notNull().references(() => teams.id),
  voterUserId: text('voter_user_id').notNull().references(() => users.id),
  nomineeUserId: text('nominee_user_id').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  uniqueIndex('superlative_votes_category_voter_unq').on(t.categoryId, t.voterUserId),
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
  // ITEM only (CONTEXT.md "Counts as"): inside a SUM, a claim of quantity q on this leaf adds q × countsAs to the
  // SUM's total, e.g. a Pyromancer garb counting as 25 burnt pages. Whole, from 1; 1 on every other kind.
  countsAs: integer('counts_as').notNull().default(1),
  // Self-references. Plain text, no FK constraint declared (Drizzle can't
  // express a same-table FK cleanly and SQLite won't enforce it across a
  // deferred insert order anyway) — validity (same bingo, not a descendant)
  // is enforced in graphService, same convention as the old
  // requirementNodes.parentId.
  pointsGateNodeId: text('points_gate_node_id'), // this node's points stay 0 until the gate node completes too
  submitGateNodeId: text('submit_gate_node_id'), // submissions targeting a leaf under this node are rejected until the gate node completes
  allowsPreLoad: integer('allows_pre_load', { mode: 'boolean' }).notNull().default(false), // display hint (CONTEXT.md "Pre-load")
  // ITEM only, optional (CONTEXT.md "Valued as"): claims on this leaf get their Drop value from this item ÷ divisor
  // instead of their own item's price, e.g. a DT2 page's Gold ring valued as Magus vestige ÷ 3. Both set or both null.
  valuedAsItemName: text('valued_as_item_name'),
  valuedAsDivisor: integer('valued_as_divisor'),
  // Optional, with Valued as: where these claims come from ("Vardorvis"), shown next to the item so players see why
  // an ordinary-looking item has a value.
  valuedAsSource: text('valued_as_source'),
  // A Task (a tile node's direct child) that needs a Proof screenshot (CONTEXT.md) from each Player before their drops
  // on it count. Never set on a Task whose Tile requires one Tile-wide (tiles.requiresProof). The note says what to show.
  requiresProof: integer('requires_proof', { mode: 'boolean' }).notNull().default(false),
  proofNote: text('proof_note'),
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
  // A Proof screenshot (CONTEXT.md) required Tile-wide: each Player needs an approved one before their drops on the Tile
  // count. When set, no Task of the Tile has its own (nodes.requiresProof). The note says what to show.
  requiresProof: integer('requires_proof', { mode: 'boolean' }).notNull().default(false),
  proofNote: text('proof_note'),
  // A Historical Bingo's (CONTEXT.md) own rules for this Tile, as the old site gave them: plain text shown in the Tile's
  // dialog. Null on every Bingo run here, whose Tiles say what they take through their Tasks.
  rulesText: text('rules_text'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  uniqueIndex('tiles_bingo_position_unq').on(t.bingoId, t.boardRow, t.boardCol),
  uniqueIndex('tiles_node_unq').on(t.nodeId),
]);

// Tags (CONTEXT.md "Tag"): words the board's search finds a Tile by, never shown to Players. A tag is on a Tile
// (tileId) or on one of its Parts (nodeId, a tile node's direct child), never both. Its own table rather than columns
// on tiles/nodes, so nothing that serialises a Tile or a node to Players can carry them by accident: only the board
// editor, the search endpoint (which answers with Tile ids) and the export read it.
export const tags = sqliteTable('tags', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bingoId: text('bingo_id').notNull().references(() => bingos.id),
  tileId: text('tile_id').references(() => tiles.id),
  nodeId: text('node_id').references(() => nodes.id),
  // A Text tag is any text; a Boss tag's text is the boss's OSRS Wiki page title.
  kind: text('kind', { enum: ['text', 'boss'] }).notNull(),
  text: text('text').notNull(),
  // A Text tag a Boss tag added (one of the wiki's names for the boss): that Boss tag, removed along with it. Same
  // table, so plain text with no FK declared, like nodes' self-references.
  bossTagId: text('boss_tag_id'),
  // The order the tags were added in, per Tile or Part.
  sortOrder: integer('sort_order').notNull().default(0),
}, (t) => [
  index('tags_bingo_idx').on(t.bingoId),
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
  // CONTEXT.md "Submission" kinds: a drop (with its Claims) or a Proof screenshot (no Claims, no points). Anything
  // counting drops filters to `drop` through submissionKinds.ts.
  kind: text('kind', { enum: ['drop', 'proof'] }).notNull().default('drop'),
  // A proof only: the Tile it's for, and the Task when the requirement is per-Task (null when it's Tile-wide).
  proofTileId: text('proof_tile_id').references(() => tiles.id),
  proofTaskId: text('proof_task_id').references(() => nodes.id),
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

// One submission can have multiple screenshots (main, bank, etc.; a Proof
// screenshot's is `proof`). The scrape_* fields are populated by the AI screenshot-analysis job.
export const submissionScreenshots = sqliteTable('submission_screenshots', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  submissionId: text('submission_id').notNull().references(() => submissions.id),
  screenshotType: text('screenshot_type', {
    enum: ['main', 'proof', 'bank', 'collection_log', 'other'],
  }).notNull().default('main'),
  // Empty while a Historical Bingo's (CONTEXT.md) screenshot is still to be uploaded (see historicalKey).
  storageUrl: text('storage_url').notNull(),
  // A Historical Bingo's only: the screenshot's key in its import bundle, which the upload that attaches the file names.
  historicalKey: text('historical_key'),
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
  // What the drop was worth in GP when submitted (CONTEXT.md "Drop value"): unit price × quantity. Null for MANUAL
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

// Item names an Admin chose to leave without a Drop value (pets and the like), hidden from the Piece values page's
// list of unvalued items.
export const unvaluedItemDismissals = sqliteTable('unvalued_item_dismissals', {
  itemName: text('item_name').primaryKey(),
  dismissedByUserId: text('dismissed_by_user_id').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// Site-wide settings a Site admin changes from the Site admin page, one JSON value per key. "titles" holds the
// Title settings (shared/titles.ts TitleSettings): only what differs from the defaults, so new defaults still apply.
export const siteSettings = sqliteTable('site_settings', {
  key: text('key').primaryKey(),
  valueJson: text('value_json').notNull(),
  updatedByUserId: text('updated_by_user_id').notNull().references(() => users.id),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// A Finished Bingo's own copy of the Title settings (#221, CONTEXT.md "Title"), taken when it moved to Finished so
// later Site admin changes and new Titles don't reach it. settingsJson is the fully resolved TitleSettings (every
// minimum and luck weight, defaults included); titleIdsJson is every Title id that existed then. Replaced on every
// move into Finished, deleted on any move out of it. See titleSettingsService.
export const bingoTitleSettings = sqliteTable('bingo_title_settings', {
  bingoId: text('bingo_id').primaryKey().references(() => bingos.id),
  settingsJson: text('settings_json').notNull(),
  titleIdsJson: text('title_ids_json').notNull(),
  frozenAt: integer('frozen_at', { mode: 'timestamp' }).notNull(),
});

// Wrapped (CONTEXT.md): a Finished Bingo's published Wrapped. A row here means it's published; publishing again
// replaces it. dataJson is the Bingo-wide part (shared BingoWrapped), computed once when published and only read
// after that, so a flood of viewers costs a lookup each (wrappedService.ts).
export const bingoWrapped = sqliteTable('bingo_wrapped', {
  bingoId: text('bingo_id').primaryKey().references(() => bingos.id),
  publishedAt: integer('published_at', { mode: 'timestamp' }).notNull(),
  publishedByUserId: text('published_by_user_id').references(() => users.id),
  dataJson: text('data_json').notNull(),
});

// Each Player's Wrapped (shared PlayerWrapped), stored with the Bingo's when it's published.
export const playerWrapped = sqliteTable('player_wrapped', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bingoId: text('bingo_id').notNull().references(() => bingos.id),
  userId: text('user_id').notNull().references(() => users.id),
  dataJson: text('data_json').notNull(),
}, (t) => [
  uniqueIndex('player_wrapped_bingo_user_unq').on(t.bingoId, t.userId),
]);

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
//   yama_opened     — subjectId: a fresh id per opening of the Yama Tile (Yammma counts them), tileId: that tile
//   rules_opened / stats_opened — subjectId: a constant ("rules"/"stats"); there's only one per bingo
// Upserted on (bingoId, userId, kind, subjectId): page opens are de-duplicated this way, keeping the latest time
// (all that Drop detective/Rules lawyer/Number cruncher need); other kinds just avoid a duplicate row for a
// resubmitted request.
export const achievementActivity = sqliteTable('achievement_activity', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bingoId: text('bingo_id').notNull().references(() => bingos.id),
  userId: text('user_id').notNull().references(() => users.id),
  kind: text('kind', { enum: ['posted', 'reacted', 'interest_marked', 'tile_opened', 'yama_opened', 'rules_opened', 'stats_opened'] }).notNull(),
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

// Wrapped art (#262): decorative cut-outs drawn as stickers on torn paper, in groups (shared WRAPPED_ART_GROUPS): a
// section's Category images, the "side" pool, or the "playerCard" art (#396). `section` is the group; sortOrder
// orders a group's images. originalUrl is the upload as it was (so it can be re-cut later with other keying settings,
// without a new screenshot); frame1Url/frame2Url are the two rendered "boil" frames. keyTolerance/keySoftness are how
// a solid-background screenshot was keyed, null for an upload that was already transparent. A new Bingo starts with
// copies of the previous Bingo's rows, pointing at the same files, so files are never deleted along with a row.
export const wrappedArt = sqliteTable('wrapped_art', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bingoId: text('bingo_id').notNull().references(() => bingos.id),
  section: text('section').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  originalUrl: text('original_url').notNull(),
  frame1Url: text('frame1_url').notNull(),
  frame2Url: text('frame2_url').notNull(),
  keyColor: text('key_color'),
  keyTolerance: integer('key_tolerance'),
  keySoftness: integer('key_softness'),
  // Credits (CONTEXT.md, #281): who this image credits, captioned on it. Null name: no credit (role is then null too).
  creditName: text('credit_name'),
  creditRole: text('credit_role'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  index('wrapped_art_bingo_section_idx').on(t.bingoId, t.section),
]);
