import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { WrappedDrop } from "@bingo/shared";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { auditLog, bingos, claims, stageTransitions, submissions } from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { createTask, createTile } from "./boardService";
import { approveSubmission, rejectSubmission } from "./scoringService";
import { ServiceError } from "./errors";
import * as statsService from "./statsService";
import * as rewindService from "./rewindService";
import { computeWrapped, duoMoments, getWrappedState, isPublished, publishWhenReady, publishWrapped, readBingoWrapped, readMyWrapped } from "./wrappedService";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});
afterEach(() => {
  vi.restoreAllMocks();
  sqlite.close();
});

const MIN = 60_000;
// Whole seconds: that is what the database keeps.
const T0 = new Date(Math.floor((Date.now() - 48 * 60 * MIN) / 1000) * 1000);
const t = (minutes: number) => new Date(T0.getTime() + minutes * MIN);

function user(name: string) {
  return db.insert(schema.users).values({ discordId: name, discordUsername: name }).returning().get();
}

/**
 * Two Teams drafted in three picks: carol first (Team A), then the Duo erin + frank (Team B, one pick), then dave
 * (Team A). Captains alice and bob. mod and mod2 review; mod2 doesn't play.
 */
function seed() {
  const mod = user("mod");
  const mod2 = user("mod2");
  const [alice, carol, dave, bob, erin, frank] = ["alice", "carol", "dave", "bob", "erin", "frank"].map(user) as [ReturnType<typeof user>, ...ReturnType<typeof user>[]];
  const bingo = db.insert(bingos).values({ slug: "wr", name: "Wrapped Bingo", boardRows: 1, boardCols: 2, createdByUserId: mod.id, stage: "live", buyinAmount: 5_000_000 }).returning().get();
  const teamA = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: alice.id, name: "Team A", codeword: "a" }).returning().get();
  const teamB = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: bob!.id, name: "Team B", codeword: "b" }).returning().get();
  const member = (teamId: string, userId: string, isCaptain = false) => db.insert(schema.teamMembers).values({ teamId, userId, isCaptain }).run();
  member(teamA.id, alice.id, true);
  member(teamA.id, carol!.id);
  member(teamA.id, dave!.id);
  member(teamB.id, bob!.id, true);
  member(teamB.id, erin!.id);
  member(teamB.id, frank!.id);
  const pick = (pickNumber: number, teamId: string, userId: string, by: string) => db.insert(schema.draftPicks).values({ bingoId: bingo.id, pickNumber, teamId, userId, pickedByUserId: by }).run();
  pick(1, teamA.id, carol!.id, alice.id);
  pick(2, teamB.id, erin!.id, bob!.id);
  pick(2, teamB.id, frank!.id, bob!.id);
  pick(3, teamA.id, dave!.id, alice.id);
  db.insert(schema.signupPairings).values({ bingoId: bingo.id, requesterUserId: erin!.id, targetDiscordId: frank!.discordId, status: "accepted", createdByUserId: erin!.id }).run();
  db.insert(schema.bingoModerators).values([{ bingoId: bingo.id, userId: mod.id }, { bingoId: bingo.id, userId: mod2.id }]).run();
  db.insert(stageTransitions).values({ bingoId: bingo.id, fromStage: "reveal", toStage: "live", changedByUserId: mod.id, createdAt: t(0) }).run();

  const tile1 = createTile(db, { bingoId: bingo.id, name: "ZULRAH", boardRow: 0, boardCol: 0 });
  const fang = createTask(db, tile1.id, { kind: "ITEM", itemName: "Tanzanite fang", label: "Fang", points: 10 });
  const tile2 = createTile(db, { bingoId: bingo.id, name: "VORKATH", boardRow: 0, boardCol: 1 });
  const head = createTask(db, tile2.id, { kind: "ITEM", itemName: "Vorkath's head", label: "Head", points: 30 });
  const scales = createTask(db, tile2.id, { kind: "ITEM", itemName: "Zulrah's scales", label: "Scales", points: 2 });

  return { bingo, mod, mod2, alice, carol: carol!, dave: dave!, bob: bob!, erin: erin!, frank: frank!, teamA, teamB, fang, head, scales };
}

type Fx = ReturnType<typeof seed>;

function submitAt(teamId: string, userId: string, when: Date, claim: { nodeId: string; itemName: string; gpValue?: number }) {
  const s = db.insert(submissions).values({ teamId, submittedByUserId: userId, submittedAt: when, createdAt: when }).returning().get();
  db.insert(claims).values({ submissionId: s.id, nodeId: claim.nodeId, itemName: claim.itemName, quantity: 1, gpValue: claim.gpValue ?? null }).run();
  db.insert(schema.submissionScreenshots).values({ submissionId: s.id, storageUrl: `/uploads/${s.id}.png` }).run();
  return s;
}

