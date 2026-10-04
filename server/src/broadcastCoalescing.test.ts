// A burst of one event type for one Bingo goes out as the first at once and the rest as one at the window's end, so a
// burst of writes is a refetch or two on each open page, not one per write. Events whose payload a listener uses as
// data are never held or merged.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BroadcastEvent } from "@bingo/shared";
import { COALESCE_WINDOW_MS, createCoalescer, type Outgoing } from "./broadcastCoalescing";

let sent: Outgoing[];
let coalescer: ReturnType<typeof createCoalescer>;

beforeEach(() => {
  vi.useFakeTimers();
  sent = [];
  coalescer = createCoalescer((out) => sent.push(out));
});

afterEach(() => {
  coalescer.clear();
  vi.useRealTimers();
});

const teamUpdated = (bingoId: string, teamId = "t1"): BroadcastEvent => ({ type: "team_updated", bingoId, payload: { teamId } });
const push = (event: BroadcastEvent, to?: string[]) => coalescer.push({ event, ...(to ? { to } : {}) });
const types = () => sent.map((o) => o.event.type);

describe("a burst of one type for one Bingo", () => {
  it("sends the first at once and the rest as one at the window's end", () => {
    for (let i = 0; i < 10; i++) push(teamUpdated("b1", `t${i}`));
    expect(sent).toEqual([{ event: teamUpdated("b1", "t0") }]);

    vi.advanceTimersByTime(COALESCE_WINDOW_MS);
    // The latest held: no client reads team_updated's teamId.
    expect(sent).toEqual([{ event: teamUpdated("b1", "t0") }, { event: teamUpdated("b1", "t9") }]);

    // Nothing more was held, so the next window ends quietly, and the next event goes out at once again.
    vi.advanceTimersByTime(COALESCE_WINDOW_MS);
    expect(sent).toHaveLength(2);
    push(teamUpdated("b1"));
    expect(sent).toHaveLength(3);
  });

  it("is one event a window while it keeps coming", () => {
    // 40 colour saves over 10 seconds.
    for (let i = 0; i < 40; i++) {
      push(teamUpdated("b1"));
      vi.advanceTimersByTime(250);
    }
    vi.advanceTimersByTime(COALESCE_WINDOW_MS);
    // The first at once, then one at the end of each of the 20 windows it kept coming through.
    expect(sent.length).toBe(21);
  });

  it("sends a lone event at once, with nothing after it", () => {
    push({ type: "bingo_changed", bingoId: "b1", payload: {} });
    expect(types()).toEqual(["bingo_changed"]);
    vi.advanceTimersByTime(COALESCE_WINDOW_MS * 3);
    expect(types()).toEqual(["bingo_changed"]);
  });
});

describe("what is held apart", () => {
  it("doesn't hold back another Bingo's events, or another type's", () => {
    push(teamUpdated("b1"));
    push(teamUpdated("b1"));
    push(teamUpdated("b2"));
    push({ type: "audit_appended", bingoId: "b1", payload: { teamId: "t1", visibility: "public" } });
    expect(sent.map((o) => [o.event.type, "bingoId" in o.event && o.event.bingoId])).toEqual([
      ["team_updated", "b1"],
      ["team_updated", "b2"],
      ["audit_appended", "b1"],
    ]);
    vi.advanceTimersByTime(COALESCE_WINDOW_MS);
    expect(sent).toHaveLength(4);
  });

  it("keeps a Team's ratings apart from another Team's, each for its own leads", () => {
    const rating = (teamId: string): BroadcastEvent => ({ type: "draft_rating_changed", bingoId: "b1", payload: { teamId } });
    push(rating("t1"), ["lead1"]);
    push(rating("t2"), ["lead2"]);
    push(rating("t1"), ["lead1"]);
    push(rating("t2"), ["lead2"]);
    vi.advanceTimersByTime(COALESCE_WINDOW_MS);
    expect(sent).toEqual([
      { event: rating("t1"), to: ["lead1"] },
      { event: rating("t2"), to: ["lead2"] },
      { event: rating("t1"), to: ["lead1"] },
      { event: rating("t2"), to: ["lead2"] },
    ]);
  });

  it("keeps one user's Achievements apart from another's", () => {
    const earned = (userId: string): BroadcastEvent => ({ type: "achievements_changed", bingoId: "b1", payload: { userId } });
    push(earned("u1"));
    push(earned("u2"));
    expect(sent).toHaveLength(2);
  });
});

