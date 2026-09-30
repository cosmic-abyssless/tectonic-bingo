import { describe, expect, it } from "vitest";
import type { GraphNode, Tile } from "@bingo/shared";
import { TUTORIAL_IDLE, TUTORIAL_STEP_COUNT, tutorialAutoStarts, tutorialReducer, tutorialStepLabel, tutorialSteps, tutorialTileFacts, type TutorialAction, type TutorialState } from "./tutorial";

// CONTEXT.md "Tutorial" (#345): its steps, and how Start / Next / Skip and the real opens and closes move it.

const node = (id: string, over: Partial<GraphNode> = {}) =>
  ({ id, bingoId: "b", kind: "ALL", label: id, description: null, notes: null, points: 0, minCount: null, quantity: null, itemName: null, pointsGateNodeId: null, submitGateNodeId: null, allowsPreLoad: false, valuedAs: null, requiresProof: false, proofNote: null, children: [], ...over }) as GraphNode;
const tile = (parts: GraphNode[], over: Partial<Tile> = {}) => ({ id: "t", requiresProof: false, node: node("root", { children: parts }), ...over }) as Tile;

const plain = { needsProof: false, pointsWait: false };
const steps = tutorialSteps(plain, "Tectonic's Comics Bingo");
const at = (id: string) => steps.findIndex((s) => s.id === id);
const run = (actions: TutorialAction[], from: TutorialState = TUTORIAL_IDLE) => actions.reduce((s, a) => tutorialReducer(steps, s, a), from);
const on = (id: string, over: Partial<TutorialState> = {}): TutorialState => ({ ...TUTORIAL_IDLE, active: true, index: at(id), ...over });

describe("the Tutorial's steps", () => {
  it("run from Welcome (1) to Done (9) in order", () => {
    expect(steps[0]).toMatchObject({ id: "welcome", number: 1, targets: [], title: "Welcome to Tectonic's Comics Bingo!", large: true });
    expect(steps.filter((s) => s.large).map((s) => s.id)).toEqual(["welcome"]);
    expect(steps.at(-1)).toMatchObject({ id: "done", number: 9, targets: [] });
    expect(steps.map((s) => s.number)).toEqual([...steps.map((s) => s.number)].sort((a, b) => a - b));
    expect(new Set(steps.map((s) => s.number)).size).toBe(TUTORIAL_STEP_COUNT);
  });

  it("wait for the real click only at 3 (a Tile), 6 (Submit) and 8 (the ☰ menu)", () => {
    const waiting = steps.filter((s) => s.waitsFor);
    expect(waiting.map((s) => [s.number, s.waitsFor, s.targets])).toEqual([
      [3, "tile", ["board"]],
      [6, "submit", ["submit"]],
      [8, "menu", ["menu"]],
    ]);
  });

  it("let only the clicked-for element take a click: Task interest is pointed at, not pressed", () => {
    expect(steps.filter((s) => s.clickable).map((s) => s.id)).toEqual(["open-tile", "open-submit", "open-menu"]);
    expect(steps[at("task-interest")].waitsFor).toBeNull();
  });

  it("number a step's sub-steps on from .1, with the click that opens them keeping the plain number", () => {
    const label = (id: string, passed: string[] = []) => tutorialStepLabel(steps, at(id), passed.map(at));
    expect([label("welcome"), label("open-tile"), label("tile-submit"), label("done")]).toEqual(["1", "3", "5", "9"]);
    expect([label("tile-parts"), label("task-interest")]).toEqual(["4.1", "4.2"]);
    expect([label("submit-screenshot"), label("submit-tile"), label("submit-review")]).toEqual(["7.1", "7.2", "7.7"]);
    expect([label("open-menu"), label("menu-submissions"), label("menu-tutorial")]).toEqual(["8", "8.1", "8.4"]);
  });

  it("don't count a step passed over: the ones shown run on without a gap", () => {
    expect(tutorialStepLabel(steps, at("submit-review"), [at("submit-proof")])).toBe("7.6");
    expect(tutorialStepLabel(steps, at("menu-stats"), [at("menu-rules")])).toBe("8.2");
  });

  it("never point at the Submit flow's own submit button", () => {
    const flowSteps = steps.filter((s) => s.inside === "submit");
    expect(flowSteps.map((s) => s.targets).flat()).toEqual(["submit-screenshot", "submit-tile", "submit-requirement", "submit-submitter", "codeword", "submit-proof"]);
  });

  it("close the Tile at 5, the Submit flow at the end of 7 and the ☰ at the end of 8 themselves", () => {
    expect(steps.filter((s) => s.closes).map((s) => [s.id, s.closes])).toEqual([
      ["tile-submit", "tile"],
      ["submit-review", "submit"],
      ["menu-tutorial", "menu"],
    ]);
  });
});

