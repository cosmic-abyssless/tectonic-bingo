import type { ComponentType, ReactNode } from "react";
import type { ButtonProps } from "../core/ui/Button";
import type { MenuFrameProps, MenuRowProps } from "../core/ui/Menu";
import type { HeaderMenuProps } from "../core/ui/headerMenu";
import type { NoticeProps } from "../core/ui/Card";
import type { PanelProps } from "../core/ui/Panel";
import type { TeamRosterProps } from "../core/draft/TeamRoster";
import type { ReactionBarProps } from "../core/submissions/ReactionBar";
import type { TitleChipProps, TitleGroupBoxProps } from "../core/stats/TitleChrome";
import type { SuperlativeGroupBoxProps } from "../core/superlatives/SuperlativeChrome";
import type { MyAchievement, Stage, StageMilestone } from "@bingo/shared";
import type {
  BingoPageModel,
  BoardModel,
  CategoryModel,
  RequirementNodeModel,
  RewindClosingModel,
  RewindControlsModel,
  RewindLogModel,
  RewindPopupModel,
  RewindScoreboardModel,
  RewindTileTeamsModel,
  RewindTimelineModel,
  SubmissionFlowModel,
  SubmissionModel,
  TaskModel,
  TeamModel,
  TeamSelectorModel,
  TileModel,
  TileSearchModel,
  TutorialCardModel,
  WrappedBingoModel,
  WrappedCaptainModel,
  WrappedDuoModel,
  WrappedIntroModel,
  WrappedModeratorModel,
  WrappedOutroModel,
  WrappedShareCardModel,
  WrappedTeamModel,
  WrappedYouModel,
} from "../headless/types";
import type { RewindPopupPointer } from "./rewindPopupPointer";

export interface OnTheClockProps {
  teamName: string;
  teamColor: string | null;
  captains: string[]; // RSNs: the captain, then the co-captain in a duo bingo
  pickLabel: string; // "Round 2 · Pick 7" / "Singles round · Pick 31"
  isMyTurn: boolean; // the viewer leads this team
  // Drawn as the top strip of the draft room's Teams panel (full width, no frame of its own), not a card of its own.
  embedded?: boolean;
  // With embedded: the phone's pinned header, where nothing can hang outside the strip and height is precious.
  compact?: boolean;
}

export interface ThemeSlots {
  // Whole-surface composition — may call headless hooks directly.
  BoardPage: ComponentType<Record<string, never>>;

  // Bingo pages outside the board — whole-page layout like BoardPage, but
  // props-only: DraftRoom/StatsView already encapsulate their own api/*
  // calls as ordinary core/ components, so there's no headless model here.
  DraftPage: ComponentType<{ slug: string; bingoName: string }>;
  StatsPage: ComponentType<{ slug: string; bingoName: string }>;
  // A Finished Bingo's Feedback form (CONTEXT.md "Feedback form"), at /b/:slug/feedback: whole-page layout like StatsPage and
  // props-only too, holding core/feedback's FeedbackForm (which does its own fetching and draws with the page's tokens).
  FeedbackPage: ComponentType<{ slug: string; bingoName: string }>;
  // The Board's card for a Finished Bingo's Player, inviting them to give feedback until `responded`, then a link to edit
  // it. It says the answers are anonymous. Every BoardPage must draw it when page.feedback.canOpen.
  FeedbackBanner: ComponentType<{ responded: boolean; onOpen: () => void }>;
  // The shape that pops up for everyone watching when a player is drafted (core/draft/DraftPickReveal). The theme
  // draws only the shape — a fixed-size card or burst, no positioning; core handles the pop, the hold and the flight
  // to the roster. One name per drafted player (two for a duo pair). teamColor is null for a team with none.
  DraftPickBurst: ComponentType<{ names: string[]; teamName: string; teamColor: string | null }>;
  // One Achievement's unlock popup (core/achievements/AchievementUnlockReveal). The theme draws only the card: its own
  // width, no positioning or motion; core reveals it OSRS-style (a dot on the card's top edge fanning out into a line,
  // then scanning down with a copy of the card's bottom border on its leading edge), holds it and takes it away. The
  // card's root must be the bordered box, its top edge a solid line at least 3px thick: the dot and the line show just
  // the top 2px of it. Shows the Achievement's description with its flavour under it, and a "View my achievements"
  // link that calls onViewAchievements.
  AchievementUnlockCard: ComponentType<{ achievement: MyAchievement; onViewAchievements: () => void }>;
  // One Achievement in the Achievements modal's single-column list (core/achievements/AchievementsModal): earned,
  // locked (greyed, with progress when it's counted) or masked (a Hidden one not yet earned: "???", nothing else is
  // known). Shows the description, with its flavour under it once earned.
  AchievementRow: ComponentType<{ achievement: MyAchievement }>;
  // The top of the Achievements modal: how many of the switched-on Achievements the Player has earned, as a count and
  // a progress bar (Hidden ones included in both numbers).
  AchievementTotal: ComponentType<{ earned: number; total: number }>;
  // One team's column in the draft room (core/draft/TeamRoster): its card, then its picks. Read with useOptionalSlot.
  // Each pick's element must carry data-team-id and data-pick-number (the pick reveal flies to it) and stay invisible
  // while its number is in hiddenPickNumbers.
  DraftTeamRoster: ComponentType<TeamRosterProps>;
  // The banner pinned above the draft room while a pick is on the clock: whose turn, in the team's colour. Core
  // remounts it on every pick, so its entrance animation plays on each turn change.
  OnTheClockBanner: ComponentType<OnTheClockProps>;

