import { pushThemeHmrUpdate, type ThemeDefinition } from "../registry";
import { BoardPageLayout } from "./page/BoardPageLayout";
import { BoardGrid } from "./board/BoardGrid";
import { TileSearch } from "./page/TileSearch";
import { TileCell } from "./board/TileCell";
import { TileModal } from "./board/TileModal";
import { TaskPanel } from "./board/TaskPanel";
import { RequirementTree } from "./board/RequirementTree";
import { TeamBanner } from "./page/TeamBanner";

// Starter scaffold for the "comic" theme — see docs/theming.md for the full
// writer's guide (resolution/fallback rules, what a slot may import, the
// always-mounted-dialog rule, the full slot list).
//
// Right now this only overrides tokens — every slot still falls back to
// themes/default/**. To override a slot:
//   1. Copy the matching file from themes/default/{page,board,submission}/
//      into the same subfolder here (e.g. board/TileCell.tsx), and rework
//      its JSX/styling. It'll still import useSlot from "../../context" and
//      types from "../../../headless/types" — those paths don't change.
//   2. Add it to `slots` below, e.g. `slots: { TileCell }`.
// You only need to touch the slots you're actually changing.
// Classic four-color comic palette: off-white panels (like newsprint paper)
// with bold black ink borders, a punchy orange accent for interaction,
// green/blue kept as the universal complete/frozen semantics.
const comicTileLight = {
  bg: "#f3ebd9",
  border: "#000000",
  empty: "#e8e2d3",
  accent: "#f97316",
  complete: "#22c55e",
  frozen: "#38bdf8",
};

// Yellow comic-paper background; white/cream panels, bold black ink outlines
// throughout, a comic-blue accent for CTAs/badges so it reads distinctly
// from the orange tile accent and green/blue status dots.
const comicChromeLight = {
  background: "#ffc526",
  surface: "#ffffff",
  surfaceRaised: "#fff4d6",
  surfaceHover: "#dbeafe",
  outline: "#000000",
  outlineStrong: "#000000",
  onSurface: "#000000",
  onSurfaceMuted: "#57534e",
  onSurfaceSubtle: "#78716c",
  accent: "#2563eb",
  onAccent: "#ffffff",
  // Buttons share the accent look today — a distinct role in case a future
  // pass wants buttons to diverge from links/focus rings.
  button: "#2563eb",
  onButton: "#ffffff",
  buttonSecondary: "#fff4d6",
  onButtonSecondary: "#000000",
  // index.css's global ok/warn/danger/info are tuned to sit on a dark
  // surface (e.g. warn #fbbf24, a light amber that's unreadable on the
  // header's now-white bg) — darkened here to keep 4.5:1+ contrast
  // against this theme's white/pale surfaces instead.
  ok: "#15803d",
  warn: "#92400e",
  danger: "#b91c1c",
  info: "#1d4ed8",
  // Button/AppHeader's borders default to a hairline 1px; bumped up
  // here so the header rule and every button read as bold comic ink
  // outlines instead of a thin app-chrome line.
  borderWidth: "2px",
};

// "Moonlit comic panel": deep purple night instead of yellow paper, pale
// lavender ink instead of black ink, a gold accent instead of blue (blue
// reads muddy against purple; gold pops the way a comic "POW!" burst
// would, and doubles as the button color). Reuses index.css's *original*
// vibrant ok/warn/danger/info — comic-light only darkened them for its
// pale surfaces; a dark surface can use the punchy versions directly, the
// same logic in reverse.
const comicTileDark = {
  bg: "#2e1d4f",
  border: "#e9d5ff",
  empty: "#1f1338",
  accent: "#facc15",
  complete: "#22c55e",
  frozen: "#38bdf8",
};

const comicChromeDark = {
  background: "#1a0f2e",
  surface: "#241640",
  surfaceRaised: "#2e1d4f",
  surfaceHover: "#3a2760",
  outline: "#c4b5fd",
  outlineStrong: "#e9d5ff",
  onSurface: "#f5f0ff",
  onSurfaceMuted: "#c4b5fd",
  onSurfaceSubtle: "#8b7aa8",
  accent: "#facc15",
  onAccent: "#1a0f2e",
  button: "#facc15",
  onButton: "#1a0f2e",
  buttonSecondary: "#2e1d4f",
  onButtonSecondary: "#f5f0ff",
  ok: "#4ade80",
  warn: "#fbbf24",
  danger: "#f87171",
  info: "#60a5fa",
  borderWidth: "2px",
};

const comicTheme: ThemeDefinition = {
  key: "comic",
  tokens: {
    light: { tile: comicTileLight, chrome: comicChromeLight },
    dark: { tile: comicTileDark, chrome: comicChromeDark },
  },
  slots: {
    BoardPage: BoardPageLayout,
    BoardGrid,
    TaskPanel,
    RequirementTree,
    TeamBanner,
    TileSearch,
    TileCell,
    TileModal,
  },
};

export default comicTheme;

// Required for editing tokens/slots above to hot-update without a manual
// refresh — Vite's dev-only accept hands us the freshly re-evaluated
// module directly, which is the only reliable way to get fresh content
// here (a plain re-`import()` of this file would return the browser's
// already-cached module for this URL forever). Every theme's index.ts
// needs this same snippet; see docs/theming.md.
if (import.meta.hot) {
  import.meta.hot.accept((mod) => {
    if (mod) pushThemeHmrUpdate(mod.default as ThemeDefinition);
  });
}
