import type { Stage, Tile } from "@bingo/shared";

// The Tutorial (CONTEXT.md): its steps and how they move, as plain data and a reducer, so the rules are testable
// without a Board. useTutorial.tsx wires them to the page; core's TutorialOverlay draws them.

/**
 * What a step points at: the value of a `data-tutorial` attribute on the real element, in both themes. The overlay
 * highlights the first one that's on screen.
 */
export type TutorialTarget =
  | "team-banner"
  | "board"
  | "tile-parts"
  | "task-interest"
  | "part-submit"
  | "tile-submit"
  | "submit"
  | "submit-screenshot"
  | "submit-tile"
  | "submit-requirement"
  | "submit-submitter"
  | "codeword"
  | "submit-proof"
  | "menu"
  | "menu-submissions"
  | "menu-rules"
  | "menu-stats"
  | "menu-tutorial";

/** What a ✋ step waits for the Player to open, and what a step explains while it's open. */
export type TutorialOpening = "tile" | "submit" | "menu";

export interface TutorialStep {
  id: string;
  /** Its place among the Tutorial's steps (1 to tutorialStepCount); a step shown a piece at a time repeats it. */
  number: number;
  title: string;
  lines: string[];
  /** In order of preference: the first with an element on screen is highlighted. Empty for a step that points at nothing. */
  targets: TutorialTarget[];
  /** Highlights every element of its target that's on screen, together (the Tile and Part pickers). */
  all: boolean;
  /** ✋: moves on only when the Player opens this by clicking the real element. No Next. */
  waitsFor: TutorialOpening | null;
  /** Explains what's open; if the Player closes it, the Tutorial steps back to the step that opens it. */
  inside: TutorialOpening | null;
  /** Next closes this (the Tutorial closes it itself). */
  closes: TutorialOpening | null;
  /** The highlighted element takes clicks: the ✋ steps, and Task interest, which a Player may choose to mark. */
  clickable: boolean;
  /** Drawn larger (the welcome). */
  large: boolean;
  /** Passed over when its element isn't there (no teammates to submit for, no Rules, a Tile with nothing to Submit). */
  optional: boolean;
}

/** What step 4 says about the Tile that was opened, beyond its Parts. */
export interface TutorialTileFacts {
  /** It (or one of its Parts) needs a Proof screenshot. */
  needsProof: boolean;
  /** A Part's points wait on the Part before it (withheld until that one is done). */
  pointsWait: boolean;
}

export function tutorialTileFacts(tile: Tile | null | undefined): TutorialTileFacts {
  if (!tile) return { needsProof: false, pointsWait: false };
  const parts = tile.node.children;
  return { needsProof: tile.requiresProof || parts.some((p) => p.requiresProof), pointsWait: parts.some((p) => !!p.pointsGateNodeId) };
}

type StepInput = Pick<TutorialStep, "id" | "number" | "title" | "lines"> & Partial<Omit<TutorialStep, "id" | "number" | "title" | "lines">>;

function step(input: StepInput): TutorialStep {
  return { targets: [], all: false, waitsFor: null, inside: null, closes: null, optional: false, large: false, ...input, clickable: input.clickable ?? !!input.waitsFor };
}

/** The steps about opening a Tile and what's inside it, left out for a Player who has already marked Task interest. */
const TILE_STEP_IDS = new Set(["open-tile", "tile-parts", "task-interest", "tile-submit"]);

/**
 * Every step, in order. Only step 4's lines change, with the Tile that was opened. A Player who `knowsTiles` (they've
 * already marked Task interest, so they've opened a Tile) skips the Tile's steps, and the rest are numbered on without a gap.
 */
