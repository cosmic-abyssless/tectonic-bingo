import { describe, expect, it } from "vitest";
import type { DraftPick, DraftTeam } from "@bingo/shared";
import { currentRosterPicks, groupByPick } from "./TeamRoster";

const user = (rsn: string) => ({ id: rsn, discordUsername: `${rsn}_dc`, discordGlobalName: null, discordGuildNick: null, rsn });
const pick = (pickNumber: number, teamId: string, rsn: string): DraftPick =>
  ({ id: `${pickNumber}-${rsn}`, bingoId: "b", pickNumber, teamId, userId: rsn, pickedByUserId: "x", createdAt: "", rsn, user: user(rsn) }) as DraftPick;
const team = (id: string, members: string[]): DraftTeam =>
  ({ id, bingoId: "b", captainUserId: `${id}-cap`, captainRsn: `${id}-cap`, coCaptain: null, members: members.map((rsn) => ({ userId: rsn, rsn, user: user(rsn) })) }) as unknown as DraftTeam;

describe("currentRosterPicks", () => {
  // A drafted Ann (pick 1) and the pair Bob + Bea (pick 3) on Team A; Cy (pick 2) on Team B.
  const picks = [pick(1, "A", "Ann"), pick(2, "B", "Cy"), pick(3, "A", "Bob"), pick(3, "A", "Bea")];

  it("is the team's picks while its members are the ones it drafted", () => {
    expect(currentRosterPicks(team("A", ["Ann", "Bob", "Bea"]), picks).map((p) => p.rsn)).toEqual(["Ann", "Bob", "Bea"]);
  });

  it("keeps a player who has left as their pick, marked left, so their pair stays a pair", () => {
    const roster = currentRosterPicks(team("A", ["Ann", "Bob"]), picks);
    expect(groupByPick(roster).map((g) => g.map((p) => [p.rsn, !!p.left]))).toEqual([[["Ann", false]], [["Bob", false], ["Bea", true]]]);
  });

  it("doesn't mark a drafted player made Captain since as left", () => {
    const promoted = { ...team("A", ["Bob", "Bea"]), captainUserId: "Ann" } as DraftTeam;
    expect(currentRosterPicks(promoted, picks).find((p) => p.rsn === "Ann")?.left).toBeUndefined();
  });

  it("adds a member who was never drafted (a late signup, a moved player) as a single after the last pick", () => {
    const roster = currentRosterPicks(team("A", ["Ann", "Bob", "Bea", "Late", "Cy"]), picks);
    expect(groupByPick(roster).map((g) => g.map((p) => p.rsn))).toEqual([["Ann"], ["Bob", "Bea"], ["Late"], ["Cy"]]);
    expect(roster.find((p) => p.rsn === "Late")).toMatchObject({ teamId: "A", userId: "Late", user: { id: "Late" } });
  });
});