  // Page chrome — props-only.
  PageLoading: ComponentType<Record<string, never>>;
  PageError: ComponentType<{ message: string }>;
  PageHeader: ComponentType<{ page: BingoPageModel }>;
  // TeamModel.isMine already tells each option whether it's the viewer's own team.
  TeamSelector: ComponentType<{ selector: TeamSelectorModel }>;
  // Pressing the badge opens TeamInfoDialog.
  TeamBadge: ComponentType<{ team: TeamModel; onPress: () => void }>;
  TileSearch: ComponentType<{ search: TileSearchModel }>;
  // Pressing the point total opens PointBreakdownDialog (onOpenPoints).
  TeamBanner: ComponentType<{ team: TeamModel; isOtherTeam: boolean; totalPoints: number | null; onOpenPoints?: () => void }>;
  PlanningStage: ComponentType<{ stage: "planning" | "captains" }>;
  SignupStage: ComponentType<{ slug: string }>;
  // Shown above the signup/closed stage content to whoever may scout (page.canScout: mods and team leads, and every
  // Player once signups are closed) — the way into the scouting room before the draft. `canRate`: the viewer leads a
  // team, so rates players there; everyone else only looks.
  ScoutBanner: ComponentType<{ onOpen: () => void; canRate: boolean }>;
  /** The team's Codeword (CONTEXT.md), which every screenshot must show: beside the board's title while Live, and in the Submit flow. */
  CodewordBanner: ComponentType<{ codeword: string }>;
  DraftStage: ComponentType<{ draft: BingoPageModel["draft"]; milestone: StageMilestone | null; onOpenDraft: () => void }>;
  // No team picked yet, for whoever can pick one (page.canPickTeam: mods, and everyone once the bingo is Finished).
  // `selector` lets a theme list the teams right on this screen instead of pointing at a menu.
  NoTeamStage: ComponentType<{ selector: TeamSelectorModel }>;
  // Someone who isn't part of this bingo (not a Player, Moderator or Admin) from signups closing until it's Finished.
  // `isCut`: they signed up but were cut to keep the teams even. `removedFromTeam`: the Team an Admin took them off
  // (Remove from Team), to tell them so.
  NotPartStage: ComponentType<{ isCut: boolean; removedFromTeam: string | null }>;
  RulesDialog: ComponentType<{ isOpen: boolean; markdown: string; onClose: () => void }>;
  // `stage`: whether the Team's Superlative voting section (CONTEXT.md "Superlative") shows and is live.
  TeamInfoDialog: ComponentType<{ slug: string; team: TeamModel | null; stage: Stage; onClose: () => void }>;
  // Where the team's points come from, opened from the point total on the banner. Open while `team` is set; reads its data with usePointBreakdown().
  PointBreakdownDialog: ComponentType<{ team: TeamModel | null; onClose: () => void }>;
  SubmissionsDrawer: ComponentType<{ isOpen: boolean; submissions: SubmissionModel[]; onClose: () => void; onSubmit?: () => void }>;
  // The Tutorial's explanation card (CONTEXT.md "Tutorial"): the step's title and lines, "3 of 9", Next (card.primary,
  // absent on a step that waits for the Player to click) and Skip. The theme draws only the card: core's
  // TutorialOverlay sizes (its width), places and dims around it, and portals it to body above the dialogs.
  TutorialCard: ComponentType<{ card: TutorialCardModel }>;

