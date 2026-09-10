import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { createSignup, withdrawSignup } from "./signupService";
import { adminPair, cancelRequest, getAcceptedPairs, getPairingState, requestPairing, respondToRequest, unpair } from "./pairingService";
import { ServiceError } from "./errors";

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
    expect(getPairingState(db, bingo.id, a).outgoing).toEqual({ pairing, targetUser: null });
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
    expect(getPairingState(db, bingo.id, a).partner?.user?.id).toBe(b.id);
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
    expect(cState.lastOutcome).toMatchObject({ status: "declined", otherUser: { id: b.id } });
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

describe("adminPair / unpair", () => {
  it("pairs two unpaired signups without consent and can split them again", () => {
    const { bingo, admin, a, b } = seed();
    const pairing = adminPair(db, bingo, { userIdA: a.id, userIdB: b.id, createdByUserId: admin.id });
    expect(pairing).toMatchObject({ status: "accepted", createdByUserId: admin.id });
    unpair(db, bingo, pairing.id);
    expect(getAcceptedPairs(db, bingo.id)).toEqual([]);
    expect(getPairingState(db, bingo.id, a).lastOutcome).toMatchObject({ status: "dissolved", otherUser: { id: b.id } });
  });

  it("refuses when either player is already paired", () => {
    const { bingo, admin, a, b, c } = seed();
    adminPair(db, bingo, { userIdA: a.id, userIdB: b.id, createdByUserId: admin.id });
    expect(() => adminPair(db, bingo, { userIdA: b.id, userIdB: c.id, createdByUserId: admin.id })).toThrow(/already has a partner/);
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
    expect(bState.lastOutcome).toMatchObject({ status: "dissolved", otherUser: { id: a.id } });
    expect(requestPairing(db, bingo, { requester: b, targetDiscordId: c.discordId }).status).toBe("pending");
  });
});
