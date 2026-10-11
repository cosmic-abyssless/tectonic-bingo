// Notifications (CONTEXT.md "Notification"): who hears of what, by the audit log the writes leave, and how it reaches
// them (the delivery chain, Discord DM folding). Real services over a real in-memory DB; the sockets are faked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { ServerSocketMessage } from "@bingo/shared";
import * as schema from "../db/schema";
import { claims, submissions } from "../db/schema";
import { createTestDb } from "../testUtils/testDb";

const presence = vi.hoisted(() => ({ byUser: new Map<string, { open: boolean; visible: boolean; hiddenWithPermission: boolean; hiddenWithoutPermission: boolean }>() }));
const sent = vi.hoisted(() => [] as { userId: string; msg: ServerSocketMessage | null }[]);
vi.mock("../ws", () => ({
  broadcast: vi.fn(),
  userPresence: (userId: string) => presence.byUser.get(userId) ?? { open: false, visible: false, hiddenWithPermission: false, hiddenWithoutPermission: false },
  sendToUser: (userId: string, pick: (p: unknown) => ServerSocketMessage | null) => {
    const p = presence.byUser.get(userId);
    if (!p?.open) return;
    sent.push({ userId, msg: pick(p.visible ? { visible: true, notifications: "default", bingoId: null } : { visible: false, notifications: p.hiddenWithPermission ? "granted" : "default", bingoId: null }) });
  },
}));

import { createTask, createTile } from "./boardService";
import { approveSubmission, rejectSubmission } from "./scoringService";
import { drainAuditLog, initAuditCursor } from "./notificationDispatch";
import { updateSettings } from "./notificationService";
import { audit } from "../audit/record";
import { cancelPendingDms, installDmHandoff, runDmRound, sendTestDm, setDiscordDmApiForTests, updateFoldingWindows, DmError, type DiscordDmApi } from "./notificationDm";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

type User = typeof schema.users.$inferSelect;
let mod: User;
let alice: User; // on Team A, credited with the drops
let bob: User; // on Team A
let carol: User; // on Team B
let bingo: typeof schema.bingos.$inferSelect;
let teamA: string;
let teamB: string;
let tileId: string;
let taskIds: string[];

const user = (name: string, isAdmin = false) => db.insert(schema.users).values({ discordId: `d-${name}`, discordUsername: name, isAdmin }).returning().get();

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
  presence.byUser.clear();
  sent.length = 0;
  mod = user("mod", true);
  alice = user("alice");
  bob = user("bob");
  carol = user("carol");
  bingo = db.insert(schema.bingos).values({ slug: "b1", name: "Summer", boardRows: 3, boardCols: 3, createdByUserId: mod.id, stage: "live" }).returning().get();
  teamA = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: alice.id, name: "Team A", codeword: "a" }).returning().get().id;
  teamB = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: carol.id, name: "Team B", codeword: "b" }).returning().get().id;
  db.insert(schema.teamMembers).values([{ teamId: teamA, userId: alice.id, isCaptain: true }, { teamId: teamA, userId: bob.id }, { teamId: teamB, userId: carol.id, isCaptain: true }]).run();
  for (const u of [alice, bob, carol]) db.insert(schema.signups).values({ bingoId: bingo.id, userId: u.id, rsn: `${u.discordUsername[0]!.toUpperCase()}${u.discordUsername.slice(1)}` }).run();
  const tile = createTile(db, { bingoId: bingo.id, name: "Vorkath", boardRow: 0, boardCol: 0 });
  tileId = tile.id;
  taskIds = [1, 2, 3].map((i) => createTask(db, tile.id, { label: `Part ${i}`, kind: "ITEM", itemName: `Item ${i}`, points: 10 * i }).id);
  // Nothing from setting the board up is news: the dispatcher starts reading here.
  initAuditCursor(db);
});

afterEach(() => {
  setDiscordDmApiForTests(undefined);
  sqlite.close();
});

function submit(teamId: string, userId: string, nodeId: string, itemName: string) {
  const s = db.insert(submissions).values({ teamId, submittedByUserId: userId }).returning().get();
  db.insert(claims).values({ submissionId: s.id, nodeId, itemName }).run();
  return s;
}

const inbox = (u: User) => db.select().from(schema.notifications).where(eq(schema.notifications.userId, u.id)).all();
const kindsOf = (u: User) => inbox(u).map((n) => n.kind).sort();