export function tutorialSteps(tile: TutorialTileFacts, bingoName: string, knowsTiles = false): TutorialStep[] {
  const all = [
    step({
      id: "welcome",
      number: 1,
      title: `Welcome to ${bingoName}!`,
      lines: [knowsTiles ? "This short tutorial will show you around: your Team, how to Submit, and the ☰ menu." : "This short tutorial will show you around: your Team, the Tiles, and how to Submit."],
      large: true,
    }),
    step({ id: "team", number: 2, title: "Your Team", lines: ["Your Team and its points. Pressing the points shows where they came from."], targets: ["team-banner"] }),
    step({ id: "open-tile", number: 3, title: "Open a Tile", lines: ["Each Tile is a goal for your Team. Click any Tile to open it."], targets: ["board"], waitsFor: "tile" }),
    step({
      id: "tile-parts",
      number: 4,
      title: "Inside the Tile",
      lines: [
        "A Tile has one or more Parts, each worth its own points.",
        "The checklist shows what each Part needs.",
        ...(tile.needsProof ? ["This Tile needs a Proof screenshot: a screenshot of where you start, posted before your drops count."] : []),
        ...(tile.pointsWait ? ["A Part's points here wait on the Part before it: they're held back until that one is done."] : []),
      ],
      targets: ["tile-parts"],
      inside: "tile",
    }),
    step({
      id: "task-interest",
      number: 4,
      title: "Task interest",
      lines: ["Raise your hand on a Part to let your team know what you're going for. It's optional."],
      targets: ["task-interest"],
      inside: "tile",
      optional: true,
    }),
    step({
      id: "tile-submit",
      number: 5,
      title: "Submit from here",
      lines: ["Got it? Submit it straight from the Tile."],
      targets: ["part-submit", "tile-submit"],
      inside: "tile",
      closes: "tile",
      optional: true,
    }),
    step({
      id: "open-submit",
      number: 6,
      title: "Submit",
      lines: [knowsTiles ? "Submit from inside a Tile, or from the Board any time. Click Submit." : "Or Submit from the Board, any time. Click Submit."],
      targets: ["submit"],
      waitsFor: "submit",
    }),
    step({
      id: "submit-screenshot",
      number: 7,
      title: "Your screenshot",
      lines: ["Your screenshot goes here.", "Pasting one (Ctrl+V) or dragging one anywhere on the Board opens Submit too."],
      targets: ["submit-screenshot"],
      inside: "submit",
    }),
    step({ id: "submit-tile", number: 7, title: "Tile and Part", lines: ["Which Tile it's for, and which Part."], targets: ["submit-tile"], all: true, inside: "submit", optional: true }),
    step({ id: "submit-requirement", number: 7, title: "What you got", lines: ["Then what you got."], targets: ["submit-requirement"], inside: "submit", optional: true }),
    step({ id: "submit-submitter", number: 7, title: "Submitting for", lines: ["Posting a teammate's drop? Pick them here."], targets: ["submit-submitter"], inside: "submit", optional: true }),
    step({ id: "submit-codeword", number: 7, title: "Your Codeword", lines: ["Your Team's Codeword must be in every screenshot."], targets: ["codeword"], inside: "submit", optional: true }),
    step({
      id: "submit-proof",
      number: 7,
      title: "Proof screenshot",
      lines: ["Where a Tile needs one, post your Proof screenshot here, before your drops."],
      targets: ["submit-proof"],
      inside: "submit",
      optional: true,
    }),
    step({
      id: "submit-review",
      number: 7,
      title: "Reviewed by a Moderator",
      lines: ["You can also Submit from the Submissions drawer.", "A Moderator reviews every Submission."],
      inside: "submit",
      closes: "submit",
    }),
    step({ id: "open-menu", number: 8, title: "The ☰ menu", lines: ["Everything else is in the ☰ menu. Click it to open it."], targets: ["menu"], waitsFor: "menu" }),
    step({ id: "menu-submissions", number: 8, title: "Submissions", lines: ["Your Team's Submissions, and how their review went."], targets: ["menu-submissions"], inside: "menu", optional: true }),
    step({ id: "menu-rules", number: 8, title: "Rules", lines: ["The Bingo's Rules."], targets: ["menu-rules"], inside: "menu", optional: true }),
    step({ id: "menu-stats", number: 8, title: "Stats", lines: ["How your Team is doing, and every Team once the Bingo is over."], targets: ["menu-stats"], inside: "menu", optional: true }),
    step({ id: "menu-tutorial", number: 8, title: "Tutorial", lines: ["This walk through, whenever you want it again."], targets: ["menu-tutorial"], inside: "menu", closes: "menu", optional: true }),
    step({ id: "done", number: 9, title: "Done", lines: ["You're set. Good luck!", "You can replay this any time from ☰ → Tutorial."] }),
  ];
  if (!knowsTiles) return all;
  const kept = all.filter((s) => !TILE_STEP_IDS.has(s.id));
  const numbers = [...new Set(kept.map((s) => s.number))];
  return kept.map((s) => ({ ...s, number: numbers.indexOf(s.number) + 1 }));
}

/** How many numbered steps there are (the card's "of N"). */
export function tutorialStepCount(steps: TutorialStep[]): number {
  return new Set(steps.map((s) => s.number)).size;
}

