// The comic theme's own palette, as literals rather than Tailwind token
// utilities. Two reasons:
//  1. Most comic surfaces render inside react-aria modals, which portal out
//     to <body> — outside the ThemeProvider div that carries the CSS vars.
//     ComicDialog re-applies the vars inside its portal, but the board-side
//     components (TileCell, bursts, stamps) also want these exact hues.
//  2. Half of this palette (process yellow/cyan/magenta, the red of a
//     price badge) has no equivalent chrome token at all.
//
// The hues are the classic four-color (CMYK) newsprint set: pure black
// ink, warm off-white pulp paper, and the saturated process primaries that
// Silver Age covers were printed with. Dark mode is a "night issue": the
// paper goes to a deep ink-navy and the ink goes to pale cream, while the
// process colors stay loud so bursts and stamps still pop.
export interface ComicColors {
  /** Line-art black (or pale cream in dark mode). Borders, lettering. */
  INK: string;
  /** Body copy — a hair softer than INK so paragraphs don't shout. */
  INK_BODY: string;
  /** Captions, metadata, disabled. */
  INK_SUBTLE: string;
  /** Hairline dividers. */
  RULE: string;

  /** Pulp newsprint. The base page. */
  PAPER: string;
  /** Slightly darker pulp — page edges, alternate panels. */
  PAPER_ALT: string;
  /** Brightest paper — speech bubbles, caption boxes, raised surfaces. */
  PAPER_RAISED: string;

  /** Process primaries. */
  YELLOW: string;
  RED: string;
  BLUE: string;
  CYAN: string;
  MAGENTA: string;
  GREEN: string;
  ORANGE: string;
  PURPLE: string;

  /** Tints (for fills behind text set in the matching primary). */
  YELLOW_TINT: string;
  BLUE_TINT: string;
  RED_TINT: string;
  GREEN_TINT: string;
  CYAN_TINT: string;

  /** Semantic aliases used across statuses. */
  OK: string;
  WARN: string;
  BAD: string;
  INFO: string;
  FROZEN: string;

  /** Kept for existing consumers. */
  ORANGE_LINE: string;

  /** Halftone dot ink for the page background. */
  HALFTONE: string;
}

const LIGHT: ComicColors = {
  INK: "#0b0b0d",
  INK_BODY: "#1d1b18",
  INK_SUBTLE: "#6b6259",
  RULE: "rgba(11,11,13,0.22)",

  PAPER: "#f6ecd2",
  PAPER_ALT: "#eadcb6",
  PAPER_RAISED: "#fffaf0",

  YELLOW: "#ffd400",
  RED: "#e2231a",
  BLUE: "#1f4fd8",
  CYAN: "#00a8e1",
  MAGENTA: "#e5007e",
  GREEN: "#12a150",
  ORANGE: "#ff7a1a",
  PURPLE: "#6d2fb5",

  YELLOW_TINT: "#fff1a8",
  BLUE_TINT: "#cfe0ff",
  RED_TINT: "#ffd6d3",
  GREEN_TINT: "#c9f2d8",
  CYAN_TINT: "#c8eefb",

  OK: "#12a150",
  WARN: "#d8620a",
  BAD: "#c9161a",
  INFO: "#1f4fd8",
  FROZEN: "#00a8e1",

  ORANGE_LINE: "#ff7a1a",

  HALFTONE: "#0b0b0d",
};

const DARK: ComicColors = {
  INK: "#f7ecd2",
  INK_BODY: "#ede0c4",
  INK_SUBTLE: "#a89c86",
  RULE: "rgba(247,236,210,0.22)",

  PAPER: "#16183a",
  PAPER_ALT: "#101230",
  PAPER_RAISED: "#1f2350",

  YELLOW: "#ffd400",
  RED: "#ff3b30",
  BLUE: "#4f7dff",
  CYAN: "#27c3ff",
  MAGENTA: "#ff2e93",
  GREEN: "#2ecc71",
  ORANGE: "#ff8c2e",
  PURPLE: "#a06cff",

  YELLOW_TINT: "#4a3d00",
  BLUE_TINT: "#1a2a66",
  RED_TINT: "#5a1a18",
  GREEN_TINT: "#153f2a",
  CYAN_TINT: "#0f3a4d",

  OK: "#2ecc71",
  WARN: "#ff8c2e",
  BAD: "#ff3b30",
  INFO: "#4f7dff",
  FROZEN: "#27c3ff",

  ORANGE_LINE: "#ff8c2e",

  HALFTONE: "#7f8bff",
};

export function getColors(scheme: "light" | "dark"): ComicColors {
  return scheme === "dark" ? DARK : LIGHT;
}

/** Hard offset "printed" drop shadow used on every raised comic surface. */
export function hardShadow(ink: string, px = 4): string {
  return `${px}px ${px}px 0 ${ink}`;
}
