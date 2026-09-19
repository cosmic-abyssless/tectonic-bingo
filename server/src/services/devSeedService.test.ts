import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { createQuestion } from "./signupService";
import { deleteAllSignups, seedTestSignups } from "./devSeedService";
import type { TectonicRosterUser } from "./tectonicService";
import { parseWomSummary } from "./womService";
import { parseAccountType } from "./runeProfileService";
import { parseStoredCaStats } from "./combatAchievements";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

function seedBingo(overrides: Partial<typeof schema.bingos.$inferInsert> = {}) {
  const [admin] = db.insert(schema.users).values({ discordId: "admin", discordUsername: "admin" }).returning().all();
  return db.insert(schema.bingos).values({ slug: "test", name: "Test", boardRows: 3, boardCols: 3, createdByUserId: admin.id, stage: "signup", ...overrides }).returning().get();
}

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});
afterEach(() => {
  sqlite.close();
});

describe("seedTestSignups", () => {
  it("creates the requested number of active signups with distinct users", () => {
    const bingo = seedBingo();
    const { signups: created, source } = seedTestSignups(db, bingo, 5);

    expect(source).toBe("synthetic");
    expect(created).toHaveLength(5);
    expect(created.every((s) => s.status === "active")).toBe(true);
    expect(new Set(created.map((s) => s.userId)).size).toBe(5);
  });

  it("auto-answers every signup question so required ones don't block creation", () => {
    const bingo = seedBingo();
    createQuestion(db, { bingoId: bingo.id, prompt: "Willing to captain?", type: "boolean", required: true });
    createQuestion(db, { bingoId: bingo.id, prompt: "Preferred role", type: "select", optionsJson: JSON.stringify(["dps", "support"]), required: true });

    const { signups: created } = seedTestSignups(db, bingo, 3);
    expect(created).toHaveLength(3);

    const answers = db.select().from(schema.signupAnswers).where(eq(schema.signupAnswers.signupId, created[0]!.id)).all();
    expect(answers).toHaveLength(2);
    const boolAnswer = answers.find((a) => ["true", "false"].includes(a.value));
    expect(boolAnswer).toBeDefined();
    const selectAnswer = answers.find((a) => a.value === "dps" || a.value === "support");
    expect(selectAnswer).toBeDefined();
  });

  it("rejects seeding outside the signup stage, same as a real player would be", () => {
    const bingo = seedBingo({ stage: "captains" });
    expect(() => seedTestSignups(db, bingo, 3)).toThrow(/signup stage/i);
  });

  function rosterUser(userId: string, rsn: string, womId: string): TectonicRosterUser {
    return { user_id: userId, guild_id: "g", points: 0, rsns: [{ rsn, wom_id: womId }] };
  }

  it("draws real, verified signups from the tectonic roster before falling back to TestBots", () => {
    const bingo = seedBingo();
    const roster = [rosterUser("111", "RealOne", "w1"), rosterUser("222", "RealTwo", "w2")];

    const { signups: created, source } = seedTestSignups(db, bingo, 3, roster);

    expect(source).toBe("mixed");
    expect(created).toHaveLength(3);
    const rsns = created.map((s) => s.rsn).sort();
    expect(rsns).toEqual(["RealOne", "RealTwo", "TestBot3"].sort());
    const real = created.filter((s) => s.rsnVerified);
    expect(real).toHaveLength(2);
    expect(real.map((s) => s.womId).sort()).toEqual(["w1", "w2"]);
  });

  it("skips roster members who already have a signup for this bingo (any status)", () => {
    const bingo = seedBingo();
    seedTestSignups(db, bingo, 1, [rosterUser("111", "RealOne", "w1")]);

    const { signups: created } = seedTestSignups(db, bingo, 1, [rosterUser("111", "RealOne", "w1"), rosterUser("222", "RealTwo", "w2")]);
    expect(created[0]!.rsn).toBe("RealTwo");
  });

  it("reuses an existing user row for a real member instead of double-inserting", () => {
    const bingo = seedBingo();
    db.insert(schema.users).values({ discordId: "111", discordUsername: "RealOne" }).run();

    const [created] = seedTestSignups(db, bingo, 1, [rosterUser("111", "RealOne", "w1")]).signups;
    const matchingUsers = db.select().from(schema.users).where(eq(schema.users.discordId, "111")).all();
    expect(matchingUsers).toHaveLength(1);
    expect(created!.userId).toBe(matchingUsers[0]!.id);
  });

  it("ignores roster entries with no linked RSN", () => {
    const bingo = seedBingo();
    const noRsn: TectonicRosterUser = { user_id: "333", guild_id: "g", points: 0, rsns: [] };

    const { signups: created } = seedTestSignups(db, bingo, 1, [noRsn]);
    expect(created[0]!.rsn).toBe("TestBot1");
    expect(created[0]!.rsnVerified).toBe(false);
  });

  it("fabricates parseable WOM/RuneProfile stats locally for every seeded signup, real and TestBot alike, without any network call", () => {
    const bingo = seedBingo();
    const roster = [rosterUser("111", "RealOne", "w1")];

    const { signups: created } = seedTestSignups(db, bingo, 3, roster); // 1 real + 2 TestBots
    expect(created).toHaveLength(3);

    for (const signup of created) {
      const row = db.select().from(schema.signups).where(eq(schema.signups.id, signup.id)).get()!;
      expect(row.womDataJson).not.toBeNull();
      expect(row.runeProfileDataJson).not.toBeNull();
      expect(row.statsFetchedAt).not.toBeNull();

      const womSummary = parseWomSummary(JSON.parse(row.womDataJson!));
      expect(womSummary).not.toBeNull();
      expect(typeof womSummary!.ehb).toBe("number");

      const accountType = parseAccountType(JSON.parse(row.runeProfileDataJson!));
      expect(accountType).not.toBeNull();

      const ca = parseStoredCaStats(row.caCurrentJson);
      expect(ca).not.toBeNull();
      expect(ca!.points).toBeGreaterThanOrEqual(0);
      expect(row.caPeakJson).toBe(row.caCurrentJson);
    }
  });
});

