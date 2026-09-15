// Literal hex, not `text-on-surface-muted`/`text-ok`/etc: TaskPanel,
// RequirementTree, SubmissionBubble, and TileModal only ever render inside
// TileModal, which react-aria-components portals out next to the end of
// <body> — outside the DOM subtree ThemeProvider sets theme CSS variables
// on (see TileModal.tsx). Those utilities don't go *blank* there, they fall
// back to index.css's global (dark-UI) defaults, which read poorly on this
// theme's own surfaces.
//
// Bold, saturated comic-book primaries rather than desaturated "ink" tones,
// reusing this theme's own brand hues (tokens.ts's tile accent/complete,
// index.ts's chrome accent) as literals so the modal matches the board.
// Each portaled consumer picks LIGHT or DARK via useResolvedColorScheme()
// since CSS vars (and thus the scheme media queries) don't reach them.
export interface ComicColors {
  INK: string;
  INK_BODY: string;
  INK_SUBTLE: string;
  GREEN: string;
  BLUE: string;
  BLUE_TINT: string;
  ORANGE: string;
  ORANGE_LINE: string;
  RED: string;
  RULE: string;
  // Book-page / cover-color-fallback / speech-bubble parchment tones —
  // shared here so TileCell and TileModal don't each maintain their own
  // near-identical literals.
  PAPER: string;
  PAPER_ALT: string;
  PAPER_RAISED: string;
}

const LIGHT: ComicColors = {
  INK: "#000000",
  INK_BODY: "#1c1917",
  INK_SUBTLE: "#78716c",
  GREEN: "#0e9f4f",
  BLUE: "#1d4ed8",
  BLUE_TINT: "#bfdbfe",
  ORANGE: "#c2410c",
  ORANGE_LINE: "#f97316",
  RED: "#b91c1c",
  RULE: "rgba(0,0,0,0.25)",
  PAPER: "#f2ead4",
  PAPER_ALT: "#e6d9b8",
  PAPER_RAISED: "#ffffff",
};

const DARK: ComicColors = {
  INK: "#e9d5ff",
  INK_BODY: "#f5f0ff",
  INK_SUBTLE: "#8b7aa8",
  GREEN: "#0e9f4f",
  BLUE: "#1d4ed8",
  BLUE_TINT: "#3a2760",
  ORANGE: "#c2410c",
  ORANGE_LINE: "#f97316",
  RED: "#b91c1c",
  RULE: "rgba(255,255,255,0.25)",
  PAPER: "#2e1d4f",
  PAPER_ALT: "#251a3f",
  PAPER_RAISED: "#3a2760",
};

export function getColors(scheme: "light" | "dark"): ComicColors {
  return scheme === "dark" ? DARK : LIGHT;
}
