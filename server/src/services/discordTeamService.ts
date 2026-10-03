// Discord team sync: when an Admin turns it on in a Bingo's settings (bingos.discordEnabled), every Team gets, in the
// clan's Discord server (DISCORD_GUILD_ID):
//   - a role named after the Team, in the Team's color, given to each of its Players;
//   - the channels the Bingo's admins listed in Settings > Discord (bingos.discordChannelsJson, by default one text and
//     one voice channel, named after the Team), which only that role and the bot can see;
// all in one category: one the sync makes for the Bingo (named after it, or bingos.discordCategoryName), or an existing
// one the admins picked (bingos.discordCategoryId), which it never edits or deletes. They're made as
// the Draft finishes, when the Wise Old Man competition is, and kept up to date from then on: a Team renamed or
// recolored, a Player removed or signed up late, a Team added or deleted, the channel list edited. Nothing is deleted
// when the Bingo is Finished; an Admin removes them from the settings panel (removeDiscordTeams) when done with them.
//
// The bot talks to Discord over REST only (no gateway connection): it needs DISCORD_BOT_TOKEN, and in the server the
// Manage Roles and Manage Channels permissions plus every permission it hands out to the Teams (docs/discord-team-sync.md).
//
// Same conventions as womCompetitionService: the route layer calls syncDiscordTeams fire-and-forget after anything
// that may change a Team; it never throws, and a failure is kept on bingos.discordSyncError for the settings panel.
// Every sync compares what the Bingo wants with what it last sent (discord_resources.applied_json) and only sends the
// difference, so a late signup costs one role assignment, not a rename of every channel (Discord allows a channel two
// renames per 10 minutes).
import { DiscordAPIError, RateLimitError, REST, type RateLimitData } from "@discordjs/rest";
import { ChannelType, OverwriteType, PermissionFlagsBits, Routes } from "discord-api-types/v10";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { discordCategoryName, discordChannelName, discordRoleName, type DiscordChannelTemplate, type DiscordSyncStatus } from "@bingo/shared";
import { parseDiscordChannels } from "./bingoService";
import * as schema from "../db/schema";
import { bingos, discordResources, teamMembers, teams, users } from "../db/schema";
import { audit } from "../audit/record";
import { skipsIntegrations } from "../audit/context";
import { now as clockNow } from "../clock";
import { log } from "../log";
import { TESTDATA_PREFIX } from "./devTestDataService";
import { isDevModeActive } from "../devMode";

type Db = BetterSQLite3Database<typeof schema>;
type Bingo = typeof bingos.$inferSelect;
type ResourceRow = typeof discordResources.$inferSelect;
type ResourceKind = ResourceRow["kind"];

// ---------------------------------------------------------------------------
// The Discord API, as far as the sync needs it
// ---------------------------------------------------------------------------

export interface PermissionOverwrite {
  id: string;
  type: OverwriteType;
  allow: string;
  deny: string;
}

export interface RoleBody {
  name: string;
  color: number;
  mentionable: boolean;
}

export interface ChannelBody {
  name: string;
  type: ChannelType.GuildCategory | ChannelType.GuildText | ChannelType.GuildVoice;
  parent_id?: string | null;
  position?: number;
  permission_overwrites: PermissionOverwrite[];
}

/** Discord answered with an error. `code` is Discord's JSON error code (https://discord.com/developers/docs/topics/opcodes-and-status-codes#json). */
export class DiscordSyncApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly code: number | string | null,
    /** Set when Discord's rate limit would hold the request this long: the sync stops and tries again after it. */
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = "DiscordSyncApiError";
  }
}

const LONG_RATE_LIMIT_MS = 30_000;

/** How long a rate limit holds a request: a sublimit (a channel's renames) is in retryAfter, not the bucket's reset. */
function rateLimitWait(limit: Pick<RateLimitData, "timeToReset" | "retryAfter" | "sublimitTimeout">): number {
  return Math.max(limit.timeToReset, limit.retryAfter, limit.sublimitTimeout);
}
const UNKNOWN_CHANNEL = 10003;
const UNKNOWN_MEMBER = 10007;
const UNKNOWN_ROLE = 10011;
const UNKNOWN_USER = 10013;
const MISSING_PERMISSIONS = 50013;

/** The role or channel is gone (deleted by hand in Discord): it has to be made again. */
function isUnknownResource(err: unknown): boolean {
  return err instanceof DiscordSyncApiError && (err.code === UNKNOWN_CHANNEL || err.code === UNKNOWN_ROLE || err.status === 404);
}