describe("step 4, inside the Tile", () => {
  const lines = (facts: { needsProof: boolean; pointsWait: boolean }) => tutorialSteps(facts, "Tectonic's Comics Bingo")[at("tile-parts")].lines;

  it("says what a Tile's Parts are, and nothing more for a plain Tile", () => {
    expect(lines(tutorialTileFacts(tile([node("a"), node("b")])))).toHaveLength(2);
  });

  it("adds the Proof screenshot line only when the Tile (or one of its Parts) needs one", () => {
    expect(tutorialTileFacts(tile([node("a")], { requiresProof: true })).needsProof).toBe(true);
    expect(tutorialTileFacts(tile([node("a"), node("b", { requiresProof: true })])).needsProof).toBe(true);
    expect(lines({ needsProof: true, pointsWait: false }).some((l) => l.includes("Proof screenshot"))).toBe(true);
    expect(lines(plain).some((l) => l.includes("Proof screenshot"))).toBe(false);
  });

  it("adds the withheld-points line only when a Part's points wait on the Part before it", () => {
    const gated = tutorialTileFacts(tile([node("a"), node("b", { pointsGateNodeId: "a" })]));
    expect(gated).toEqual({ needsProof: false, pointsWait: true });
    expect(lines(gated).some((l) => l.includes("held back"))).toBe(true);
    expect(lines(plain).some((l) => l.includes("held back"))).toBe(false);
  });
});

describe("moving through the Tutorial", () => {
  it("starts at Welcome, and Next moves on from a step that doesn't wait for a click", () => {
    const started = run([{ type: "start", replay: false }]);
    expect(started).toMatchObject({ active: true, index: 0, replay: false });
    expect(run([{ type: "next" }], started).index).toBe(1);
  });

  it("doesn't go past a ✋ step on Next, only once the thing is really opened", () => {
    expect(run([{ type: "next" }], on("open-tile")).index).toBe(at("open-tile"));
    const opened = run([{ type: "opened", what: "tile", tileId: "zulrah" }], on("open-tile"));
    expect(opened).toMatchObject({ index: at("tile-parts"), tileId: "zulrah" });
    expect(run([{ type: "opened", what: "submit" }], on("open-submit")).index).toBe(at("submit-screenshot"));
    expect(run([{ type: "opened", what: "menu" }], on("open-menu")).index).toBe(at("menu-submissions"));
  });

  it("ignores an open that isn't the one the step waits for", () => {
    expect(run([{ type: "opened", what: "submit" }], on("open-tile")).index).toBe(at("open-tile"));
  });

  it("steps back to 3 when the Tile is closed during 4 or 5", () => {
    for (const id of ["tile-parts", "task-interest", "tile-submit"]) expect(run([{ type: "closed", what: "tile" }], on(id)).index).toBe(at("open-tile"));
  });

  it("steps back to 6 when the Submit flow is closed during 7", () => {
    for (const id of ["submit-screenshot", "submit-codeword", "submit-review"]) expect(run([{ type: "closed", what: "submit" }], on(id)).index).toBe(at("open-submit"));
  });

  it("steps back to the ☰ step when the menu is closed while its entries are pointed out", () => {
    expect(run([{ type: "closed", what: "menu" }], on("menu-stats")).index).toBe(at("open-menu"));
  });

  it("doesn't step back for a close on a step that isn't inside it (Next at 5 closes the Tile itself)", () => {
    const afterNext = run([{ type: "next" }], on("tile-submit"));
    expect(afterNext.index).toBe(at("open-submit"));
    expect(run([{ type: "closed", what: "tile" }], afterNext).index).toBe(at("open-submit"));
  });

  it("passes over an optional step with nothing to point at, in the direction it was going, and never over a required one", () => {
    expect(run([{ type: "pass" }], on("submit-submitter")).index).toBe(at("submit-codeword"));
    expect(run([{ type: "pass" }], on("submit-submitter", { direction: -1 })).index).toBe(at("submit-requirement"));
    expect(run([{ type: "pass" }], on("submit-screenshot")).index).toBe(at("submit-screenshot"));
  });

  it("ends on Skip from any step, and on Next from the last", () => {
    for (const s of steps) expect(run([{ type: "end" }], on(s.id)).active).toBe(false);
    expect(run([{ type: "next" }], on("done")).active).toBe(false);
  });

  it("remembers a replay, so finishing it records nothing", () => {
    expect(run([{ type: "start", replay: true }, { type: "end" }])).toMatchObject({ active: false, replay: true });
  });

  it("carries on as it is when asked to start while it's running (a replay asked for as it starts on its own)", () => {
    expect(run([{ type: "start", replay: false }, { type: "next" }, { type: "start", replay: true }])).toMatchObject({ active: true, index: 1, replay: false });
  });
});

describe("when the Tutorial starts on its own", () => {
  it("starts for a Player on their own Team's Board while Live, the first time", () => {
    expect(tutorialAutoStarts({ stage: "live", onOwnTeamBoard: true, seen: false })).toBe(true);
  });

  it("doesn't once it's been seen, off the Player's own Board, or before or after Live", () => {
    expect(tutorialAutoStarts({ stage: "live", onOwnTeamBoard: true, seen: true })).toBe(false);
    expect(tutorialAutoStarts({ stage: "live", onOwnTeamBoard: false, seen: false })).toBe(false);
    expect(tutorialAutoStarts({ stage: "reveal", onOwnTeamBoard: true, seen: false })).toBe(false);
    expect(tutorialAutoStarts({ stage: "complete", onOwnTeamBoard: true, seen: false })).toBe(false);
  });
});
