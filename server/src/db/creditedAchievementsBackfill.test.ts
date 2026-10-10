import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { and, eq } from "drizzle-orm";
import fs from "fs";
import path from "path";
import * as schema from "./schema";
import { createTestDb } from "../testUtils/testDb";

// The data migration that gives a Submission's Achievements to the Player it's credited to, for drops a teammate posted
// for them before that was the rule. Run here against a seeded DB, as it runs on deploy. Rows are seeded the way the
// old live path wrote them: the posting activity under the poster.
const backfill = fs.readFileSync(path.resolve(__dirname, "../../drizzle/0066_achievements_to_credited.sql"), "utf8").replace(/--> statement-breakpoint/g, "");

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});
afterEach(() => {
  sqlite.close();
});

const DAY = 24 * 60 * 60 * 1000;
const START = new Date("2026-03-01T12:00:00Z");
const KEYS = ["strong_start", "night_owl", "early_bird", "regular", "globetrotter", "called_it", "big_spender", "partner_slayer"] as const;

const mkUser = (name: string) => db.insert(schema.users).values({ discordId: name, discordUsername: name }).returning().get();

/** A Bingo at `stage` with one Team of `members`, five Tiles of one Part each (the Part is the Item), and `keys` switched on at `switchedOnAt`. */
function seedBingo(slug: string, stage: (typeof schema.bingos.$inferSelect)["stage"], members: { id: string }[], opts: { keys?: readonly string[]; switchedOnAt?: Date } = {}) {
  const bingo = db.insert(schema.bingos).values({ slug, name: slug, boardRows: 1, boardCols: 5, createdByUserId: members[0]!.id, stage }).returning().get();
  for (const key of opts.keys ?? KEYS) {
    db.insert(schema.bingoAchievementSettings).values({ bingoId: bingo.id, achievementKey: key, enabled: true, firstSwitchedOnAt: opts.switchedOnAt ?? new Date(0) }).run();
  }
  const team = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: members[0]!.id, name: "Team", codeword: `${slug}-team` }).returning().get();
  db.insert(schema.teamMembers).values(members.map((m, i) => ({ teamId: team.id, userId: m.id, isCaptain: i === 0 }))).run();
  const tiles = [0, 1, 2, 3, 4].map((col) => {
    const root = db.insert(schema.nodes).values({ bingoId: bingo.id, kind: "ALL" }).returning().get();
    const part = db.insert(schema.nodes).values({ bingoId: bingo.id, kind: "ITEM", itemName: "x", label: "Part" }).returning().get();
    db.insert(schema.nodeEdges).values({ parentId: root.id, childId: part.id, sortOrder: 0 }).run();
    const tile = db.insert(schema.tiles).values({ bingoId: bingo.id, name: `Tile ${col}`, boardRow: 0, boardCol: col, nodeId: root.id }).returning().get();
    return { tile, part };
  });

  /** A drop on Tile `tileIdx`, credited to `credited`, posted by `poster`, `days` after START at local `hour`, worth `gp`. */
  function drop(credited: { id: string }, poster: { id: string } | null, opts: { tileIdx?: number; days?: number; hour?: number; gp?: number } = {}) {
    const { tile, part } = tiles[opts.tileIdx ?? 0]!;
    const at = new Date(START.getTime() + (opts.days ?? 0) * DAY);
    const sub = db
      .insert(schema.submissions)
      .values({ teamId: team.id, submittedByUserId: credited.id, postedByUserId: poster?.id ?? null, submittedAt: at, createdAt: at, updatedAt: at })
      .returning()
      .get();
    db.insert(schema.claims).values({ submissionId: sub.id, nodeId: part.id, itemName: "x", quantity: 1, gpValue: opts.gp ?? null }).run();
    db.insert(schema.achievementActivity)
      .values({
        bingoId: bingo.id,
        userId: (poster ?? credited).id,
        kind: "posted",
        subjectId: sub.id,
        tileId: tile.id,
        creditedUserId: credited.id,
        teamId: team.id,
        localDate: at.toISOString().slice(0, 10),
        localHour: opts.hour ?? 12,
        occurredAt: at,
      })
      .run();
    return sub;
  }
  const interest = (user: { id: string }, tileIdx = 0) => db.insert(schema.tileInterests).values({ tileId: tiles[tileIdx]!.tile.id, taskId: tiles[tileIdx]!.part.id, teamId: team.id, userId: user.id }).run();
  const earn = (user: { id: string }, key: string) => db.insert(schema.achievementEarned).values({ bingoId: bingo.id, userId: user.id, achievementKey: key, earnedAt: START, popupShownAt: START }).run();
  return { bingo, drop, interest, earn };
}

const earnedKeys = (bingoId: string, userId: string) =>
  db
    .select({ key: schema.achievementEarned.achievementKey })
    .from(schema.achievementEarned)
    .where(and(eq(schema.achievementEarned.bingoId, bingoId), eq(schema.achievementEarned.userId, userId)))
    .all()
    .map((r) => r.key)
    .sort();
