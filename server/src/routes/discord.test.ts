// Discord team sync's admin routes (Settings > Discord): who may use them, what the settings accept, and Remove from
// Discord. Real routers over a real in-memory DB, with the logged-in user faked, hit over HTTP. No bot token is set, so
// nothing here reaches Discord (discordTeamService.test.ts covers the sync itself against fake servers).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";
import { eq } from "drizzle-orm";
import type { Bingo, DiscordSyncStatus } from "@bingo/shared";
import * as schema from "../db/schema";
import type { SessionUser } from "../types";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

vi.mock("../ocr", () => ({
  isOcrEnabled: () => false,
  analyzeSubmissionScreenshot: vi.fn(),
}));
vi.mock("../ws", () => ({ broadcast: vi.fn() }));
vi.mock("../db", async () => {
  const { createTestDb } = await import("../testUtils/testDb");
  return { ...createTestDb(), DB_PATH: ":memory:", BUSY_TIMEOUT_MS: 0 };
});

let db: BetterSQLite3Database<typeof schema>;
let sqlite: Database.Database;
let admin: SessionUser;
let player: SessionUser;
let bingo: typeof schema.bingos.$inferSelect;
let actingAs: SessionUser | null = null;
let server: Server;
let base: string;

beforeAll(async () => {
  ({ db, sqlite } = (await import("../db")) as unknown as { db: typeof db; sqlite: typeof sqlite });
  const { default: adminRouter } = await import("./admin");
  const { errorHandler } = await import("../middleware/errorHandler");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { user?: SessionUser }).user = actingAs ?? undefined;
    req.isAuthenticated = (() => !!actingAs) as typeof req.isAuthenticated;
    next();
  });
  app.use("/api/bingos/:slug/admin", adminRouter);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/bingos/b1/admin`;
});

afterAll(() => {
  server.close();
});

function wipe() {
  sqlite.pragma("foreign_keys = OFF");
  for (const { name } of sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'").all() as { name: string }[]) {
    sqlite.prepare(`DELETE FROM "${name}"`).run();
  }
  sqlite.pragma("foreign_keys = ON");
}

async function call<T>(as: SessionUser, method: string, path: string, body?: unknown) {
  actingAs = as;
  const res = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  return { status: res.status, body: (await res.json()) as T & { error?: string } };
}

beforeEach(() => {
  wipe();
  vi.stubEnv("DISCORD_BOT_TOKEN", "");
  admin = db.insert(schema.users).values({ discordId: "100", discordUsername: "admin", isAdmin: true }).returning().get();
  player = db.insert(schema.users).values({ discordId: "200", discordUsername: "player" }).returning().get();
  bingo = db.insert(schema.bingos).values({ slug: "b1", name: "B1", boardRows: 5, boardCols: 5, createdByUserId: admin.id, stage: "reveal" }).returning().get();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("who may use them", () => {
  it("is Admins only", async () => {
    expect((await call(player, "GET", "/discord")).status).toBe(403);
    expect((await call(player, "POST", "/discord/sync", {})).status).toBe(403);
    expect((await call(player, "POST", "/discord/remove", {})).status).toBe(403);
  });
});

describe("the settings", () => {
  it("save the switch, category and channel list, giving new channels keys", async () => {
    const { status, body } = await call<{ bingo: Bingo }>(admin, "PATCH", "/settings", {
      discordEnabled: true,
      discordCategoryId: "800000000000000000",
      discordChannels: [{ key: "chat", type: "text", name: "{team}" }, { type: "voice", name: "{team} Voice" }],
    });
    expect(status).toBe(200);
    expect(body.bingo.discordEnabled).toBe(true);
    expect(body.bingo.discordCategoryId).toBe("800000000000000000");
    expect(body.bingo.discordChannels.map((c) => c.name)).toEqual(["{team}", "{team} Voice"]);
    expect(body.bingo.discordChannels[1]!.key).toMatch(/^[a-z0-9-]+$/);
  });

  it("refuse a channel without {team}, and a category ID that isn't one", async () => {
    expect((await call(admin, "PATCH", "/settings", { discordChannels: [{ type: "text", name: "general" }] })).status).toBe(400);
    expect((await call(admin, "PATCH", "/settings", { discordCategoryId: "general" })).status).toBe(400);
  });

  it("take a test Discord server only on a dev server", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEV_LOGIN_ENABLED", "true");
    expect(await call(admin, "PATCH", "/settings", { discordGuildId: "700000000000000000" })).toMatchObject({ status: 400, body: { error: "The Discord server can only be changed on a dev server" } });

    vi.stubEnv("NODE_ENV", "development");
    const { status, body } = await call<{ bingo: Bingo }>(admin, "PATCH", "/settings", { discordGuildId: "700000000000000000" });
    expect(status).toBe(200);
    expect(body.bingo.discordGuildId).toBe("700000000000000000");
  });
});

describe("the status", () => {
  it("says why nothing is synced without a bot", async () => {
    const { status, body } = await call<DiscordSyncStatus>(admin, "GET", "/discord");
    expect(status).toBe(200);
    expect(body.blocker).toMatch(/no Discord bot/);
  });
});

describe("Remove from Discord", () => {
  it("turns the sync off even when what's left can't be removed, and says why", async () => {
    db.update(schema.bingos).set({ discordEnabled: true }).where(eq(schema.bingos.id, bingo.id)).run();
    db.insert(schema.discordResources).values({ bingoId: bingo.id, guildId: "100000000000000000", kind: "category", discordId: "900000000000000001" }).run();
    const { status, body } = await call<{ deleted: number; error: string | null; bingo: Bingo }>(admin, "POST", "/discord/remove", {});
    expect(status).toBe(200);
    expect(body.deleted).toBe(0);
    expect(body.error).toMatch(/DISCORD_BOT_TOKEN/);
    expect(body.bingo.discordEnabled).toBe(false);
  });
});