describe("who hears of what", () => {
  it("a user who never opted in gets nothing stored, whatever happens", () => {
    approveSubmission(db, { submissionId: submit(teamA, alice.id, taskIds[0]!, "Item 1").id, reviewedByUserId: mod.id });
    rejectSubmission(db, { submissionId: submit(teamA, alice.id, taskIds[1]!, "Item 2").id, reviewedByUserId: mod.id, reviewerNotes: "No codeword" });
    drainAuditLog(db);
    expect(db.select().from(schema.notifications).all()).toEqual([]);
  });

  it("In the app gets the default kinds and no others until they're turned on", () => {
    updateSettings(db, bob.id, { level: "app" });
    for (const [i, id] of taskIds.entries()) approveSubmission(db, { submissionId: submit(teamA, alice.id, id, `Item ${i + 1}`).id, reviewedByUserId: mod.id });
    drainAuditLog(db);
    // Team completed a Tile is a default; Team drop approved and Team completed a Part aren't.
    expect(kindsOf(bob)).toEqual(["team_tile_completed"]);

    updateSettings(db, bob.id, { kinds: { team_drop_approved: true } });
    const tile2 = createTile(db, { bingoId: bingo.id, name: "Zulrah", boardRow: 0, boardCol: 1 });
    const t = createTask(db, tile2.id, { label: "Pet", kind: "ITEM", itemName: "Snakeling", points: 5 });
    initAuditCursor(db);
    drainAuditLog(db);
    approveSubmission(db, { submissionId: submit(teamA, alice.id, t.id, "Snakeling").id, reviewedByUserId: mod.id });
    drainAuditLog(db);
    expect(kindsOf(bob)).toEqual(["team_drop_approved", "team_tile_completed", "team_tile_completed"]);
    expect(inbox(bob).find((n) => n.kind === "team_drop_approved")!.title).toBe("Alice's drop was approved");
  });

  it("never tells a Player of another Team's progress", () => {
    updateSettings(db, carol.id, { level: "app", kinds: { team_drop_approved: true, team_part_completed: true } });
    for (const [i, id] of taskIds.entries()) approveSubmission(db, { submissionId: submit(teamA, alice.id, id, `Item ${i + 1}`).id, reviewedByUserId: mod.id });
    drainAuditLog(db);
    expect(inbox(carol)).toEqual([]);
  });

  it("never tells someone what they did themselves", () => {
    // Alice reviews (as if a Moderator) a drop on her own Team: the reviewer is left out of who hears of it.
    updateSettings(db, alice.id, { level: "app", kinds: { team_drop_approved: true } });
    updateSettings(db, bob.id, { level: "app", kinds: { team_drop_approved: true } });
    approveSubmission(db, { submissionId: submit(teamA, bob.id, taskIds[0]!, "Item 1").id, reviewedByUserId: alice.id });
    drainAuditLog(db);
    expect(inbox(alice)).toEqual([]);
    expect(kindsOf(bob)).toEqual(["team_drop_approved"]);
  });

  it("says nothing of a Team's progress before the Bingo is Live (Sealed Tiles)", () => {
    db.update(schema.bingos).set({ stage: "reveal", sealedTiles: true }).where(eq(schema.bingos.id, bingo.id)).run();
    updateSettings(db, bob.id, { level: "app", kinds: { team_drop_approved: true, team_part_completed: true } });
    approveSubmission(db, { submissionId: submit(teamA, alice.id, taskIds[0]!, "Item 1").id, reviewedByUserId: mod.id });
    drainAuditLog(db);
    expect(inbox(bob)).toEqual([]);
  });

  it("tells the credited Player their drop was rejected, with the note", () => {
    updateSettings(db, alice.id, { level: "app" });
    rejectSubmission(db, { submissionId: submit(teamA, alice.id, taskIds[0]!, "Item 1").id, reviewedByUserId: mod.id, reviewerNotes: "No codeword" });
    drainAuditLog(db);
    expect(inbox(alice).map((n) => [n.kind, n.body])).toEqual([["drop_rejected", '"No codeword"']]);
  });

  it("a kind turned off stops, and turning the Level back on after Off keeps the choices", () => {
    updateSettings(db, alice.id, { level: "app", kinds: { drop_rejected: false, team_drop_approved: true } });
    rejectSubmission(db, { submissionId: submit(teamA, alice.id, taskIds[0]!, "Item 1").id, reviewedByUserId: mod.id });
    drainAuditLog(db);
    expect(inbox(alice)).toEqual([]);
    updateSettings(db, alice.id, { level: "off" });
    const back = updateSettings(db, alice.id, { level: "app" });
    expect(back.kinds).toEqual({ drop_rejected: false, team_drop_approved: true });
  });

  it("a Finished Bingo sends only that it went Finished; a Historical one nothing", () => {
    updateSettings(db, alice.id, { level: "app" });
    db.update(schema.bingos).set({ stage: "complete" }).where(eq(schema.bingos.id, bingo.id)).run();
    rejectSubmission(db, { submissionId: submit(teamA, alice.id, taskIds[0]!, "Item 1").id, reviewedByUserId: mod.id });
    audit(db, { action: "stage.changed", bingoId: bingo.id, entity: { type: "bingo", id: bingo.id }, details: { from: "live", to: "complete" }, actor: { userId: mod.id } });
    drainAuditLog(db);
    expect(kindsOf(alice)).toEqual(["bingo_stage"]);

    db.update(schema.bingos).set({ historical: true }).where(eq(schema.bingos.id, bingo.id)).run();
    audit(db, { action: "stage.changed", bingoId: bingo.id, entity: { type: "bingo", id: bingo.id }, details: { from: "live", to: "complete" }, actor: { userId: mod.id } });
    drainAuditLog(db);
    expect(kindsOf(alice)).toEqual(["bingo_stage"]);
  });

  it("tells Moderators a Submission is waiting, and a site-wide kind reaches every opted-in clan member", () => {
    updateSettings(db, mod.id, { level: "app" });
    updateSettings(db, carol.id, { level: "app", kinds: { bingo_open: true } });
    audit(db, { action: "submission.created", bingoId: bingo.id, teamId: teamA, entity: { type: "submission", id: null }, details: { tileId, tileName: "Vorkath", taskLabels: [], claims: [{ nodeId: taskIds[0]!, itemName: "Item 1", quantity: 1 }], screenshotUrl: "/x.png" }, actor: { userId: alice.id } });
    audit(db, { action: "stage.changed", bingoId: bingo.id, entity: { type: "bingo", id: bingo.id }, details: { from: "planning", to: "signup" }, actor: { userId: mod.id } });
    drainAuditLog(db);
    expect(inbox(mod).map((n) => [n.kind, n.body])).toEqual([["submissions_waiting", 'Team A: 1 Item 1 on "Vorkath"']]);
    expect(kindsOf(carol)).toEqual(["bingo_open"]);
  });
});

