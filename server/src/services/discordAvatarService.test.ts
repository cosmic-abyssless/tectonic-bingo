import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { APIGuildMember } from "discord-api-types/v10";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { log } from "../log";
import { refreshDiscordAvatars, type ReadMember } from "./discordAvatarService";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});

afterEach(() => {
  sqlite.close();
  vi.restoreAllMocks();
});

const ALICE = "100000000000000001";
const BOB = "100000000000000002";
const CAROL = "100000000000000003";

function addUser(discordId: string, discordAvatar: string | null = null, discordGuildAvatar: string | null = null) {
  db.insert(schema.users).values({ discordId, discordUsername: discordId, discordAvatar, discordGuildAvatar }).run();
}

function pictures() {
  return Object.fromEntries(db.select().from(schema.users).all().map((u) => [u.discordId, [u.discordAvatar, u.discordGuildAvatar]]));
}

const member = (avatar: string | null, userAvatar: string | null) => ({ avatar, user: { avatar: userAvatar } }) as APIGuildMember;

describe("refreshDiscordAvatars", () => {
  it("stores each member's server picture and global picture, and clears a server picture for someone who left", async () => {
    addUser(ALICE, "old");
    addUser(BOB, "bob", "999/gone");
    addUser(CAROL, "carol");
    const members: Record<string, APIGuildMember | null> = { [ALICE]: member("server", "new"), [BOB]: null, [CAROL]: member(null, "carol") };

    const result = await refreshDiscordAvatars(db, "999", async (id) => members[id]);

    expect(pictures()).toEqual({ [ALICE]: ["new", "999/server"], [BOB]: ["bob", null], [CAROL]: ["carol", null] });
    expect(result).toEqual({ read: 3, changed: 2 });
  });

  it("skips users who aren't on Discord (dev and generated users)", async () => {
    addUser("dev-admin");
    addUser("testdata-20261016-0039-74");
    const readMember = vi.fn<ReadMember>(async () => null);

    await refreshDiscordAvatars(db, "999", readMember);

    expect(readMember).not.toHaveBeenCalled();
  });

  it("stops at the first lookup Discord can't answer, keeping what's stored", async () => {
    vi.spyOn(log, "warn").mockImplementation(() => {});
    addUser(ALICE, "a", "999/a");
    addUser(BOB, "b", "999/b");
    const readMember = vi.fn<ReadMember>(async () => {
      throw new Error("Discord is down");
    });

    const result = await refreshDiscordAvatars(db, "999", readMember);

    expect(readMember).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ read: 0, changed: 0 });
    expect(pictures()).toEqual({ [ALICE]: ["a", "999/a"], [BOB]: ["b", "999/b"] });
  });
});
