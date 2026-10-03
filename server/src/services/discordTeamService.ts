// Discord team sync: when an Admin turns it on in a Bingo's settings (bingos.discordEnabled), every Team gets, in the
// clan's Discord server (DISCORD_GUILD_ID):
//   - a role named after the Team, in the Team's color, given to each of its Players;
//   - a private text channel and a private voice channel, which only that role (plus the bot, and the optional staff
//     role, bingos.discordStaffRoleId) can see;
// all under one category named after the Bingo. They're kept up to date from the Draft on: a Team renamed or
// recolored, a Player drafted, removed or signed up late, a Team added or deleted. Nothing is deleted when the Bingo
// is Finished; an Admin removes them from the settings panel (removeDiscordTeams) when they're done with them.
//
// The bot talks to Discord over REST only (no gateway connection): it needs DISCORD_BOT_TOKEN, and in the server the
// Manage Roles and Manage Channels permissions plus every permission it hands out to the Teams (docs/discord-team-sync.md).
//
// Same conventions as womCompetitionService: the route layer calls syncDiscordTeams fire-and-forget after anything
// that may change a Team; it never throws, and a failure is kept on bingos.discordSyncError for the settings panel.
// Every sync compares what the Bingo wants with what it last sent (discord_resources.applied_json) and only sends the
// difference, so a Draft pick costs one role assignment, not a rename of every channel (Discord allows a channel two
// renames per 10 minutes).
import { DiscordAPIError, REST } from "@discordjs/rest";
import { ChannelType, OverwriteType, PermissionFlagsBits, Routes } from "discord-api-types/v10";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { DiscordSyncStatus } from "@bingo/shared";
import * as schema from "../db/schema";
import { bingos, discordResources, teamMembers, teams, users } from "../db/schema";
import { audit } from "../audit/record";
import { skipsIntegrations } from "../audit/context";
import { now as clockNow } from "../clock";
import { log } from "../log";
import { TESTDATA_PREFIX } from "./devTestDataService";

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
  permission_overwrites: PermissionOverwrite[];
}

/** Discord answered with an error. `code` is Discord's JSON error code (https://discord.com/developers/docs/topics/opcodes-and-status-codes#json). */
export class DiscordSyncApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly code: number | string | null,
  ) {
    super(message);
    this.name = "DiscordSyncApiError";
  }
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
    this.rest = new REST({ version: "10", retries: 1, ...(apiBaseUrl ? { api: apiBaseUrl } : {}) }).setToken(token);
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

  async deleteChannel(channelId: string, reason: string): Promise<void> {
    await this.call(() => this.rest.delete(Routes.channel(channelId), { reason }));
  }

  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof DiscordAPIError) throw new DiscordSyncApiError(`Discord: ${err.message} (${err.method.toUpperCase()} ${err.url.replace(/^.*\/api\/v\d+/, "")})`, err.status, err.code);
      throw new DiscordSyncApiError(`Couldn't reach Discord: ${err instanceof Error ? err.message : String(err)}`, null, null);
    }
  }
}

let _api: { token: string; guildId: string; api: RestDiscordGuildApi } | undefined;

/** Null unless the server has a bot token and a guild: the sync is then off everywhere, whatever a Bingo's setting. */
export function getDiscordGuildApi(): DiscordGuildApi | null {
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!token || !guildId) return null;
  if (!_api || _api.token !== token || _api.guildId !== guildId) _api = { token, guildId, api: new RestDiscordGuildApi(token, guildId) };
  return _api.api;
}

// ---------------------------------------------------------------------------
// What a Bingo wants in Discord
// ---------------------------------------------------------------------------

const NAME_MAX = 100;

/** A Team's text channel name: Discord's own rules (lowercase, no spaces), so a sync doesn't see a "change" it made. */
export function textChannelName(teamName: string): string {
  const name = teamName
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, NAME_MAX);
  return name || "team";
}

function displayName(name: string, fallback: string): string {
  return name.trim().slice(0, NAME_MAX) || fallback;
}

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

