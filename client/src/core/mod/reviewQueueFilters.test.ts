import { describe, expect, it } from "vitest";
import type { MinimalUser, ModSubmissionRow, SubmissionStatus } from "@bingo/shared";
import { inclusionFilter, storedPicks } from "../ui/inclusionFilter";
import {
  filterSubmissions,
  NOBODY_RECORDED,
  NOT_REVIEWED,
  reviewerOptions,
  submitterOptions,
} from "./reviewQueueFilters";

const user = (id: string): MinimalUser => ({ id, discordUsername: id, discordGlobalName: null, discordGuildNick: null, rsn: null }) as MinimalUser;
const [alice, bob, carol, mod] = ["alice", "bob", "carol", "mod"].map(user) as [MinimalUser, MinimalUser, MinimalUser, MinimalUser];

function row(id: string, o: { status?: SubmissionStatus; by?: MinimalUser | null; postedBy?: MinimalUser | null; reviewer?: MinimalUser | null; team?: string } = {}) {
  return {
    submission: { id, status: o.status ?? "pending" },
    team: o.team === "Team 2" ? { id: "t2", name: "Team 2", color: "#fff" } : { id: "t1", name: "Team 1", color: "#fff" },
    tile: { name: id === "3" ? "VORKATH" : "ZULRAH" },
    partLabels: ["Page 1"],
    proofTaskLabel: null,
    leaves: [],
    claims: id === "2" ? [{ itemName: "Tanzanite fang" }] : [],
    submittedByUser: o.by === undefined ? alice : o.by,
    postedByUser: o.postedBy ?? null,
    reviewedByUser: o.reviewer ?? null,
  } as unknown as ModSubmissionRow;
}

const ROWS = [
  row("1", { by: alice }),
  row("2", { by: bob, postedBy: carol, status: "approved", reviewer: mod }),
  row("3", { by: carol, status: "rejected", reviewer: mod, team: "Team 2" }),
  // An imported Historical Submission: reviewed, nobody on record.
  row("4", { by: alice, status: "approved", reviewer: null }),
  row("5", { by: null, status: "approved", reviewer: mod }),
];

function ids(filters: { status?: string[]; team?: string[]; submitter?: string[]; reviewer?: string[]; query?: string }) {
  const f = (keys: string[] | undefined, options: { key: string }[]) => inclusionFilter(new Set(keys ?? []), options);
  return filterSubmissions(ROWS, {
    status: f(filters.status, [{ key: "pending" }, { key: "approved" }, { key: "rejected" }]),
    team: f(filters.team, [{ key: "t1" }, { key: "t2" }]),
    submitter: f(filters.submitter, submitterOptions(ROWS)),
    reviewer: f(filters.reviewer, reviewerOptions(ROWS)),
    query: filters.query,
  }).map((r) => r.submission.id);
}

describe("submitterOptions", () => {
  it("lists everyone credited or posting, with how many Submissions each is on", () => {
    expect(submitterOptions(ROWS).map((o) => [o.key, o.count])).toEqual([
      ["alice", 2],
      ["bob", 1],
      ["carol", 2],
    ]);
  });

  it("counts a Player once on a Submission they're both credited to and posted", () => {
    expect(submitterOptions([row("1", { by: alice, postedBy: alice })])).toEqual([{ key: "alice", label: "alice", count: 1 }]);
  });
});

describe("reviewerOptions", () => {
  it("lists each reviewer, then Not reviewed and Nobody recorded, with counts", () => {
    expect(reviewerOptions(ROWS).map((o) => [o.key, o.label, o.count])).toEqual([
      ["mod", "mod", 3],
      [NOT_REVIEWED, "Not reviewed", 1],
      [NOBODY_RECORDED, "Nobody recorded", 1],
    ]);
  });

  it("leaves out the special options nothing falls under", () => {
    expect(reviewerOptions([row("2", { status: "approved", reviewer: mod })]).map((o) => o.key)).toEqual(["mod"]);
  });
});

describe("filterSubmissions", () => {
  it("passes everything with every filter on Any", () => {
    expect(ids({})).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("matches a submitter by who it's credited to or who posted it", () => {
    expect(ids({ submitter: ["carol"] })).toEqual(["2", "3"]);
    expect(ids({ submitter: ["alice", "bob"] })).toEqual(["1", "2", "4"]);
  });

  it("matches a reviewer, Not reviewed (pending) and Nobody recorded (reviewed, no reviewer)", () => {
    expect(ids({ reviewer: ["mod"] })).toEqual(["2", "3", "5"]);
    expect(ids({ reviewer: [NOT_REVIEWED] })).toEqual(["1"]);
    expect(ids({ reviewer: [NOBODY_RECORDED] })).toEqual(["4"]);
  });

  it("searches the Tile, Items, Team and people, ignoring case", () => {
    expect(ids({ query: "vork" })).toEqual(["3"]);
    expect(ids({ query: "FANG" })).toEqual(["2"]);
    expect(ids({ query: "team 2" })).toEqual(["3"]);
    expect(ids({ query: "carol" })).toEqual(["2", "3"]); // posted #2, credited with #3
    expect(ids({ query: "  " })).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("applies every filter at once", () => {
    expect(ids({ status: ["approved"], submitter: ["alice", "carol"] })).toEqual(["2", "4"]);
    expect(ids({ reviewer: ["mod"], team: ["t2"] })).toEqual(["3"]);
    expect(ids({ team: ["t1"] })).toEqual(["1", "2", "4", "5"]);
    expect(ids({ status: ["pending"], reviewer: ["mod"] })).toEqual([]);
  });

  it("still shows a new pending Submission under every Reviewer and Submitter picked while nothing was pending", () => {
    const reviewed = ROWS.filter((r) => r.submission.status !== "pending");
    const reviewers = storedPicks(reviewerOptions(reviewed).map((o) => o.key), reviewerOptions(reviewed));
    const submitters = storedPicks(submitterOptions(reviewed).map((o) => o.key), submitterOptions(reviewed));
    // The new one's by dave, whom no option listed when everyone was picked.
    const rows = [...ROWS, row("6", { by: user("dave") })];
    const shown = filterSubmissions(rows, {
      status: inclusionFilter(new Set(["pending"]), [{ key: "pending" }, { key: "approved" }, { key: "rejected" }]),
      team: inclusionFilter(new Set(), [{ key: "t1" }, { key: "t2" }]),
      submitter: inclusionFilter(new Set(submitters), submitterOptions(rows)),
      reviewer: inclusionFilter(new Set(reviewers), reviewerOptions(rows)),
    });
    expect(shown.map((r) => r.submission.id)).toEqual(["1", "6"]);
  });
});
