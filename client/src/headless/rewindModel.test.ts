import { describe, expect, it } from "vitest";
import type { GraphNode, RewindResponse, RewindSubmission, SignificanceTier, Tile } from "@bingo/shared";
import { adjustmentsAt, boardStateAt, closingRows, countUpTo, formatOneIn, playbackHolds, PLAYBACK, prepareRewind, standoutOf, stepNext, stepPrev, teamPointsAt, tileTeamsAt, visibleItems } from "./rewindModel";
import { buildTileModelsStatic } from "./boardModel";

const MIN = 60_000;
const T0 = Date.UTC(2026, 0, 1, 12);
const iso = (minutes: number) => new Date(T0 + minutes * MIN).toISOString();

function sub(id: string, minutes: number, opts: { status?: "approved" | "rejected"; tier?: SignificanceTier; claims?: { nodeId: string; quantity: number }[]; teamId?: string } = {}): RewindSubmission {
  return {
    id,
    teamId: opts.teamId ?? "team",
    status: opts.status ?? "approved",
    submittedAt: iso(minutes),
    player: null,
    tileId: "tile",
    screenshotUrl: null,
    claims: (opts.claims ?? []).map((c, i) => ({ id: `${id}-c${i}`, nodeId: c.nodeId, label: "Scales", itemName: "Zulrah's scales", quantity: c.quantity, gpValue: null, luckOneIn: null, luckKills: null })),
    gpValue: null,
    reactions: [],
    completed: { tiles: [], lines: [], firstTiles: [], firstParts: [] },
    significance: { score: 0, tier: opts.tier ?? "minor" },
  };
}

// One Tile with a SUM Part: 5 scales over one item leaf. s1 brings 2, s2 (rejected) 9, s3 3 (completing it).
function fixture(): RewindResponse {
  return {
    startAt: iso(0),
    endAt: iso(100),
    submissions: [
      sub("s1", 10, { claims: [{ nodeId: "scales", quantity: 2 }] }),
      sub("s2", 20, { status: "rejected", claims: [{ nodeId: "scales", quantity: 9 }], tier: "notable" }),
      sub("s3", 30, { claims: [{ nodeId: "scales", quantity: 3 }], tier: "huge" }),
    ],
    teams: [
      {
        teamId: "team",
        nodes: [
          { nodeId: "sum", completedAt: iso(30), submissionId: "s3", pointsAwarded: 20, pointsAt: iso(30) },
          { nodeId: "scales", completedAt: iso(10), submissionId: "s1", pointsAwarded: 0, pointsAt: null },
          { nodeId: "tileNode", completedAt: iso(30), submissionId: "s3", pointsAwarded: 5, pointsAt: iso(30) },
        ],
        adjustments: [{ id: "adj", amount: -4, reason: "late", createdAt: iso(90) }],
        finalPoints: 21,
      },
    ],
  };
}

const leaf: GraphNode = { id: "scales", kind: "ITEM", itemName: "Zulrah's scales", children: [] } as unknown as GraphNode;
const sumNode: GraphNode = { id: "sum", kind: "SUM", quantity: 5, label: "Scales", points: 20, children: [leaf] } as unknown as GraphNode;
const tile = { id: "tile", name: "ZULRAH", nodeId: "tileNode", boardRow: 0, boardCol: 0, categoryId: null, node: { id: "tileNode", kind: "ALL", points: 5, children: [sumNode] } } as unknown as Tile;

function sumProgressAt(minutes: number) {
  const data = prepareRewind(fixture());
  const state = boardStateAt(data.teams.get("team"), data.itemsByTeam.get("team")!, T0 + minutes * MIN);
  const [model] = buildTileModelsStatic({ tiles: [tile], categories: [], ...state, bingoStartsAt: null, interests: [], viewerUserId: "me" });
  return { tree: model!.tasks[0]!.tree!, progress: model!.progress };
}

