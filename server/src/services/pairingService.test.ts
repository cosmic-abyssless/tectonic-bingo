import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { createSignup, withdrawSignup } from "./signupService";
import { adminPair, cancelRequest, getAcceptedPairs, getPairingState, getUnpairedSignups, leavePairing, removePairing, requestPairing, respondToRequest, unpair } from "./pairingService";
import { ServiceError } from "./errors";
import { runWithAuditContext } from "../audit/context";
import { createTeam } from "./teamService";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

type Participant = { id: string; discordId: string };

function seed() {
  const admin = db.insert(schema.users).values({ discordId: "admin", discordUsername: "admin" }).returning().get();
  const bingo = db
    .insert(schema.bingos)
    .values({ slug: "test", name: "Test", boardRows: 3, boardCols: 3, createdByUserId: admin.id, stage: "signup", signupMode: "duo" })
    .returning()
    .get();
  const player = (discordId: string, signedUp = true): Participant => {
    const user = db.insert(schema.users).values({ discordId, discordUsername: discordId }).returning().get();
    if (signedUp) createSignup(db, bingo, { bingoId: bingo.id, userId: user.id, rsn: discordId, answers: [] });
    return { id: user.id, discordId };
  };
  return { bingo, admin, a: player("a"), b: player("b"), c: player("c") };
}

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});
afterEach(() => {
  sqlite.close();
});

describe("requestPairing", () => {
  it("creates a pending request the target sees as incoming", () => {
    const { bingo, a, b } = seed();
    const pairing = requestPairing(db, bingo, { requester: a, targetDiscordId: b.discordId });
    expect(pairing.status).toBe("pending");
    expect(getPairingState(db, bingo.id, a).outgoing?.pairing.id).toBe(pairing.id);
    expect(getPairingState(db, bingo.id, b).incoming.map((r) => r.pairing.id)).toEqual([pairing.id]);
  });

  it("works for a clan member who hasn't logged in yet", () => {
    const { bingo, a } = seed();
    const pairing = requestPairing(db, bingo, { requester: a, targetDiscordId: "stranger" });
    expect(getPairingState(db, bingo.id, a).outgoing).toEqual({ pairing, target: { discordId: "stranger", user: null, rsn: null, name: "stranger" } });
  });

  it("names a target who has logged in but not signed up, without an rsn", () => {
    const { bingo, a } = seed();
    const lurker = db.insert(schema.users).values({ discordId: "lurker", discordUsername: "lurker" }).returning().get();
    requestPairing(db, bingo, { requester: a, targetDiscordId: "lurker" });
    expect(getPairingState(db, bingo.id, a).outgoing?.target).toMatchObject({ user: { id: lurker.id }, rsn: null, name: "lurker" });
  });

  it("allows one outgoing request at a time", () => {
    const { bingo, a, b, c } = seed();
    requestPairing(db, bingo, { requester: a, targetDiscordId: b.discordId });
    expect(() => requestPairing(db, bingo, { requester: a, targetDiscordId: c.discordId })).toThrow(/cancel your current request/i);
  });

  it("pairs immediately when the target already asked the requester", () => {
    const { bingo, a, b } = seed();
    requestPairing(db, bingo, { requester: a, targetDiscordId: b.discordId });
    const pairing = requestPairing(db, bingo, { requester: b, targetDiscordId: a.discordId });
    expect(pairing.status).toBe("accepted");
    expect(getPairingState(db, bingo.id, a).partner).toMatchObject({ user: { id: b.id }, rsn: "b" });
  });

  it("rejects self, unsigned requesters, already-paired players, and solo bingos", () => {
    const { bingo, a, b, c } = seed();
    expect(() => requestPairing(db, bingo, { requester: a, targetDiscordId: a.discordId })).toThrow(/yourself/);
    const d = { id: db.insert(schema.users).values({ discordId: "d", discordUsername: "d" }).returning().get().id, discordId: "d" };
    expect(() => requestPairing(db, bingo, { requester: d, targetDiscordId: a.discordId })).toThrow(/sign up/i);
    adminPair(db, bingo, { userIdA: a.id, userIdB: b.id, createdByUserId: a.id });
    expect(() => requestPairing(db, bingo, { requester: c, targetDiscordId: a.discordId })).toThrow(/already has a partner/);
    expect(() => requestPairing(db, { ...bingo, signupMode: "solo" }, { requester: c, targetDiscordId: a.discordId })).toThrow(ServiceError);
  });

  it("rejects players already on a team, in either direction", () => {
    const { bingo, a, b, c } = seed();
    createTeam(db, { bingoId: bingo.id, captainUserId: a.id });
    expect(() => requestPairing(db, bingo, { requester: a, targetDiscordId: b.discordId })).toThrow(/already on a team/);
    expect(() => requestPairing(db, bingo, { requester: b, targetDiscordId: a.discordId })).toThrow(/already on a team/);
    expect(() => adminPair(db, bingo, { userIdA: a.id, userIdB: c.id, createdByUserId: a.id })).toThrow(/already on a team/);
  });
});

