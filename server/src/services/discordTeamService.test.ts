import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { ChannelType, OverwriteType } from "discord-api-types/v10";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { log } from "../log";
import { deleteBingo, updateBingoSettings } from "./bingoService";
import { discordChannelName, discordTextChannelName, type DiscordChannelTemplate } from "@bingo/shared";
import {
  DiscordSyncApiError,
  discordSyncBlocker,
  getDiscordSyncStatus,
  removeDiscordTeams,
  roleColor,
  syncDiscordTeams,
  type ChannelBody,
  type DiscordGuildApi,
  type RoleBody,
} from "./discordTeamService";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

const GUILD = "100000000000000000";
const BOT = "200000000000000000";

/** An in-memory guild that records every call, standing in for Discord. */
class FakeGuild implements DiscordGuildApi {
  readonly guildId = GUILD;
  private next = 1;
  roles = new Map<string, RoleBody>();
  channels = new Map<string, ChannelBody>();
  memberRoles = new Map<string, Set<string>>();
  notInGuild = new Set<string>();
  calls: string[] = [];
  failNext: DiscordSyncApiError | null = null;

  private id() {
    return String(900000000000000000n + BigInt(this.next++));
  }
  private maybeFail(call: string) {
    this.calls.push(call);
    if (this.failNext) {
      const err = this.failNext;
      this.failNext = null;
      throw err;
    }
  }
  async botUserId() {
    return BOT;
  }
  async createRole(body: RoleBody) {
    this.maybeFail(`createRole ${body.name}`);
    const id = this.id();
    this.roles.set(id, body);
    return id;
  }
  async editRole(roleId: string, body: RoleBody) {
    this.maybeFail(`editRole ${body.name}`);
    if (!this.roles.has(roleId)) throw new DiscordSyncApiError("Unknown Role", 404, 10011);
    this.roles.set(roleId, body);
  }
  async deleteRole(roleId: string) {
    this.maybeFail(`deleteRole ${this.roles.get(roleId)?.name}`);
    if (!this.roles.delete(roleId)) throw new DiscordSyncApiError("Unknown Role", 404, 10011);
  }
  async addMemberRole(userId: string, roleId: string) {
    this.maybeFail(`addMemberRole ${userId}`);
    if (this.notInGuild.has(userId)) throw new DiscordSyncApiError("Unknown Member", 404, 10007);
    this.memberRoles.set(userId, new Set([...(this.memberRoles.get(userId) ?? []), roleId]));
  }
  async removeMemberRole(userId: string, roleId: string) {
    this.maybeFail(`removeMemberRole ${userId}`);
    this.memberRoles.get(userId)?.delete(roleId);
  }
  async createChannel(body: ChannelBody) {
    this.maybeFail(`createChannel ${body.name}`);
    const id = this.id();
    this.channels.set(id, body);
    return id;
  }
  async editChannel(channelId: string, body: ChannelBody) {
    this.maybeFail(`editChannel ${body.name}`);
    if (!this.channels.has(channelId)) throw new DiscordSyncApiError("Unknown Channel", 404, 10003);
    this.channels.set(channelId, body);
  }
  async deleteChannel(channelId: string) {
    this.maybeFail(`deleteChannel ${this.channels.get(channelId)?.name}`);
    if (!this.channels.delete(channelId)) throw new DiscordSyncApiError("Unknown Channel", 404, 10003);
  }
  async listChannels() {
    return [...this.channels].map(([id, c]) => ({ id, type: c.type, parent_id: c.parent_id ?? null, position: c.position ?? 0 }));
  }
  roleNamed(name: string) {
    return [...this.roles].find(([, r]) => r.name === name);
  }
  channelNamed(name: string, type: ChannelType) {
    return [...this.channels].find(([, c]) => c.name === name && c.type === type);
  }
  holders(roleId: string) {
    return [...this.memberRoles].filter(([, roles]) => roles.has(roleId)).map(([u]) => u).sort();
  }
}

/** A channel list, keys c0, c1, ... */
function channels(...entries: [DiscordChannelTemplate["type"], string][]): DiscordChannelTemplate[] {
  return entries.map(([type, name], i) => ({ key: `c${i}`, type, name }));
}

let discordUserSeq = 0;
function user(name: string, overrides: Partial<typeof schema.users.$inferInsert> = {}) {
  const discordId = String(300000000000000000n + BigInt(++discordUserSeq));
  return db.insert(schema.users).values({ discordId, discordUsername: name, ...overrides }).returning().get();
}