describe("boardStateAt", () => {
  it("shows a SUM Part's progress only from approved Submissions made by then", () => {
    expect(sumProgressAt(5).tree.progress).toEqual({ current: 0, target: 5 });
    expect(sumProgressAt(15).tree.progress).toEqual({ current: 2, target: 5 });
    // The rejected s2 (9 scales) never counts.
    expect(sumProgressAt(25).tree.progress).toEqual({ current: 2, target: 5 });
    expect(sumProgressAt(25).progress.allComplete).toBe(false);
    expect(sumProgressAt(30).tree.progress).toEqual({ current: 5, target: 5 });
    expect(sumProgressAt(30).progress).toMatchObject({ allComplete: true, pointsAwarded: 25 });
  });

  it("scores every moment, Point Adjustments included from when they were made, ending on the final score", () => {
    const data = prepareRewind(fixture());
    const team = data.teams.get("team");
    expect(teamPointsAt(team, T0 + 29 * MIN)).toBe(0);
    expect(teamPointsAt(team, T0 + 30 * MIN)).toBe(25);
    expect(teamPointsAt(team, T0 + 95 * MIN)).toBe(21);
    expect(teamPointsAt(team, data.end)).toBe(team!.finalPoints);
    expect(adjustmentsAt(team, "bingo", T0 + 89 * MIN)).toEqual([]);
    expect(adjustmentsAt(team, "bingo", T0 + 90 * MIN)).toHaveLength(1);
  });
});

// The fixture plus a second Team, "other", that finishes the same Tile in one go at minute 50.
function twoTeams(): RewindResponse {
  const data = fixture();
  data.submissions.push(sub("o1", 50, { teamId: "other", claims: [{ nodeId: "scales", quantity: 5 }] }));
  data.teams.push({
    teamId: "other",
    nodes: [
      { nodeId: "sum", completedAt: iso(50), submissionId: "o1", pointsAwarded: 20, pointsAt: iso(50) },
      { nodeId: "scales", completedAt: iso(50), submissionId: "o1", pointsAwarded: 0, pointsAt: null },
      { nodeId: "tileNode", completedAt: iso(50), submissionId: "o1", pointsAwarded: 5, pointsAt: iso(50) },
    ],
    adjustments: [],
    finalPoints: 25,
  });
  return data;
}

describe("All Teams", () => {
  const data = prepareRewind(twoTeams());

  it("puts every Team's Submissions on one timeline, oldest first", () => {
    expect(data.allItems.map((i) => i.sub.id)).toEqual(["s1", "s2", "s3", "o1"]);
  });

  it("marks a Tile complete for exactly the Teams whose own Board has it complete at that moment", () => {
    for (const minutes of [0, 15, 30, 49, 50, 100]) {
      const at = T0 + minutes * MIN;
      const teams = tileTeamsAt([tile], data, ["team", "other"], at).get("tile")!;
      for (const teamId of ["team", "other"]) {
        const state = boardStateAt(data.teams.get(teamId), data.itemsByTeam.get(teamId)!, at);
        const [own] = buildTileModelsStatic({ tiles: [tile], categories: [], ...state, bingoStartsAt: null, interests: [], viewerUserId: "me" });
        const mine = teams.find((t) => t.teamId === teamId)!;
        expect(mine.complete).toBe(own!.progress.allComplete);
        expect(mine.pointsAwarded).toBe(own!.progress.pointsAwarded);
      }
    }
    const at = (minutes: number) => tileTeamsAt([tile], data, ["team", "other"], T0 + minutes * MIN).get("tile")!.filter((t) => t.complete).map((t) => t.teamId);
    expect(at(29)).toEqual([]);
    expect(at(30)).toEqual(["team"]);
    expect(at(50)).toEqual(["team", "other"]);
  });
});