describe("merging what the client reads", () => {
  it("names every user held in access_changed", () => {
    const access = (userIds: string[]): BroadcastEvent => ({ type: "access_changed", bingoId: "b1", payload: { userIds } });
    push(access(["u1"]));
    push(access(["u2", "u3"]));
    push(access(["u3", "u4"]));
    vi.advanceTimersByTime(COALESCE_WINDOW_MS);
    expect(sent.map((o) => o.event)).toEqual([access(["u1"]), access(["u2", "u3", "u4"])]);
  });

  it("names every node held in submission_reviewed", () => {
    const reviewed = (nodeIds: string[]): BroadcastEvent => ({ type: "submission_reviewed", bingoId: "b1", payload: { teamId: "t1", nodeIds } });
    push(reviewed(["n0"]));
    push(reviewed(["n1"]));
    push(reviewed(["n2", "n1"]));
    vi.advanceTimersByTime(COALESCE_WINDOW_MS);
    expect(sent.at(-1)!.event).toEqual(reviewed(["n1", "n2"]));
  });

  it("sends a merge of events for some users to all of them, and to everyone if one was for everyone", () => {
    const access = (userIds: string[]): BroadcastEvent => ({ type: "access_changed", bingoId: "b1", payload: { userIds } });
    push(access(["u0"]));
    push(access(["u1"]), ["u1"]);
    push(access(["u2"]), ["u2"]);
    vi.advanceTimersByTime(COALESCE_WINDOW_MS);
    expect(sent.at(-1)!.to).toEqual(["u1", "u2"]);

    vi.advanceTimersByTime(COALESCE_WINDOW_MS);
    push(access(["u0"]));
    push(access(["u1"]), ["u1"]);
    push(access(["u2"]));
    vi.advanceTimersByTime(COALESCE_WINDOW_MS);
    expect(sent.at(-1)!.to).toBeUndefined();
  });
});

describe("events sent as they come", () => {
  it("sends every Draft pick, and every undo, at once", () => {
    const pick = (pickNumber: number): BroadcastEvent => ({ type: "draft_pick", bingoId: "b1", payload: { pickNumber, teamId: "t1", userIds: [`u${pickNumber}`] } });
    for (let n = 1; n <= 5; n++) push(pick(n));
    push({ type: "draft_pick_undone", bingoId: "b1", payload: { pickNumber: 5, teamId: "t1", userIds: ["u5"] } });
    expect(sent.map((o) => o.event)).toEqual([pick(1), pick(2), pick(3), pick(4), pick(5), { type: "draft_pick_undone", bingoId: "b1", payload: { pickNumber: 5, teamId: "t1", userIds: ["u5"] } }]);
    vi.advanceTimersByTime(COALESCE_WINDOW_MS);
    expect(sent).toHaveLength(6);
  });

  it("sends every stage change, whose toast names the stage", () => {
    push({ type: "stage_changed", bingoId: "b1", payload: { stage: "reveal" } });
    push({ type: "stage_changed", bingoId: "b1", payload: { stage: "live" } });
    expect(types()).toEqual(["stage_changed", "stage_changed"]);
  });

  it("sends a stats refresh's start and end, but holds a plain signup change", () => {
    push({ type: "signup_changed", bingoId: "b1", payload: { signupId: "s1", statsRefreshing: true } });
    push({ type: "signup_changed", bingoId: "b1", payload: { signupId: "s1", statsRefreshing: false, statsFailed: false } });
    push({ type: "signup_changed", bingoId: "b1", payload: {} });
    push({ type: "signup_changed", bingoId: "b1", payload: {} });
    expect(sent).toHaveLength(3);
    vi.advanceTimersByTime(COALESCE_WINDOW_MS);
    expect(sent).toHaveLength(4);
  });

  it("sends site-wide events as they come", () => {
    push({ type: "bug_report_changed", payload: { id: "r1" } });
    push({ type: "bug_report_changed", payload: { id: "r2" } });
    push({ type: "access_changed", bingoId: null, payload: { userIds: ["u1"] } });
    push({ type: "access_changed", bingoId: null, payload: { userIds: ["u2"] } });
    expect(sent).toHaveLength(4);
  });
});

it("drops what it holds when cleared", () => {
  push(teamUpdated("b1"));
  push(teamUpdated("b1"));
  coalescer.clear();
  vi.advanceTimersByTime(COALESCE_WINDOW_MS);
  expect(sent).toHaveLength(1);
});