/** The Player isn't in the server (left, or never joined): nothing to give a role to. */
function isUnknownMember(err: unknown): boolean {
  return err instanceof DiscordSyncApiError && (err.code === UNKNOWN_MEMBER || err.code === UNKNOWN_USER);
}

export interface GuildChannelInfo {
  id: string;
  type: number;
  parent_id?: string | null;
  position: number;
}

/** Everything the sync does in the guild. The real one is RestDiscordGuildApi; tests use a fake guild. */
export interface DiscordGuildApi {
  readonly guildId: string;
  botUserId(): Promise<string>;
  createRole(body: RoleBody, reason: string): Promise<string>;
  editRole(roleId: string, body: RoleBody, reason: string): Promise<void>;
  deleteRole(roleId: string, reason: string): Promise<void>;
  addMemberRole(discordUserId: string, roleId: string, reason: string): Promise<void>;
  removeMemberRole(discordUserId: string, roleId: string, reason: string): Promise<void>;
  createChannel(body: ChannelBody, reason: string): Promise<string>;
  editChannel(channelId: string, body: ChannelBody, reason: string): Promise<void>;
  deleteChannel(channelId: string, reason: string): Promise<void>;
  /** Every channel in the server: to check an existing category and place the Teams' channels after what's in it. */
  listChannels(): Promise<GuildChannelInfo[]>;
}

/** Discord's REST API with the bot's token. @discordjs/rest queues requests to stay inside Discord's rate limits. */
export class RestDiscordGuildApi implements DiscordGuildApi {
  private rest: REST;
  private botId: string | null = null;

  constructor(
    token: string,
    readonly guildId: string,
    /** Tests point it at a local server. */
    apiBaseUrl?: string,
  ) {
    // A short rate limit is waited out; a long one (a channel renamed a third time within 10 minutes) fails the request
    // instead of holding the sync, and every change queued behind it, for minutes. The sync retries after it.
    this.rest = new REST({ version: "10", retries: 1, rejectOnRateLimit: (limit) => rateLimitWait(limit) > LONG_RATE_LIMIT_MS, ...(apiBaseUrl ? { api: apiBaseUrl } : {}) }).setToken(token);
  }

  async botUserId(): Promise<string> {
    if (!this.botId) this.botId = ((await this.call(() => this.rest.get(Routes.user("@me")))) as { id: string }).id;
    return this.botId;
  }

  async createRole(body: RoleBody, reason: string): Promise<string> {
    return ((await this.call(() => this.rest.post(Routes.guildRoles(this.guildId), { body, reason }))) as { id: string }).id;
  }

  async editRole(roleId: string, body: RoleBody, reason: string): Promise<void> {
    await this.call(() => this.rest.patch(Routes.guildRole(this.guildId, roleId), { body, reason }));
  }

  async deleteRole(roleId: string, reason: string): Promise<void> {
    await this.call(() => this.rest.delete(Routes.guildRole(this.guildId, roleId), { reason }));
  }

  async addMemberRole(discordUserId: string, roleId: string, reason: string): Promise<void> {
    await this.call(() => this.rest.put(Routes.guildMemberRole(this.guildId, discordUserId, roleId), { reason }));
  }

  async removeMemberRole(discordUserId: string, roleId: string, reason: string): Promise<void> {
    await this.call(() => this.rest.delete(Routes.guildMemberRole(this.guildId, discordUserId, roleId), { reason }));
  }

  async createChannel(body: ChannelBody, reason: string): Promise<string> {
    return ((await this.call(() => this.rest.post(Routes.guildChannels(this.guildId), { body, reason }))) as { id: string }).id;
  }

  async editChannel(channelId: string, body: ChannelBody, reason: string): Promise<void> {
    // A channel's type can't be changed; Discord rejects the field on an edit.
    const { type: _type, ...edit } = body;
    await this.call(() => this.rest.patch(Routes.channel(channelId), { body: edit, reason }));
  }

  async listChannels(): Promise<GuildChannelInfo[]> {
    return (await this.call(() => this.rest.get(Routes.guildChannels(this.guildId)))) as GuildChannelInfo[];
  }