export interface TutorialState {
  active: boolean;
  index: number;
  /** Replayed from the ☰ menu: finishing or skipping it records nothing. */
  replay: boolean;
  /** The way the Player last moved, so a step with nothing to point at is passed over in the same direction. */
  direction: 1 | -1;
  /** The Tile opened at step 3, for step 4's lines and for the Submit flow at step 7. */
  tileId: string | null;
  /** Started for a Player who'd already marked Task interest: the Tile's steps are left out (see tutorialSteps). */
  knowsTiles: boolean;
  /** The steps passed over this time through (nothing to point at), which don't take up a sub-step number. */
  passed: number[];
}

export const TUTORIAL_IDLE: TutorialState = { active: false, index: 0, replay: false, direction: 1, tileId: null, knowsTiles: false, passed: [] };

export type TutorialAction =
  /**
   * `knowsTiles` leaves the Tile's steps out for the whole run, so marking Task interest during it doesn't change them.
   * `tileId` is a Tile they marked interest on, for the Submit flow at step 7 to start on in place of one opened at 3.
   */
  | { type: "start"; replay: boolean; knowsTiles?: boolean; tileId?: string | null }
  | { type: "next" }
  | { type: "back" }
  /** The current (optional) step's element isn't there. */
  | { type: "pass" }
  | { type: "end" }
  /** Something the Tutorial can wait for is open (the Tile modal carries the Tile's id). */
  | { type: "opened"; what: TutorialOpening; tileId?: string | null }
  | { type: "closed"; what: TutorialOpening };

/** How the Tutorial moves between `steps`. Moving past the last step, or skipping, ends it. */
export function tutorialReducer(steps: TutorialStep[], state: TutorialState, action: TutorialAction): TutorialState {
  // Already running (it started on its own as the ☰ asked for a replay): it carries on as it is.
  if (action.type === "start") {
    if (state.active) return state;
    const knowsTiles = !!action.knowsTiles;
    return { ...TUTORIAL_IDLE, active: true, replay: action.replay, knowsTiles, tileId: knowsTiles ? (action.tileId ?? null) : null };
  }
  if (!state.active) return state;
  const current = steps[state.index];
  const goTo = (index: number, direction: 1 | -1): TutorialState =>
    index >= steps.length ? { ...state, active: false } : { ...state, index: Math.max(0, index), direction };
  switch (action.type) {
    case "end":
      return { ...state, active: false };
    case "next":
      return current?.waitsFor ? state : goTo(state.index + 1, 1);
    case "back":
      return goTo(state.index - 1, -1);
    case "pass":
      return current?.optional ? { ...goTo(state.index + state.direction, state.direction), passed: [...state.passed, state.index] } : state;
    case "opened":
      if (current?.waitsFor !== action.what) return state;
      return { ...goTo(state.index + 1, 1), ...(action.what === "tile" ? { tileId: action.tileId ?? null } : {}) };
    case "closed": {
      if (current?.inside !== action.what) return state;
      // Back to the step that opens it.
      let opener = state.index - 1;
      while (opener >= 0 && steps[opener].waitsFor !== action.what) opener--;
      return opener < 0 ? state : goTo(opener, 1);
    }
  }
}

/**
 * The step's number on its card. Steps that share a number are its sub-steps, numbered on from .1 ("7.1", "7.2"), except
 * a first one that waits for a click, which opens them and keeps the plain number ("8", then "8.1"). Steps passed over
 * (nothing to point at) take no number, so the ones shown run on without gaps.
 */
export function tutorialStepLabel(steps: TutorialStep[], index: number, passed: number[]): string {
  const step = steps[index];
  const group = steps.map((s, i) => ({ s, i })).filter(({ s }) => s.number === step.number);
  if (group.length === 1) return String(step.number);
  const opener = group[0].s.waitsFor ? group[0].i : null;
  if (index === opener) return String(step.number);
  const sub = group.filter(({ i }) => i !== opener && i <= index && (i === index || !passed.includes(i))).length;
  return `${step.number}.${sub}`;
}

/** Starts on its own the first time a Player sees their own Team's Board while the Bingo is Live. */
export function tutorialAutoStarts({ stage, onOwnTeamBoard, seen }: { stage: Stage; onOwnTeamBoard: boolean; seen: boolean }): boolean {
  return stage === "live" && onOwnTeamBoard && !seen;
}