  // The frame + header the core dialogs (bug report, player profile) are
  // built from, so a theme can dress them without reimplementing them. Read
  // with useOptionalSlot, not useSlot: those dialogs also mount on pages
  // outside any ThemeProvider (mod panel, site admin), where they fall back
  // to the core Dialog/DialogHeader.
  DialogFrame: ComponentType<{ isOpen: boolean; onClose: () => void; size?: "md" | "lg"; isDismissable?: boolean; children: ReactNode }>;
  DialogHeader: ComponentType<{ title: ReactNode; subtitle?: ReactNode; onClose: () => void; action?: ReactNode }>;

  // Every core Button (core/ui/Button): the same props, variants (primary, secondary, ghost, danger) and sizes, drawn
  // the theme's way. Read with useOptionalSlot: outside a theme, Button is core's PlainButton.
  Button: ComponentType<ButtonProps>;

  // Every core Menu and MenuItem (core/ui/Menu): the account menu, the pickers' menus. Same props (MenuItem's variant:
  // "option", or "action" for a row that acts on the list). Read with useOptionalSlot: outside a theme they're core's.
  Menu: ComponentType<MenuFrameProps>;
  MenuItem: ComponentType<MenuRowProps>;

  // Every core Notice (core/ui/Card) and Panel (core/ui/Panel): a status line in a tone, and a raised section of a
  // page. Read with useOptionalSlot: outside a theme they're core's.
  Notice: ComponentType<NoticeProps>;
  Panel: ComponentType<PanelProps>;

  // "Beta" after the heading of a section still being tried out (core/ui/BetaTag). Read with useOptionalSlot: outside
  // a theme it's core's.
  BetaTag: ComponentType;

  // The stats page's Titles (core/stats/TitleChrome): the box around one Title group's rows, which sets --title-ink
  // and --title-rule for them (and --title-name-size, if it likes), and a Title's chip (the contributors table, the player's profile). Read with
  // useOptionalSlot: outside a theme they're core's.
  TitleGroupBox: ComponentType<TitleGroupBoxProps>;
  TitleChip: ComponentType<TitleChipProps>;

  // One Superlative category (core/superlatives/SuperlativeChrome), in the Team info dialog: a banner styled like a
  // TitleGroupBox row. Read with useOptionalSlot: outside a theme it's core's.
  SuperlativeGroupBox: ComponentType<SuperlativeGroupBoxProps>;

  // The emoji reactions under a submission (core/submissions/ReactionBar), in the theme's own colours: a theme whose
  // cards aren't the page's surface (the comic's paper, even in dark mode) needs its own. Read with useOptionalSlot.
  ReactionBar: ComponentType<ReactionBarProps>;

  // The page's backdrop, the layers the theme draws behind every page (the comic's halftone), for a PinnedGap to show
  // the page through. Fixed, full-window layers; nothing (the page colour alone) in a theme without one.
  PageBackdrop: ComponentType;

  // The header's report-a-bug button (AppHeader). Read with useOptionalSlot: the header also shows on pages outside
  // any ThemeProvider, which fall back to core's BugReportButton.
  BugReportButton: ComponentType<{ onPress: () => void; hasUnseen: boolean }>;
  // The header's ☰ menu (AppHeader), at its far right: its button (with a dot while hasUnseen) and the menu it opens,
  // the viewer's row on top, then each group in order with a divider before it. An entry marked current is the page
  // you're on: a check mark, not clickable. The colour-scheme item is drawn with core's ColorSchemeRadios. Read with
  // useOptionalSlot: pages outside any ThemeProvider fall back to core's PlainHeaderMenu.
  HeaderMenu: ComponentType<HeaderMenuProps>;

