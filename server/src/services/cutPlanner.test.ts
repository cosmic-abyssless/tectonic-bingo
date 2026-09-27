// cutPlanner is pure and DB-free (see its header comment), so its tests build CutPlannerUnit fixtures directly —
// no createTestDb needed. CONTEXT.md "Cut review" has the vocabulary these tests are named after.
import { describe, expect, it } from "vitest";
import type { TimeZoneRegion } from "@bingo/shared";
import { minTeamSize, planCutChanges, resolveChanges, scoreChanges, type CutPlannerInput, type CutPlannerTeam, type CutPlannerUnit } from "./cutPlanner";
import { ServiceError } from "./errors";

let nextRank = 0;
function single(signupId: string, opts: { signedUpAt?: number; region?: TimeZoneRegion | null } = {}): CutPlannerUnit {
  return {
    pairingId: null,
    isCaptainPair: false,
    entries: [{ userId: signupId, signedUpAt: opts.signedUpAt ?? 0, insertionRank: nextRank++, timezoneRegion: opts.region ?? null }],
  };
}
function pair(pairingId: string, aId: string, bId: string, opts: { signedUpAt?: [number, number]; isCaptainPair?: boolean } = {}): CutPlannerUnit {
  const [at1, at2] = opts.signedUpAt ?? [0, 0];
  return {
    pairingId,
    isCaptainPair: opts.isCaptainPair ?? false,
    entries: [
      { userId: aId, signedUpAt: at1, insertionRank: nextRank++, timezoneRegion: null },
      { userId: bId, signedUpAt: at2, insertionRank: nextRank++, timezoneRegion: null },
    ],
  };
}
function baseInput(units: CutPlannerUnit[], overrides: Partial<CutPlannerInput> = {}): CutPlannerInput {
  return { units, cutMode: "even", teamCount: 2, drafted: { pairs: 0, singles: 0 }, isSolo: false, ...overrides };
}

describe("minTeamSize", () => {
  it("grows with the player count", () => {
    expect(minTeamSize(1)).toBe(3);
    expect(minTeamSize(19)).toBe(3);
    expect(minTeamSize(20)).toBe(4);
    expect(minTeamSize(49)).toBe(4);
    expect(minTeamSize(50)).toBe(5);
    expect(minTeamSize(500)).toBe(5);
  });
});

