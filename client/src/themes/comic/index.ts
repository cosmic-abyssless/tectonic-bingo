import { pushThemeHmrUpdate, type ThemeDefinition } from "../registry";
import { COMIC_FONT } from "./font";
import { BoardPageLayout } from "./page/BoardPageLayout";
import { DraftPageLayout } from "./page/DraftPageLayout";
import { StatsPageLayout } from "./page/StatsPageLayout";
import { BoardGrid } from "./board/BoardGrid";
import { TileSearch } from "./page/TileSearch";
import { TileCell } from "./board/TileCell";
import { TileModal } from "./board/TileModal";
import { TaskPanel } from "./board/TaskPanel";
import { RequirementTree } from "./board/RequirementTree";
import { TeamBanner } from "./page/TeamBanner";
import { TeamSelector, TeamBadge } from "./page/TeamSelector";
import { PageHeader } from "./page/PageHeader";
import { SubmissionsDrawer } from "./page/SubmissionsDrawer";
import { RulesDialog } from "./page/RulesDialog";
import { TeamInfoDialog } from "./page/TeamInfoDialog";
import { ComicDialog, ComicDialogHeader } from "./ui/ComicDialog";
import { SubmissionModal } from "./submission/SubmissionModal";
import { ScreenshotDropzone } from "./submission/ScreenshotDropzone";
import { AnalysisPanel } from "./submission/AnalysisPanel";
import { TilePicker, RequirementPicker } from "./submission/Pickers";
import { TaskPicker } from "./submission/TaskPicker";
import { StagedClaimsList } from "./submission/StagedClaimsList";
// The theme's shared classes (comic-press, comic-rays, comic-halftone, the
// dialog keyframes…). Was imported on feat/mico-work but dropped when that
// work landed on main, leaving every one of them unstyled.
import "./comic.css";

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
  buttonSecondaryBorder: "#000000",
  buttonSecondaryHover: "#dbeafe",
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
  // Applied to AppHeader's title and Card/CardHeader's title (see
  // tokens.ts) — puts the comic lettering font on page and section
  // headings everywhere under this theme, with zero per-page wiring.
  headingFont: COMIC_FONT,
  // Bangers is already a dense, bold-looking display face — stacking the
  // heading's own font-semibold/font-bold class on top of it crowds the
  // letterforms and hurts legibility, so drop back to normal weight
  // anywhere headingFont applies.
  headingWeight: "400",
};

// "Moonlit comic panel": deep purple night page, pale lavender ink instead
// of black ink, a gold accent instead of blue (blue reads muddy against
// purple; gold pops the way a comic "POW!" burst would). Tiles and the
// header/search/team-banner chrome are charcoal rather than purple — an
// all-purple board read as an overload, so those surfaces are neutral dark
// grays instead, with the purple page background and lavender outline/ink
// left to carry the "night" identity. A forest green stands in for the
// default (secondary) button fill — the nav-style buttons ("Mod panel",
// "Select team", etc.) that used to blend into the purple chrome now pop
// against the charcoal instead; gold stays reserved for the primary button
// and accent role. Reuses index.css's *original* vibrant ok/warn/danger/
// info — comic-light only darkened them for its pale surfaces; a dark
// surface can use the punchy versions directly, the same logic in reverse.
const comicTileDark = {
  bg: "#242428",
  border: "#e9d5ff",
  empty: "#1c1c20",
  accent: "#facc15",
  complete: "#22c55e",
  frozen: "#38bdf8",
};

const comicChromeDark = {
  background: "#1a0f2e",
  surface: "#38383e",
  surfaceRaised: "#44444c",
  surfaceHover: "#505058",
  outline: "#c4b5fd",
  outlineStrong: "#e9d5ff",
  onSurface: "#f5f0ff",
  onSurfaceMuted: "#c4b5fd",
  onSurfaceSubtle: "#8b7aa8",
  accent: "#facc15",
  onAccent: "#1a0f2e",
  button: "#facc15",
  onButton: "#1a0f2e",
  buttonSecondary: "#2f6b4a",
  onButtonSecondary: "#f0fff4",
  // A darker forest green, not outlineStrong's pale lavender — the light
  // purple border read as a mismatched clash against the green fill; a
  // shade of the same green reads as a proper border instead.
  buttonSecondaryBorder: "#1e4a32",
  // A lighter green, not surfaceHover's neutral gray — hovering a green
  // button to gray read as a step backward/disabled rather than a hover.
  buttonSecondaryHover: "#3f8f60",
  ok: "#4ade80",
  warn: "#fbbf24",
  danger: "#f87171",
  info: "#60a5fa",
  borderWidth: "2px",
  headingFont: COMIC_FONT,
  headingWeight: "400",
};

const comicTheme: ThemeDefinition = {
  key: "comic",
  tokens: {
    light: { tile: comicTileLight, chrome: comicChromeLight },
    dark: { tile: comicTileDark, chrome: comicChromeDark },
  },
  slots: {
    BoardPage: BoardPageLayout,
    DraftPage: DraftPageLayout,
    StatsPage: StatsPageLayout,
    BoardGrid,
    TaskPanel,
    RequirementTree,
    TeamBanner,
    TeamSelector,
    TeamBadge,
    TileSearch,
    TileCell,
    TileModal,
    PageHeader,
    SubmissionsDrawer,
    RulesDialog,
    TeamInfoDialog,
    DialogFrame: ComicDialog,
    DialogHeader: ComicDialogHeader,
    SubmissionModal,
    ScreenshotDropzone,
    AnalysisPanel,
    TilePicker,
    TaskPicker,
    RequirementPicker,
    StagedClaimsList,
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