  async deleteChannel(channelId: string, reason: string): Promise<void> {
    await this.call(() => this.rest.delete(Routes.channel(channelId), { reason }));
  }

  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof RateLimitError) {
        const wait = rateLimitWait(err);
        throw new DiscordSyncApiError(`Discord's rate limit holds ${err.method.toUpperCase()} ${err.route} for ${Math.ceil(wait / 1000)}s`, 429, null, wait);
      }
      if (err instanceof DiscordAPIError) throw new DiscordSyncApiError(`Discord: ${err.message} (${err.method.toUpperCase()} ${err.url.replace(/^.*\/api\/v\d+/, "")})`, err.status, err.code);
      throw new DiscordSyncApiError(`Couldn't reach Discord: ${err instanceof Error ? err.message : String(err)}`, null, null);
    }
  }
}

const _apis = new Map<string, RestDiscordGuildApi>();

/** The bot in one Discord server; null without a bot token, when the sync is off everywhere, whatever a Bingo's setting. */
export function getDiscordGuildApi(guildId: string): DiscordGuildApi | null {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return null;
  const key = `${token}:${guildId}`;
  if (!_apis.has(key)) _apis.set(key, new RestDiscordGuildApi(token, guildId));
  return _apis.get(key)!;
}

/**
 * Where a Bingo's roles and channels go: the clan's server (DISCORD_GUILD_ID), or on a dev server the one its admins
 * picked to try the sync on (bingos.discordGuildId).
 */
export function discordGuildIdFor(bingo: Pick<Bingo, "discordGuildId">): string | null {
  return (isDevModeActive() && bingo.discordGuildId) || process.env.DISCORD_GUILD_ID || null;
}

/**
 * Which bot to use. Left out: the real one for the guild. Tests pass a fake guild (used whatever the guild), or a
 * function giving one per guild id.
 */
export type DiscordApiSource = DiscordGuildApi | ((guildId: string) => DiscordGuildApi | null) | null | undefined;

function resolveApi(source: DiscordApiSource, guildId: string | null): DiscordGuildApi | null {
  if (source === null) return null;
  if (source === undefined) return guildId ? getDiscordGuildApi(guildId) : null;
  if (typeof source === "function") return guildId ? source(guildId) : null;
  return source;
}

/**
 * Whether the Bingo syncs to a test Discord server picked on a dev server, not the clan's. Only then may a test data
 * Bingo (the generator's) be synced: its made-up Players and Teams never reach the clan's server.
 */
export function onDiscordTestServer(bingo: Pick<Bingo, "discordGuildId">): boolean {
  return isDevModeActive() && !!bingo.discordGuildId && bingo.discordGuildId !== process.env.DISCORD_GUILD_ID;
}

/** A Discord server other than `guildId` that still holds some of the Bingo's roles and channels, or null. */
function strayGuildId(db: Db, bingoId: string, guildId: string): string | null {
  return db.select({ guildId: discordResources.guildId }).from(discordResources).where(eq(discordResources.bingoId, bingoId)).all().find((r) => r.guildId !== guildId)?.guildId ?? null;
}

// ---------------------------------------------------------------------------
// What a Bingo wants in Discord
// ---------------------------------------------------------------------------

/** "#e74c3c" (or "e74c3c") as Discord's integer color; 0 (no color) for anything else. */
export function roleColor(hex: string | null): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex?.trim() ?? "");
  return m ? parseInt(m[1]!, 16) : 0;
}

const bits = (...flags: bigint[]) => flags.reduce((a, b) => a | b, 0n).toString();

const TEXT_ACCESS = bits(
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AddReactions,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.EmbedLinks,
);
const VOICE_ACCESS = bits(PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.Stream, PermissionFlagsBits.UseVAD);
const VIEW = bits(PermissionFlagsBits.ViewChannel);
// The bot keeps sight of what it made (with @everyone denied it otherwise couldn't edit or delete it). Manage Roles
// (Manage Permissions in a channel) can't be granted by an overwrite unless the bot is an Administrator, so it isn't.
const BOT_ACCESS = bits(PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.Connect);

function overwrites(guildId: string, botId: string, grants: { id: string; allow: string }[]): PermissionOverwrite[] {
  return [
    // The @everyone role's id is the guild's own.
    { id: guildId, type: OverwriteType.Role, allow: "0", deny: VIEW },
    { id: botId, type: OverwriteType.Member, allow: BOT_ACCESS, deny: "0" },
    ...grants.map((g) => ({ id: g.id, type: OverwriteType.Role, allow: g.allow, deny: "0" })),
  ];
}