function overwrites(guildId: string, botId: string, staffRoleId: string | null, grants: { id: string; allow: string }[]): PermissionOverwrite[] {
  return [
    // The @everyone role's id is the guild's own.
    { id: guildId, type: OverwriteType.Role, allow: "0", deny: VIEW },
    { id: botId, type: OverwriteType.Member, allow: BOT_ACCESS, deny: "0" },
    ...grants.map((g) => ({ id: g.id, type: OverwriteType.Role, allow: g.allow, deny: "0" })),
  ].concat(staffRoleId ? [{ id: staffRoleId, type: OverwriteType.Role, allow: grants[0]?.allow ?? VIEW, deny: "0" }] : []);
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

/** From the Draft on the Teams exist; before it Captains (and so Teams) still come and go. */
const SYNC_STAGES: readonly Bingo["stage"][] = ["draft", "reveal", "live", "complete"];

// E2E test hook, same convention as WOM_COMPETITION_SYNC_DISABLED.
function syncDisabled(): boolean {
  return process.env.DISCORD_TEAM_SYNC_DISABLED === "true";
}

/** Why a Bingo isn't synced right now, or null if it is. Shown in the settings panel. */
export function discordSyncBlocker(bingo: Pick<Bingo, "slug" | "stage" | "historical" | "discordEnabled">, api: DiscordGuildApi | null = getDiscordGuildApi()): string | null {
  if (!api) return "The server has no Discord bot set up (DISCORD_BOT_TOKEN and DISCORD_GUILD_ID).";
  if (!bingo.discordEnabled) return "Turned off for this bingo.";
  // A test data Bingo's made-up Players and Teams must never reach the real server.
  if (bingo.slug.startsWith(TESTDATA_PREFIX)) return "A test data bingo is never synced to Discord.";
  if (bingo.historical) return "A historical bingo is never synced to Discord.";
  if (!SYNC_STAGES.includes(bingo.stage)) return "Starts once the bingo reaches the Draft.";
  return null;
}

// One Discord job at a time per Bingo, so two quick changes can't both create a Team's role. A sync that hasn't
// started yet already covers any later change, so further requests share it instead of queueing another.
const tails = new Map<string, Promise<unknown>>();
const pendingSyncs = new Map<string, Promise<void>>();

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
  /** Re-send everything, not only what changed: puts back what someone changed or deleted by hand in Discord. */
  force?: boolean;
}

/**
 * Brings a Bingo's Discord roles and channels up to date with its Teams. Fire-and-forget from the routes: never throws,
 * and resolves once the sync (or the one already waiting, which it joins) is done. A no-op unless discordSyncBlocker
 * says the Bingo is synced, or when a request asked to keep off the outside services (the test data generator's).
 */
export function syncDiscordTeams(db: Db, bingoId: string, options: DiscordSyncOptions = {}, api: DiscordGuildApi | null = getDiscordGuildApi()): Promise<void> {
  if (syncDisabled() || skipsIntegrations() || !api) return Promise.resolve();
  const pending = pendingSyncs.get(bingoId);
  if (pending && !options.force) return pending;
  const run = enqueue(bingoId, async () => {
    if (pendingSyncs.get(bingoId) === run) pendingSyncs.delete(bingoId);
    await syncNow(db, bingoId, options, api);
  });
  pendingSyncs.set(bingoId, run);
  return run;
}

interface SyncChanges {
  created: string[];
  updated: string[];
  deleted: string[];
  membersAdded: number;
  membersRemoved: number;
}