describe("respondToRequest", () => {
  it("accepting pairs both players and clears their other open requests", () => {
    const { bingo, a, b, c } = seed();
    const ab = requestPairing(db, bingo, { requester: a, targetDiscordId: b.discordId });
    const cb = requestPairing(db, bingo, { requester: c, targetDiscordId: b.discordId });
    const bd = requestPairing(db, bingo, { requester: b, targetDiscordId: "d" });
    // b accepts a: c's request to b is declined and b's own request to d cancelled.
    respondToRequest(db, bingo, b, ab.id, true);
    expect(getAcceptedPairs(db, bingo.id).map((p) => p.userIds.sort())).toEqual([[a.id, b.id].sort()]);
    const cState = getPairingState(db, bingo.id, c);
    expect(cState.outgoing).toBeNull();
    expect(cState.lastOutcome).toMatchObject({ status: "declined", other: { user: { id: b.id } } });
    const statusById = new Map(db.select().from(schema.signupPairings).all().map((p) => [p.id, p.status]));
    expect(statusById.get(cb.id)).toBe("declined");
    expect(statusById.get(bd.id)).toBe("cancelled");
  });

  it("declining leaves the requester free to ask someone else", () => {
    const { bingo, a, b, c } = seed();
    const ab = requestPairing(db, bingo, { requester: a, targetDiscordId: b.discordId });
    respondToRequest(db, bingo, b, ab.id, false);
    expect(getPairingState(db, bingo.id, a).lastOutcome).toMatchObject({ status: "declined" });
    expect(requestPairing(db, bingo, { requester: a, targetDiscordId: c.discordId }).status).toBe("pending");
  });

  it("only the target can respond, and only once", () => {
    const { bingo, a, b, c } = seed();
    const ab = requestPairing(db, bingo, { requester: a, targetDiscordId: b.discordId });
    expect(() => respondToRequest(db, bingo, c, ab.id, true)).toThrow(/not found/i);
    respondToRequest(db, bingo, b, ab.id, false);
    expect(() => respondToRequest(db, bingo, b, ab.id, true)).toThrow(/already been answered/);
  });
});

describe("cancelRequest", () => {
  it("cancels the requester's own pending request", () => {
    const { bingo, a, b } = seed();
    const ab = requestPairing(db, bingo, { requester: a, targetDiscordId: b.discordId });
    cancelRequest(db, bingo, a, ab.id);
    expect(getPairingState(db, bingo.id, a)).toMatchObject({ outgoing: null, lastOutcome: null });
    expect(() => cancelRequest(db, bingo, b, ab.id)).toThrow(/not found/i);
  });
});