describe("delivery", () => {
  const rejectFor = (u: User) => {
    rejectSubmission(db, { submissionId: submit(teamA, u.id, taskIds[0]!, "Item 1").id, reviewedByUserId: mod.id });
    drainAuditLog(db);
  };

  it("a visible tab gets a toast", () => {
    updateSettings(db, alice.id, { level: "discord" });
    presence.byUser.set(alice.id, { open: true, visible: true, hiddenWithPermission: false, hiddenWithoutPermission: false });
    rejectFor(alice);
    expect(sent.map((s) => s.msg && "deliver" in s.msg && s.msg.deliver)).toEqual(["toast"]);
    expect(db.select().from(schema.notificationDmQueue).all()).toEqual([]);
  });

  it("only a hidden tab with permission at + Browser gets a browser notification, and no DM", () => {
    installDmHandoff();
    updateSettings(db, alice.id, { level: "discord" });
    presence.byUser.set(alice.id, { open: true, visible: false, hiddenWithPermission: true, hiddenWithoutPermission: false });
    rejectFor(alice);
    expect(sent.map((s) => s.msg && "deliver" in s.msg && s.msg.deliver)).toEqual(["browser"]);
    expect(db.select().from(schema.notificationDmQueue).all()).toEqual([]);
  });

  it("a hidden tab without permission at + Discord falls through to a DM", () => {
    installDmHandoff();
    updateSettings(db, alice.id, { level: "discord" });
    presence.byUser.set(alice.id, { open: true, visible: false, hiddenWithPermission: false, hiddenWithoutPermission: true });
    rejectFor(alice);
    expect(sent.map((s) => s.msg && "deliver" in s.msg && s.msg.deliver)).toEqual(["none"]);
    expect(db.select().from(schema.notificationDmQueue).all()).toHaveLength(1);
  });

  it("In the app never DMs", () => {
    installDmHandoff();
    updateSettings(db, alice.id, { level: "app" });
    rejectFor(alice);
    expect(db.select().from(schema.notificationDmQueue).all()).toEqual([]);
  });
});

