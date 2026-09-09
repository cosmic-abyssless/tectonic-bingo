import type { ThemeDefinition } from "../registry";

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
    // chrome: {
    //   bg: "#101012",
    //   surface: "#18181b",
    //   surfaceRaised: "#202023",
    //   surfaceHover: "#232327",
    //   line: "#27272a",
    //   lineStrong: "#3f3f46",
    //   fg: "#fafafa",
    //   fgMuted: "#a1a1aa",
    //   fgSubtle: "#71717a",
    //   accent: "#a1a1aa",
    //   accentFg: "#101012",
    // },
  },
  slots: {},
};

export default comicTheme;