function seed(overrides: Partial<typeof schema.bingos.$inferInsert> = {}) {
  const admin = user("admin");
  const bingo = db
    .insert(schema.bingos)
    .values({ slug: "spring", name: "Spring Bingo", boardRows: 3, boardCols: 3, createdByUserId: admin.id, stage: "reveal", discordEnabled: true, ...overrides })
    .returning()
    .get();
  const captain = user("captain");
  const player = user("player");
  const team = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: captain.id, name: "Red Dragons", codeword: "azure-wolf", color: "#e74c3c" }).returning().get();
  db.insert(schema.teamMembers).values({ teamId: team.id, userId: captain.id, isCaptain: true }).run();
  db.insert(schema.teamMembers).values({ teamId: team.id, userId: player.id }).run();
  return { bingo, team, captain, player };
}

function bingoRow(id: string) {
  return db.select().from(schema.bingos).where(eq(schema.bingos.id, id)).get()!;
}

function auditActions() {
  return db.select().from(schema.auditLog).all().map((r) => r.action);
}

let guild: FakeGuild;

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
  guild = new FakeGuild();
});
afterEach(() => {
  sqlite.close();
  vi.unstubAllEnvs();
});

describe("names and colors", () => {
  it("makes a text channel name the way Discord would", () => {
    expect(discordTextChannelName("Red Dragons")).toBe("red-dragons");
    expect(discordTextChannelName("  The *Best*  Team!! ")).toBe("the-best-team");
    expect(discordTextChannelName("Ærø Ünïcode")).toBe("ærø-ünïcode");
    expect(discordTextChannelName("!!!")).toBe("team");
  });

  it("names a Team's channel from its entry in the list", () => {
    expect(discordChannelName({ type: "text", name: "{team}-loot" }, "Red Dragons")).toBe("red-dragons-loot");
    expect(discordChannelName({ type: "voice", name: "{team} Voice" }, "Red Dragons")).toBe("Red Dragons Voice");
  });

  it("reads a hex color, and anything else as no color", () => {
    expect(roleColor("#e74c3c")).toBe(0xe74c3c);
    expect(roleColor("E74C3C")).toBe(0xe74c3c);
    expect(roleColor(null)).toBe(0);
    expect(roleColor("red")).toBe(0);
  });
});

describe("discordSyncBlocker", () => {
  const base = { slug: "spring", stage: "reveal" as const, historical: false, discordEnabled: true, discordGuildId: null };
  it("syncs once the Draft has finished, with the Wise Old Man competition", () => {
    expect(discordSyncBlocker(base, guild)).toBeNull();
    expect(discordSyncBlocker({ ...base, stage: "live" }, guild)).toBeNull();
    expect(discordSyncBlocker({ ...base, stage: "complete" }, guild)).toBeNull();
    expect(discordSyncBlocker({ ...base, stage: "draft" }, guild)).toMatch(/draft finishes/);
    expect(discordSyncBlocker({ ...base, stage: "captains" }, guild)).toMatch(/draft finishes/);
  });
  it("never syncs without a bot, when off, or for test data and historical bingos", () => {
    expect(discordSyncBlocker(base, null)).toMatch(/DISCORD_BOT_TOKEN/);
    expect(discordSyncBlocker({ ...base, discordEnabled: false }, guild)).toMatch(/off/);
    expect(discordSyncBlocker({ ...base, slug: "testdata-abc" }, guild)).toMatch(/test data/);
    expect(discordSyncBlocker({ ...base, historical: true }, guild)).toMatch(/historical/);
  });
});

