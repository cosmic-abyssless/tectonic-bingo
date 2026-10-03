import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { ChannelType, OverwriteType } from "discord-api-types/v10";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { deleteBingo } from "./bingoService";
import {
  DiscordSyncApiError,
  discordSyncBlocker,
  getDiscordSyncStatus,
  removeDiscordTeams,
  roleColor,
  syncDiscordTeams,
  textChannelName,
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
    expect(textChannelName("Red Dragons")).toBe("red-dragons");
    expect(textChannelName("  The *Best*  Team!! ")).toBe("the-best-team");
    expect(textChannelName("Ærø Ünïcode")).toBe("ærø-ünïcode");
    expect(textChannelName("!!!")).toBe("team");
  });

  it("reads a hex color, and anything else as no color", () => {
    expect(roleColor("#e74c3c")).toBe(0xe74c3c);
    expect(roleColor("E74C3C")).toBe(0xe74c3c);
    expect(roleColor(null)).toBe(0);
    expect(roleColor("red")).toBe(0);
  });
});

describe("discordSyncBlocker", () => {
  const base = { slug: "spring", stage: "reveal" as const, historical: false, discordEnabled: true };
  it("syncs from the Draft on", () => {
    expect(discordSyncBlocker(base, guild)).toBeNull();
    expect(discordSyncBlocker({ ...base, stage: "draft" }, guild)).toBeNull();
    expect(discordSyncBlocker({ ...base, stage: "complete" }, guild)).toBeNull();
    expect(discordSyncBlocker({ ...base, stage: "captains" }, guild)).toMatch(/Draft/);
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

  it("lets the staff role see every channel", async () => {
    const { bingo } = seed({ discordStaffRoleId: "400000000000000000" });
    await syncDiscordTeams(db, bingo.id, {}, guild);
    for (const channel of guild.channels.values()) expect(channel.permission_overwrites.some((o) => o.id === "400000000000000000")).toBe(true);
  });

  it("does nothing for a test data bingo, before the Draft, or when turned off", async () => {
    for (const overrides of [{ slug: "testdata-x" }, { stage: "captains" as const }, { discordEnabled: false }]) {
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
    expect(getDiscordSyncStatus(db, bingo, guild).teams).toEqual([{ teamId: team.id, teamName: "Red Dragons", roleId: null, textChannelId: null, voiceChannelId: null }]);
    await syncDiscordTeams(db, bingo.id, {}, guild);
    const status = getDiscordSyncStatus(db, bingoRow(bingo.id), guild);
    expect(status.blocker).toBeNull();
    expect(status.guildId).toBe(GUILD);
    expect(status.categoryId).not.toBeNull();
    expect(status.teams[0]!.roleId).toBe(guild.roleNamed("Red Dragons")![0]);
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