  // Menu chrome for ColumnPicker / MultiSelect / SingleSelect. Props are
  // inlined so this file does not import Picker (that would cycle through
  // themes/context). Read with useOptionalSlot: mod and admin have no
  // ThemeProvider and fall back to the core Picker.
  PickerFrame: ComponentType<{
    options: { key: string; label: string; count?: number }[];
    selectedKeys: Set<string>;
    onSelectionChange: (keys: string[]) => void;
    selectionMode: "multiple" | "single";
    active?: boolean;
    children: ReactNode;
  }>;

  // Board.
  // highlightedTileId is optional and only meaningful to a theme whose
  // TileCell has some "spotlighted" visual state to drive from it (the
  // default theme's BoardGrid/TileCell just ignore it) — it's the id of
  // whichever tile the search dropdown currently has highlighted, if any,
  // so a theme can visually tie the two together.
  // tileOverlay (Rewind's All Teams view) draws something over a Tile's cell, above TileCell, in the same box; a
  // BoardGrid must render it when it's given. Each Tile's box carries data-tile-id={tile.id}: Rewind finds a Tile's cell
  // by it to place popups beside it.
  BoardGrid: ComponentType<{ board: BoardModel; onOpenTile: (tileId: string) => void; highlightedTileId?: string | null; tileOverlay?: (tile: TileModel) => ReactNode }>;
  RowLabel: ComponentType<{ category: CategoryModel | null }>;
  EmptyCell: ComponentType<{ row: number; col: number }>;
  // onOpen takes the tile id (rather than being pre-bound) so the default
  // theme can pass a reference-stable callback and let React.memo(TileCell)
  // actually skip re-rendering unchanged tiles — see BoardGrid.tsx.
  TileCell: ComponentType<{ tile: TileModel; onOpen: (tileId: string) => void; isSearchHighlighted?: boolean }>;
  PreStartBanner: ComponentType<{ startsAt: number }>;
  // onSubmit opens the submission flow for the open tile, optionally pre-picking
  // one of its parts. onToggleInterest flips the viewer's hand for a part; only
  // wired when some part has interest.canToggle — themes should still check
  // task.interest.canToggle per part before showing the control.
  TileModal: ComponentType<{
    tile: TileModel | null;
    isOpen: boolean;
    onClose: () => void;
    onSubmit?: (taskId?: string) => void;
    onToggleInterest?: (taskId: string) => void;
    // Opens the Submit flow on posting a Proof screenshot (CONTEXT.md): for the Tile (no taskId) or one Task.
    onPostProof?: (taskId?: string) => void;
  }>;
  // onPostProof: opens the Submit flow on posting a Proof screenshot for the Task (see TaskModel.proof); absent when
  // the viewer can't submit.
  TaskPanel: ComponentType<{ task: TaskModel; onPostProof?: () => void }>;
  RequirementTree: ComponentType<{ node: RequirementNodeModel; root?: boolean }>;
  TileSubmissions: ComponentType<{ submissions: SubmissionModel[] }>;

