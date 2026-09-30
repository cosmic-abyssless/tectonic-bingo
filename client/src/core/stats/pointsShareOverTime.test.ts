import { describe, expect, it } from "vitest";
import type { ContributionAward, ContributionCount } from "@bingo/shared";
import { pointsShareOverTime, topWithViewer } from "./pointsShareOverTime";

const award = (label: string, points: number, at: string): ContributionAward => ({ nodeId: label, kind: "task", label, awardPoints: points, points, fraction: 1, at, claims: [] });

const player = (userId: string, teamId: string, awards: ContributionAward[]): ContributionCount => ({
  userId,
  user: { id: userId, discordUsername: userId, discordGlobalName: null, discordGuildNick: null, discordId: userId, discordAvatar: null },
  teamId,
  approvedSubmissions: awards.length,
  pointsShare: awards.reduce((sum, a) => sum + a.points, 0),
  gpGained: 0,
  awards,
});

const T1 = "2026-09-01T10:00:00.000Z";
const T2 = "2026-09-01T11:00:00.000Z";
const T3 = "2026-09-01T12:00:00.000Z";

describe("pointsShareOverTime", () => {
  it("runs each Player's share up at their own awards, alongside their Team's points", () => {
    const [alice, bob] = pointsShareOverTime([player("alice", "a", [award("Zulrah", 10, T1), award("Vorkath", 5, T3)]), player("bob", "a", [award("Hydra", 30, T2)])]);
    expect(alice!.dots.map((d) => [d.at, d.share, d.teamPoints])).toEqual([
      [Date.parse(T1), 10, 10],
      [Date.parse(T3), 15, 45], // Bob's 30 in between counts toward the Team's points, not a dot of Alice's
    ]);
    expect(bob!.dots.map((d) => [d.at, d.share, d.teamPoints])).toEqual([[Date.parse(T2), 30, 40]]);
  });

  it("makes awards credited at the same moment one step", () => {
    const [alice] = pointsShareOverTime([player("alice", "a", [award("Task", 10, T1), award("Tile bonus", 20, T1)])]);
    expect(alice!.dots).toEqual([{ at: Date.parse(T1), share: 30, teamPoints: 30, earned: [{ label: "Task", points: 10 }, { label: "Tile bonus", points: 20 }] }]);
  });

  it("keeps Teams apart and leaves out Players with nothing earned", () => {
    const series = pointsShareOverTime([player("alice", "a", [award("Zulrah", 10, T1)]), player("carol", "b", [award("Hydra", 30, T2)]), player("dave", "b", [])]);
    expect(series.map((s) => [s.player.userId, s.dots.at(-1)!.teamPoints])).toEqual([
      ["alice", 10],
      ["carol", 30],
    ]);
  });

  it("skips an award with no time rather than hanging", () => {
    const undated = { ...award("Zulrah", 10, T1), at: undefined as unknown as string };
    const series = pointsShareOverTime([player("alice", "a", [undated, award("Vorkath", 5, T2)]), player("bob", "a", [undated])]);
    expect(series.map((s) => [s.player.userId, s.dots.map((d) => d.share)])).toEqual([["alice", [5]]]);
  });
});

describe("topWithViewer", () => {
  const team = pointsShareOverTime([1, 2, 3, 4, 5].map((n) => player(`p${n}`, "a", [award(`Task ${n}`, n * 10, T1)])));
  const ids = (series: ReturnType<typeof topWithViewer>) => series.map((s) => s.player.userId);

  it("keeps the top ones, highest share first", () => {
    expect(ids(topWithViewer(team, 3, undefined))).toEqual(["p5", "p4", "p3"]);
  });

  it("adds the viewer at the end when they're further down", () => {
    expect(ids(topWithViewer(team, 3, "p1"))).toEqual(["p5", "p4", "p3", "p1"]);
  });

  it("doesn't add the viewer twice when they're already in the top", () => {
    expect(ids(topWithViewer(team, 3, "p4"))).toEqual(["p5", "p4", "p3"]);
  });
});
