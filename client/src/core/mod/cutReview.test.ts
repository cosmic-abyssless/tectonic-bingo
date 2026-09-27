import { describe, expect, it } from "vitest";
import type { CutReviewPool } from "@bingo/shared";
import { appliedChanges, partnerChoices, restoreConflicts, rowsFromPlan, scoredChanges, setDropped, setPartner, setSplit, setTeamPick, splitChoices } from "./cutReview";

const pool: CutReviewPool = {
  singles: ["a", "b", "c", "d", "e"].map((userId) => ({ userId, rsn: userId.toUpperCase(), region: null })),
  pairs: [
    { pairingId: "p1", members: [{ userId: "x", rsn: "X" }, { userId: "y", rsn: "Y" }] },
    { pairingId: "p2", members: [{ userId: "z", rsn: "Z" }, { userId: "w", rsn: "W" }] },
  ],
  teams: [{ teamId: "t1", name: "One", captainRsn: "Cap" }],
};

describe("rowsFromPlan", () => {
  it("starts every Team pick blank, whatever the plan names", () => {
    const rows = rowsFromPlan([{ kind: "addTeam", captainUserId: "a" }, { kind: "removeTeam", teamId: "t1" }]);
    expect(rows).toMatchObject([
      { kind: "addTeam", captainUserId: null, dropped: false },
      { kind: "removeTeam", teamId: null, dropped: false },
    ]);
  });
});

describe("scoredChanges / appliedChanges", () => {
  it("leaves dropped rows out, and an empty list is a valid 'keep these cuts'", () => {
    const rows = rowsFromPlan([{ kind: "pair", userIds: ["a", "b"] }, { kind: "split", pairingId: "p1" }]);
    expect(scoredChanges(setDropped(rows, "change-0", true))).toEqual([{ kind: "split", pairingId: "p1" }]);
    const none = setDropped(setDropped(rows, "change-0", true), "change-1", true);
    expect(scoredChanges(none)).toEqual([]);
    expect(appliedChanges(none)).toEqual([]);
  });

  it("scores a Team change without its pick, but won't apply it until picked", () => {
    let rows = rowsFromPlan([{ kind: "pair", userIds: ["a", "b"] }, { kind: "addTeam" }]);
    expect(scoredChanges(rows)).toEqual([{ kind: "pair", userIds: ["a", "b"] }, { kind: "addTeam" }]);
    expect(appliedChanges(rows)).toBeNull();
    rows = setTeamPick(rows, "change-1", "c");
    expect(scoredChanges(rows)[1]).toEqual({ kind: "addTeam", captainUserId: "c" });
    expect(appliedChanges(rows)).toEqual([{ kind: "pair", userIds: ["a", "b"] }, { kind: "addTeam", captainUserId: "c" }]);
  });

  it("a dropped Team change doesn't hold up Apply", () => {
    const rows = setDropped(rowsFromPlan([{ kind: "removeTeam" }]), "change-0", true);
    expect(appliedChanges(rows)).toEqual([]);
  });

  it("picks which Team to remove", () => {
    const rows = setTeamPick(rowsFromPlan([{ kind: "removeTeam" }]), "change-0", "t1");
    expect(appliedChanges(rows)).toEqual([{ kind: "removeTeam", teamId: "t1" }]);
  });
});

describe("partnerChoices", () => {
  const rows = rowsFromPlan([{ kind: "pair", userIds: ["a", "b"] }, { kind: "pair", userIds: ["c", "d"] }]);
  const ids = (choices: CutReviewPool["singles"]) => choices.map((s) => s.userId);

  it("offers any single not in another pair row, nor this row's other slot", () => {
    expect(ids(partnerChoices(rows, "change-0", 1, pool))).toEqual(["b", "e"]);
    expect(ids(partnerChoices(rows, "change-0", 0, pool))).toEqual(["a", "e"]);
  });

  it("frees a dropped row's players", () => {
    expect(ids(partnerChoices(setDropped(rows, "change-1", true), "change-0", 1, pool))).toEqual(["b", "c", "d", "e"]);
  });

  it("keeps each player in at most one row after an edit", () => {
    const edited = setPartner(rows, "change-0", 1, "e");
    expect(edited[0]).toMatchObject({ userIds: ["a", "e"] });
    expect(ids(partnerChoices(edited, "change-1", 0, pool))).toEqual(["b", "c"]);
  });
});

describe("splitChoices", () => {
  it("offers any pair not split by another row", () => {
    const rows = rowsFromPlan([{ kind: "split", pairingId: "p1" }, { kind: "split", pairingId: "p2" }]);
    expect(splitChoices(rows, "change-0", pool).map((p) => p.pairingId)).toEqual(["p1"]);
    expect(splitChoices(setDropped(rows, "change-1", true), "change-0", pool).map((p) => p.pairingId)).toEqual(["p1", "p2"]);
  });

  it("re-points a split", () => {
    const rows = setSplit(rowsFromPlan([{ kind: "split", pairingId: "p1" }]), "change-0", "p2");
    expect(appliedChanges(rows)).toEqual([{ kind: "split", pairingId: "p2" }]);
  });
});

describe("restoreConflicts", () => {
  it("blocks restoring a dropped row whose player another row has since taken", () => {
    let rows = rowsFromPlan([{ kind: "pair", userIds: ["a", "b"] }, { kind: "pair", userIds: ["c", "d"] }]);
    rows = setDropped(rows, "change-0", true);
    expect(restoreConflicts(rows, "change-0")).toBe(false);
    rows = setPartner(rows, "change-1", 1, "a");
    expect(restoreConflicts(rows, "change-0")).toBe(true);
  });

  it("blocks restoring a split whose pair another row now splits", () => {
    let rows = rowsFromPlan([{ kind: "split", pairingId: "p1" }, { kind: "split", pairingId: "p2" }]);
    rows = setSplit(setDropped(rows, "change-0", true), "change-1", "p1");
    expect(restoreConflicts(rows, "change-0")).toBe(true);
  });
});
