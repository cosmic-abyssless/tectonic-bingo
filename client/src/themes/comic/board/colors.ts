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
import { DARK_PALETTE } from "../darkPalettes";

export interface ComicColors {
  /** Lettering: headings, labels, the darkest text. */
  INK: string;
  /** Line art: borders, outlines, hard offset shadows. Same as INK in the
   *  light palette; dark palettes split them so a page can have, say, black
   *  or neon-cyan panel lines under cream lettering. */
  LINE: string;
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

  /** Lettering on a saturated fill (primary button, stamps, coloured tags, dialog headers). */
  ON_LOUD: string;
  /** Lettering on the YELLOW fill (score tab, yellow buttons, hovered menu rows). */
  ON_YELLOW: string;
  /** Outlined display lettering (the page title): fill + the hard stroke/drop. */
  TITLE_FILL: string;
  TITLE_STROKE: string;
  /** Modal scrim, and the sunbeams that turn behind an open modal. */
  SCRIM: string;
  BURST: string;
  /** Translucent line colour for the page's speed-line rays and inline halftone shading. */
  RAY: string;
  SHADE: string;

  /**
   * Overrides for everything printed on the comic book's pages (and only
   * there: the cover, board, header and dialogs keep the base palette). A
   * dark scheme uses it to make the pages read as paper — a warm stock with
   * dark ink — instead of the dark surface colour. Unset, the pages use the
   * base palette. Resolve with pageColors().
   */
  page?: Partial<Omit<ComicColors, "page">>;
}

const LIGHT: ComicColors = {
  INK: "#0b0b0d",
  LINE: "#0b0b0d",
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

  ON_LOUD: "#fffaf0",
  ON_YELLOW: "#0b0b0d",
  TITLE_FILL: "#ffffff",
  TITLE_STROKE: "#000000",
  SCRIM: "#0b0b0d",
  BURST: "#fff3c4",
  RAY: "rgba(11,11,13,0.10)",
  SHADE: "rgba(11,11,13,0.30)",
};

export function getColors(scheme: "light" | "dark"): ComicColors {
  return scheme === "dark" ? DARK_PALETTE.colors : LIGHT;
}

/** The palette for what's printed on the book's pages: the base palette with its `page` overrides applied. */
export function pageColors(c: ComicColors): ComicColors {
  return c.page ? { ...c, ...c.page, page: undefined } : c;
}

/**
 * The "TECTONIC" masthead: white lettering on a red box, in every palette,
 * because it's meant to read as a comic publisher's logo (think Marvel's) —
 * a fixed brand mark, not something the theme recolours.
 */
export const TECTONIC_LOGO = { bg: "#d2412d", fg: "#ffffff" } as const;

/** Hard offset "printed" drop shadow used on every raised comic surface. */
export function hardShadow(ink: string, px = 4): string {
  return `${px}px ${px}px 0 ${ink}`;
}