const postedBy = (bingoId: string) =>
  db
    .select({ userId: schema.achievementActivity.userId, subjectId: schema.achievementActivity.subjectId })
    .from(schema.achievementActivity)
    .where(and(eq(schema.achievementActivity.bingoId, bingoId), eq(schema.achievementActivity.kind, "posted")))
    .all();

describe("Achievements to the credited Player backfill (0066)", () => {
  it("moves a teammate-posted drop's posting activity to the credited Player, and gives them what it earns", () => {
    const [alice, bob] = ["alice", "bob"].map(mkUser) as [ReturnType<typeof mkUser>, ReturnType<typeof mkUser>];
    const live = seedBingo("live", "live", [alice, bob]);
    // bob posts alice's 30m drop at 03:00 on Tile 0, which alice has interest marked on; he earned the old way.
    const forAlice = live.drop(alice, bob, { hour: 3, gp: 30_000_000 });
    live.interest(alice);
    live.earn(bob, "strong_start");
    live.earn(bob, "partner_slayer");
    // alice's own drops on four more days and Tiles: with bob's post, 5 of each.
    [1, 2, 3, 4].forEach((i) => live.drop(alice, null, { tileIdx: i, days: i }));
    live.earn(alice, "strong_start");

    sqlite.exec(backfill);

    expect(postedBy(live.bingo.id).find((r) => r.subjectId === forAlice.id)!.userId).toBe(alice.id);
    expect(earnedKeys(live.bingo.id, alice.id)).toEqual(["big_spender", "called_it", "globetrotter", "night_owl", "regular", "strong_start"]);
    // bob keeps what he had and gains nothing.
    expect(earnedKeys(live.bingo.id, bob.id)).toEqual(["partner_slayer", "strong_start"]);

    const added = db.select().from(schema.achievementEarned).where(and(eq(schema.achievementEarned.userId, alice.id), eq(schema.achievementEarned.achievementKey, "night_owl"))).get()!;
    expect(added.popupShownAt).toBeNull();
    const audits = db.select().from(schema.auditLog).where(and(eq(schema.auditLog.action, "achievement.earned"), eq(schema.auditLog.actorUserId, alice.id))).all();
    expect(audits.map((a) => a.entityId).sort()).toEqual(["big_spender", "called_it", "globetrotter", "night_owl", "regular"]);
    expect(JSON.parse(audits.find((a) => a.entityId === "big_spender")!.details)).toEqual({ key: "big_spender", name: "Moneybags" });
  });

  it("only counts activity since each Achievement was switched on, and only ones that are", () => {
    const [alice, bob] = ["alice", "bob"].map(mkUser) as [ReturnType<typeof mkUser>, ReturnType<typeof mkUser>];
    const late = seedBingo("late", "live", [alice, bob], { switchedOnAt: new Date(START.getTime() + DAY) });
    late.drop(alice, bob, { hour: 3 });
    const off = seedBingo("off", "live", [bob, alice], { keys: ["night_owl"] });
    off.drop(alice, bob, { hour: 7 });

    sqlite.exec(backfill);

    expect(earnedKeys(late.bingo.id, alice.id)).toEqual([]);
    expect(earnedKeys(off.bingo.id, alice.id)).toEqual([]);
  });

  it("leaves a Bingo that isn't Live, and a credited Player who isn't on its Teams, alone", () => {
    const [alice, bob, dave] = ["alice", "bob", "dave"].map(mkUser) as [ReturnType<typeof mkUser>, ReturnType<typeof mkUser>, ReturnType<typeof mkUser>];
    const finished = seedBingo("finished", "complete", [alice, bob]);
    finished.drop(alice, bob);
    const live = seedBingo("live", "live", [bob]);
    live.drop(dave, bob); // dave isn't on the Team

    sqlite.exec(backfill);

    expect(earnedKeys(finished.bingo.id, alice.id)).toEqual([]);
    expect(postedBy(finished.bingo.id)[0]!.userId).toBe(bob.id);
    expect(earnedKeys(live.bingo.id, dave.id)).toEqual([]);
  });

  it("doesn't earn Called it without interest on the drop's Part, nor Moneybags under 25m", () => {
    const [alice, bob] = ["alice", "bob"].map(mkUser) as [ReturnType<typeof mkUser>, ReturnType<typeof mkUser>];
    const live = seedBingo("live", "live", [alice, bob]);
    live.drop(alice, bob, { gp: 24_000_000 });
    live.interest(alice, 1); // a different Tile's Part
    live.interest(bob); // the poster's interest, not hers

    sqlite.exec(backfill);

    expect(earnedKeys(live.bingo.id, alice.id)).toEqual(["strong_start"]);
  });
});