async function syncNow(db: Db, bingoId: string, options: DiscordSyncOptions, api: DiscordGuildApi): Promise<void> {
  const bingo = db.select().from(bingos).where(eq(bingos.id, bingoId)).get();
  if (!bingo || discordSyncBlocker(bingo, api)) return;
  const changes: SyncChanges = { created: [], updated: [], deleted: [], membersAdded: 0, membersRemoved: 0 };
  try {
    await reconcile(db, bingo, api, options, changes);
    db.update(bingos).set({ discordSyncError: null, discordSyncedAt: clockNow() }).where(eq(bingos.id, bingoId)).run();
  } catch (err) {
    const message = err instanceof DiscordSyncApiError && err.code === MISSING_PERMISSIONS ? `${err.message}. Check the bot's permissions and that its role is above the Team roles.` : err instanceof Error ? err.message : String(err);
    log.warn("discord team sync failed", { bingoId, err: message });
    // Recorded once per distinct failure: a broken setup would otherwise add one per Draft pick.
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
  const rowFor = (teamId: string | null, kind: ResourceKind) => rows.find((r) => r.teamId === teamId && r.kind === kind);

  /** Creates the object, or edits it when what's wanted differs from what was last sent (or always, when forced). */
  async function ensure<T extends object>(
    teamId: string | null,
    kind: ResourceKind,
    label: string,
    wanted: T,
    ops: { create: () => Promise<string>; edit: (id: string) => Promise<void> },
    applied: (row: ResourceRow | undefined) => object = (row) => wanted,
  ): Promise<{ id: string; recreated: boolean }> {
    const row = rowFor(teamId, kind);
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
      rows.push(db.insert(discordResources).values({ bingoId: bingo.id, teamId, kind, discordId: id, appliedJson, createdAt: clockNow(), updatedAt: clockNow() }).returning().get());
    }
    changes.created.push(label);
    return { id, recreated: true };
  }

  // The category everything sits under, named after the Bingo.
  const categoryBody: ChannelBody = {
    name: displayName(bingo.name, "Bingo"),
    type: ChannelType.GuildCategory,
    permission_overwrites: overwrites(api.guildId, botId, bingo.discordStaffRoleId, []),
  };
  const category = await ensure(null, "category", `category "${categoryBody.name}"`, categoryBody, {
    create: () => api.createChannel(categoryBody, reason),
    edit: (id) => api.editChannel(id, categoryBody, reason),
  });

  const teamRows = db.select().from(teams).where(eq(teams.bingoId, bingo.id)).all();
  const memberRows = teamRows.length
    ? db
        .select({ teamId: teamMembers.teamId, discordId: users.discordId, inGuild: users.inGuild })
        .from(teamMembers)
        .innerJoin(users, eq(teamMembers.userId, users.id))
        .where(inArray(teamMembers.teamId, teamRows.map((t) => t.id)))
        .all()
    : [];

  for (const team of teamRows) {
    const teamName = displayName(team.name, "Team");
    // A Player who isn't in the server can't hold a role (a Historical import's are the only ones without one).
    const members = memberRows
      .filter((m) => m.teamId === team.id && m.inGuild !== false && /^\d+$/.test(m.discordId))
      .map((m) => m.discordId)
      .sort();

    const roleBody: RoleBody = { name: teamName, color: roleColor(team.color), mentionable: true };
    const role = await ensure(team.id, "role", `role "${teamName}"`, roleBody, {
      create: () => api.createRole(roleBody, reason),
      edit: (id) => api.editRole(id, roleBody, reason),
    }, (row) => ({ ...roleBody, members: row ? (parseApplied<RoleApplied>(row).members ?? []) : [] }));
    await syncRoleMembers(db, rowFor(team.id, "role")!, role.id, members, options.force || role.recreated, reason, api, changes);

    for (const [kind, type, name, access] of [
      ["text_channel", ChannelType.GuildText, textChannelName(teamName), TEXT_ACCESS],
      ["voice_channel", ChannelType.GuildVoice, teamName, VOICE_ACCESS],
    ] as const) {
      const body: ChannelBody = { name, type, parent_id: category.id, permission_overwrites: overwrites(api.guildId, botId, bingo.discordStaffRoleId, [{ id: role.id, allow: access }]) };
      await ensure(team.id, kind, `${kind === "text_channel" ? "text" : "voice"} channel "${name}"`, body, {
        create: () => api.createChannel(body, reason),
        edit: (id) => api.editChannel(id, body, reason),
      });
    }
  }

  // What's left of Teams that are gone (deleted, or undone by moving the Bingo back).
  const teamIds = new Set(teamRows.map((t) => t.id));
  const orphans = rows.filter((r) => r.teamId !== null && !teamIds.has(r.teamId));
  for (const row of orphanOrder(orphans)) {
    await deleteResource(db, row, reason, api);
    changes.deleted.push(`${row.kind.replace("_", " ")} of a removed team`);
  }
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
  const had = new Set(resendAll ? [] : (parseApplied<RoleApplied>(row).members ?? []));
  const want = new Set(wanted);
  const members = new Set(had);
  const save = () => saveApplied(db, row, { ...parseApplied(row), members: [...members].sort() });
  try {
    for (const id of want) {
      if (had.has(id)) continue;
      try {
        await api.addMemberRole(id, roleId, reason);
        members.add(id);
        changes.membersAdded++;
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
export function removeDiscordTeams(db: Db, bingoId: string, api: DiscordGuildApi | null = getDiscordGuildApi()): Promise<DiscordRemoveResult> {
  return enqueue(bingoId, async () => {
    const rows = db.select().from(discordResources).where(eq(discordResources.bingoId, bingoId)).all();
    if (rows.length === 0) return { ok: true, deleted: 0 } as const;
    if (!api) return { ok: false, deleted: 0, message: "The server has no Discord bot set up (DISCORD_BOT_TOKEN and DISCORD_GUILD_ID)." } as const;
    const bingo = db.select({ name: bingos.name }).from(bingos).where(eq(bingos.id, bingoId)).get();
    const reason = `Tectonic Bingo: ${bingo?.name ?? "deleted bingo"} removed`.slice(0, 512);
    let deleted = 0;
    try {
      for (const row of orphanOrder(rows)) {
        await deleteResource(db, row, reason, api);
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
  });
}

// ---------------------------------------------------------------------------
// What the settings panel shows
// ---------------------------------------------------------------------------

export function getDiscordSyncStatus(db: Db, bingo: Bingo, api: DiscordGuildApi | null = getDiscordGuildApi()): DiscordSyncStatus {
  const rows = db.select().from(discordResources).where(eq(discordResources.bingoId, bingo.id)).all();
  const teamRows = db.select({ id: teams.id, name: teams.name }).from(teams).where(eq(teams.bingoId, bingo.id)).all();
  const idOf = (teamId: string, kind: ResourceKind) => rows.find((r) => r.teamId === teamId && r.kind === kind)?.discordId ?? null;
  return {
    blocker: discordSyncBlocker(bingo, api),
    guildId: api?.guildId ?? process.env.DISCORD_GUILD_ID ?? null,
    categoryId: db.select().from(discordResources).where(and(eq(discordResources.bingoId, bingo.id), isNull(discordResources.teamId), eq(discordResources.kind, "category"))).get()?.discordId ?? null,
    teams: teamRows.map((t) => ({ teamId: t.id, teamName: t.name, roleId: idOf(t.id, "role"), textChannelId: idOf(t.id, "text_channel"), voiceChannelId: idOf(t.id, "voice_channel") })),
    resourceCount: rows.length,
  };
}