describe("planCutChanges", () => {
  it('cutMode "none": nothing to plan', () => {
    const plan = planCutChanges(baseInput([pair("p1", "a", "b"), single("c")], { cutMode: "none" }));
    expect(plan).toEqual({ changes: [], cutPlayers: 0, cutPlayersNow: 0 });
  });

  it("2 Teams, 1 pair + 2 singles: the pair can't split across 2 Teams (2 cut) — pairs the 2 singles, tying with (and beating) splitting the pair", () => {
    const units = [pair("p1", "a", "b"), single("c", { signedUpAt: 10 }), single("d", { signedUpAt: 20 })];
    const plan = planCutChanges(baseInput(units, { teamCount: 2 }));
    expect(plan.cutPlayersNow).toBe(2);
    expect(plan.cutPlayers).toBe(0);
    // Splitting "p1" would also reach 0 cut in one change — a tie broken by preferring pairing over splitting.
    expect(plan.changes).toEqual([{ kind: "pair", userIds: ["c", "d"] }]);
  });

  it("2 Teams, 3 singles: nothing helps — pairing two of them would leave a cut pair, worse than the 1 Unavoidable cut", () => {
    const units = [single("a"), single("b"), single("c")];
    const plan = planCutChanges(baseInput(units, { teamCount: 2 }));
    expect(plan.cutPlayersNow).toBe(1);
    expect(plan.changes).toEqual([]);
    expect(plan.cutPlayers).toBe(1);
  });

  it("prefers pairing two singles in the same timezone region, then earlier signup date", () => {
    // 1 pair (cut alone, 2 Teams) + 2 "europe" singles + 2 "asia" singles: pairing any 2 of the 4 singles fixes
    // the pair's remainder (1 pair -> 2 pairs) and leaves the other 2 singles evenly split — every combination
    // scores identically, so which one is chosen only reflects the preference order.
    const units = [
      pair("p1", "captainless-a", "captainless-b"),
      single("europe-early", { signedUpAt: 1, region: "europe" }),
      single("europe-late", { signedUpAt: 2, region: "europe" }),
      single("asia-early", { signedUpAt: 1, region: "asia" }),
      single("asia-late", { signedUpAt: 2, region: "asia" }),
    ];
    const plan = planCutChanges(baseInput(units, { teamCount: 2 }));
    expect(plan.cutPlayersNow).toBe(2);
    expect(plan.cutPlayers).toBe(0);
    expect(plan.changes).toEqual([{ kind: "pair", userIds: ["europe-early", "europe-late"] }]);
  });

  it("never proposes splitting a pair a Captain belongs to, even when splitting would otherwise be the only fix", () => {
    // A lone pair, 2 Teams: it can't split across the Teams (2 cut). Splitting it into 2 singles would divide
    // evenly instead (0 cut) — but not when it's a Captain's pair.
    const captainPlan = planCutChanges(baseInput([pair("p1", "a", "b", { isCaptainPair: true })], { teamCount: 2 }));
    expect(captainPlan.cutPlayersNow).toBe(2);
    expect(captainPlan.changes).toEqual([]);
    expect(captainPlan.cutPlayers).toBe(2);

    // The same shape, not a Captain's pair: now splitting is exactly the fix.
    const plainPlan = planCutChanges(baseInput([pair("p1", "a", "b", { isCaptainPair: false })], { teamCount: 2 }));
    expect(plainPlan.changes).toEqual([{ kind: "split", pairingId: "p1" }]);
    expect(plainPlan.cutPlayers).toBe(0);
  });

  it('"pairs only" never proposes a split, even though one would otherwise fix the cut', () => {
    const units = [pair("p1", "a", "b"), pair("p2", "c", "d"), pair("p3", "e", "f")];
    const plan = planCutChanges(baseInput(units, { teamCount: 2, cutMode: "pairs_only" }));
    expect(plan.changes.some((c) => c.kind === "split")).toBe(false);
  });

  it("a solo Bingo only ever proposes a Team change, and respects ±1 and the size tiers", () => {
    // 21 singles (a duo bingo's mixed-mode conversion is never on the table for a solo one — see isSolo): at 6
    // Teams, 3 are cut. Going to 7 would clear the cut entirely (21 / 7 = 3 each) but drops the average Team size
    // to 3, below the 21-player tier's minimum of 4 — so it's never proposed. Going to 5 (average 4.2, allowed)
    // leaves only 1 cut, the best allowed option.
    const units = Array.from({ length: 21 }, (_, i) => single(`s${i}`, { signedUpAt: i }));
    const plan = planCutChanges(baseInput(units, { teamCount: 6, isSolo: true }));
    expect(plan.cutPlayersNow).toBe(3);
    expect(plan.changes.every((c) => c.kind === "addTeam" || c.kind === "removeTeam")).toBe(true);
    expect(plan.changes).toEqual([{ kind: "removeTeam" }]);
    expect(plan.cutPlayers).toBe(1);
  });

  it("never proposes going below 2 Teams", () => {
    const units = [single("a"), single("b"), single("c")];
    const plan = planCutChanges(baseInput(units, { teamCount: 2, isSolo: true }));
    expect(plan.changes.some((c) => c.kind === "removeTeam")).toBe(false);
  });

  it("is deterministic regardless of the pool's array order", () => {
    const units = [
      pair("p1", "a", "b"),
      single("c", { signedUpAt: 10, region: "europe" }),
      single("d", { signedUpAt: 20, region: "asia" }),
      single("e", { signedUpAt: 5, region: "europe" }),
    ];
    const forward = planCutChanges(baseInput(units, { teamCount: 2 }));
    const reversed = planCutChanges(baseInput([...units].reverse(), { teamCount: 2 }));
    expect(reversed).toEqual(forward);
  });
});