describe("leavePairing / removePairing", () => {
  it("lets either half leave an accepted pairing", () => {
    const { bingo, a, b } = seed();
    const ab = requestPairing(db, bingo, { requester: a, targetDiscordId: b.discordId });
    respondToRequest(db, bingo, b, ab.id, true);
    leavePairing(db, bingo, b, ab.id); // the target, not the original requester
    expect(getAcceptedPairs(db, bingo.id)).toEqual([]);
    // Shown to both halves, unlike "declined" — the row doesn't record which of them chose to leave.
    expect(getPairingState(db, bingo.id, a).lastOutcome).toMatchObject({ status: "left", other: { user: { id: b.id } } });
    expect(getPairingState(db, bingo.id, b).lastOutcome).toMatchObject({ status: "left", other: { user: { id: a.id } } });
  });

  it("refuses a pairing that isn't yours, or isn't accepted yet", () => {
    const { bingo, a, b, c } = seed();
    const ab = requestPairing(db, bingo, { requester: a, targetDiscordId: b.discordId });
    expect(() => leavePairing(db, bingo, c, ab.id)).toThrow(/not paired/i); // still pending
    respondToRequest(db, bingo, b, ab.id, true);
    expect(() => leavePairing(db, bingo, c, ab.id)).toThrow(/isn't your pairing/);
  });

  it("removePairing dispatches by status: cancels a pending request (requester only), leaves an accepted one (either half)", () => {
    const { bingo, a, b, c } = seed();
    const ab = requestPairing(db, bingo, { requester: a, targetDiscordId: b.discordId });
    expect(() => removePairing(db, bingo, b, ab.id)).toThrow(/not found/i); // still pending; b isn't the requester
    removePairing(db, bingo, a, ab.id);
    expect(getPairingState(db, bingo.id, a).outgoing).toBeNull();

    const ac = requestPairing(db, bingo, { requester: a, targetDiscordId: c.discordId });
    respondToRequest(db, bingo, c, ac.id, true);
    removePairing(db, bingo, c, ac.id); // accepted; c is the target, not the requester
    expect(getAcceptedPairs(db, bingo.id)).toEqual([]);
  });
});

describe("adminPair / unpair", () => {
  it("pairs two unpaired signups without consent and can split them again", () => {
    const { bingo, admin, a, b } = seed();
    const pairing = adminPair(db, bingo, { userIdA: a.id, userIdB: b.id, createdByUserId: admin.id });
    expect(pairing).toMatchObject({ status: "accepted", createdByUserId: admin.id });
    unpair(db, bingo, pairing.id);
    expect(getAcceptedPairs(db, bingo.id)).toEqual([]);
    expect(getPairingState(db, bingo.id, a).lastOutcome).toMatchObject({ status: "dissolved", other: { user: { id: b.id } } });
  });

  it("refuses when either player is already paired", () => {
    const { bingo, admin, a, b, c } = seed();
    adminPair(db, bingo, { userIdA: a.id, userIdB: b.id, createdByUserId: admin.id });
    expect(() => adminPair(db, bingo, { userIdA: b.id, userIdB: c.id, createdByUserId: admin.id })).toThrow(/already has a partner/);
  });

  // After signups close, mods can still pair up the singles who'd otherwise be cut, until the draft stage.
  it("lets mods pair and unpair before the draft stage, while players' own requests stop when signups close", () => {
    const { bingo, admin, a, b, c } = seed();
    const closed = { ...bingo, stage: "captains" as const };
    const pairing = adminPair(db, closed, { userIdA: a.id, userIdB: b.id, createdByUserId: admin.id });
    unpair(db, closed, pairing.id);
    expect(() => requestPairing(db, closed, { requester: a, targetDiscordId: c.discordId })).toThrow(/signup stage/);
    const drafting = { ...bingo, stage: "draft" as const };
    expect(() => adminPair(db, drafting, { userIdA: a.id, userIdB: b.id, createdByUserId: admin.id })).toThrow(/before the draft stage/);
  });

  it("won't unpair a captain from their co-captain", () => {
    const { bingo, admin, a, b } = seed();
    const pairing = adminPair(db, bingo, { userIdA: a.id, userIdB: b.id, createdByUserId: admin.id });
    createTeam(db, { bingoId: bingo.id, captainUserId: a.id, coCaptainUserId: b.id });
    expect(() => unpair(db, bingo, pairing.id)).toThrow(/on a team/);
    expect(getAcceptedPairs(db, bingo.id)).toHaveLength(1);
  });
});

describe("audit trail", () => {
  it("requestPairing records pairing.requested for a one-sided request, and pairing.accepted for a mutual match", () => {
    const { bingo, a, b } = seed();
    requestPairing(db, bingo, { requester: a, targetDiscordId: b.discordId });
    expect(db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "pairing.requested")).all()).toHaveLength(1);

    requestPairing(db, bingo, { requester: b, targetDiscordId: a.discordId });
    const accepted = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "pairing.accepted")).all();
    expect(accepted).toHaveLength(1);
    expect(JSON.parse(accepted[0]!.details)).toMatchObject({ partnerUserId: b.id });
  });

  it("respondToRequest records pairing.declined; cancelRequest records pairing.cancelled", () => {
    const { bingo, a, b, c } = seed();
    const ab = requestPairing(db, bingo, { requester: a, targetDiscordId: b.discordId });
    respondToRequest(db, bingo, b, ab.id, false);
    expect(db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "pairing.declined")).all()).toHaveLength(1);

    const ac = requestPairing(db, bingo, { requester: a, targetDiscordId: c.discordId });
    cancelRequest(db, bingo, a, ac.id);
    expect(db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "pairing.cancelled")).all()).toHaveLength(1);
  });

  it("adminPair records pairing.admin_paired and unpair records pairing.unpaired, both with display names", () => {
    const { bingo, admin, a, b } = seed();
    const pairing = adminPair(db, bingo, { userIdA: a.id, userIdB: b.id, createdByUserId: admin.id });
    const paired = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "pairing.admin_paired")).get()!;
    expect(JSON.parse(paired.details).displayNames).toEqual(["a", "b"]);

    unpair(db, bingo, pairing.id);
    const unpaired = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "pairing.unpaired")).get()!;
    expect(JSON.parse(unpaired.details).displayNames.sort()).toEqual(["a", "b"]);
  });

  it("leavePairing records pairing.left, not pairing.dissolved", () => {
    const { bingo, a, b } = seed();
    const ab = requestPairing(db, bingo, { requester: a, targetDiscordId: b.discordId });
    respondToRequest(db, bingo, b, ab.id, true);
    leavePairing(db, bingo, b, ab.id);
    expect(db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "pairing.left")).all()).toHaveLength(1);
    expect(db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "pairing.dissolved")).all()).toHaveLength(0);
  });

  it("withdrawing a paired signup records pairing.dissolved with cause 'withdrawal'", () => {
    const { bingo, a, b } = seed();
    const ab = requestPairing(db, bingo, { requester: a, targetDiscordId: b.discordId });
    respondToRequest(db, bingo, b, ab.id, true);
    const signupId = db.select().from(schema.signups).all().find((s) => s.userId === a.id)!.id;

    runWithAuditContext({ requestId: "withdraw-req", actorUserId: a.id, actorType: "user", actorRole: "player", recorded: 0, skip: null }, () => {
      withdrawSignup(db, bingo, signupId);
    });

    const row = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "pairing.dissolved")).get()!;
    expect(JSON.parse(row.details)).toMatchObject({ cause: "withdrawal" });
    expect(row.requestId).not.toBeNull();
    const withdrawnRow = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "signup.withdrawn")).get()!;
    expect(withdrawnRow.requestId).toBe(row.requestId);
  });
});