  // Rewind (CONTEXT.md "Rewind"): a Finished Bingo played back on its own Board, at /b/:slug/rewind.
  // Whole-surface, like BoardPage: may call useRewindModel() and useBoardModel() (the Board at the moment being
  // viewed) directly, and draws the Board with the ordinary BoardGrid slot. Every other Rewind slot is props-only.
  RewindPage: ComponentType<Record<string, never>>;
  // The timeline: from going Live to Finishing in real time (quiet stretches show as gaps), one tick per Submission of
  // the viewed Team sized by its tier (rejected ones greyed), and a scrubber to drag or click (timeline.seek).
  RewindTimeline: ComponentType<{ timeline: RewindTimelineModel }>;
  // Play/Pause, previous/next Submission, previous/next notable-or-bigger one, and the "show rejected" toggle.
  RewindControls: ComponentType<{ controls: RewindControlsModel }>;
  // Every Team's points at the moment being viewed (whatever Team's Board is shown); pressing one shows its Board.
  RewindScoreboard: ComponentType<{ scoreboard: RewindScoreboardModel }>;
  // Every Submission up to the moment being viewed, newest first, one compact line each (Player, items, Tile, Drop
  // value, time, tier; its Team in the All Teams view; rejected ones stamped). Pressing one jumps there and shows its
  // popup (log.jumpTo). Sits under the scoreboard; on a wide screen the page bounds its height, so it should shrink to
  // fit and scroll within it.
  RewindLog: ComponentType<{ log: RewindLogModel }>;
  // One Submission's popup: the Player it's credited to, their Team, its items with Drop value (and Luck when known),
  // a thumbnail of its main screenshot, its Reactions and what it completed. size "big" (a huge Submission) or
  // "small" (a notable one). A rejected one is greyed out and stamped "Rejected". The theme draws only the card (its
  // own width, no positioning); the page places it beside its Tile, clear of the header and the timeline, and plays it
  // in and out. pointer says which of the card's edges faces the Tile and where along it (null when there's no Tile to
  // point at), for a theme that draws a tail to it. The page leaves REWIND_POPUP_GAP px between the card and the Tile
  // for one; rewindPopupPointer.ts has a helper to anchor it.
  RewindPopup: ComponentType<{ popup: RewindPopupModel; pointer: RewindPopupPointer | null }>;
  // The closing card at the very end: every final Title with its holder and the value behind it, for the viewed Team
  // (closing.team) or the whole Bingo. Built like the Stats page's Titles (core/stats TitlesSection draws them the same
  // way). Like RewindPopup, only the card: the page places it, over the Board, and it scrolls within its own height.
  RewindClosing: ComponentType<{ closing: RewindClosingModel }>;
  // All Teams view: the marks on one Tile for each Team that has completed it by the moment being viewed (in
  // scoreboard order; possibly none). Drawn over the Tile's cell, filling it; it takes no clicks.
  RewindTileMarkers: ComponentType<{ tile: RewindTileTeamsModel }>;
  // All Teams view: the dialog a Tile opens, listing every Team's progress on it at the moment being viewed.
  RewindTileTeams: ComponentType<{ tile: RewindTileTeamsModel | null; isOpen: boolean; onClose: () => void }>;

