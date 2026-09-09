import { pushThemeHmrUpdate, type ThemeDefinition } from "../registry";
import { BoardPageLayout } from "./page/BoardPageLayout";
import { TileSearch } from "./page/TileSearch";

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
    tile: {
      bg: "#101012",
      border: "#232327",
      empty: "#0c0c0e",
      accent: "#a1a1aa",
      complete: "#4ade80",
      frozen: "#60a5fa",
    },
    // Uncomment and fill in to re-skin the page chrome (header, panels,
    // dialogs, ...) via Tailwind's --color-* variables — see docs/theming.md.
    chrome: {
      bg: "#dbbf42",
      surface: "#ffffff",
      surfaceRaised: "#f90202",
      surfaceHover: "#232327",
      line: "#000000",
      lineStrong: "#3f3f46",
      fg: "#000",
      fgMuted: "#a1a1aa",
      fgSubtle: "#71717a",
      accent: "#a1a1aa",
      accentFg: "#101012",
    },
  },
  slots: {
    BoardPage: BoardPageLayout,
    TileSearch,
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
