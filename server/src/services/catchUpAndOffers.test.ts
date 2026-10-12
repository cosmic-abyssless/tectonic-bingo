// Catch-up (CONTEXT.md) and the one-time offers: real services over a real in-memory DB.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import { claims, submissions } from "../db/schema";
import { createTestDb } from "../testUtils/testDb";

vi.mock("../ws", () => ({ broadcast: vi.fn(), userPresence: () => ({ open: false, visible: false, hiddenWithPermission: false, hiddenWithoutPermission: false }), sendToUser: vi.fn() }));

import { createTask, createTile } from "./boardService";
import { approveSubmission } from "./scoringService";
import { dismissCatchUp, getCatchUp, recordBingoPresence } from "./catchUpService";
import { getSettings, updateSettings } from "./notificationService";
import { answerOffer, claimOffer } from "./notificationOffers";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;
type User = typeof schema.users.$inferSelect;
let mod: User;
let alice: User;
let bob: User;
let carol: User;
let bingo: typeof schema.bingos.$inferSelect;
let teamA: string;
let teamB: string;
let tasks: string[];

const user = (name: string, isAdmin = false) => db.insert(schema.users).values({ discordId: `d-${name}`, discordUsername: name, isAdmin }).returning().get();
const HOUR = 3_600_000;
const t0 = new Date("2026-10-10T12:00:00Z");

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
  mod = user("mod", true);
  alice = user("alice");
  bob = user("bob");
  carol = user("carol");
  bingo = db.insert(schema.bingos).values({ slug: "b1", name: "Summer", boardRows: 3, boardCols: 3, createdByUserId: mod.id, stage: "live" }).returning().get();
  teamA = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: alice.id, name: "Team A", codeword: "a" }).returning().get().id;
  teamB = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: carol.id, name: "Team B", codeword: "b" }).returning().get().id;
  db.insert(schema.teamMembers).values([{ teamId: teamA, userId: alice.id, isCaptain: true }, { teamId: teamA, userId: bob.id }, { teamId: teamB, userId: carol.id, isCaptain: true }]).run();
  for (const u of [alice, bob, carol]) db.insert(schema.signups).values({ bingoId: bingo.id, userId: u.id, rsn: u.discordUsername }).run();
  const tile = createTile(db, { bingoId: bingo.id, name: "Vorkath", boardRow: 0, boardCol: 0 });
  tasks = [1, 2].map((i) => createTask(db, tile.id, { label: `Part ${i}`, kind: "ITEM", itemName: `Item ${i}`, points: 10 }).id);
});

afterEach(() => {
  vi.useRealTimers();
  sqlite.close();
});

function approveAt(teamId: string, userId: string, nodeId: string, item: string, at: Date) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(at);
  const s = db.insert(submissions).values({ teamId, submittedByUserId: userId, submittedAt: at }).returning().get();
  db.insert(claims).values({ submissionId: s.id, nodeId, itemName: item }).run();
  approveSubmission(db, { submissionId: s.id, reviewedByUserId: mod.id });
  vi.useRealTimers();
}