describe("syncDiscordTeams", () => {
  it("makes a category, and for each Team a colored role given to its Players and private text and voice channels", async () => {
    const { bingo, captain, player } = seed();
    await syncDiscordTeams(db, bingo.id, {}, guild);

    const category = guild.channelNamed("Spring Bingo", ChannelType.GuildCategory)!;
    expect(category).toBeDefined();
    const [roleId, role] = guild.roleNamed("Red Dragons")!;
    expect(role.color).toBe(0xe74c3c);
    expect(guild.holders(roleId)).toEqual([captain.discordId, player.discordId].sort());

    const [, text] = guild.channelNamed("red-dragons", ChannelType.GuildText)!;
    const [, voice] = guild.channelNamed("Red Dragons", ChannelType.GuildVoice)!;
    for (const channel of [text, voice]) {
      expect(channel.parent_id).toBe(category[0]);
      // Hidden from @everyone, open to the bot and the Team's role.
      expect(channel.permission_overwrites.find((o) => o.id === GUILD)!.deny).not.toBe("0");
      expect(channel.permission_overwrites.find((o) => o.id === BOT)!.type).toBe(OverwriteType.Member);
      expect(channel.permission_overwrites.find((o) => o.id === roleId)!.allow).not.toBe("0");
    }

    const after = bingoRow(bingo.id);
    expect(after.discordSyncError).toBeNull();
    expect(after.discordSyncedAt).not.toBeNull();
    expect(auditActions()).toContain("discord.synced");
  });

  it("sends nothing when nothing changed", async () => {
    const { bingo } = seed();
    await syncDiscordTeams(db, bingo.id, {}, guild);
    guild.calls = [];
    await syncDiscordTeams(db, bingo.id, {}, guild);
    expect(guild.calls).toEqual([]);
  });

  it("renames and recolors only what changed when a Team is renamed or recolored", async () => {
    const { bingo, team } = seed();
    await syncDiscordTeams(db, bingo.id, {}, guild);
    guild.calls = [];
    db.update(schema.teams).set({ color: "#3498db" }).where(eq(schema.teams.id, team.id)).run();
    await syncDiscordTeams(db, bingo.id, {}, guild);
    expect(guild.calls).toEqual(["editRole Red Dragons"]);
    expect(guild.roleNamed("Red Dragons")![1].color).toBe(0x3498db);

    guild.calls = [];
    db.update(schema.teams).set({ name: "Blue Whales" }).where(eq(schema.teams.id, team.id)).run();
    await syncDiscordTeams(db, bingo.id, {}, guild);
    expect(guild.calls.sort()).toEqual(["editChannel Blue Whales", "editChannel blue-whales", "editRole Blue Whales"]);
  });

  it("gives the role to a Player drafted later and takes it from one removed, but not from someone given it by hand", async () => {
    const { bingo, team, player } = seed();
    await syncDiscordTeams(db, bingo.id, {}, guild);
    const [roleId] = guild.roleNamed("Red Dragons")!;
    // Someone an Admin gave the role to in Discord.
    guild.memberRoles.set("555", new Set([roleId]));

    const late = user("late");
    db.insert(schema.teamMembers).values({ teamId: team.id, userId: late.id }).run();
    db.delete(schema.teamMembers).where(eq(schema.teamMembers.userId, player.id)).run();
    guild.calls = [];
    await syncDiscordTeams(db, bingo.id, {}, guild);

    expect(guild.calls.sort()).toEqual([`addMemberRole ${late.discordId}`, `removeMemberRole ${player.discordId}`]);
    expect(guild.holders(roleId)).toContain(late.discordId);
    expect(guild.holders(roleId)).not.toContain(player.discordId);
    expect(guild.holders(roleId)).toContain("555");
  });

  it("skips Players who aren't in the server", async () => {
    const { bingo, team } = seed();
    const away = user("away", { inGuild: false });
    db.insert(schema.teamMembers).values({ teamId: team.id, userId: away.id }).run();
    await syncDiscordTeams(db, bingo.id, {}, guild);
    expect(guild.calls).not.toContain(`addMemberRole ${away.discordId}`);
  });

  it("keeps going past a Player Discord doesn't know, and tries them again next time", async () => {
    const { bingo, player } = seed();
    guild.notInGuild.add(player.discordId);
    await syncDiscordTeams(db, bingo.id, {}, guild);
    expect(bingoRow(bingo.id).discordSyncError).toBeNull();
    guild.notInGuild.clear();
    guild.calls = [];
    await syncDiscordTeams(db, bingo.id, {}, guild);
    expect(guild.calls).toEqual([`addMemberRole ${player.discordId}`]);
  });

  it("deletes the role and channels of a Team that's gone", async () => {
    const { bingo, team } = seed();
    await syncDiscordTeams(db, bingo.id, {}, guild);
    db.delete(schema.teamMembers).where(eq(schema.teamMembers.teamId, team.id)).run();
    db.delete(schema.teams).where(eq(schema.teams.id, team.id)).run();
    await syncDiscordTeams(db, bingo.id, {}, guild);
    expect(guild.roles.size).toBe(0);
    expect([...guild.channels.values()].map((c) => c.type)).toEqual([ChannelType.GuildCategory]);
    expect(db.select().from(schema.discordResources).all()).toHaveLength(1);
  });

  it("makes again, on a forced sync, a channel deleted by hand", async () => {
    const { bingo } = seed();
    await syncDiscordTeams(db, bingo.id, {}, guild);
    const [textId] = guild.channelNamed("red-dragons", ChannelType.GuildText)!;
    guild.channels.delete(textId);
    await syncDiscordTeams(db, bingo.id, { force: true }, guild);
    const [newId] = guild.channelNamed("red-dragons", ChannelType.GuildText)!;
    expect(newId).not.toBe(textId);
    expect(db.select().from(schema.discordResources).where(eq(schema.discordResources.discordId, newId)).get()).toBeDefined();
  });

  it("re-gives a role made again to all its Players", async () => {
    const { bingo, captain, player } = seed();
    await syncDiscordTeams(db, bingo.id, {}, guild);
    const [roleId] = guild.roleNamed("Red Dragons")!;
    guild.roles.delete(roleId);
    await syncDiscordTeams(db, bingo.id, { force: true }, guild);
    const [newRoleId] = guild.roleNamed("Red Dragons")!;
    expect(guild.holders(newRoleId)).toEqual([captain.discordId, player.discordId].sort());
    // Its channels now name the new role.
    const [, text] = guild.channelNamed("red-dragons", ChannelType.GuildText)!;
    expect(text.permission_overwrites.some((o) => o.id === newRoleId)).toBe(true);
  });

  it("makes the channels the list asks for, each Team's together and in the list's order", async () => {
    const { bingo, captain } = seed({ discordChannelsJson: JSON.stringify(channels(["text", "{team}"], ["text", "{team}-loot"], ["voice", "{team} Voice"])) });
    const blue = user("blue");
    db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: blue.id, name: "Blue Whales", codeword: "blue-x", draftOrder: 0 }).run();
    db.update(schema.teams).set({ draftOrder: 1 }).where(eq(schema.teams.captainUserId, captain.id)).run();
    await syncDiscordTeams(db, bingo.id, {}, guild);

    const inOrder = [...guild.channels.values()].filter((c) => c.type !== ChannelType.GuildCategory).sort((a, b) => a.position! - b.position!).map((c) => c.name);
    expect(inOrder).toEqual(["blue-whales", "blue-whales-loot", "Blue Whales Voice", "red-dragons", "red-dragons-loot", "Red Dragons Voice"]);
    const [categoryId] = guild.channelNamed("Spring Bingo", ChannelType.GuildCategory)!;
    for (const c of guild.channels.values()) if (c.type !== ChannelType.GuildCategory) expect(c.parent_id).toBe(categoryId);
  });

  it("renames a Team's channels when their entry is renamed, keeping them", async () => {
    const { bingo } = seed({ discordChannelsJson: JSON.stringify(channels(["text", "{team}"])) });
    await syncDiscordTeams(db, bingo.id, {}, guild);
    const [id] = guild.channelNamed("red-dragons", ChannelType.GuildText)!;
    guild.calls = [];
    db.update(schema.bingos).set({ discordChannelsJson: JSON.stringify(channels(["text", "{team}-chat"])) }).where(eq(schema.bingos.id, bingo.id)).run();
    await syncDiscordTeams(db, bingo.id, {}, guild);
    expect(guild.calls).toEqual(["editChannel red-dragons-chat"]);
    expect(guild.channels.get(id)!.name).toBe("red-dragons-chat");
  });

  it("adds a new entry's channels to every Team, and deletes a removed one's", async () => {
    const { bingo } = seed({ discordChannelsJson: JSON.stringify(channels(["text", "{team}"], ["voice", "{team}"])) });
    await syncDiscordTeams(db, bingo.id, {}, guild);
    guild.calls = [];
    db.update(schema.bingos).set({ discordChannelsJson: JSON.stringify(channels(["text", "{team}"], ["text", "{team}-loot"])) }).where(eq(schema.bingos.id, bingo.id)).run();
    await syncDiscordTeams(db, bingo.id, {}, guild);
    expect(guild.calls.sort()).toEqual(["createChannel red-dragons-loot", "deleteChannel Red Dragons"]);
    expect(auditActions()).toContain("discord.synced");
  });

  it("replaces a Team's channel when its entry changes from text to voice", async () => {
    const { bingo } = seed({ discordChannelsJson: JSON.stringify(channels(["text", "{team}"])) });
    await syncDiscordTeams(db, bingo.id, {}, guild);
    db.update(schema.bingos).set({ discordChannelsJson: JSON.stringify([{ key: "c0", type: "voice", name: "{team}" }]) }).where(eq(schema.bingos.id, bingo.id)).run();
    await syncDiscordTeams(db, bingo.id, {}, guild);
    expect([...guild.channels.values()].map((c) => c.type).sort()).toEqual([ChannelType.GuildVoice, ChannelType.GuildCategory].sort());
  });

  it("names the category as set, or after the bingo", async () => {
    const { bingo } = seed({ discordCategoryName: "Bingo #12" });
    await syncDiscordTeams(db, bingo.id, {}, guild);
    expect(guild.channelNamed("Bingo #12", ChannelType.GuildCategory)).toBeDefined();
  });

  it("on a forced sync still takes the role from a Player who left the Team", async () => {
    const { bingo, player } = seed();
    await syncDiscordTeams(db, bingo.id, {}, guild);
    const [roleId] = guild.roleNamed("Red Dragons")!;
    db.delete(schema.teamMembers).where(eq(schema.teamMembers.userId, player.id)).run();
    await syncDiscordTeams(db, bingo.id, { force: true }, guild);
    expect(guild.holders(roleId)).not.toContain(player.discordId);
  });

  it("stops at a long rate limit and tries again after it", async () => {
    vi.useFakeTimers();
    try {
      const { bingo } = seed();
      guild.failNext = new DiscordSyncApiError("Discord's rate limit holds PATCH /channels/:id for 300s", 429, null, 300_000);
      await syncDiscordTeams(db, bingo.id, {}, guild);
      expect(bingoRow(bingo.id).discordSyncError).toMatch(/trying again then/);
      expect(guild.roles.size).toBe(0);
      await vi.advanceTimersByTimeAsync(301_000);
      expect(bingoRow(bingo.id).discordSyncError).toBeNull();
      expect(guild.roles.size).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does nothing for a test data bingo, before the Draft, or when turned off", async () => {
    for (const overrides of [{ slug: "testdata-x" }, { stage: "draft" as const }, { discordEnabled: false }]) {
      ({ sqlite, db } = createTestDb());
      const { bingo } = seed(overrides);
      await syncDiscordTeams(db, bingo.id, {}, guild);
    }
    expect(guild.calls).toEqual([]);
  });

  it("does nothing when the E2E hook turns it off", async () => {
    vi.stubEnv("DISCORD_TEAM_SYNC_DISABLED", "true");
    const { bingo } = seed();
    await syncDiscordTeams(db, bingo.id, {}, guild);
    expect(guild.calls).toEqual([]);
  });

  it("reports Discord's error answers to Sentry (log.error with the error), but not a long rate limit or Discord being unreachable", async () => {
    const error = vi.spyOn(log, "error").mockImplementation(() => {});
    const { bingo } = seed();
    guild.failNext = new DiscordSyncApiError("Discord: Missing Permissions", 403, 50013);
    await syncDiscordTeams(db, bingo.id, {}, guild);
    expect(error).toHaveBeenCalledWith("discord team sync failed", { bingoId: bingo.id, err: expect.any(DiscordSyncApiError) });

    error.mockClear();
    guild.failNext = new DiscordSyncApiError("Couldn't reach Discord: ECONNRESET", null, null);
    await syncDiscordTeams(db, bingo.id, { force: true }, guild);
    vi.useFakeTimers();
    try {
      guild.failNext = new DiscordSyncApiError("Discord's rate limit holds PATCH /channels/:id for 300s", 429, null, 300_000);
      await syncDiscordTeams(db, bingo.id, { force: true }, guild);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("keeps a failure for the settings panel, audits it once, and clears it on the next success", async () => {
    const { bingo } = seed();
    guild.failNext = new DiscordSyncApiError("Discord: Missing Permissions", 403, 50013);
    await syncDiscordTeams(db, bingo.id, {}, guild);
    expect(bingoRow(bingo.id).discordSyncError).toMatch(/Missing Permissions.*bot's permissions/);
    guild.failNext = new DiscordSyncApiError("Discord: Missing Permissions", 403, 50013);
    await syncDiscordTeams(db, bingo.id, {}, guild);
    expect(auditActions().filter((a) => a === "discord.sync_failed")).toHaveLength(1);

    await syncDiscordTeams(db, bingo.id, {}, guild);
    expect(bingoRow(bingo.id).discordSyncError).toBeNull();
    expect(guild.roles.size).toBe(1);
  });

  it("never makes a Team's role twice when changes come in quick succession", async () => {
    const { bingo } = seed();
    await Promise.all([syncDiscordTeams(db, bingo.id, {}, guild), syncDiscordTeams(db, bingo.id, {}, guild), syncDiscordTeams(db, bingo.id, {}, guild)]);
    expect(guild.roles.size).toBe(1);
    expect(guild.channels.size).toBe(3);
  });
});

describe("removeDiscordTeams", () => {
  it("deletes everything the sync made and forgets it", async () => {
    const { bingo } = seed();
    await syncDiscordTeams(db, bingo.id, {}, guild);
    const result = await removeDiscordTeams(db, bingo.id, guild);
    expect(result).toEqual({ ok: true, deleted: 4 });
    expect(guild.roles.size).toBe(0);
    expect(guild.channels.size).toBe(0);
    expect(db.select().from(schema.discordResources).all()).toHaveLength(0);
    expect(auditActions()).toContain("discord.removed");
  });

  it("still cleans up after the bingo itself is gone", async () => {
    const { bingo } = seed();
    await syncDiscordTeams(db, bingo.id, {}, guild);
    deleteBingo(db, bingo.id);
    const result = await removeDiscordTeams(db, bingo.id, guild);
    expect(result.ok).toBe(true);
    expect(guild.channels.size).toBe(0);
  });

  it("tolerates what was already deleted by hand", async () => {
    const { bingo } = seed();
    await syncDiscordTeams(db, bingo.id, {}, guild);
    guild.roles.clear();
    expect(await removeDiscordTeams(db, bingo.id, guild)).toEqual({ ok: true, deleted: 4 });
  });
});

describe("getDiscordSyncStatus", () => {
  it("lists each Team's role and channels", async () => {
    const { bingo, team } = seed();
    expect(getDiscordSyncStatus(db, bingo, guild).teams).toEqual([{ teamId: team.id, teamName: "Red Dragons", roleId: null, channels: [{ key: "chat", channelId: null }, { key: "voice", channelId: null }] }]);
    await syncDiscordTeams(db, bingo.id, {}, guild);
    const status = getDiscordSyncStatus(db, bingoRow(bingo.id), guild);
    expect(status.blocker).toBeNull();
    expect(status.guildId).toBe(GUILD);
    expect(status.categoryId).not.toBeNull();
    expect(status.teams[0]!.roleId).toBe(guild.roleNamed("Red Dragons")![0]);
    expect(status.teams[0]!.channels[0]!.channelId).toBe(guild.channelNamed("red-dragons", ChannelType.GuildText)![0]);
    expect(status.resourceCount).toBe(4);
  });
});

describe("RestDiscordGuildApi", () => {
  it("sends the bot's requests to Discord's routes, with the reason in the audit log header", async () => {
    const { createServer } = await import("node:http");
    const { RestDiscordGuildApi } = await import("./discordTeamService");
    const seen: { method: string; url: string; auth: string | undefined; reason: string | undefined; body: unknown }[] = [];
    const server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        seen.push({ method: req.method!, url: decodeURIComponent(req.url!), auth: req.headers.authorization, reason: req.headers["x-audit-log-reason"] as string | undefined, body: raw ? JSON.parse(raw) : null });
        if (req.url!.endsWith("/roles/404")) {
          res.setHeader("Content-Type", "application/json");
          res.statusCode = 404;
          res.end(JSON.stringify({ message: "Unknown Role", code: 10011 }));
          return;
        }
        // Discord answers a role assignment or a delete with 204 No Content.
        if (req.method === "DELETE" || req.method === "PUT") {
          res.statusCode = 204;
          res.end();
          return;
        }
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ id: decodeURIComponent(req.url!).includes("@me") ? "bot-id" : "new-id" }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const api = new RestDiscordGuildApi("token", GUILD, `http://127.0.0.1:${port}/api`);
      expect(await api.botUserId()).toBe("bot-id");
      expect(await api.createRole({ name: "Red", color: 1, mentionable: true }, "Tectonic Bingo: Spring")).toBe("new-id");
      await api.addMemberRole("u1", "r1", "why");
      await api.editChannel("c1", { name: "red", type: ChannelType.GuildText, parent_id: "cat", permission_overwrites: [] }, "why");
      const err = await api.editRole("404", { name: "x", color: 0, mentionable: true }, "why").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(DiscordSyncApiError);
      expect((err as DiscordSyncApiError).code).toBe(10011);

      expect(seen.map((s) => `${s.method} ${s.url}`)).toEqual([
        "GET /api/v10/users/@me",
        `POST /api/v10/guilds/${GUILD}/roles`,
        `PUT /api/v10/guilds/${GUILD}/members/u1/roles/r1`,
        "PATCH /api/v10/channels/c1",
        `PATCH /api/v10/guilds/${GUILD}/roles/404`,
      ]);
      expect(seen[1]!.auth).toBe("Bot token");
      expect(decodeURIComponent(seen[1]!.reason!)).toBe("Tectonic Bingo: Spring");
      // A channel's type isn't sent on an edit.
      expect(seen[3]!.body).toEqual({ name: "red", parent_id: "cat", permission_overwrites: [] });
    } finally {
      server.close();
    }
  });
});

describe("channel list settings", () => {
  it("keeps entries' keys, mints them for new ones, and refuses a name without {team}", () => {
    const { bingo } = seed();
    const saved = updateBingoSettings(db, bingo.id, { discordChannels: [{ key: "chat", type: "text", name: " {team}-chat " }, { type: "voice", name: "{team}" }] });
    const list = JSON.parse(saved.discordChannelsJson) as DiscordChannelTemplate[];
    expect(list[0]).toEqual({ key: "chat", type: "text", name: "{team}-chat" });
    expect(list[1]!.key).toMatch(/^[a-z0-9-]+$/);
    expect(() => updateBingoSettings(db, bingo.id, { discordChannels: [{ type: "text", name: "general" }] })).toThrow(/\{team\}/);
    expect(() => updateBingoSettings(db, bingo.id, { discordChannels: [{ type: "stage", name: "{team}" }] })).toThrow(/text or voice/);
  });
});

describe("RestDiscordGuildApi rate limits", () => {
  it("fails fast on a long one (a channel's third rename in 10 minutes), saying how long", async () => {
    const { createServer } = await import("node:http");
    const { RestDiscordGuildApi } = await import("./discordTeamService");
    const server = createServer((_req, res) => {
      res.statusCode = 429;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Retry-After", "300");
      res.end(JSON.stringify({ message: "You are being rate limited.", retry_after: 300, global: false }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const api = new RestDiscordGuildApi("token", GUILD, `http://127.0.0.1:${(server.address() as { port: number }).port}/api`);
      const err = await api.editChannel("c1", { name: "x", type: ChannelType.GuildText, permission_overwrites: [] }, "why").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(DiscordSyncApiError);
      expect((err as DiscordSyncApiError).retryAfterMs).toBeGreaterThanOrEqual(300_000);
    } finally {
      server.close();
    }
  });
});

describe("a test Discord server (dev servers only)", () => {
  const TEST_GUILD = "700000000000000000";
  /** The clan's server and a test server, each its own fake. */
  function guilds() {
    const clan = guild;
    const test = new FakeGuild();
    (test as { guildId: string }).guildId = TEST_GUILD;
    return { clan, test, source: (id: string) => (id === GUILD ? clan : id === TEST_GUILD ? test : null) };
  }

  beforeEach(() => {
    vi.stubEnv("DISCORD_GUILD_ID", GUILD);
    vi.stubEnv("NODE_ENV", "development");
  });

  it("syncs to the picked server on a dev server, everyone included (in_guild is about the clan's)", async () => {
    vi.stubEnv("DEV_LOGIN_ENABLED", "true");
    const { clan, test, source } = guilds();
    const { bingo, team } = seed({ discordGuildId: TEST_GUILD });
    const away = user("away", { inGuild: false });
    db.insert(schema.teamMembers).values({ teamId: team.id, userId: away.id }).run();
    await syncDiscordTeams(db, bingo.id, {}, source);
    expect(clan.calls).toEqual([]);
    expect(test.roles.size).toBe(1);
    expect(test.calls).toContain(`addMemberRole ${away.discordId}`);
    expect(db.select().from(schema.discordResources).all().every((r) => r.guildId === TEST_GUILD)).toBe(true);
    expect(getDiscordSyncStatus(db, bingoRow(bingo.id), source).guildId).toBe(TEST_GUILD);
  });

  it("syncs a test data bingo (the generator's) only to a test server, even from its requests", async () => {
    vi.stubEnv("DEV_LOGIN_ENABLED", "true");
    const { clan, test, source } = guilds();
    const { bingo } = seed({ slug: "testdata-x", discordGuildId: TEST_GUILD });
    // The generator's requests keep off the outside services, but not the test server it was pointed at.
    await syncDiscordTeams(db, bingo.id, { skipIntegrations: true }, source);
    expect(test.roles.size).toBe(1);
    expect(clan.calls).toEqual([]);

    // Pointed at the clan's server (or nowhere), it never syncs.
    ({ sqlite, db } = createTestDb());
    const other = seed({ slug: "testdata-y", discordGuildId: GUILD });
    await syncDiscordTeams(db, other.bingo.id, {}, source);
    expect(clan.calls).toEqual([]);
    expect(discordSyncBlocker(other.bingo, source)).toMatch(/test Discord server/);
  });

  it("keeps the generator's requests off a real bingo's Discord, without losing a real change behind them", async () => {
    vi.stubEnv("DEV_LOGIN_ENABLED", "true");
    const { clan, source } = guilds();
    const { bingo } = seed();
    const skipped = syncDiscordTeams(db, bingo.id, { skipIntegrations: true }, source);
    const real = syncDiscordTeams(db, bingo.id, {}, source);
    await Promise.all([skipped, real]);
    expect(clan.roles.size).toBe(1);
  });

  it("ignores the picked server anywhere but a dev server", async () => {
    vi.stubEnv("DEV_LOGIN_ENABLED", "false");
    const { clan, test, source } = guilds();
    const { bingo } = seed({ discordGuildId: TEST_GUILD });
    await syncDiscordTeams(db, bingo.id, {}, source);
    expect(test.calls).toEqual([]);
    expect(clan.roles.size).toBe(1);
  });

  it("won't change server while anything made in the old one is left, nor sync half into another", async () => {
    vi.stubEnv("DEV_LOGIN_ENABLED", "true");
    const { clan, test, source } = guilds();
    const { bingo } = seed();
    await syncDiscordTeams(db, bingo.id, {}, source);
    expect(() => updateBingoSettings(db, bingo.id, { discordGuildId: TEST_GUILD })).toThrow(/Remove/);

    // Even if it were changed underneath, the sync refuses rather than splitting the bingo across servers.
    db.update(schema.bingos).set({ discordGuildId: TEST_GUILD }).where(eq(schema.bingos.id, bingo.id)).run();
    await syncDiscordTeams(db, bingo.id, {}, source);
    expect(test.calls).toEqual([]);
    expect(bingoRow(bingo.id).discordSyncError).toMatch(/another Discord server/);

    // Removal deletes each thing from the server it was made in, and then the new server is free to use.
    expect(await removeDiscordTeams(db, bingo.id, source)).toEqual({ ok: true, deleted: 4 });
    expect(clan.roles.size + clan.channels.size).toBe(0);
    await syncDiscordTeams(db, bingo.id, {}, source);
    expect(test.roles.size).toBe(1);
  });
});

describe("an existing category", () => {
  const CLAN_CATEGORY = "800000000000000000";
  /** A category the server already has, with two channels of its own in it. */
  function clanCategory() {
    guild.channels.set(CLAN_CATEGORY, { name: "Bingo", type: ChannelType.GuildCategory, permission_overwrites: [] });
    guild.channels.set("800000000000000001", { name: "rules", type: ChannelType.GuildText, parent_id: CLAN_CATEGORY, position: 3, permission_overwrites: [] });
    guild.channels.set("800000000000000002", { name: "signups", type: ChannelType.GuildText, parent_id: CLAN_CATEGORY, position: 7, permission_overwrites: [] });
  }
  const teamChannels = () => [...guild.channels.values()].filter((c) => c.parent_id === CLAN_CATEGORY && !["rules", "signups"].includes(c.name));

  it("puts the Teams' channels in it, after what's already there, and never edits it", async () => {
    clanCategory();
    const { bingo } = seed({ discordCategoryId: CLAN_CATEGORY });
    await syncDiscordTeams(db, bingo.id, {}, guild);
    expect(teamChannels().map((c) => c.name).sort()).toEqual(["Red Dragons", "red-dragons"]);
    expect(Math.min(...teamChannels().map((c) => c.position!))).toBe(8);
    expect([...guild.channels.values()].filter((c) => c.type === ChannelType.GuildCategory)).toHaveLength(1);
    expect(guild.calls.some((c) => c.includes("Bingo"))).toBe(false);
    expect(getDiscordSyncStatus(db, bingoRow(bingo.id), guild).categoryId).toBe(CLAN_CATEGORY);

    // Remove from Discord leaves it, and the server's own channels in it, alone.
    await removeDiscordTeams(db, bingo.id, guild);
    expect(guild.channels.has(CLAN_CATEGORY)).toBe(true);
    expect(guild.channels.size).toBe(3);
  });

  it("moves the channels in when picked later, deleting the category the sync had made, and back out again", async () => {
    clanCategory();
    const { bingo } = seed();
    await syncDiscordTeams(db, bingo.id, {}, guild);
    const [ownId] = guild.channelNamed("Spring Bingo", ChannelType.GuildCategory)!;
    const [textId] = guild.channelNamed("red-dragons", ChannelType.GuildText)!;

    updateBingoSettings(db, bingo.id, { discordCategoryId: CLAN_CATEGORY });
    await syncDiscordTeams(db, bingo.id, {}, guild);
    expect(guild.channels.get(textId)!.parent_id).toBe(CLAN_CATEGORY);
    expect(guild.channels.has(ownId)).toBe(false);

    updateBingoSettings(db, bingo.id, { discordCategoryId: null });
    await syncDiscordTeams(db, bingo.id, {}, guild);
    const [newOwnId] = guild.channelNamed("Spring Bingo", ChannelType.GuildCategory)!;
    expect(guild.channels.get(textId)!.parent_id).toBe(newOwnId);
  });

  it("says so when the ID isn't a category in the server", async () => {
    const { bingo } = seed({ discordCategoryId: "800000000000000009" });
    await syncDiscordTeams(db, bingo.id, {}, guild);
    expect(bingoRow(bingo.id).discordSyncError).toMatch(/isn't a category in this server/);
    expect(guild.roles.size).toBe(0);
  });
});

describe("never takes the server down", () => {
  it("a sync resolves even when something outside Discord throws", async () => {
    const { bingo } = seed();
    const broken = () => {
      throw new Error("database is locked");
    };
    await expect(syncDiscordTeams(db, bingo.id, {}, broken)).resolves.toBeUndefined();
  });

  it("removal resolves with the failure instead of rejecting", async () => {
    const { bingo } = seed();
    await syncDiscordTeams(db, bingo.id, {}, guild);
    const broken = () => {
      throw new Error("database is locked");
    };
    expect(await removeDiscordTeams(db, bingo.id, broken)).toEqual({ ok: false, deleted: 0, message: "database is locked" });
  });
});

describe("two bingos in one existing category", () => {
  it("settle: neither keeps moving its channels after the other's", async () => {
    const CATEGORY = "800000000000000000";
    guild.channels.set(CATEGORY, { name: "Bingos", type: ChannelType.GuildCategory, permission_overwrites: [] });
    const a = seed({ discordCategoryId: CATEGORY });
    const b = seed({ slug: "autumn", name: "Autumn Bingo", discordCategoryId: CATEGORY });
    await syncDiscordTeams(db, a.bingo.id, {}, guild);
    await syncDiscordTeams(db, b.bingo.id, {}, guild);
    guild.calls = [];
    await syncDiscordTeams(db, a.bingo.id, {}, guild);
    await syncDiscordTeams(db, b.bingo.id, {}, guild);
    expect(guild.calls).toEqual([]);
  });
});
