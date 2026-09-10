// Literal hex, not `text-fg-muted`/`text-ok`/etc: TaskPanel and
// RequirementTree only ever render inside TileModal, which
// react-aria-components portals out next to the end of <body> — outside the
// DOM subtree ThemeProvider sets theme CSS variables on (see
// TileModal.tsx). Those utilities don't go *blank* there, they fall back to
// index.css's global (dark-UI) defaults, which read poorly — muddy and
// low-contrast — on this theme's cream page background.
//
// Bold, saturated comic-book primaries rather than desaturated "ink" tones,
// reusing this theme's own brand hues (tokens.ts's tile accent/complete,
// index.ts's chrome accent) as literals so the modal matches the board.
export const INK = "#000000";
export const INK_BODY = "#1c1917";
export const INK_SUBTLE = "#78716c";
export const GREEN = "#0e9f4f";
export const BLUE = "#1d4ed8";
export const BLUE_TINT = "#bfdbfe";
export const ORANGE = "#c2410c";
export const ORANGE_LINE = "#f97316";
export const RED = "#b91c1c";
export const RULE = "rgba(0,0,0,0.25)";