describe("withdrawing a signup", () => {
  it("dissolves the pair so the partner can pick again", () => {
    const { bingo, a, b, c } = seed();
    const ab = requestPairing(db, bingo, { requester: a, targetDiscordId: b.discordId });
    respondToRequest(db, bingo, b, ab.id, true);
    const signupId = db.select().from(schema.signups).all().find((s) => s.userId === a.id)!.id;
    withdrawSignup(db, bingo, signupId);
    const bState = getPairingState(db, bingo.id, b);
    expect(bState.partner).toBeNull();
    expect(bState.lastOutcome).toMatchObject({ status: "dissolved", other: { user: { id: a.id } } });
    expect(requestPairing(db, bingo, { requester: b, targetDiscordId: c.discordId }).status).toBe("pending");
  });
});

describe("getUnpairedSignups", () => {
  it("lists everyone signed up without a partner, except the viewer, flagging who's waiting on a reply", () => {
    const { bingo, a, b, c } = seed();
    const d = (() => {
      const user = db.insert(schema.users).values({ discordId: "d", discordUsername: "d" }).returning().get();
      createSignup(db, bingo, { bingoId: bingo.id, userId: user.id, rsn: "d", answers: [] });
      return { id: user.id, discordId: "d" };
    })();
    // a and b pair up; c has asked d, who hasn't answered.
    const ab = requestPairing(db, bingo, { requester: a, targetDiscordId: b.discordId });
    respondToRequest(db, bingo, b, ab.id, true);
    requestPairing(db, bingo, { requester: c, targetDiscordId: d.discordId });

    expect(getUnpairedSignups(db, bingo.id, d.id)).toEqual([{ userId: c.id, discordId: "c", rsn: "c", waiting: true }]);
    expect(getUnpairedSignups(db, bingo.id, a.id).map((p) => [p.rsn, p.waiting])).toEqual([
      ["c", true],
      ["d", false],
    ]);
  });

  it("leaves out withdrawn signups", () => {
    const { bingo, a, b } = seed();
    const signupB = db.select().from(schema.signups).where(eq(schema.signups.userId, b.id)).get()!;
    withdrawSignup(db, bingo, signupB.id);
    expect(getUnpairedSignups(db, bingo.id, a.id).map((p) => p.rsn)).toEqual(["c"]);
  });
});
