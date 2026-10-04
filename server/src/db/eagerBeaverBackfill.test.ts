import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { and, eq } from "drizzle-orm";
import fs from "fs";
import path from "path";
import * as schema from "./schema";
import { createTestDb } from "../testUtils/testDb";

// The data migration that gives Eager beaver to Players who marked Task interest before it was earnable in Board
// revealed (#464). Run here against a seeded DB, as it runs on deploy.
const backfill = fs.readFileSync(path.resolve(__dirname, "../../drizzle/0063_eager_beaver_backfill.sql"), "utf8").replace(/--> statement-breakpoint/g, "");

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});
afterEach(() => {
  sqlite.close();
});

const mkUser = (name: string) => db.insert(schema.users).values({ discordId: name, discordUsername: name }).returning().get();

/** A Bingo at `stage` with one Team of `members`, one Tile with a Task, and Eager beaver switched `on`. */
function seedBingo(slug: string, stage: (typeof schema.bingos.$inferSelect)["stage"], members: { id: string }[], on = true) {
  const bingo = db.insert(schema.bingos).values({ slug, name: slug, boardRows: 1, boardCols: 1, createdByUserId: members[0]!.id, stage }).returning().get();
  db.insert(schema.bingoAchievementSettings).values({ bingoId: bingo.id, achievementKey: "eager_beaver", enabled: on, firstSwitchedOnAt: new Date(0) }).run();
  const team = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: members[0]!.id, name: "Team", codeword: `${slug}-team` }).returning().get();
  db.insert(schema.teamMembers).values(members.map((m, i) => ({ teamId: team.id, userId: m.id, isCaptain: i === 0 }))).run();
  const node = db.insert(schema.nodes).values({ bingoId: bingo.id, kind: "ALL" }).returning().get();
  const tile = db.insert(schema.tiles).values({ bingoId: bingo.id, name: "Tile", boardRow: 0, boardCol: 0, nodeId: node.id }).returning().get();
  const tasks = [0, 1].map(() => db.insert(schema.nodes).values({ bingoId: bingo.id, kind: "MANUAL", label: "Task" }).returning().get());
  const mark = (userId: string, task = 0) => db.insert(schema.tileInterests).values({ tileId: tile.id, taskId: tasks[task]!.id, teamId: team.id, userId }).run();
  return { bingo, team, mark };
}

const earners = (bingoId: string) =>
  db
    .select({ userId: schema.achievementEarned.userId, popupShownAt: schema.achievementEarned.popupShownAt })
    .from(schema.achievementEarned)
    .where(and(eq(schema.achievementEarned.bingoId, bingoId), eq(schema.achievementEarned.achievementKey, "eager_beaver")))
    .all();
const audits = (bingoId: string) =>
  db.select().from(schema.auditLog).where(and(eq(schema.auditLog.bingoId, bingoId), eq(schema.auditLog.action, "achievement.earned"))).all();

describe("Eager beaver backfill (0063)", () => {
  it("awards exactly the Players with interest marked in a Bingo in Board revealed or Live, with the popup still to play and an audit entry", () => {
    const [alice, bob, carol, dave, erin] = ["alice", "bob", "carol", "dave", "erin"].map(mkUser) as [ReturnType<typeof mkUser>, ...ReturnType<typeof mkUser>[]];
    const reveal = seedBingo("reveal", "reveal", [alice, bob!, carol!]);
    reveal.mark(alice.id);
    reveal.mark(alice.id, 1); // two marks, one earn
    reveal.mark(bob!.id);
    reveal.mark(dave!.id); // not on a Team in this Bingo
    // carol marked nothing.
    const live = seedBingo("live", "live", [erin!]);
    live.mark(erin!.id);
    const finished = seedBingo("finished", "complete", [dave!]);
    finished.mark(dave!.id);

    sqlite.exec(backfill);

    expect(earners(reveal.bingo.id).map((e) => e.userId).sort()).toEqual([alice.id, bob!.id].sort());
    expect(earners(reveal.bingo.id).every((e) => e.popupShownAt === null)).toBe(true);
    expect(earners(live.bingo.id).map((e) => e.userId)).toEqual([erin!.id]);
    expect(earners(finished.bingo.id)).toEqual([]);

    const entries = audits(reveal.bingo.id);
    expect(entries.map((a) => a.actorUserId).sort()).toEqual([alice.id, bob!.id].sort());
    expect(entries[0]).toMatchObject({ entityType: "achievement", entityId: "eager_beaver", entityLabel: "Eager beaver", visibility: "mods", actorRole: "player" });
    expect(JSON.parse(entries[0]!.details)).toEqual({ key: "eager_beaver", name: "Eager beaver" });
  });

  it("is idempotent, and leaves a Player who already earned it alone", () => {
    const [alice, bob] = ["alice", "bob"].map(mkUser) as [ReturnType<typeof mkUser>, ReturnType<typeof mkUser>];
    const { bingo, mark } = seedBingo("reveal", "reveal", [alice, bob]);
    mark(alice.id);
    mark(bob.id);
    const earlier = new Date("2026-01-01T00:00:00Z");
    db.insert(schema.achievementEarned).values({ bingoId: bingo.id, userId: bob.id, achievementKey: "eager_beaver", earnedAt: earlier, popupShownAt: earlier }).run();

    sqlite.exec(backfill);
    sqlite.exec(backfill);

    expect(earners(bingo.id)).toHaveLength(2);
    expect(earners(bingo.id).find((e) => e.userId === bob.id)!.popupShownAt).toEqual(earlier);
    expect(audits(bingo.id).map((a) => a.actorUserId)).toEqual([alice.id]);
  });

  it("skips a Bingo where Eager beaver is switched off", () => {
    const alice = mkUser("alice");
    const { bingo, mark } = seedBingo("off", "reveal", [alice], false);
    mark(alice.id);
    sqlite.exec(backfill);
    expect(earners(bingo.id)).toEqual([]);
    expect(audits(bingo.id)).toEqual([]);
  });
});