// Reviewed `after` minutes after it was made (the review time is set straight after, for exact stats).
function review(s: { id: string; submittedAt: Date }, reviewerId: string, after: number, reject = false) {
  if (reject) rejectSubmission(db, { submissionId: s.id, reviewedByUserId: reviewerId, reviewerNotes: "no" });
  else approveSubmission(db, { submissionId: s.id, reviewedByUserId: reviewerId });
  db.update(submissions).set({ reviewedAt: new Date(s.submittedAt.getTime() + after * MIN) }).where(eq(submissions.id, s.id)).run();
}

function finish(fx: Fx) {
  db.update(bingos).set({ stage: "complete" }).where(eq(bingos.id, fx.bingo.id)).run();
  db.insert(stageTransitions).values({ bingoId: fx.bingo.id, fromStage: "live", toStage: "complete", changedByUserId: fx.mod.id, createdAt: t(600) }).run();
  return db.select().from(bingos).where(eq(bingos.id, fx.bingo.id)).get()!;
}

/** Dave (last pick) scores the most; carol (first pick) the least; the Duo in between. mod reviews 4 (1 rejected), mod2 1. */
function play(fx: Fx) {
  review(submitAt(fx.teamA.id, fx.dave.id, t(10), { nodeId: fx.head.id, itemName: "Vorkath's head", gpValue: 8_000_000 }), fx.mod.id, 30);
  review(submitAt(fx.teamA.id, fx.carol.id, t(20), { nodeId: fx.scales.id, itemName: "Zulrah's scales", gpValue: 100 }), fx.mod.id, 90);
  review(submitAt(fx.teamB.id, fx.erin.id, t(30), { nodeId: fx.fang.id, itemName: "Tanzanite fang", gpValue: 2_000_000 }), fx.mod.id, 10);
  review(submitAt(fx.teamB.id, fx.frank.id, t(40), { nodeId: fx.head.id, itemName: "Vorkath's head" }), fx.mod.id, 5, true);
  review(submitAt(fx.teamB.id, fx.frank.id, t(50), { nodeId: fx.scales.id, itemName: "Zulrah's scales" }), fx.mod2.id, 120);
}

const viewer = (userId: string, isMod: boolean, myTeamId: string | null = null) => ({ userId, isMod, myTeamId });