describe("Catch-up", () => {
  it("on by default", () => {
    expect(getSettings(db, bob.id).catchUpEnabled).toBe(true);
  });

  it("off: no card ever", () => {
    updateSettings(db, bob.id, { catchUpEnabled: false });
    recordBingoPresence(db, bob.id, bingo.id, t0);
    approveAt(teamA, alice.id, tasks[0]!, "Item 1", new Date(t0.getTime() + HOUR));
    expect(getCatchUp(db, bingo, bob, new Date(t0.getTime() + 5 * HOUR))).toMatchObject({ enabled: false, sections: [] });
  });

  it("on: coming back after teammates' drops shows exactly the time since the last visit, and nothing of other Teams", () => {
    updateSettings(db, bob.id, { catchUpEnabled: true });
    approveAt(teamA, alice.id, tasks[0]!, "Item 1", new Date(t0.getTime() - HOUR)); // before the last visit
    recordBingoPresence(db, bob.id, bingo.id, t0);
    approveAt(teamA, alice.id, tasks[1]!, "Item 2", new Date(t0.getTime() + HOUR));
    approveAt(teamB, carol.id, tasks[0]!, "Item 1", new Date(t0.getTime() + 2 * HOUR));
    const catchUp = getCatchUp(db, bingo, bob, new Date(t0.getTime() + 5 * HOUR));
    expect(catchUp.since).toBe(t0.toISOString());
    const text = catchUp.sections.flatMap((s) => s.lines.map((l) => l.text)).join(" | ");
    expect(text).toContain("+10 points"); // Part 2 only: Part 1 came before the last visit
    expect(text).toContain("1 Tile completed: Vorkath");
    expect(text).not.toContain("carol");
    // A Player doesn't see the scoreboard while it's Live.
    expect(text).not.toContain("Standing");
  });

  it("never the standings, even to an Admin on a Team who can see the scoreboard", () => {
    db.update(schema.users).set({ isAdmin: true }).where(eq(schema.users.id, bob.id)).run();
    const admin = { ...bob, isAdmin: true };
    recordBingoPresence(db, admin.id, bingo.id, t0);
    approveAt(teamA, alice.id, tasks[0]!, "Item 1", new Date(t0.getTime() + HOUR));
    const text = getCatchUp(db, bingo, admin, new Date(t0.getTime() + 5 * HOUR)).sections.flatMap((s) => s.lines.map((l) => l.text)).join(" | ");
    expect(text).toContain("+10 points");
    expect(text).not.toMatch(/standing|of 2/i);
  });

  it("nothing new: no card", () => {
    updateSettings(db, bob.id, { catchUpEnabled: true });
    recordBingoPresence(db, bob.id, bingo.id, t0);
    approveAt(teamB, carol.id, tasks[0]!, "Item 1", new Date(t0.getTime() + HOUR));
    expect(getCatchUp(db, bingo, bob, new Date(t0.getTime() + 5 * HOUR)).sections).toEqual([]);
  });

  it("Got it hides it until the next visit", () => {
    updateSettings(db, bob.id, { catchUpEnabled: true });
    recordBingoPresence(db, bob.id, bingo.id, t0);
    approveAt(teamA, alice.id, tasks[0]!, "Item 1", new Date(t0.getTime() + HOUR));
    const back = new Date(t0.getTime() + 5 * HOUR);
    recordBingoPresence(db, bob.id, bingo.id, back);
    expect(getCatchUp(db, bingo, bob, back).sections.length).toBeGreaterThan(0);
    dismissCatchUp(db, bob.id, bingo.id, back);
    expect(getCatchUp(db, bingo, bob, new Date(back.getTime() + 60_000)).sections).toEqual([]);
    // The next visit, after a teammate's drop meanwhile, shows again.
    approveAt(teamA, alice.id, tasks[1]!, "Item 2", new Date(back.getTime() + HOUR));
    expect(getCatchUp(db, bingo, bob, new Date(back.getTime() + 3 * HOUR)).sections.length).toBeGreaterThan(0);
  });
});

describe("offers", () => {
  it("at most one per user per Bingo, never again once dismissed, and Turn on turns Notifications on", () => {
    const other = db.insert(schema.bingos).values({ slug: "b2", name: "Winter", boardRows: 3, boardCols: 3, createdByUserId: mod.id }).returning().get();
    expect(claimOffer(db, bob.id, bingo.id, "mod_panel")).toBe(true);
    // The same page loading again still shows it; another offer in this Bingo doesn't.
    expect(claimOffer(db, bob.id, bingo.id, "mod_panel")).toBe(true);
    expect(claimOffer(db, bob.id, bingo.id, "draft_room")).toBe(false);
    answerOffer(db, bob.id, bingo.id, "mod_panel", false);
    expect(claimOffer(db, bob.id, bingo.id, "mod_panel")).toBe(false);
    expect(claimOffer(db, bob.id, other.id, "mod_panel")).toBe(false);
    expect(claimOffer(db, bob.id, other.id, "draft_room")).toBe(true);
    answerOffer(db, bob.id, other.id, "draft_room", true);
    expect(getSettings(db, bob.id).level).toBe("app");
    // Already on: nothing more is offered.
    const third = db.insert(schema.bingos).values({ slug: "b3", name: "Spring", boardRows: 3, boardCols: 3, createdByUserId: mod.id }).returning().get();
    expect(claimOffer(db, bob.id, third.id, "first_submission")).toBe(false);
  });
});