describe("resolveChanges / scoreChanges", () => {
  function scenario() {
    return baseInput([pair("p1", "a", "b"), single("c", { signedUpAt: 10 }), single("d", { signedUpAt: 20 })], { teamCount: 2 });
  }

  it("scores an empty change list as the roster stands", () => {
    const result = scoreChanges(scenario(), []);
    expect(result).toEqual({ cutPlayers: 2, cutPlayersMax: 2, cutPlayersNow: 2, pickOptions: null });
  });

  it("scores the admin's own edit the same way the planner would", () => {
    const result = scoreChanges(scenario(), [{ kind: "pair", userIds: ["c", "d"] }]);
    expect(result).toEqual({ cutPlayers: 0, cutPlayersMax: 0, cutPlayersNow: 2, pickOptions: null });
  });

  it("resolves a multi-step edit in order: split, then pair one of the resulting halves", () => {
    const input = baseInput([pair("p1", "a", "b"), single("c")], { teamCount: 2 });
    // Splitting p1 first frees "a" and "b" up to be re-paired with "c" — order matters.
    const { units, teamCount } = resolveChanges(input, [
      { kind: "split", pairingId: "p1" },
      { kind: "pair", userIds: ["a", "c"] },
    ]);
    expect(teamCount).toBe(2);
    expect(units).toHaveLength(2); // one pair (a & c), one single (b)
    expect(units.some((u) => u.entries.length === 2 && u.entries.map((e) => e.userId).sort().join() === "a,c")).toBe(true);
    expect(units.some((u) => u.entries.length === 1 && u.entries[0]!.userId === "b")).toBe(true);
  });

  it("rejects a pairing referencing a signup that's no longer unpaired", () => {
    expect(() => resolveChanges(scenario(), [{ kind: "pair", userIds: ["a", "c"] }])).toThrow(ServiceError);
  });

  it("rejects splitting a pairing that no longer exists", () => {
    expect(() => resolveChanges(scenario(), [{ kind: "split", pairingId: "nope" }])).toThrow(/isn't currently accepted/);
  });

  it("rejects splitting a Captain's pair", () => {
    const input = baseInput([pair("p1", "a", "b", { isCaptainPair: true }), single("c")], { teamCount: 2 });
    expect(() => resolveChanges(input, [{ kind: "split", pairingId: "p1" }])).toThrow(/can't be split/);
  });

  it("rejects more than one Team change in a plan", () => {
    expect(() => resolveChanges(scenario(), [{ kind: "addTeam" }, { kind: "removeTeam" }])).toThrow(/at most one Team/i);
  });

  it("rejects a Team change that would drop below 2 Teams", () => {
    const input = baseInput([single("a"), single("b")], { teamCount: 2 });
    expect(() => resolveChanges(input, [{ kind: "removeTeam" }])).toThrow(/at least 2 Teams/i);
  });

  it("rejects a Team change that would violate the size tier", () => {
    const units = Array.from({ length: 21 }, (_, i) => single(`s${i}`));
    const input = baseInput(units, { teamCount: 6 });
    expect(() => resolveChanges(input, [{ kind: "addTeam" }])).toThrow(/fewer than 4 players/i);
  });
});

// A Team change moves players, not just the count: an added Team's Captain leaves the pool, a removed Team's
// Captains rejoin it (see cutPlanner.ts's CutPlannerTeam).
describe("Team changes move their Captains", () => {
  const captainTeam = (teamId: string, captainId: string): CutPlannerTeam => ({
    teamId,
    members: [{ userId: captainId, signedUpAt: 0, insertionRank: nextRank++, timezoneRegion: null }],
    pairingId: null,
  });
  const singles = (n: number, prefix = "s") => Array.from({ length: n }, (_, i) => single(`${prefix}${i}`, { signedUpAt: i }));

  it("doesn't add a Team when its Captain leaving the pool would cut more (2 Teams, 9 singles: 1 cut; 3 Teams of the 8 left: 2 cut)", () => {
    const input = baseInput(singles(9), { isSolo: true, teamCount: 2, teams: [captainTeam("t1", "c1"), captainTeam("t2", "c2")] });
    const plan = planCutChanges(input);
    expect(plan.cutPlayersNow).toBe(1);
    expect(plan.changes).toEqual([]);
    expect(plan.cutPlayers).toBe(1);
  });

  it("adds a Team when that saves players even with its Captain leaving the pool (2 Teams, 7 singles: 1 cut; 3 Teams of the 6 left: 0)", () => {
    const input = baseInput(singles(7), { isSolo: true, teamCount: 2, teams: [captainTeam("t1", "c1"), captainTeam("t2", "c2")] });
    const plan = planCutChanges(input);
    expect(plan.cutPlayersNow).toBe(1);
    expect(plan.changes).toEqual([{ kind: "addTeam" }]);
    expect(plan.cutPlayers).toBe(0);
  });

  it("removes a Team when its Captain rejoining the pool saves players (3 Teams, 5 singles: 2 cut; 2 Teams of 6: 0)", () => {
    const teams = [captainTeam("t1", "c1"), captainTeam("t2", "c2"), captainTeam("t3", "c3")];
    const plan = planCutChanges(baseInput(singles(5), { isSolo: true, teamCount: 3, teams }));
    expect(plan.cutPlayersNow).toBe(2);
    expect(plan.changes).toEqual([{ kind: "removeTeam" }]);
    expect(plan.cutPlayers).toBe(0);
  });

  it("counts the Teams' Captains in the average Team size the tiers check", () => {
    // 4 singles + 2 Captains = 6 players: 3 Teams would average 2, under the minimum of 3 — no Team is added.
    const input = baseInput(singles(4), { isSolo: true, teamCount: 2, teams: [captainTeam("t1", "c1"), captainTeam("t2", "c2")] });
    expect(() => resolveChanges(input, [{ kind: "addTeam" }])).toThrow(/fewer than 3 players/i);
  });

  it("scores an added Team exactly once its Captain is picked, and refuses a Captain who isn't in the pool", () => {
    const input = baseInput(singles(7), { isSolo: true, teamCount: 2, teams: [captainTeam("t1", "c1"), captainTeam("t2", "c2")] });
    expect(scoreChanges(input, [{ kind: "addTeam", captainUserId: "s3" }]).cutPlayers).toBe(0);
    expect(() => scoreChanges(input, [{ kind: "addTeam", captainUserId: "c1" }])).toThrow(ServiceError);
  });

  it("puts a removed Team's two Captains back as the pair they are", () => {
    const pairTeam: CutPlannerTeam = {
      teamId: "t3",
      members: [
        { userId: "x", signedUpAt: 0, insertionRank: nextRank++, timezoneRegion: null },
        { userId: "y", signedUpAt: 0, insertionRank: nextRank++, timezoneRegion: null },
      ],
      pairingId: "pxy",
    };
    // 3 Teams, 2 pairs in the pool: 2 pairs over 3 Teams is 0 each, so both pairs (4 players) are cut.
    const units = [pair("p1", "a", "b"), pair("p2", "c", "d")];
    const teams = [captainTeam("t1", "c1"), captainTeam("t2", "c2"), pairTeam];
    const input = baseInput(units, { teamCount: 3, teams });
    // Removing the pair's Team: 3 pairs over 2 Teams = 1 each, 1 pair (2 players) cut.
    expect(scoreChanges(input, [{ kind: "removeTeam", teamId: "t3" }]).cutPlayers).toBe(2);
    expect(() => scoreChanges(input, [{ kind: "removeTeam", teamId: "nope" }])).toThrow(ServiceError);
  });

  // The case an Admin hit: the plan claimed 0 cut, but only one of the Teams it could remove gets there.
  it("gives the range over an open Team pick, and what each pick leaves cut, not just the best case", () => {
    const pairTeam: CutPlannerTeam = {
      teamId: "t3",
      members: [
        { userId: "x", signedUpAt: 0, insertionRank: nextRank++, timezoneRegion: null },
        { userId: "y", signedUpAt: 0, insertionRank: nextRank++, timezoneRegion: null },
      ],
      pairingId: "pxy",
    };
    // 3 Teams, 5 pairs + 6 singles: 2 pairs (4 players) cut. Removing the pair-led Team: 6 pairs + 6 singles over 2 = 0 cut.
    // Removing a solo-led one: 5 pairs (1 cut) + 7 singles (1 cut) over 2 = 3 cut.
    const units = [pair("p1", "a", "b"), pair("p2", "c", "d"), pair("p3", "e", "f"), pair("p4", "g", "h"), pair("p5", "i", "j"), ...singles(6)];
    const input = baseInput(units, { teamCount: 3, teams: [captainTeam("t1", "c1"), captainTeam("t2", "c2"), pairTeam] });
    const open = scoreChanges(input, [{ kind: "removeTeam" }]);
    expect(open).toMatchObject({ cutPlayers: 0, cutPlayersMax: 3, cutPlayersNow: 4 });
    expect(open.pickOptions).toEqual({ t1: 3, t2: 3, t3: 0 });
    // Once picked the count is exact, and the other picks still say what they would leave.
    const picked = scoreChanges(input, [{ kind: "removeTeam", teamId: "t1" }]);
    expect(picked).toMatchObject({ cutPlayers: 3, cutPlayersMax: 3 });
    expect(picked.pickOptions).toEqual({ t1: 3, t2: 3, t3: 0 });
  });

  it("scores an open added Team for every possible Captain: in a duo bingo, only a pair's members", () => {
    const input = baseInput([pair("p1", "a", "b"), ...singles(7)], { teamCount: 2, teams: [captainTeam("t1", "c1"), captainTeam("t2", "c2")] });
    const { pickOptions } = scoreChanges(input, [{ kind: "addTeam" }]);
    // A duo Team is led by a pair, so the singles can't captain it.
    expect(Object.keys(pickOptions ?? {}).sort()).toEqual(["a", "b"]);
    expect(pickOptions?.a).toBe(pickOptions?.b); // a pair leaves together, whichever of them captains
  });

  it("scores an open added Team for every possible Captain: in a solo bingo, every single", () => {
    const input = baseInput(singles(7), { isSolo: true, teamCount: 2, teams: [captainTeam("t1", "c1"), captainTeam("t2", "c2")] });
    const { pickOptions } = scoreChanges(input, [{ kind: "addTeam" }]);
    expect(Object.keys(pickOptions ?? {}).sort()).toEqual(["s0", "s1", "s2", "s3", "s4", "s5", "s6"]);
    expect(new Set(Object.values(pickOptions ?? {}))).toEqual(new Set([0])); // any one of them leaving: 6 over 3 Teams
  });
});

// In a duo bingo every Team is led by a pair (CONTEXT.md), so an added Team's Captain comes out of the pool with their
// partner: a single can't captain one, and with no pair in the pool there's no Team to add.
describe("an added Team in a duo bingo is led by a pair", () => {
  const captainTeams = (): CutPlannerTeam[] =>
    ["c1", "c2"].map((c, i) => ({ teamId: `t${i + 1}`, members: [{ userId: c, signedUpAt: 0, insertionRank: nextRank++, timezoneRegion: null }], pairingId: null }));
  const singles = (n: number) => Array.from({ length: n }, (_, i) => single(`s${i}`, { signedUpAt: i }));

  it("refuses a single as the new Team's Captain, and takes a pair's member (the pair leaving together)", () => {
    const input = baseInput([pair("p1", "a", "b"), ...singles(7)], { teamCount: 2, teams: captainTeams() });
    expect(() => scoreChanges(input, [{ kind: "addTeam", captainUserId: "s0" }])).toThrow(/has to have a partner/);
    const picked = scoreChanges(input, [{ kind: "addTeam", captainUserId: "a" }]);
    // 7 singles over 3 Teams: 1 cut, the pair's partner gone with the Captain rather than left behind in the pool.
    expect(picked).toMatchObject({ cutPlayers: 1, cutPlayersMax: 1 });
    expect(picked.pickOptions).toEqual({ a: 1, b: 1 });
  });

  it("the same single is a fine Captain in a solo bingo", () => {
    const input = baseInput(singles(7), { isSolo: true, teamCount: 2, teams: captainTeams() });
    expect(scoreChanges(input, [{ kind: "addTeam", captainUserId: "s0" }]).cutPlayers).toBe(0);
  });

  it("refuses an open added Team when the pool has no pair to lead it", () => {
    const input = baseInput(singles(7), { teamCount: 2, teams: captainTeams() });
    expect(() => scoreChanges(input, [{ kind: "addTeam" }])).toThrow(ServiceError);
    expect(() => scoreChanges(input, [{ kind: "addTeam" }])).toThrow(/no pair left to lead a new Team/);
  });

  it("never proposes adding a Team when there's no pair to lead it, though the same pool would in a solo bingo", () => {
    // 2 Teams, 7 singles: 1 cut. A 3rd Team led by one of them would leave 6 over 3 (0 cut) — in a solo bingo.
    const solo = planCutChanges(baseInput(singles(7), { isSolo: true, teamCount: 2, teams: captainTeams() }));
    expect(solo.changes).toEqual([{ kind: "addTeam" }]);
    const duo = planCutChanges(baseInput(singles(7), { teamCount: 2, teams: captainTeams() }));
    expect(duo.changes.some((c) => c.kind === "addTeam")).toBe(false);
    expect(duo.cutPlayers).toBeLessThanOrEqual(duo.cutPlayersNow);
  });
});
