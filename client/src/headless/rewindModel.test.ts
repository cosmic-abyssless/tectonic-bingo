import { describe, expect, it } from "vitest";
import type { GraphNode, RewindResponse, RewindSubmission, SignificanceTier, Tile } from "@bingo/shared";
import { adjustmentsAt, boardStateAt, countUpTo, formatOneIn, playbackHolds, PLAYBACK, prepareRewind, stepNext, stepPrev, teamPointsAt, visibleItems } from "./rewindModel";
import { buildTileModelsStatic } from "./boardModel";

const MIN = 60_000;
const T0 = Date.UTC(2026, 0, 1, 12);
const iso = (minutes: number) => new Date(T0 + minutes * MIN).toISOString();

function sub(id: string, minutes: number, opts: { status?: "approved" | "rejected"; tier?: SignificanceTier; claims?: { nodeId: string; quantity: number }[] } = {}): RewindSubmission {
  return {
    id,
    teamId: "team",
    status: opts.status ?? "approved",
    submittedAt: iso(minutes),
    player: null,
    tileId: "tile",
    screenshotUrl: null,
    claims: (opts.claims ?? []).map((c, i) => ({ id: `${id}-c${i}`, nodeId: c.nodeId, label: "Scales", itemName: "Zulrah's scales", quantity: c.quantity, gpValue: null, luckOneIn: null })),
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

  it("plays a small Bingo in about 7 minutes", () => {
    const holds = playbackHolds(bingo(40));
    expect(Math.abs(minutes(sum(holds)) - 7)).toBeLessThanOrEqual(1);
  });

  it("plays a large Bingo in about 7 minutes", () => {
    const holds = playbackHolds(bingo(1_200));
    expect(Math.abs(minutes(sum(holds)) - 7)).toBeLessThanOrEqual(1);
  });

  it("holds a huge Submission 4× a notable one, and a minor one only briefly", () => {
    const [minor, notable, huge] = playbackHolds(["minor", "notable", "huge", "minor", "notable"]);
    expect(huge! / notable!).toBeCloseTo(4);
    expect(minor!).toBeLessThan(notable!);
  });

  it("gives minor Submissions the minimum hold when there are too many to share the time", () => {
    const holds = playbackHolds([...Array.from({ length: 5_000 }, () => "minor" as const), "notable", "huge"]);
    expect(holds[0]).toBe(PLAYBACK.minMinorMs);
    expect(holds.at(-1)! / holds.at(-2)!).toBeCloseTo(4);
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
