import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { upsertLoginUser } from "./discord";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
  delete process.env.ADMIN_DISCORD_IDS;
});

afterEach(() => {
  sqlite.close();
});

describe("upsertLoginUser", () => {
  it("creates a new user from a Discord profile", async () => {
    const user = await upsertLoginUser(db, { id: "111", username: "alice" }, "AliceInGuild");
    expect(user.discordId).toBe("111");
    expect(user.discordUsername).toBe("alice");
    expect(user.discordGuildNick).toBe("AliceInGuild");
    expect(user.isAdmin).toBe(false);
  });

  it("bootstraps a user in ADMIN_DISCORD_IDS as admin", async () => {
    process.env.ADMIN_DISCORD_IDS = "111,222";
    const user = await upsertLoginUser(db, { id: "111", username: "alice" }, null);
    expect(user.isAdmin).toBe(true);
  });

  it("upserts on repeat login, updating profile fields", async () => {
    await upsertLoginUser(db, { id: "111", username: "alice" }, null);
    const second = await upsertLoginUser(db, { id: "111", username: "alice_renamed" }, "NewNick");
    const all = await db.select().from(schema.users);
    expect(all).toHaveLength(1);
    expect(second.discordUsername).toBe("alice_renamed");
    expect(second.discordGuildNick).toBe("NewNick");
  });

  it("elevates but never demotes admin status", async () => {
    process.env.ADMIN_DISCORD_IDS = "111";
    await upsertLoginUser(db, { id: "111", username: "alice" }, null);

    // Simulate the env var being removed on a later login — admin status
    // must stick because it may have since been granted via the admin panel.
    delete process.env.ADMIN_DISCORD_IDS;
    const second = await upsertLoginUser(db, { id: "111", username: "alice" }, null);
    expect(second.isAdmin).toBe(true);
  });
});
