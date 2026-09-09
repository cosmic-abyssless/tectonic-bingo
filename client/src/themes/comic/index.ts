import { pushThemeHmrUpdate, type ThemeDefinition } from "../registry";
import { BoardPageLayout } from "./page/BoardPageLayout";
import { BoardGrid } from "./board/BoardGrid";
import { TileSearch } from "./page/TileSearch";
import { TileCell } from "./board/TileCell";

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
const comicTheme: ThemeDefinition = {
  key: "comic",
  tokens: {
    // Classic four-color comic palette: off-white panels (like newsprint
    // paper) with bold black ink borders, a punchy orange accent for
    // interaction, green/blue kept as the universal complete/frozen
    // semantics.
    tile: {
      bg: "#f3ebd9",
      border: "#000000",
      empty: "#e8e2d3",
      accent: "#f97316",
      complete: "#22c55e",
      frozen: "#38bdf8",
    },
    // Yellow comic-paper background (kept as-is); white/cream panels, bold
    // black ink outlines throughout, a comic-blue accent for CTAs/badges so
    // it reads distinctly from the orange tile accent and green/blue status
    // dots.
    chrome: {
      bg: "#dbbf42",
      surface: "#ffffff",
      surfaceRaised: "#fff4d6",
      surfaceHover: "#dbeafe",
      line: "#000000",
      lineStrong: "#000000",
      fg: "#000000",
      fgMuted: "#57534e",
      fgSubtle: "#78716c",
      accent: "#2563eb",
      accentFg: "#ffffff",
    },
  },
  slots: {
    BoardPage: BoardPageLayout,
    BoardGrid,
    TileSearch,
    TileCell,
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