interface RoleApplied extends RoleBody {
  members: string[];
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function parseApplied<T>(row: ResourceRow): Partial<T> {
  try {
    return JSON.parse(row.appliedJson) as Partial<T>;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// When a Bingo is synced
// ---------------------------------------------------------------------------

/** Once the Draft has finished, the same moment the Wise Old Man competition is made (syncWomCompetitionAfterDraft). */
const SYNC_STAGES: readonly Bingo["stage"][] = ["reveal", "live", "complete"];

// E2E test hook, same convention as WOM_COMPETITION_SYNC_DISABLED.
function syncDisabled(): boolean {
  return process.env.DISCORD_TEAM_SYNC_DISABLED === "true";
}

/** Why a Bingo isn't synced right now, or null if it is. Shown in the settings panel. */
export function discordSyncBlocker(bingo: Pick<Bingo, "slug" | "stage" | "historical" | "discordEnabled" | "discordGuildId">, source?: DiscordApiSource): string | null {
  if (!resolveApi(source, discordGuildIdFor(bingo))) return "The server has no Discord bot set up (DISCORD_BOT_TOKEN and DISCORD_GUILD_ID).";
  if (!bingo.discordEnabled) return "Turned off for this bingo.";
  // A test data Bingo's made-up Players and Teams must never reach the clan's server; a test server is fine.
  if (bingo.slug.startsWith(TESTDATA_PREFIX) && !onDiscordTestServer(bingo)) return "A test data bingo is only synced to a test Discord server (its Discord server ID).";
  if (bingo.historical) return "A historical bingo is never synced to Discord.";
  if (!SYNC_STAGES.includes(bingo.stage)) return "Starts when the draft finishes, with the Wise Old Man competition.";
  return null;
}

// One Discord job at a time per Bingo, so two quick changes can't both create a Team's role. A sync that hasn't
// started yet already covers any later change, so further requests share it instead of queueing another.
const tails = new Map<string, Promise<unknown>>();
const pendingSyncs = new Map<string, { run: Promise<void>; skipIntegrations: boolean }>();

function enqueue<T>(bingoId: string, job: () => Promise<T>): Promise<T> {
  const next = (tails.get(bingoId) ?? Promise.resolve()).catch(() => undefined).then(job);
  tails.set(bingoId, next);
  void next
    .catch(() => undefined)
    .finally(() => {
      if (tails.get(bingoId) === next) tails.delete(bingoId);
    });
  return next;
}

export interface DiscordSyncOptions {
  /** Set by syncDiscordTeams: the request asked to keep off the outside services (X-Dev-Skip-Integrations). */
  skipIntegrations?: boolean;
  /** Re-send everything, not only what changed: puts back what someone changed or deleted by hand in Discord. */
  force?: boolean;
}

/**
 * Brings a Bingo's Discord roles and channels up to date with its Teams. Fire-and-forget from the routes: never throws,
 * and resolves once the sync (or the one already waiting, which it joins) is done. A no-op unless discordSyncBlocker
 * says the Bingo is synced, or when a request asked to keep off the outside services (the test data generator's), unless
 * the Bingo syncs to a test Discord server (onDiscordTestServer).
 */
export function syncDiscordTeams(db: Db, bingoId: string, options: DiscordSyncOptions = {}, api?: DiscordApiSource): Promise<void> {
  if (syncDisabled() || api === null || (api === undefined && !process.env.DISCORD_BOT_TOKEN)) return Promise.resolve();
  // Read now, in the request's context: the job below may run in another's.
  if (skipsIntegrations()) options = { ...options, skipIntegrations: true };
  // A waiting sync covers this one, unless it was asked to keep off the outside services and this one wasn't.
  const pending = pendingSyncs.get(bingoId);
  if (pending && !options.force && (!pending.skipIntegrations || options.skipIntegrations)) return pending.run;
  const run = enqueue(bingoId, async () => {
    if (pendingSyncs.get(bingoId)?.run === run) pendingSyncs.delete(bingoId);
    try {
      await syncNow(db, bingoId, options, api);
    } catch (err) {
      // syncNow keeps Discord's failures for the settings panel; this is anything else (the database, a bingo deleted
      // mid-sync). Callers don't wait for it, so a rejection here would be unhandled and take the server down.
      log.error("discord team sync crashed", { bingoId, err });
    }
  });
  pendingSyncs.set(bingoId, { run, skipIntegrations: !!options.skipIntegrations });
  return run;
}

interface SyncChanges {
  created: string[];
  updated: string[];
  deleted: string[];
  membersAdded: number;
  membersRemoved: number;
}

async function syncNow(db: Db, bingoId: string, options: DiscordSyncOptions, source: DiscordApiSource): Promise<void> {
  const bingo = db.select().from(bingos).where(eq(bingos.id, bingoId)).get();
  if (!bingo || discordSyncBlocker(bingo, source)) return;
  // The generator's requests keep off the outside services, except a test Discord server it was pointed at.
  if (options.skipIntegrations && !onDiscordTestServer(bingo)) return;
  const api = resolveApi(source, discordGuildIdFor(bingo))!;
  const changes: SyncChanges = { created: [], updated: [], deleted: [], membersAdded: 0, membersRemoved: 0 };
  try {
    // Never half in one server and half in another (the guild picked on a dev server changed, or DISCORD_GUILD_ID did).
    const stray = strayGuildId(db, bingo.id, api.guildId);
    if (stray) throw new Error(`Its roles and channels are still in another Discord server (${stray}). Remove them from Discord first.`);
    await reconcile(db, bingo, api, options, changes);
    db.update(bingos).set({ discordSyncError: null, discordSyncedAt: clockNow() }).where(eq(bingos.id, bingoId)).run();
  } catch (err) {
    const message =
      err instanceof DiscordSyncApiError && err.code === MISSING_PERMISSIONS
        ? `${err.message}. Check the bot's permissions and that its role is above the Team roles.`
        : err instanceof DiscordSyncApiError && err.retryAfterMs !== null
          ? `${err.message}; trying again then.`
          : err instanceof Error
            ? err.message
            : String(err);
    if (err instanceof DiscordSyncApiError && err.retryAfterMs !== null) {
      setTimeout(() => void syncDiscordTeams(db, bingoId, {}, source), err.retryAfterMs + 1000).unref();
    }
    log.warn("discord team sync failed", { bingoId, err: message });
    // Recorded once per distinct failure: a broken setup would otherwise add one per change.
    if (bingo.discordSyncError !== message) {
      audit(db, { action: "discord.sync_failed", bingoId, entity: { type: "bingo", id: bingoId, label: bingo.name }, details: { message }, actor: "system" });
    }
    db.update(bingos).set({ discordSyncError: message }).where(eq(bingos.id, bingoId)).run();
  }
  // What did reach Discord is recorded even when the sync stopped partway.
  if (changes.created.length || changes.updated.length || changes.deleted.length || changes.membersAdded || changes.membersRemoved) {
    audit(db, { action: "discord.synced", bingoId, entity: { type: "bingo", id: bingoId, label: bingo.name }, details: { ...changes }, actor: "system" });
  }
}

async function reconcile(db: Db, bingo: Bingo, api: DiscordGuildApi, options: DiscordSyncOptions, changes: SyncChanges): Promise<void> {
  const reason = `Tectonic Bingo: ${bingo.name}`.slice(0, 512);
  const botId = await api.botUserId();
  const rows = db.select().from(discordResources).where(eq(discordResources.bingoId, bingo.id)).all();
  const rowFor = (teamId: string | null, kind: ResourceKind, channelKey: string | null = null) => rows.find((r) => r.teamId === teamId && r.kind === kind && r.channelKey === channelKey);

  /** Creates the object, or edits it when what's wanted differs from what was last sent (or always, when forced). */
  async function ensure<T extends object>(
    where: { teamId: string | null; kind: ResourceKind; channelKey?: string },
    label: string,
    wanted: T,
    ops: { create: () => Promise<string>; edit: (id: string) => Promise<void> },
    applied: (row: ResourceRow | undefined) => object = () => wanted,
  ): Promise<{ id: string; recreated: boolean }> {
    const row = rowFor(where.teamId, where.kind, where.channelKey ?? null);
    if (row) {
      const differs = !sameJson(pick(parseApplied<T>(row), wanted), wanted);
      if (!differs && !options.force) return { id: row.discordId, recreated: false };
      try {
        await ops.edit(row.discordId);
        saveApplied(db, row, { ...parseApplied(row), ...applied(row) });
        if (differs) changes.updated.push(label);
        return { id: row.discordId, recreated: false };
      } catch (err) {
        if (!isUnknownResource(err)) throw err;
        // Deleted by hand in Discord: made again below, and its row pointed at the new one.
      }
    }
    const id = await ops.create();
    const appliedJson = JSON.stringify(applied(undefined));
    if (row) {
      db.update(discordResources).set({ discordId: id, appliedJson, updatedAt: clockNow() }).where(eq(discordResources.id, row.id)).run();
      row.discordId = id;
      row.appliedJson = appliedJson;
    } else {
      const values = { bingoId: bingo.id, guildId: api.guildId, teamId: where.teamId, kind: where.kind, channelKey: where.channelKey ?? null, discordId: id, appliedJson, createdAt: clockNow(), updatedAt: clockNow() };
      rows.push(db.insert(discordResources).values(values).returning().get());
    }
    changes.created.push(label);
    return { id, recreated: true };
  }

  // The category every channel the sync makes goes in, so it always knows where they go: an existing one the admins
  // picked (never edited or deleted here), or one the sync makes for the Bingo.
  const category = bingo.discordCategoryId ? await existingCategory(api, bingo.discordCategoryId, syncedChannelIds(db, api.guildId)) : await ownCategory();
  async function ownCategory(): Promise<{ id: string; firstPosition: number }> {
    const body: ChannelBody = {
      name: discordCategoryName(bingo.discordCategoryName, bingo.name),
      type: ChannelType.GuildCategory,
      permission_overwrites: overwrites(api.guildId, botId, []),
    };
    const { id } = await ensure({ teamId: null, kind: "category" }, `category "${body.name}"`, body, {
      create: () => api.createChannel(body, reason),
      edit: (id) => api.editChannel(id, body, reason),
    });
    return { id, firstPosition: 0 };
  }

  const templates = parseDiscordChannels(bingo.discordChannelsJson);
  // Teams in their draft order, so each Team's channels sit together in the category in the same order as on the site.
  const teamRows = db
    .select()
    .from(teams)
    .where(eq(teams.bingoId, bingo.id))
    .all()
    .sort((a, b) => (a.draftOrder ?? Infinity) - (b.draftOrder ?? Infinity) || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  const memberRows = teamRows.length
    ? db
        .select({ teamId: teamMembers.teamId, discordId: users.discordId, inGuild: users.inGuild })
        .from(teamMembers)
        .innerJoin(users, eq(teamMembers.userId, users.id))
        .where(inArray(teamMembers.teamId, teamRows.map((t) => t.id)))
        .all()
    : [];

  // users.in_guild is about the clan's server; in a test server picked on a dev server, Discord says who's there.
  const clanServer = !process.env.DISCORD_GUILD_ID || api.guildId === process.env.DISCORD_GUILD_ID;
  for (const [teamIndex, team] of teamRows.entries()) {
    // A Player who isn't in the server can't hold a role (a Historical import's are the only ones without one).
    const members = memberRows
      .filter((m) => m.teamId === team.id && (m.inGuild !== false || !clanServer) && /^\d+$/.test(m.discordId))
      .map((m) => m.discordId)
      .sort();

    const roleBody: RoleBody = { name: discordRoleName(team.name), color: roleColor(team.color), mentionable: true };
    const role = await ensure({ teamId: team.id, kind: "role" }, `role "${roleBody.name}"`, roleBody, {
      create: () => api.createRole(roleBody, reason),
      edit: (id) => api.editRole(id, roleBody, reason),
    }, (row) => ({ ...roleBody, members: row ? (parseApplied<RoleApplied>(row).members ?? []) : [] }));
    await syncRoleMembers(db, rowFor(team.id, "role")!, role.id, members, !!options.force || role.recreated, reason, api, changes);

    for (const [templateIndex, template] of templates.entries()) {
      const body = channelBody(template, team.name, category.id, category.firstPosition + teamIndex * templates.length + templateIndex, overwrites(api.guildId, botId, [{ id: role.id, allow: template.type === "text" ? TEXT_ACCESS : VOICE_ACCESS }]));
      await ensure({ teamId: team.id, kind: channelKind(template), channelKey: template.key }, `${template.type} channel "${body.name}"`, body, {
        create: () => api.createChannel(body, reason),
        edit: (id) => api.editChannel(id, body, reason),
      });
    }
  }

  // What's no longer wanted: everything of a Team that's gone (deleted, or undone by moving the Bingo back), and every
  // Team's channel for an entry taken off the list (or whose type changed, which Discord can only do by replacing it).
  const teamIds = new Set(teamRows.map((t) => t.id));
  const wantedChannels = new Set(templates.map((t) => `${channelKind(t)}:${t.key}`));
  const orphans = rows.filter(
    (r) =>
      (r.teamId !== null && (!teamIds.has(r.teamId) || (r.kind !== "role" && !wantedChannels.has(`${r.kind}:${r.channelKey}`)))) ||
      // The sync's own category, once the channels have moved to an existing one (deleted last: see orphanOrder).
      (r.kind === "category" && !!bingo.discordCategoryId),
  );
  for (const row of orphanOrder(orphans)) {
    await deleteResource(db, row, reason, api);
    const name = parseApplied<ChannelBody & RoleBody>(row).name;
    changes.deleted.push(`${row.kind.replace("_", " ")}${name ? ` "${name}"` : ""}`);
  }
}

/**
 * Every channel the sync made in a server, for any Bingo: never counted as an existing category's own channels, or two
 * Bingos sharing one would each keep moving theirs after the other's.
 */
function syncedChannelIds(db: Db, guildId: string): Set<string> {
  return new Set(db.select({ id: discordResources.discordId }).from(discordResources).where(eq(discordResources.guildId, guildId)).all().map((r) => r.id));
}

/**
 * An existing category the admins picked: it must be a category in this server that the bot can see. The Teams'
 * channels go after whatever else is in it, so they don't get mixed in with the server's own.
 */
async function existingCategory(api: DiscordGuildApi, categoryId: string, synced: Set<string>): Promise<{ id: string; firstPosition: number }> {
  const channels = await api.listChannels();
  if (!channels.some((c) => c.id === categoryId && c.type === ChannelType.GuildCategory)) {
    throw new Error(`Discord category ${categoryId} isn't a category in this server, or the bot can't see it.`);
  }
  const others = channels.filter((c) => c.parent_id === categoryId && !synced.has(c.id)).map((c) => c.position);
  return { id: categoryId, firstPosition: others.length ? Math.max(...others) + 1 : 0 };
}

function channelKind(template: Pick<DiscordChannelTemplate, "type">): "text_channel" | "voice_channel" {
  return template.type === "text" ? "text_channel" : "voice_channel";
}

/**
 * One Team's channel for one entry of the list: in the Bingo's category, at its place (Teams in draft order, each
 * Team's channels in the list's order; Discord still shows a category's text channels above its voice ones).
 */
function channelBody(template: DiscordChannelTemplate, teamName: string, categoryId: string, position: number, permissionOverwrites: PermissionOverwrite[]): ChannelBody {
  return {
    name: discordChannelName(template, teamName),
    type: template.type === "text" ? ChannelType.GuildText : ChannelType.GuildVoice,
    parent_id: categoryId,
    position,
    permission_overwrites: permissionOverwrites,
  };
}

/** Only the keys `wanted` has, so a stored role's member list doesn't count as a difference in its name or color. */
function pick<T extends object>(applied: Partial<T>, wanted: T): Partial<T> {
  return Object.fromEntries(Object.keys(wanted).map((k) => [k, applied[k as keyof T]])) as Partial<T>;
}

function saveApplied(db: Db, row: ResourceRow, applied: object): void {
  row.appliedJson = JSON.stringify(applied);
  db.update(discordResources).set({ appliedJson: row.appliedJson, updatedAt: clockNow() }).where(eq(discordResources.id, row.id)).run();
}

/**
 * Gives the role to the Team's Players who don't have it yet and takes it from those who left the Team. Only takes it
 * from people the sync gave it to (the role's stored member list), so a role an Admin handed out by hand stays.
 */
async function syncRoleMembers(db: Db, row: ResourceRow, roleId: string, wanted: string[], resendAll: boolean, reason: string, api: DiscordGuildApi, changes: SyncChanges): Promise<void> {
  const had = new Set(parseApplied<RoleApplied>(row).members ?? []);
  const want = new Set(wanted);
  const members = new Set(had);
  const save = () => saveApplied(db, row, { ...parseApplied(row), members: [...members].sort() });
  try {
    for (const id of want) {
      if (had.has(id) && !resendAll) continue;
      try {
        await api.addMemberRole(id, roleId, reason);
        if (!had.has(id)) changes.membersAdded++;
        members.add(id);
      } catch (err) {
        // Not in the server: they get it on a later sync once they've joined and logged in again.
        if (!isUnknownMember(err)) throw err;
      }
    }
    for (const id of had) {
      if (want.has(id)) continue;
      try {
        await api.removeMemberRole(id, roleId, reason);
        changes.membersRemoved++;
      } catch (err) {
        if (!isUnknownMember(err)) throw err;
      }
      members.delete(id);
    }
  } finally {
    save();
  }
}

/** Channels before the category they sit in and before the role their permissions name. */
function orphanOrder(rows: ResourceRow[]): ResourceRow[] {
  const rank: Record<ResourceKind, number> = { text_channel: 0, voice_channel: 0, role: 1, category: 2 };
  return [...rows].sort((a, b) => rank[a.kind] - rank[b.kind]);
}

async function deleteResource(db: Db, row: ResourceRow, reason: string, api: DiscordGuildApi): Promise<void> {
  try {
    if (row.kind === "role") await api.deleteRole(row.discordId, reason);
    else await api.deleteChannel(row.discordId, reason);
  } catch (err) {
    // Already deleted by hand: nothing left to do.
    if (!isUnknownResource(err)) throw err;
  }
  db.delete(discordResources).where(eq(discordResources.id, row.id)).run();
}

// ---------------------------------------------------------------------------
// Removing it all
// ---------------------------------------------------------------------------

export type DiscordRemoveResult = { ok: true; deleted: number } | { ok: false; deleted: number; message: string };

/**
 * Deletes every role and channel the sync made for a Bingo and forgets them. Also the way to clean up after a Bingo
 * is deleted (its rows outlive it). The caller turns the sync off first, or the next change makes them all again.
 */
export function removeDiscordTeams(db: Db, bingoId: string, source?: DiscordApiSource): Promise<DiscordRemoveResult> {
  // Never rejects: deleting a bingo calls it without waiting (see syncDiscordTeams).
  return enqueue(bingoId, () => removeNow(db, bingoId, source)).catch((err: unknown) => {
    log.error("discord team removal crashed", { bingoId, err });
    return { ok: false, deleted: 0, message: err instanceof Error ? err.message : String(err) } as const;
  });
}

async function removeNow(db: Db, bingoId: string, source: DiscordApiSource): Promise<DiscordRemoveResult> {
  const rows = db.select().from(discordResources).where(eq(discordResources.bingoId, bingoId)).all();
  if (rows.length === 0) return { ok: true, deleted: 0 } as const;
  // Each from the server it was made in.
  const apis = new Map(rows.map((r) => [r.guildId, resolveApi(source, r.guildId)]));
  if ([...apis.values()].some((a) => !a)) return { ok: false, deleted: 0, message: "The server has no Discord bot set up (DISCORD_BOT_TOKEN)." } as const;
  const bingo = db.select({ name: bingos.name }).from(bingos).where(eq(bingos.id, bingoId)).get();
  const reason = `Tectonic Bingo: ${bingo?.name ?? "deleted bingo"} removed`.slice(0, 512);
  let deleted = 0;
  try {
    for (const row of orphanOrder(rows)) {
      await deleteResource(db, row, reason, apis.get(row.guildId)!);
      deleted++;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn("discord team removal failed", { bingoId, err: message });
    if (bingo) db.update(bingos).set({ discordSyncError: message }).where(eq(bingos.id, bingoId)).run();
    return { ok: false, deleted, message } as const;
  }
  if (bingo) {
    db.update(bingos).set({ discordSyncError: null, discordSyncedAt: null }).where(eq(bingos.id, bingoId)).run();
    audit(db, { action: "discord.removed", bingoId, entity: { type: "bingo", id: bingoId, label: bingo.name }, details: { deleted }, actor: "system" });
  }
  return { ok: true, deleted } as const;
}

// ---------------------------------------------------------------------------
// What the settings panel shows
// ---------------------------------------------------------------------------

export function getDiscordSyncStatus(db: Db, bingo: Bingo, source?: DiscordApiSource): DiscordSyncStatus {
  const rows = db.select().from(discordResources).where(eq(discordResources.bingoId, bingo.id)).all();
  const teamRows = db.select({ id: teams.id, name: teams.name }).from(teams).where(eq(teams.bingoId, bingo.id)).all();
  const templates = parseDiscordChannels(bingo.discordChannelsJson);
  const target = resolveApi(source, discordGuildIdFor(bingo))?.guildId ?? discordGuildIdFor(bingo);
  const idOf = (teamId: string, kind: ResourceKind, channelKey: string | null = null) => rows.find((r) => r.teamId === teamId && r.kind === kind && r.channelKey === channelKey)?.discordId ?? null;
  return {
    blocker: discordSyncBlocker(bingo, source) ?? (rows.some((r) => r.guildId !== target) ? "Its roles and channels are still in another Discord server. Remove them from Discord first." : null),
    // Where what's been made is (for the links), else where it will go.
    guildId: rows[0]?.guildId ?? target,
    categoryId: bingo.discordCategoryId ?? db.select().from(discordResources).where(and(eq(discordResources.bingoId, bingo.id), isNull(discordResources.teamId), eq(discordResources.kind, "category"))).get()?.discordId ?? null,
    teams: teamRows.map((t) => ({
      teamId: t.id,
      teamName: t.name,
      roleId: idOf(t.id, "role"),
      channels: templates.map((c) => ({ key: c.key, channelId: idOf(t.id, channelKind(c), c.key) })),
    })),
    resourceCount: rows.length,
  };
}
