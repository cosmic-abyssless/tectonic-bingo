import { pushThemeHmrUpdate, type ThemeDefinition } from "../registry";
import { COMIC_FONT } from "./font";
import { DARK_PALETTE } from "./darkPalettes";
import { BoardPageLayout } from "./page/BoardPageLayout";
import { DraftPageLayout } from "./page/DraftPageLayout";
import { StatsPageLayout } from "./page/StatsPageLayout";
import { DraftPickBurst } from "./draft/DraftPickBurst";
import { OnTheClockBanner } from "./draft/OnTheClockBanner";
import { TeamRoster as DraftTeamRoster } from "./draft/TeamRoster";
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
import { PointBreakdownDialog } from "./page/PointBreakdownDialog";
import { NoTeamStage } from "./page/NoTeamStage";
import { PlanningStage } from "./page/PlanningStage";
import { ScoutBanner } from "./page/ScoutBanner";
import { BugReportButton } from "./page/BugReportButton";
import { ThemedButton } from "./ui/ThemedButton";
import { ComicMenu, ComicMenuItem } from "./ui/ComicMenu";
import { ComicNotice, ComicPanel } from "./ui/ComicPanel";
import { Halftone } from "./fx/Halftone";
import { SignupStage } from "./signup/SignupStage";
import { ComicDialog, ComicDialogHeader } from "./ui/ComicDialog";
import { SubmissionModal } from "./submission/SubmissionModal";
import { ScreenshotDropzone } from "./submission/ScreenshotDropzone";
import { AnalysisPanel } from "./submission/AnalysisPanel";
import { TilePicker, RequirementPicker, SubmitterPicker } from "./submission/Pickers";
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
  field: "#ffffff",
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

const comicTheme: ThemeDefinition = {
  key: "comic",
  tokens: {
    light: { tile: comicTileLight, chrome: comicChromeLight },
    dark: { tile: DARK_PALETTE.tile, chrome: { ...DARK_PALETTE.chrome, headingFont: COMIC_FONT } },
  },
  palettes: { light: "Newsprint", dark: DARK_PALETTE.name },
  slots: {
    BoardPage: BoardPageLayout,
    DraftPage: DraftPageLayout,
    StatsPage: StatsPageLayout,
    DraftPickBurst,
    OnTheClockBanner,
    DraftTeamRoster,
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
    PointBreakdownDialog,
    NoTeamStage,
    PlanningStage,
    ScoutBanner,
    SignupStage,
    BugReportButton,
    Button: ThemedButton,
    Menu: ComicMenu,
    MenuItem: ComicMenuItem,
    Notice: ComicNotice,
    Panel: ComicPanel,
    PageBackdrop: Halftone,
    DialogFrame: ComicDialog,
    DialogHeader: ComicDialogHeader,
    SubmissionModal,
    ScreenshotDropzone,
    AnalysisPanel,
    SubmitterPicker,
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