describe("stepping", () => {
  const data = prepareRewind(fixture());
  const all = data.itemsByTeam.get("team")!;
  const shown = visibleItems(all, false);
  const notable = (i: (typeof all)[number]) => i.sub.significance.tier !== "minor";

  it("hides rejected Submissions unless they're switched on", () => {
    expect(shown.map((i) => i.sub.id)).toEqual(["s1", "s3"]);
    expect(visibleItems(all, true).map((i) => i.sub.id)).toEqual(["s1", "s2", "s3"]);
  });

  it("goes to the next and previous Submission from a focused one or from a scrubbed moment", () => {
    expect(stepNext(shown, T0, -1)).toBe(0);
    expect(stepNext(shown, T0 + 10 * MIN, 0)).toBe(1);
    expect(stepNext(shown, T0 + 30 * MIN, 1)).toBe(-1);
    // Scrubbed to between s1 and s3: next is s3, previous is s1 (the drop that got the Board there).
    expect(stepNext(shown, T0 + 15 * MIN, -1)).toBe(1);
    expect(stepPrev(shown, T0 + 15 * MIN, -1)).toBe(0);
    expect(stepPrev(shown, T0 + 10 * MIN, 0)).toBe(-1);
  });

  it("steps over minor Submissions for the notable steps", () => {
    const withRejected = visibleItems(all, true);
    expect(stepNext(withRejected, T0, -1, notable)).toBe(1);
    expect(stepNext(withRejected, T0 + 20 * MIN, 1, notable)).toBe(2);
    expect(stepPrev(withRejected, T0 + 30 * MIN, 2, notable)).toBe(1);
    expect(stepPrev(withRejected, T0 + 20 * MIN, 1, notable)).toBe(-1);
  });

  it("counts Submissions made by a moment, inclusive", () => {
    expect(countUpTo(shown, T0 + 10 * MIN - 1)).toBe(0);
    expect(countUpTo(shown, T0 + 10 * MIN)).toBe(1);
    expect(countUpTo(shown, T0 + 999 * MIN)).toBe(2);
  });
});

describe("playbackHolds", () => {
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const minutes = (ms: number) => ms / 60_000;
  // Roughly how generated test-data Bingos come out: mostly minor, some notable, a few huge.
  const bingo = (n: number): SignificanceTier[] => Array.from({ length: n }, (_, i) => (i % 25 === 0 ? "huge" : i % 6 === 0 ? "notable" : "minor"));

  it("holds each tier for its own time in a small Bingo, well under the ceiling", () => {
    const [minor, notable, huge] = playbackHolds(["minor", "notable", "huge", "minor", "notable"]);
    expect([minor, notable, huge]).toEqual([PLAYBACK.holdMs.minor, PLAYBACK.holdMs.notable, PLAYBACK.holdMs.huge]);
    expect(minutes(sum(playbackHolds(bingo(40))))).toBeLessThan(2);
  });

  it("never holds one Submission for long, however few big ones there are", () => {
    // A Team with a handful of huge Submissions among many minor ones used to hold each huge one for ~25s.
    const holds = playbackHolds([...Array.from({ length: 117 }, () => "minor" as const), ...Array.from({ length: 21 }, () => "notable" as const), "huge", "huge", "huge", "huge"]);
    expect(Math.max(...holds)).toBe(PLAYBACK.holdMs.huge);
  });

  it("plays every Team's Submissions together in about 7 minutes", () => {
    // Six Teams of a typical and of a large Bingo, merged for the All Teams view.
    for (const perTeam of [250, 400]) {
      const total = minutes(sum(playbackHolds(bingo(6 * perTeam), PLAYBACK.allTeamsMinMinorMs)));
      expect(total).toBeGreaterThanOrEqual(6);
      expect(total).toBeLessThanOrEqual(8);
    }
  });

  it("fits a large Bingo into 7 minutes, keeping the tiers' ratios", () => {
    const holds = playbackHolds(bingo(1_200));
    expect(minutes(sum(holds))).toBeLessThanOrEqual(7.01);
    expect(minutes(sum(holds))).toBeGreaterThan(6);
    const [huge, , , , , , notable] = holds;
    expect(huge! / notable!).toBeCloseTo(PLAYBACK.holdMs.huge / PLAYBACK.holdMs.notable);
  });

  it("gives minor Submissions the minimum hold when there are too many to share the time", () => {
    const holds = playbackHolds([...Array.from({ length: 5_000 }, () => "minor" as const), "notable", "huge"]);
    expect(holds[0]).toBe(PLAYBACK.minMinorMs);
    expect(holds.at(-2)).toBe(PLAYBACK.minNotableMs);
    expect(holds.at(-1)! / holds.at(-2)!).toBeCloseTo(PLAYBACK.holdMs.huge / PLAYBACK.holdMs.notable);
  });

  it("is empty with nothing to play", () => {
    expect(playbackHolds([])).toEqual([]);
  });
});