describe("deleteAllSignups", () => {
  it("removes every signup and its answers for the bingo only", () => {
    const bingo = seedBingo();
    const other = db.insert(schema.bingos).values({ slug: "other", name: "Other", boardRows: 3, boardCols: 3, createdByUserId: bingo.createdByUserId, stage: "signup" }).returning().get();
    createQuestion(db, { bingoId: bingo.id, prompt: "Willing to captain?", type: "boolean", required: true });
    seedTestSignups(db, bingo, 3);
    seedTestSignups(db, other, 2);

    expect(deleteAllSignups(db, bingo.id)).toBe(3);

    expect(db.select().from(schema.signups).where(eq(schema.signups.bingoId, bingo.id)).all()).toHaveLength(0);
    expect(db.select().from(schema.signupAnswers).all()).toHaveLength(0);
    expect(db.select().from(schema.signups).where(eq(schema.signups.bingoId, other.id)).all()).toHaveLength(2);
  });
});

describe("audit trail", () => {
  it("seedTestSignups records dev.signups_seeded as a dev actor, alongside the individual signup.created rows", () => {
    const bingo = seedBingo();
    seedTestSignups(db, bingo, 3);

    const row = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "dev.signups_seeded")).get()!;
    expect(row.actorType).toBe("dev");
    expect(JSON.parse(row.details)).toEqual({ count: 3, source: "synthetic" });
    expect(db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "signup.created")).all()).toHaveLength(3);
  });

  it("deleteAllSignups records dev.signups_wiped, and no-ops when there's nothing to delete", () => {
    const bingo = seedBingo();
    seedTestSignups(db, bingo, 2);
    deleteAllSignups(db, bingo.id);
    const row = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "dev.signups_wiped")).get()!;
    expect(row.actorType).toBe("dev");
    expect(JSON.parse(row.details)).toEqual({ deleted: 2 });

    deleteAllSignups(db, bingo.id);
    expect(db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "dev.signups_wiped")).all()).toHaveLength(1);
  });
});
