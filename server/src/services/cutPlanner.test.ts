// cutPlanner is pure and DB-free (see its header comment), so its tests build CutPlannerUnit fixtures directly —
// no createTestDb needed. CONTEXT.md "Cut review" has the vocabulary these tests are named after.
import { describe, expect, it } from "vitest";
import type { TimeZoneRegion } from "@bingo/shared";
import { minTeamSize, planCutChanges, resolveChanges, scoreChanges, type CutPlannerInput, type CutPlannerUnit } from "./cutPlanner";
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
    expect(plan.changes).toEqual([{ kind: "pair", signupIds: ["c", "d"] }]);
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
    expect(plan.changes).toEqual([{ kind: "pair", signupIds: ["europe-early", "europe-late"] }]);
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
    expect(result).toEqual({ cutPlayers: 2, cutPlayersNow: 2 });
  });

  it("scores the admin's own edit the same way the planner would", () => {
    const result = scoreChanges(scenario(), [{ kind: "pair", signupIds: ["c", "d"] }]);
    expect(result).toEqual({ cutPlayers: 0, cutPlayersNow: 2 });
  });

  it("resolves a multi-step edit in order: split, then pair one of the resulting halves", () => {
    const input = baseInput([pair("p1", "a", "b"), single("c")], { teamCount: 2 });
    // Splitting p1 first frees "a" and "b" up to be re-paired with "c" — order matters.
    const { units, teamCount } = resolveChanges(input, [
      { kind: "split", pairingId: "p1" },
      { kind: "pair", signupIds: ["a", "c"] },
    ]);
    expect(teamCount).toBe(2);
    expect(units).toHaveLength(2); // one pair (a & c), one single (b)
    expect(units.some((u) => u.entries.length === 2 && u.entries.map((e) => e.userId).sort().join() === "a,c")).toBe(true);
    expect(units.some((u) => u.entries.length === 1 && u.entries[0]!.userId === "b")).toBe(true);
  });

  it("rejects a pairing referencing a signup that's no longer unpaired", () => {
    expect(() => resolveChanges(scenario(), [{ kind: "pair", signupIds: ["a", "c"] }])).toThrow(ServiceError);
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