describe("formatOneIn", () => {
  it("reads as 1 in N, rounded", () => {
    expect(formatOneIn(7.4)).toBe("1 in 7");
    expect(formatOneIn(1234)).toBe(`1 in ${(1230).toLocaleString()}`);
  });
});

describe("closingRows", () => {
  const rows = [
    { id: "a", teamId: "t1" },
    { id: "b", teamId: "t2" },
    { id: "c", teamId: null },
  ];

  it("keeps the viewed Team's rows and the ones with no Team, like the Stats page's filter with that Team picked", () => {
    expect(closingRows(rows, "t1").map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("keeps every row in the All Teams view", () => {
    expect(closingRows(rows, null).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});

describe("standoutOf", () => {
  const NOTHING = { tiles: [], lines: [], firstTiles: [], firstParts: [] };
  const withClaim = (gpValue: number | null, luckOneIn: number | null): RewindSubmission => {
    const s = sub("x", 1, { claims: [{ nodeId: "scales", quantity: 1 }] });
    return { ...s, gpValue, claims: s.claims.map((c) => ({ ...c, gpValue, luckOneIn })) };
  };

  it("calls out the signal that counted most, with its value", () => {
    expect(standoutOf(withClaim(80_000_000, 20))).toEqual({ kind: "gp", value: "80m" });
    expect(standoutOf(withClaim(200_000, 5_000))).toEqual({ kind: "luck", value: formatOneIn(5_000) });
    const users = Array.from({ length: 7 }, (_, i) => ({ id: `u${i}`, discordUsername: `u${i}`, discordGlobalName: null, discordGuildNick: null, rsn: null }));
    const hyped = { ...withClaim(1_000_000, null), reactions: [{ emoji: "🔥", users }] } as RewindSubmission;
    expect(standoutOf(hyped)).toEqual({ kind: "reactions", value: "7" });
  });

  it("says what it completed: a Line over a Tile, a first with no value", () => {
    const base = withClaim(null, null);
    expect(standoutOf({ ...base, completed: { ...NOTHING, tiles: ["ZULRAH"], lines: ["Row 2"] } })).toEqual({ kind: "line", value: "Row 2" });
    expect(standoutOf({ ...base, completed: { ...NOTHING, tiles: ["ZULRAH"] } })).toEqual({ kind: "tile", value: "ZULRAH" });
    expect(standoutOf({ ...base, completed: { ...NOTHING, tiles: ["ZULRAH"], firstTiles: ["ZULRAH"] } })).toEqual({ kind: "first", value: null });
    expect(standoutOf({ ...base, completed: { ...NOTHING, firstParts: ["ZULRAH — Page 1"] } })).toEqual({ kind: "first", value: null });
  });

  it("never calls out a signal the Submission doesn't have", () => {
    // A pet: no GP value, so a little Luck wins even though it's weak.
    expect(standoutOf(withClaim(null, 12))?.kind).toBe("luck");
    expect(standoutOf(withClaim(null, null))).toBeNull();
  });
});