  // Wrapped (CONTEXT.md "Wrapped"): a Finished Bingo's story from the viewer's point of view, at /b/:slug/wrapped. The
  // Wrapped* slots are one group. WrappedPage is whole-surface (may call useWrappedModel() directly): the page frame,
  // the progress indicator, and each of the model's sections in order through its section slot. The section slots are
  // props-only, each one section's model; a section the model leaves out (nothing to say for this viewer) is never
  // drawn. Sections are built from core/wrapped's WrappedScene (one screen of the story, saying how many steps it has)
  // and Reveal (a line that belongs to one of those steps), and must work at phone width. WrappedPage either lets them
  // follow scrolling (the default: a Reveal fades up as its Scene scrolls into view; with reduced motion it just fades
  // in) or supplies their progress, for a page that doesn't scroll, such as a guided view: it wraps the sections in
  // core/wrapped/sceneProgress's WrappedProgressProvider with a WrappedProgressSource, usually
  // createWrappedProgressStore(). Each Scene then registers its step count with the source (read it with
  // useWrappedScenes(store): id, steps, element, in document order) and the page sets, per Scene,
  // store.setSceneState(id, { reached, current }): its Reveals at steps below `reached` are shown (instantly with
  // reduced motion), the rest hidden. Nothing scrolls or is measured then, and the sections are the same either way. A guided
  // page reads a Scene as a page and a Reveal step as a panel on it (a step no Reveal is at is skipped), and may give the
  // provider a `reveal` component to draw each Reveal itself, as a frame of its own that is empty until its step is reached
  // (the comic's panels); a section whose Reveal brings its own frame marks it `bare`. Each section model carries
  // its category's art (`art`: any number of Category images, each two boil frames and maybe a credited name, and
  // the category's additional credits; both empty without any): draw it with core/wrapped's WrappedCategoryArt (or
  // WrappedSectionArt / StickerArt), which swaps the frames slowly and adds the CSS shadow, and make sure the section
  // still looks finished without it. The model's `sideArt` is for WrappedPage to set beside the sections. WrappedPage
  // also calls `actions.outroReached()` once the viewer gets to the Outro, and, when `outroReachedBefore` and the Outro
  // has share cards, offers a jump to them (core/wrapped's WRAPPED_CARDS_ID).
  WrappedPage: ComponentType<Record<string, never>>;
  // The Board's way in, for a Finished Bingo once Wrapped is published, or for a Moderator before that (preview: say
  // it's a preview only Moderators can see).
  WrappedBanner: ComponentType<{ preview: boolean; onOpen: () => void }>;
  // The opening screen. preview: a Moderator's preview, computed just now and not yet published.
  WrappedIntro: ComponentType<{ section: WrappedIntroModel; preview: boolean }>;
  WrappedYou: ComponentType<{ section: WrappedYouModel }>;
  // A Player's Duo (only for one in a Duo): who carried whom is friendly teasing, never a verdict.
  WrappedDuo: ComponentType<{ section: WrappedDuoModel }>;
  // A Captain's Draft: every pick against where it finished, the best Steal, a grade. Never label a pick a bust.
  WrappedCaptain: ComponentType<{ section: WrappedCaptainModel }>;
  // A reviewing Moderator's (or Admin's) own reviews.
  WrappedModerator: ComponentType<{ section: WrappedModeratorModel }>;
  WrappedTeam: ComponentType<{ section: WrappedTeamModel }>;
  // The Bingo as a whole, moderation stats (with the rejection-rate banter and the "moderators" category's art) included.
  WrappedBingo: ComponentType<{ section: WrappedBingoModel }>;
  // The closing screen: a way on to Rewind and back to the Board, then the viewer's share cards (section.cards), drawn
  // with core/wrapped's WrappedShareCards and the WrappedShareCard slot. WrappedShareCards previews each card, adds
  // Copy image, Download and Share, and (preview) the "Preview" watermark every card carries in a Moderator's preview.
  WrappedOutro: ComponentType<{ section: WrappedOutroModel; preview: boolean; onRewind: () => void; onBoard: () => void }>;
  // One share card, the image a Player shares (CONTEXT.md "Wrapped"): drawn at exactly 540×675 CSS px (4:5; made into a
  // 1080×1350 PNG in the viewer's browser, never on the server, by redrawing this DOM, so what's drawn is what's shared).
  // It must stand on its own: its own background, the Bingo's name and the site in its footer, nothing outside its box,
  // no animation. Draw only the fields the model gives (a field without data is null: leave no gap for it). Draw
  // images with core/wrapped's CardImage (eager, CORS-safe for Discord avatars, and a fallback when an item has no
  // icon), and use system fonts: web fonts aren't carried into the image.
  WrappedShareCard: ComponentType<{ card: WrappedShareCardModel }>;

  // Submission flow — mounted only while open (see BoardPageLayout).
  SubmissionModal: ComponentType<{ flow: SubmissionFlowModel }>;
  ScreenshotDropzone: ComponentType<{ screenshot: SubmissionFlowModel["screenshot"] }>;
  AnalysisPanel: ComponentType<{ analysis: SubmissionFlowModel["analysis"] }>;
  SubmitterPicker: ComponentType<{ submitter: SubmissionFlowModel["submitter"] }>;
  TilePicker: ComponentType<{ tile: SubmissionFlowModel["tile"] }>;
  TaskPicker: ComponentType<{ task: SubmissionFlowModel["task"] }>;
  // Drop or Proof screenshot (CONTEXT.md), where the picked Tile or Task needs one; and the warning on a drop whose
  // Player hasn't posted theirs yet, with a way to post it. Renders nothing when neither applies.
  ProofPicker: ComponentType<{ kind: SubmissionFlowModel["kind"]; warning: SubmissionFlowModel["proofWarning"] }>;
  RequirementPicker: ComponentType<{ requirement: SubmissionFlowModel["requirement"]; quantity: SubmissionFlowModel["quantity"] }>;
  StagedClaimsList: ComponentType<{ staged: SubmissionFlowModel["staged"] }>;
}

export type SlotName = keyof ThemeSlots;