describe("publishing", () => {
  it("is refused before the Bingo is Finished", () => {
    const fx = seed();
    const live = db.select().from(bingos).where(eq(bingos.id, fx.bingo.id)).get()!;
    expect(() => publishWrapped(db, live, fx.mod.id)).toThrow(ServiceError);
    expect(() => readMyWrapped(db, live, viewer(fx.mod.id, true))).toThrow(ServiceError);
  });

  it("gives a non-Moderator 'not published' and a Moderator a live preview until it's published", () => {
    const fx = seed();
    play(fx);
    const bingo = finish(fx);
    expect(getWrappedState(db, bingo)).toEqual({ published: false, publishedAt: null, publishOnFinish: false, pendingSubmissions: 0 });

    try {
      readMyWrapped(db, bingo, viewer(fx.dave.id, false, fx.teamA.id));
      expect.unreachable();
    } catch (err) {
      expect((err as ServiceError).status).toBe(404);
      expect((err as ServiceError).code).toBe("wrapped_not_published");
    }
    expect(() => readBingoWrapped(db, bingo, viewer(fx.dave.id, false, fx.teamA.id))).toThrow(ServiceError);

    const preview = readMyWrapped(db, bingo, viewer(fx.alice.id, true, fx.teamA.id));
    expect(preview.preview).toBe(true);
    expect(preview.player?.userId).toBe(fx.alice.id);
    // A preview is never stored.
    expect(db.select().from(schema.playerWrapped).all()).toHaveLength(0);
  });

  it("stores one Player Wrapped per Player and the Bingo-wide one, and audits publishing and publishing again", () => {
    const fx = seed();
    play(fx);
    const bingo = finish(fx);
    expect(isPublished(db, bingo.id)).toBe(false);
    const state = publishWrapped(db, bingo, fx.mod.id);
    expect(state.published).toBe(true);
    expect(isPublished(db, bingo.id)).toBe(true);
    expect(db.select().from(schema.playerWrapped).all().map((r) => r.userId).sort()).toEqual([fx.alice.id, fx.bob.id, fx.carol.id, fx.dave.id, fx.erin.id, fx.frank.id].sort());

    publishWrapped(db, bingo, fx.mod.id);
    expect(db.select().from(schema.playerWrapped).all()).toHaveLength(6);
    expect(db.select({ action: auditLog.action }).from(auditLog).all().map((r) => r.action).filter((a) => a.startsWith("wrapped."))).toEqual(["wrapped.published", "wrapped.republished"]);
  });

  it("refuses to publish, or publish again, while any Submission is pending", () => {
    const fx = seed();
    play(fx);
    const late = submitAt(fx.teamA.id, fx.dave.id, t(70), { nodeId: fx.fang.id, itemName: "Tanzanite fang" });
    const bingo = finish(fx);
    expect(getWrappedState(db, bingo).pendingSubmissions).toBe(1);
    try {
      publishWrapped(db, bingo, fx.mod.id);
      expect.unreachable();
    } catch (err) {
      expect((err as ServiceError).status).toBe(409);
      expect((err as ServiceError).code).toBe("wrapped_pending_submissions");
    }
    expect(getWrappedState(db, bingo).published).toBe(false);

    review(late, fx.mod.id, 5);
    publishWrapped(db, bingo, fx.mod.id);
    // A review undone after publishing puts it back in the queue: publishing again waits for it too.
    db.update(submissions).set({ status: "pending", reviewedAt: null, reviewedByUserId: null }).where(eq(submissions.id, late.id)).run();
    expect(() => publishWrapped(db, bingo, fx.mod.id)).toThrow(ServiceError);
  });

  it("publishes on its own only when the Bingo is set to (off by default), once nothing is pending, and only once", () => {
    const fx = seed();
    play(fx);
    const late = submitAt(fx.teamA.id, fx.dave.id, t(70), { nodeId: fx.fang.id, itemName: "Tanzanite fang" });
    const off = finish(fx);
    expect(off.publishWrappedOnFinish).toBe(false);
    review(late, fx.mod.id, 5);
    expect(publishWhenReady(db, off, fx.mod.id)).toBe(false);
    expect(getWrappedState(db, off).published).toBe(false);

    // Set to: at the finish there's still a pending Submission, so it waits for the last review.
    db.update(submissions).set({ status: "pending", reviewedAt: null, reviewedByUserId: null }).where(eq(submissions.id, late.id)).run();
    db.update(bingos).set({ publishWrappedOnFinish: true }).where(eq(bingos.id, fx.bingo.id)).run();
    const on = db.select().from(bingos).where(eq(bingos.id, fx.bingo.id)).get()!;
    expect(publishWhenReady(db, on, fx.mod.id)).toBe(false);
    expect(getWrappedState(db, on).published).toBe(false);
    review(late, fx.mod.id, 5);
    expect(publishWhenReady(db, on, fx.mod.id)).toBe(true);
    expect(getWrappedState(db, on)).toMatchObject({ published: true, publishOnFinish: true, pendingSubmissions: 0 });
    // Publishing again is a Moderator's call.
    expect(publishWhenReady(db, on, fx.mod.id)).toBe(false);
  });

  it("reads a published Wrapped without recomputing any stats", () => {
    const fx = seed();
    play(fx);
    const bingo = finish(fx);
    publishWrapped(db, bingo, fx.mod.id);

    const spies = [
      vi.spyOn(statsService, "getTeamCredits"),
      vi.spyOn(statsService, "getContributionCounts"),
      vi.spyOn(statsService, "getTitleFacts"),
      vi.spyOn(rewindService, "getRewind"),
    ];
    const mine = readMyWrapped(db, bingo, viewer(fx.dave.id, false, fx.teamA.id));
    readBingoWrapped(db, bingo, viewer(fx.mod2.id, true));
    expect(mine.preview).toBe(false);
    expect(mine.player?.you.submissions).toBe(1);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it("keeps its numbers when things change afterwards, until it's published again", () => {
    const fx = seed();
    play(fx);
    const bingo = finish(fx);
    publishWrapped(db, bingo, fx.mod.id);

    // A late approval after publishing.
    review(submitAt(fx.teamA.id, fx.dave.id, t(60), { nodeId: fx.fang.id, itemName: "Tanzanite fang", gpValue: 1_000_000 }), fx.mod.id, 15);
    const daveView = viewer(fx.dave.id, false, fx.teamA.id);
    expect(readMyWrapped(db, bingo, daveView).player!.you.submissions).toBe(1);
    expect(readMyWrapped(db, bingo, daveView).bingo.totalSubmissions).toBe(4);

    publishWrapped(db, bingo, fx.mod.id);
    expect(readMyWrapped(db, bingo, daveView).player!.you.submissions).toBe(2);
    expect(readMyWrapped(db, bingo, daveView).bingo.totalSubmissions).toBe(5);
  });

  it("gives a viewer who isn't a Player only the Bingo-wide data (and a reviewer their Moderator section)", () => {
    const fx = seed();
    play(fx);
    const bingo = finish(fx);
    publishWrapped(db, bingo, fx.mod.id);
    const outsider = user("outsider");
    const theirs = readMyWrapped(db, bingo, viewer(outsider.id, false));
    expect(theirs.player).toBeNull();
    expect(theirs.moderator).toBeNull();
    expect(theirs.bingo.teams).toHaveLength(2);

    const mod2 = readMyWrapped(db, bingo, viewer(fx.mod2.id, true));
    expect(mod2.player).toBeNull();
    expect(mod2.moderator).toEqual({ reviewed: 1, medianReviewMs: 120 * MIN, rejectionRate: 0 });
  });

  it("leaves other Teams' screenshots out on read when the Bingo hides them once Finished", () => {
    const fx = seed();
    play(fx);
    db.update(bingos).set({ showScreenshotsWhenFinished: false }).where(eq(bingos.id, fx.bingo.id)).run();
    const bingo = finish(fx);
    publishWrapped(db, bingo, fx.mod.id);
    const teamB = readBingoWrapped(db, bingo, viewer(fx.erin.id, false, fx.teamB.id)).bingo.teams;
    expect(teamB.find((x) => x.teamId === fx.teamA.id)!.biggestDrop!.screenshotUrl).toBeNull();
    expect(teamB.find((x) => x.teamId === fx.teamB.id)!.biggestDrop!.screenshotUrl).not.toBeNull();
    expect(readBingoWrapped(db, bingo, viewer(fx.mod.id, true)).bingo.teams.every((x) => x.biggestDrop?.screenshotUrl)).toBe(true);
  });
});

describe("computeWrapped", () => {
  it("names the draft's biggest Steal, treating a Duo as one pick, and never a bust", () => {
    const fx = seed();
    play(fx);
    const { bingo, players } = computeWrapped(db, finish(fx));
    // Positions: carol 1, erin & frank 2 (one pick), dave 4. Dave finished first among the drafted.
    expect(bingo.biggestSteal).toMatchObject({ player: { id: fx.dave.id }, pickNumber: 3, position: 4, rank: 1, placesBeaten: 3 });
    const of = (id: string) => players.find((p) => p.userId === id)!;
    expect(of(fx.erin.id).you.draft).toEqual({ pickNumber: 2, position: 2 });
    expect(of(fx.frank.id).you.draft).toEqual({ pickNumber: 2, position: 2 });
    expect(of(fx.dave.id).you.draft).toEqual({ pickNumber: 3, position: 4 });
    // The Captain sees every pick; the Duo is one pick with both halves.
    const picks = of(fx.bob.id).captain!.picks;
    expect(picks).toHaveLength(1);
    expect(picks[0]!.players.map((p) => p.id).sort()).toEqual([fx.erin.id, fx.frank.id].sort());
    expect(of(fx.carol.id).captain).toBeNull();
    expect(of(fx.bob.id).captain!.drafted).toBe(4);
    expect(picks[0]!.pointsShare).toBe(Math.max(of(fx.erin.id).you.pointsShare, of(fx.frank.id).you.pointsShare));
  });

  it("computes the moderation stats", () => {
    const fx = seed();
    play(fx);
    const { moderation } = computeWrapped(db, finish(fx)).bingo;
    // Waits: 30, 90, 10, 5 (mod, one rejected) and 120 (mod2) minutes.
    expect(moderation.reviewed).toBe(5);
    expect(moderation.medianReviewMs).toBe(30 * MIN);
    expect(moderation.fastestReviewMs).toBe(5 * MIN);
    expect(moderation.withinHourFraction).toBeCloseTo(3 / 5);
    expect(moderation.topReviewer).toMatchObject({ user: { id: fx.mod.id }, reviewed: 4 });
    expect(moderation.reviewers.map((r) => [r.user.id, r.reviewed, r.rejected, r.rejectionRate, r.medianReviewMs])).toEqual([
      [fx.mod.id, 4, 1, 0.25, 20 * MIN],
      [fx.mod2.id, 1, 0, 0, 120 * MIN],
    ]);
    expect(moderation.busiestHour!.reviews).toBeGreaterThanOrEqual(1);
  });

  it("builds each Player's You, Duo and Team facts from approved Submissions only", () => {
    const fx = seed();
    play(fx);
    const { bingo, players } = computeWrapped(db, finish(fx));
    const of = (id: string) => players.find((p) => p.userId === id)!;

    const dave = of(fx.dave.id).you;
    expect(dave.submissions).toBe(1);
    expect(dave.gpGained).toBe(8_000_000);
    expect(dave.coveredBuyIn).toBe(true);
    expect(dave.topDrops.map((d) => d.itemName)).toEqual(["Vorkath's head"]);
    expect(dave.teamRank).toBe(1);
    expect(dave.firstDrop?.itemName).toBe("Vorkath's head");
    expect(dave.mostActiveDay?.submissions).toBe(1);
    // The average over every Player, whether or not they scored.
    const shares = players.map((p) => p.you.pointsShare);
    expect(dave.bingoAveragePointsShare).toBeCloseTo(shares.reduce((a, b) => a + b, 0) / shares.length);
    expect(of(fx.carol.id).you.coveredBuyIn).toBe(false);
    // The rejected head never counts for frank; the scales do.
    expect(of(fx.frank.id).you.submissions).toBe(1);
    expect(of(fx.frank.id).you.firstDrop?.itemName).toBe("Zulrah's scales");

    expect(of(fx.erin.id).duo).toMatchObject({ partner: { id: fx.frank.id }, rank: 1, duoCount: 1, pickNumber: 2 });
    expect(Array.isArray(of(fx.erin.id).duo!.moments)).toBe(true);
    expect(of(fx.dave.id).duo).toBeNull();

    expect(bingo.totalSubmissions).toBe(4);
    expect(bingo.totalGp).toBe(10_000_100);
    const [first, second] = bingo.teams;
    expect(first).toMatchObject({ teamId: fx.teamA.id, placement: 1, mvp: { player: { id: fx.dave.id } }, topGpEarner: { player: { id: fx.dave.id } } });
    expect(first!.biggestDrop?.itemName).toBe("Vorkath's head");
    expect(second!.teamId).toBe(fx.teamB.id);
    expect(first!.pointsOverTime.at(-1)!.points).toBe(first!.points);
  });
});

describe("duoMoments", () => {
  const drop = (submissionId: string, at: string, gpValue: number | null, itemName = submissionId): WrappedDrop => ({
    submissionId, teamId: "t", player: null, itemName, quantity: 1, gpValue, luckOneIn: null, at, screenshotUrl: null,
  });
  const tiles: Record<string, { id: string; name: string }> = {
    m1: { id: "zul", name: "Zulrah" }, t1: { id: "zul", name: "Zulrah" },
    m2: { id: "zul", name: "Zulrah" }, t2: { id: "zul", name: "Zulrah" },
    m3: { id: "vork", name: "Vorkath" }, t3: { id: "cox", name: "Chambers" },
    m4: { id: "a", name: "A" }, t4: { id: "b", name: "B" },
  };
  const tileOf = (id: string) => tiles[id] ?? null;

  it("pairs Submissions on the same Tile first, most valuable first, each Tile once, then the same day", () => {
    const mine = [drop("m1", "2026-01-03T10:00:00Z", 5), drop("m2", "2026-01-04T10:00:00Z", 50), drop("m3", "2026-01-05T09:00:00Z", 1)];
    const theirs = [drop("t1", "2026-01-03T11:00:00Z", 5), drop("t2", "2026-01-06T10:00:00Z", 100), drop("t3", "2026-01-05T20:00:00Z", 2)];
    const moments = duoMoments(mine, theirs, tileOf);
    expect(moments.map((m) => [m.kind, m.tileName, m.mine.submissionId, m.theirs.submissionId, m.date])).toEqual([
      ["tile", "Zulrah", "m2", "t2", "2026-01-04"],
      ["day", null, "m1", "t1", "2026-01-03"],
      ["day", null, "m3", "t3", "2026-01-05"],
    ]);
  });

  it("shows each Submission as its most valuable drop, and has nothing without a shared Tile or day", () => {
    const moments = duoMoments([drop("m1", "2026-01-03T10:00:00Z", 1, "Scales"), drop("m1", "2026-01-03T10:00:00Z", 9, "Onyx")], [drop("t1", "2026-01-03T12:00:00Z", 5)], tileOf);
    expect(moments[0]!.mine.itemName).toBe("Onyx");
    expect(duoMoments([drop("m4", "2026-01-03T10:00:00Z", 1)], [drop("t4", "2026-01-09T10:00:00Z", 1)], tileOf)).toEqual([]);
  });
});