describe("Discord DMs", () => {
  let dms: { discordId: string; content: string }[];
  let api: DiscordDmApi;
  beforeEach(() => {
    dms = [];
    api = { send: vi.fn(async (discordId: string, content: string) => void dms.push({ discordId, content })) };
    setDiscordDmApiForTests(api);
    installDmHandoff();
    updateSettings(db, bob.id, { level: "discord", kinds: { team_drop_approved: true } });
  });

  const approveAt = (i: number, at: Date) => {
    vi.setSystemTime(at);
    approveSubmission(db, { submissionId: submit(teamA, alice.id, taskIds[i]!, `Item ${i + 1}`).id, reviewedByUserId: mod.id });
    drainAuditLog(db);
  };

  it("folds three approvals within the window into one DM with a count, but keeps three Inbox entries", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const t0 = new Date("2026-10-11T12:00:00Z");
      approveAt(0, t0);
      approveAt(1, new Date(t0.getTime() + 4 * 60_000));
      approveAt(2, new Date(t0.getTime() + 9 * 60_000));
      expect(inbox(bob).filter((n) => n.kind === "team_drop_approved")).toHaveLength(3);
      // The third completed the Tile, which isn't folded: it went at once.
      expect(await runDmRound(db, new Date(t0.getTime() + 10 * 60_000))).toBe(1);
      expect(dms.map((d) => d.content.split("\n")[0])).toEqual(['**Your Team completed "Vorkath"**']);
      expect(await runDmRound(db, new Date(t0.getTime() + 15 * 60_000))).toBe(1);
      const folded = dms.find((d) => d.content.includes("drops approved"))!;
      expect(folded.content).toContain("Alice: 3 drops approved (+60) in Summer");
      expect(folded.discordId).toBe("d-bob");
    } finally {
      vi.useRealTimers();
    }
  });

  it("opening the site before the window ends drops the pending DM", async () => {
    const t0 = new Date();
    approveAt(0, t0);
    cancelPendingDms(db, bob.id);
    expect(await runDmRound(db, new Date(t0.getTime() + 60 * 60_000))).toBe(0);
    expect(dms).toEqual([]);
  });

  it("a folding window changed in Site admin applies to the next DM, no restart", async () => {
    updateFoldingWindows(db, { team_drop_approved: 0 }, mod.id);
    const t0 = new Date();
    approveAt(0, t0);
    expect(await runDmRound(db, new Date(t0.getTime() + 1000))).toBeGreaterThan(0);
  });

  it("a 50007 marks the user unreachable and stops DMs; Try again recovers", async () => {
    vi.mocked(api.send).mockRejectedValue(new DmError("Cannot send messages to this user", 50007));
    const t0 = new Date();
    updateFoldingWindows(db, { team_drop_approved: 0 }, mod.id);
    approveAt(0, t0);
    await runDmRound(db, new Date(t0.getTime() + 1000));
    const settings = () => db.select().from(schema.notificationSettings).where(eq(schema.notificationSettings.userId, bob.id)).get()!;
    expect(settings().discordUnreachableSince).not.toBeNull();
    approveAt(1, t0);
    expect(db.select().from(schema.notificationDmQueue).all()).toEqual([]);

    vi.mocked(api.send).mockImplementation(async (discordId, content) => void dms.push({ discordId, content }));
    expect((await sendTestDm(db, bob)).ok).toBe(true);
    expect(settings().discordUnreachableSince).toBeNull();
  });

  it("drops a Pairing request DM once it's been answered", async () => {
    updateSettings(db, carol.id, { level: "discord" });
    const pairing = db.insert(schema.signupPairings).values({ bingoId: bingo.id, requesterUserId: alice.id, targetDiscordId: carol.discordId, createdByUserId: alice.id }).returning().get();
    db.update(schema.bingos).set({ stage: "signup" }).where(eq(schema.bingos.id, bingo.id)).run();
    audit(db, { action: "pairing.requested", bingoId: bingo.id, entity: { type: "pairing", id: pairing.id }, details: { requesterUserId: alice.id, targetDiscordId: carol.discordId }, actor: { userId: alice.id } });
    drainAuditLog(db);
    db.update(schema.signupPairings).set({ status: "declined" }).where(eq(schema.signupPairings.id, pairing.id)).run();
    expect(await runDmRound(db, new Date(Date.now() + 1000))).toBe(0);
  });
});
