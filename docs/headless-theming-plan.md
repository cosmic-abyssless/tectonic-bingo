# Headless board layer + per-bingo UI themes — implementation plan

**Status:** approved plan, not yet implemented. Revised 2026-09-08 after the
react-aria-components restyle (`fdb2778`) landed on `main`.
**Scope:** the headless layer + refactoring the current player UI into the
`default` theme. The first real theme ("retro comic book") is a follow-up
that builds on this; this plan must leave nothing it needs missing.

## For the implementer

- Work on a branch off `main` (suggested: `headless-theming`). Commit at the
  end of **every phase** in §7 — the app must build and behave identically
  after each. Do not squash phases together.
- **Acceptance bar is "no behavior change."** This is a refactor. If you find
  a bug while moving code, note it in the commit message and leave the
  behavior as-is unless it blocks the refactor.
- Verification after every phase: `npm run build -w client` and `npm test`
  (server vitest — no server file should change; a red server suite means
  something leaked). Manual checklist in §8 at the end of phases 2, 3, 4.
- E2E (`e2e/*.spec.ts`) is **deferred** per repo policy — do not run or fix
  it here. Note it is already partially broken by the restyle (class-based
  selectors like `.bg-slate-800.rounded-xl` and the old yellow points span no
  longer exist); that is pre-existing drift, not yours to fix.
- **Reuse `core/ui/*` primitives and the pure helpers listed in §2** — do not
  reinvent them. Line references below are against `main` at `e6c575c`
  (post-restyle); re-verify before cutting.
- Keep every file under ~300 lines (repo convention). Split rather than grow.
- Read `docs/implementation-plan.md` §3 (client architecture) first; this plan
  supersedes its "Theme contract" paragraph, which Phase 5 rewrites.

## Context

Each bingo should be able to ship its own custom player-facing UI — not a CSS
skin, but real React code (the last event was Pokémon-themed with one-off UI).
Today that's impossible without forking the board: `pages/BingoPage.tsx`
(398 lines) owns every query hook, all page state, and the stage-branched
surfaces; `core/submissions/SubmissionModal.tsx` (439 lines) owns
upload/OCR/staged-claims plus its own mutations; the board subtree threads
*raw server arrays* (`nodeStates`, `teamSubmissions`) three levels deep and
`TileCell.tsx:33` re-derives progress per cell on every render. The theme
skeleton (`themes/registry.ts`, `ThemeRoot`, six `--tile-*` tokens) only
themes tile colours; `useThemedComponent` is never called.

The restyle already did half the groundwork: the page chrome is composed from
accessible `core/ui` primitives with semantic token classes, `index.css`
explicitly says "boards keep their own theming via headless tile components",
and the tile components were deliberately left with their own styling. This
plan adds the missing **headless layer** (view-model hooks + a typed slot
registry + a theme provider) and refactors the current UI into the `default`
theme on top of it, so a theme only writes presentational components against
data-only view models and never touches API code.

## 0. Settled decisions and the acceptance bar

- **Themeable**: the board (grid, tile cell, tile modal, task panel), the
  `/b/:slug` page chrome (header contents, stage stepper/milestone row, team
  banner, tile search, rules dialog, submissions drawer, stage empty states,
  the draft-stage view), and the submission modal.
  **Never themed**: mod, admin, stats, draft room, bingo list, login.
  `SignupForm`, `TeamRoster`, `AppHeader`, `StageStepper`, `MilestoneCountdown`
  stay core components a theme may *use*.
- **Override model: hybrid** — a theme overrides individual named slots
  (default fallback) *or* replaces a whole surface's composition (`BoardPage`);
  both consume the same headless hooks.
- **Current UI becomes the `default` theme** (single code path).
- Themes are **lazy-loaded**; `bingo.theme` selects one, unknown key → default.
- **RAC overlay rule**: dialogs are always mounted and controlled by `isOpen`
  (`core/ui/Dialog.tsx:13-17` — needed for exit animations). Every overlay
  slot therefore takes `isOpen` and must not be conditionally rendered. The
  one exception, matching today: the submission modal is mounted only while
  open (`BingoPage.tsx:225`), because unmount is what resets its state.
- Conventions: files ≲300 lines; server state only in the query cache; client
  never re-implements gating; types only from `@bingo/shared`; admin/mod
  import `core/*` directly and never mount a theme.
- **Preserve verbatim** (e2e / behavior): the three `SubmissionModal`
  auto-select effects with their dependency arrays and eslint-disables
  (`SubmissionModal.tsx:105-147`); `TileCell` `title={tile.name}` (L44) and
  the `pointsAwarded/totalPoints` badge text (L83-86); `Heading slot="title"`
  inside dialogs (`TileModal.tsx:82`); copy "Submit completion" (L270),
  "Submit for review" (L434), "This task is judged manually" (L375);
  placeholders "Search tiles…" (L336), "Search requirements…" (L384),
  "Search tiles, items…" (`BingoPage.tsx:353`); the hidden
  `input[type="file"]` (L292-301); `IconButton label="Close"` on dialog
  headers (`Dialog.tsx:56`).

## 1. Directory layout

New top-level `client/src/headless/` (not under `core/`): it spans page
chrome + board + submission flow and is the **only** place allowed to import
`api/*` and `context/*`. `core/` stays "theme-agnostic building blocks that
admin/mod also use".

```
client/src/
  headless/
    index.ts                 barrel — the ONLY thing themes import from here
    types.ts                 all view-model types (§2)
    boardModel.ts            pure builders: buildTileModelsStatic/finalizeTileModels, buildRequirementTree,
                             buildTaskModels, buildLineModels, buildSubmissionModels, toCategoryModel/toTeamModel,
                             getRowCategory (moved from BoardGrid.tsx:11-16)
    submissionFlowLogic.ts   pure: getAvailableTasks (moved from SubmissionModal.tsx:16-23), computeOpenLeaves,
                             buildTileOptions, buildCurrentClaim, isFlowValid
    useNowTick.ts            1 s tick until a deadline (ports BoardGrid.tsx:54-68 exactly)
    useTileSearch.ts         query/focus/highlight/keydown + the 150 ms blur timeout (BingoPage.tsx:313-345, 364-377)
    useViewingTeam.ts        viewingTeamId + auto-select myTeam on shell load (BingoPage.tsx:37-40) — NO dropdown state;
                             RAC MenuTrigger owns open/close in the slot
    usePageEvents.ts         the WS handler (BingoPage.tsx:53-68): stage_changed → toast(), submission_created →
                             browser Notification for mods; bingoId filter
    BingoPageProvider.tsx    loads shell/board/progress/submissions/pending/draft; provides BingoPageModel (+ internal raw ctx)
    BoardProvider.tsx        nested inside; owns the tick; provides BoardModel
    useBingoPage.ts          useBingoPage(), useBoardModel(), useTileModel(id), usePageEvent (re-export of useWebSocketEvent)
    useSubmissionFlow.ts     the submission state machine; owns useCreateSubmission/useAnalyzeScreenshot
    SubmissionFlowHost.tsx   render-prop wrapper around useSubmissionFlow so leaf slots stay props-only
  core/
    board/   tileProgress.ts, taskClaims.ts, requirementTree.ts   (unchanged)
             labels.ts   NEW — leafLabel/compositeLabel moved out of TaskPanel.tsx:11-28
             BoardGrid/TileCell/TileModal/TaskPanel .tsx → DELETED in Phase 3 (moved to themes/default/board)
    submissions/ SubmissionRow.tsx, ScreenshotThumb.tsx, claimsSummary.ts (unchanged)
             SubmissionModal.tsx, TeamSubmissionsList.tsx → DELETED in Phase 4 (moved)
    ui/      unchanged — themes use Button/IconButton, Dialog/DialogHeader/DialogTrigger, Menu/MenuItem/MenuTrigger,
             Card/CardHeader/Notice/EmptyState/Badge/FilterChip, Field/Input/Select/Textarea, Tabs, AppHeader,
             StageStepper/MilestoneCountdown, CountdownTimer, StatusBadge, Markdown, SearchableSelect, icons.tsx, time.ts, user.ts
    signup/SignupForm.tsx, draft/TeamRoster.tsx   unchanged (used by the SignupStage / DraftStage slots)
  themes/
    keys.ts          export const THEME_KEYS = ["default", …] — import-free, safe for the admin bundle
    tokens.ts        ThemeTokens type, defaultTokens, tokensToCssVars()  (absorbs themes/default/tokens.ts)
    slots.ts         ThemeSlots interface + every slot's props type (imports headless/types only)
    context.ts       ThemeContext, useSlot(), useThemeTokens()   (imports slots.ts/tokens.ts types only — avoids cycles)
    registry.ts      ThemeDefinition, ResolvedTheme, lazy `loaders` map, resolveTheme(key), mergeTheme()
    ThemeProvider.tsx  <ThemeProvider themeKey> — resolves, merges over default, sets CSS vars on the root div (replaces ThemeRoot)
    default/
      index.ts       defaultTheme: ThemeDefinition (eager, complete slot map)
      page/     BoardPageLayout PageHeader TeamSelector TeamBadge StageRow TeamBanner TileSearch
                PlanningStage SignupStage DraftStage NoTeamStage RulesDialog SubmissionsDrawer PageStates
      board/    BoardGrid RowLabel EmptyCell TileCell PreStartBanner TileModal TaskPanel RequirementTree TileSubmissions
      submission/ SubmissionModal ScreenshotDropzone AnalysisPanel TilePicker TaskPicker RequirementPicker StagedClaimsList
    ThemeRoot.tsx, default/tokens.ts → DELETED in Phase 3 (replaced by ThemeProvider + themes/tokens.ts)
  pages/BingoPage.tsx   ~40 lines: params → BingoPageProvider → ThemeProvider → BoardPage slot
```

No `themes/default/ui/icons.tsx` — `core/ui/icons.tsx` already has the 22
outline icons (`CheckIcon`, `LockIcon`, `ClockIcon`, `SearchIcon`,
`ImageIcon`, `SpinnerIcon`, `XIcon`, `ChevronDownIcon`, `GridIcon`,
`UsersIcon`, …).

Import rules (review guard: `grep -rn "from \"../../api\|from \"../../context" client/src/themes` must be empty):

| From | May import |
|---|---|
| `themes/**` | `headless` barrel, `themes/{context,slots,tokens}`, `core/ui/*`, `core/submissions/{SubmissionRow,ScreenshotThumb}`, `core/signup/SignupForm`, `core/draft/TeamRoster`, `react-aria-components`, `@bingo/shared` (types + `STAGE_LABEL`/`STAGE_ORDER`/`nextMilestone`) |
| `headless/**` | `api/*`, `context/*`, `core/board/*.ts`, `core/submissions/claimsSummary.ts`, `core/ui/{time,user}.ts`, `core/ui/Toast.ts` (`toast()` only), `@bingo/shared` |
| `core/admin/**`, `core/mod/**` | never `headless/*` or `themes/*` (only `themes/keys.ts`, for the settings select) |
| `pages/BingoPage.tsx` | `headless`, `themes/ThemeProvider`, `themes/context` |

## 2. Headless view models (`headless/types.ts`)

Slots receive only these + callbacks — never `Tile`, `TeamNodeState[]`,
`SubmissionDetails[]`, or `LeafClaimMaps`. Colours are passed raw (`color`);
alpha variants are the slot's business (the restyle already dropped the old
`${hex}1a` convention — `BoardGrid.tsx:110` uses `66`, `BingoPage.tsx:88` `99`).

```ts
CategoryModel { id; label; color: string|null; sortOrder }
TeamModel     { id; name; color: string|null; isMine }
UserModel     { displayName; avatarUrl }

RequirementNodeModel {
  id; kind: NodeKind; label /* leafLabel()/compositeLabel() applied */; isLeaf; status: NodeStatus;
  complete; submitted /* any non-rejected claim */; notNeeded /* an enclosing ANY/COUNT is already satisfied */;
  dim /* complete || notNeeded */; progress: { current; target } | null /* SUM only */;
  showHeading /* !(root && kind === "ALL") */; children: RequirementNodeModel[];
}
TaskModel {
  id; label; description; notes; points; kind; isManual; allowsPreLoad;
  status; complete; locked; lockedReason: string|null /* TileModal.tsx:117-131 text */;
  available /* getAvailableTasks semantics */; tree: RequirementNodeModel | null /* null for MANUAL */;
}
SubmissionModel {
  id; status: SubmissionStatus; submittedAt; timeAgo; thumbnailUrl: string|null; summary /* claimsSummary() */;
  submittedBy: string|null; reviewerNotes: string|null; tileId: string|null; tileName: string|null; taskLabels: string[];
  detail: SubmissionDetails /* escape hatch so core SubmissionRow still works — the ONE raw shape a theme may see */;
}
TileModel {
  id; name; imageUrl; row; col; category: CategoryModel|null;
  accentColor: string|null /* category colour; the slot falls back to the --tile-accent token when null (TileCell.tsx:38) */;
  progress: { completedTasks; totalTasks; pointsAwarded; totalPoints; allComplete };
  taskStatuses: { id; index; label; status: NodeStatus }[] /* TileCell's dot row */;
  freeze: { hasFreezePeriod; durationMinutes; unlocksAt: number|null; isFrozen; remainingMs };
  tasks: TaskModel[]; submissions: SubmissionModel[] /* groupSubmissionsByTile() for this tile */;
  dimmed /* search miss */; canSubmit /* page.canSubmit && !allComplete && !isFrozen — TileModal's submitDisabled inverted */;
}
LineModel  { id; lineType; lineIndex; tileIds: string[]; points; complete; pointsAwarded }
           // not rendered by the default theme; exposed for line overlays. BoardLine.node.children are the tile
           // root nodes (server boardService.ts:210); complete = line.nodeId ∈ nodeStates.
BoardModel {
  rows; cols; grid: (TileModel|null)[][] /* [row][col] */; tiles: TileModel[]; tileById: ReadonlyMap<string, TileModel>;
  rowCategories: (CategoryModel|null)[]; showRowLabels; lines: LineModel[]; now: number;
  preStart: { isPreStart; startsAt: number|null } /* board stays interactive; default shows a Notice banner */;
  totalPoints: number|null /* progressData.totalPoints */;
}
StageView = "signup" | "planning" | "captains" | "draft" | "noTeam" | "board"
            // exact branch order from BingoPage.tsx:169-187: signup → planning|captains → draft → !viewingTeamId → board
TileSearchModel  { query; setQuery(q); clear(); focused; setFocused(f); blur() /* hook owns the 150 ms timeout */;
                   results: { id; name }[]; overflowCount; showDropdown; highlightedIndex;
                   onKeyDown(e: React.KeyboardEvent<HTMLInputElement>); choose(tileId); inputRef }
TeamSelectorModel{ teams: TeamModel[]; selectedId: string|null; select(id) }   // open/close belongs to RAC MenuTrigger in the slot
BingoPageModel {
  slug; themeKey;
  bingo: { name; stage: Stage; stageLabel /* STAGE_LABEL[stage] */; rulesMarkdown: string|null;
           startsAt: number|null; endsAt: number|null; boardRows; boardCols };
  milestone: StageMilestone | null /* nextMilestone(bingo) from @bingo/shared */;
  user: UserModel; isMod; myTeam: TeamModel|null; teams: TeamModel[]; categories: CategoryModel[];
  stageView: StageView; boardRevealed /* reveal|live|complete — only gates the Stats button today (BingoPage.tsx:135) */;
  draft: { state: DraftState | null; isLoading: boolean } /* for DraftStage; DraftState is the shared response type */;
  viewing: { team: TeamModel|null; isOtherTeam; pendingSubmissionCount }; canSubmit; pendingCount;
  showEndCountdown /* endsAt && stage === "live" */;
  submissions: SubmissionModel[] /* whole team, newest first (drawer) */;
  teamSelector: TeamSelectorModel; search: TileSearchModel;
  openTile: { id: string|null; open(id); close() } /* replaces BOTH BingoPage.openTileId and BoardGrid.selected */;
  rules:  { open; show(); hide() };  drawer: { open; show(); hide() };
  submit: { open; initialTileId: string|undefined; show(tileId?); hide() } /* show() also hides the drawer (BingoPage.tsx:82-86) */;
  actions: { goHome(); goToStats(); goToMod(); goToDraft() };   // logout lives in core AppHeader's user menu
}
SubmissionFlowModel {
  screenshot: { file: File|null; previewUrl: string|null; dragOver; error: string|null; pick(file); openFilePicker();
                inputProps: { ref; type: "file"; accept: "image/*"; onChange(e) } };
  analysis:   { status: "idle"|"analyzing"|"done"|"failed";
                result: { codewordFound; codeword; warnings: string[]; detected: { itemName; tileName } | null } | null };
  tile:       { selectedId; options: { id; label; group? }[]; select(id) };
  task:       { selectedId; options: { id; label }[]; select(id); current: { id; label; isManual } | null; autoSelected };
  requirement:{ visible; selectedId; options: { id; label }[]; readOnly; select(id);
                pickerKey /* `${tileId}-${taskId}` — the SearchableSelect remount key, SubmissionModal.tsx:381 */ };
  quantity:   { visible; value; max; needed; set(n) };
  staged:     { items: { label }[]; remove(index); canStageCurrent; stageCurrent() };
  submit:     { isValid; isSubmitting; isAnalyzing; error: string|null; run(): Promise<void> };
  close();
}
```

### Builders (`headless/boardModel.ts`) — reuse existing helpers, do not rewrite
Reuse `summarizeTileProgress`, `getFreezeUnlockAt`, `groupSubmissionsByTile`
(`core/board/tileProgress.ts`), `buildLeafClaimMaps` / `itemLeafValue` /
`leafComplete` (`core/board/taskClaims.ts`), `collectLeaves` /
`tileMatchesSearch` (`core/board/requirementTree.ts`), `claimsSummary`,
`timeAgo` (`core/ui/time.ts`), `displayName` (`core/ui/user.ts`).

- `buildRequirementTree(node, maps, statusByNodeId, ancestorSatisfied = false, root = true)` — returns null for
  MANUAL; ports `TaskPanel.tsx:30-131` (`rowClass`, `LeafRow`, `SumRow`, `RequirementTree`) rules 1:1.
- `buildTaskModels(tile, summary, maps)` — ports `TileModal.tsx:117-131` gate/lock + `getAvailableTasks`.
- **Two-stage tile memo** (the per-cell recompute fix for `TileCell.tsx:33-36`):
  `buildTileModelsStatic({ tiles, categories, nodeStates, teamSubmissions, bingoStartsAt })` runs once per data
  change; `finalizeTileModels(static, now, matchIds, canSubmit, prev)` is the cheap per-tick pass and **returns
  the previous object for any tile whose isFrozen/remainingMs/dimmed/canSubmit didn't change**, so
  `React.memo(TileCell)` only re-renders frozen cells. Key the memo on the query *data references*
  (`boardData?.tiles`, `progressData?.nodeStates`, `submissionsData?.submissions`), never on `?? []`
  fallbacks — hoist stable `EMPTY` constants.
- `buildLineModels(lines, tiles, nodeStates)`, `buildSubmissionModels(tiles, submissions)` (ports
  `TeamSubmissionsList` taskLookup + `TileModal.tsx:134-147` taskLabelByLeafId; newest first).

### Providers / hooks
- `BingoPageProvider({ slug, children, renderLoading, renderError })` — calls `useAuth`, `useBingo`, `useBoard`,
  `useViewingTeam`, `useTeamProgress(slug, viewingTeamId)`, `useTeamSubmissions`, `usePendingCount(slug,
  !!shell?.isMod)`, `useDraftState(slug)` (only enabled while `stage === "draft"` — it 403s for non-signups,
  see the comment at `BingoPage.tsx:261-265`), `usePageEvents`, `useNavigate`, `useTileSearch`, and the
  open-state `useState`s. Early returns exactly as `BingoPage.tsx:70-72`; these render the **default** theme's
  `PageLoading`/`PageError` slots because the theme key isn't known until the shell loads. The context value is
  **tick-free** (no `now`). Raw query data goes in an internal `BingoPageRawContext` that only `headless/` reads.
- `usePageEvents(shell)` — moves `BingoPage.tsx:53-68` verbatim: `bingoId` filter, `stage_changed` →
  `toast({ title: "Stage changed", description: STAGE_LABEL[stage] })`, mod `submission_created` → browser
  `Notification`. (`toast()` from `core/ui/Toast.tsx:18-22`; `ToastRegion` is already mounted in `App.tsx:81`.)
- `BoardProvider` — internal; `useNowTick(startMs + maxFreezeMs)`, the two-stage memo, `buildLineModels`.
- `useSubmissionFlow({ initialTileId, onClose, onSuccess })` — reads raw data from `BingoPageRawContext`; owns
  `useCreateSubmission` + `useAnalyzeScreenshot` (FormData assembly from `SubmissionModal.tsx:149-160` and
  `234-250` moves here); window drag/drop listeners (L177-205) move unchanged; the three auto-select effects
  (L105-147) move **with identical dependency arrays and eslint-disables** — the second re-fires on refetch and
  resets qty; pre-existing quirk, do not fix. `tileOptions` (L252-265) keep `Date.now()` at compute time.
  WS invalidation stays transparent: `useCreateSubmission`'s `onSuccess` invalidates `teamProgress`/
  `teamSubmissions` (`api/queries.ts:86-89`) → provider refetches → models rebuild.
- `SubmissionFlowHost({ initialTileId, onClose, children(flow) })` — mounted only while `page.submit.open`
  (matches `BingoPage.tsx:225`), so unmount = reset.

## 3. Slot registry

`themes/slots.ts`:
```ts
export interface ThemeSlots {
  // whole-surface composition (may call headless hooks)
  BoardPage: ComponentType<Record<string, never>>;
  // page chrome (props-only)
  PageLoading: ComponentType<Record<string, never>>;  PageError: ComponentType<{ message: string }>;
  PageHeader: ComponentType<{ page: BingoPageModel }>;   // default: core AppHeader (back/title/subtitle) + TeamSelector/TeamBadge + nav Buttons
  TeamSelector: ComponentType<{ selector: TeamSelectorModel; myTeamId: string | null }>;   // default: RAC MenuTrigger/Menu (BingoPage.tsx:106-123)
  TeamBadge: ComponentType<{ team: TeamModel }>;
  StageRow: ComponentType<{ stage: Stage; milestone: StageMilestone | null }>;              // default: StageStepper + MilestoneCountdown (L164-167)
  TileSearch: ComponentType<{ search: TileSearchModel }>;
  TeamBanner: ComponentType<{ team: TeamModel; isOtherTeam: boolean; totalPoints: number | null }>;
  PlanningStage: ComponentType<{ stage: "planning" | "captains" }>;                        // default: EmptyState copy at L171-174
  SignupStage: ComponentType<{ slug: string }>;                                             // default renders <SignupForm slug/>
  DraftStage: ComponentType<{ draft: BingoPageModel["draft"]; milestone: StageMilestone | null; onOpenDraft(): void }>; // default: DraftStageView L266-310 + TeamRoster
  NoTeamStage: ComponentType<{ isMod: boolean }>;                                           // default: EmptyState copy at L177-186
  RulesDialog: ComponentType<{ isOpen: boolean; markdown: string; onClose(): void }>;      // always mounted (L242-247)
  SubmissionsDrawer: ComponentType<{ isOpen: boolean; submissions: SubmissionModel[]; onClose(): void; onSubmit?: () => void }>;
  // board
  BoardGrid: ComponentType<{ board: BoardModel; onOpenTile(tileId: string): void }>;
  RowLabel: ComponentType<{ category: CategoryModel | null }>;
  EmptyCell: ComponentType<{ row: number; col: number }>;
  TileCell: ComponentType<{ tile: TileModel; onOpen(): void }>;
  PreStartBanner: ComponentType<{ startsAt: number }>;                                      // default: Notice at BoardGrid.tsx:91-95
  TileModal: ComponentType<{ tile: TileModel | null; isOpen: boolean; onClose(): void; onSubmit?: () => void }>;  // always mounted (TileModal.tsx:14-36)
  TaskPanel: ComponentType<{ task: TaskModel }>;
  RequirementTree: ComponentType<{ node: RequirementNodeModel; root?: boolean }>;
  TileSubmissions: ComponentType<{ submissions: SubmissionModel[] }>;
  // submission flow (SubmissionModal is mounted only while open — see §0)
  SubmissionModal: ComponentType<{ flow: SubmissionFlowModel }>;
  ScreenshotDropzone: ComponentType<{ screenshot: SubmissionFlowModel["screenshot"] }>;
  AnalysisPanel: ComponentType<{ analysis: SubmissionFlowModel["analysis"] }>;
  TilePicker: ComponentType<{ tile: SubmissionFlowModel["tile"] }>;
  TaskPicker: ComponentType<{ task: SubmissionFlowModel["task"] }>;
  RequirementPicker: ComponentType<{ requirement: SubmissionFlowModel["requirement"]; quantity: SubmissionFlowModel["quantity"] }>;
  StagedClaimsList: ComponentType<{ staged: SubmissionFlowModel["staged"] }>;
}
export type SlotName = keyof ThemeSlots;
```

`themes/registry.ts`:
```ts
export interface ThemeDefinition { key: string; tokens?: Partial<ThemeTokens>; slots?: Partial<ThemeSlots> }
export interface ResolvedTheme   { key: string; tokens: ThemeTokens; slots: ThemeSlots }
const loaders: Record<string, () => Promise<{ default: ThemeDefinition }>> = {
  // comic: () => import("./comic"),   // follow-up: one line + a folder
};
export function isKnownTheme(key: string): boolean
export function resolveTheme(key: string): ResolvedTheme | Promise<ResolvedTheme>
//   "default"/unknown → merged default, synchronously; known lazy key → module-level cached Promise merged
//   over default; import failure → console.warn + default (never throws, matching getTheme today)
export function mergeTheme(base: ResolvedTheme, def: ThemeDefinition): ResolvedTheme   // shallow merge of tokens and slots
```
`themes/keys.ts`: `export const THEME_KEYS = ["default"] as const` — keep in sync with `loaders` (comment it).

`themes/context.ts`: `ThemeContext`, `useSlot<K extends SlotName>(name: K): ThemeSlots[K]`, `useThemeTokens()`.
Imports only `slots.ts`/`tokens.ts` types — never `registry.ts` or `default/index.ts` (cycle: default slot
components import `useSlot` from here).

`themes/ThemeProvider.tsx` — `useState<ResolvedTheme>(() => sync default)`; `useEffect` on `themeKey`: if lazy,
await `resolveTheme` and set, guarding a stale key with a ref. **Not** `React.lazy`/`Suspense` (need a whole
definition object, caching across remounts, and an admin theme-key edit must not re-suspend the tree). While a
non-default theme loads, render the default `PageLoading` slot. Renders `<div style={tokensToCssVars(tokens)}
data-theme={key}>` — replaces `ThemeRoot` (`BingoPage.tsx:91`). Mounted **only** in `pages/BingoPage.tsx`.

Resolution rule for the default theme: **every nested slot render goes through `useSlot`, never a direct
import** — otherwise partial overrides silently don't apply.

`pages/BingoPage.tsx` after (shape):
```tsx
export function BingoPage() {
  const { slug } = useParams();
  return (
    <BingoPageProvider slug={slug!} renderLoading={() => <DefaultPageLoading/>} renderError={(m) => <DefaultPageError message={m}/>}>
      <ThemedSurface/>
    </BingoPageProvider>
  );
}
function ThemedSurface() { const page = useBingoPage(); return <ThemeProvider themeKey={page.themeKey}><BoardPageSlot/></ThemeProvider>; }
function BoardPageSlot() { const BoardPage = useSlot("BoardPage"); return <BoardPage/>; }
```

## 4. Default theme refactor mapping (move JSX, don't rewrite it; `git mv` where possible)

Line refs are against `main@e6c575c`.

| Existing code | → `client/src/themes/default/…` | Now receives / notes |
|---|---|---|
| `BingoPage.tsx` L28-88 (queries, state, WS handler, helpers) | — | → `headless/*` |
| L90-92, 163, 223, 256-257 shell + `<main>`; stage branch L169-222; mounts L225-255 | `page/BoardPageLayout.tsx` (BoardPage slot, ~110) | `useBingoPage()`, `useBoardModel()`, `useSlot` for every child; renders `TileModal` (driven by `page.openTile`), `RulesDialog`, `SubmissionsDrawer`, and `SubmissionFlowHost` here |
| L93-161 `<AppHeader …>` + children | `page/PageHeader.tsx` (~80) | `{ page }`; keeps core `AppHeader` (it owns the avatar menu/logout); subtitle = end countdown or `page.bingo.stageLabel` (L96-104); `TeamSelector`/`TeamBadge` via `useSlot`; nav `Button`s call `page.actions.*`, `page.rules.show`, `page.drawer.show`, `page.submit.show()`; pending `Badge` from `page.pendingCount` |
| L106-123 / L124-129 / L88 `teamBadgeStyle` | `page/TeamSelector.tsx` (RAC `MenuTrigger`/`Menu`/`MenuItem`), `page/TeamBadge.tsx` | `selector.select(String(key))` in `onAction`; the `${color}99` border stays a slot detail |
| L164-167 stepper + milestone | `page/StageRow.tsx` | `{ stage, milestone }`; core `StageStepper`, `MilestoneCountdown` — the latter takes `bingo`; pass a minimal `Pick<Bingo,…>` built from the model, or change `MilestoneCountdown` to accept `milestone` (small core change, allowed) |
| L169-170 / L171-174 / L175-176 + L266-310 / L177-186 | `SignupStage`, `PlanningStage`, `DraftStage` (uses core `TeamRoster`), `NoTeamStage` | `EmptyState` from `core/ui/Card` |
| L189-190 + `TileSearch` component L312-398 | `page/TileSearch.tsx` (~70) | `{ search }`; state → `useTileSearch`; keeps placeholder "Search tiles, items…" |
| L191-207 team banner | `page/TeamBanner.tsx` | `{ team, isOtherTeam, totalPoints }` |
| L242-247 rules `Dialog` | `page/RulesDialog.tsx` | `{ isOpen, markdown, onClose }`; core `Dialog`/`DialogHeader`/`Markdown` |
| L70-72 loading/error | `page/PageStates.tsx` (`PageLoading`, `PageError`) | |
| `core/board/BoardGrid.tsx` | `board/BoardGrid.tsx` (~60) | `{ board, onOpenTile }`; iterates `board.grid`; `RowLabel`/`TileCell`/`EmptyCell`/`PreStartBanner` via `useSlot`; no tick (L54-68 → `useNowTick`), no `selected`, no TileModal (L139-147 moves up) |
| BoardGrid L103-115 / L91-95 | `board/RowLabel.tsx`, `board/PreStartBanner.tsx` (core `Notice`) | |
| `core/board/TileCell.tsx` | `board/TileCell.tsx`, `React.memo` | `{ tile, onOpen }`; keeps `imgFailed`; `--tile-accent` set only when `tile.accentColor` (L38); keep L44 title + L83-86 badge |
| `core/board/TileModal.tsx` L14-36 wrapper + L38-149 `TileDetails` | `board/TileModal.tsx` (~90) + `board/TileSubmissions.tsx` (L134-147) | `{ tile, isOpen, onClose, onSubmit }`; always-mounted core `Dialog size="lg"`; `tile.tasks` → `TaskPanel` slot; `disabled={!tile.canSubmit}`; `Heading slot="title"` |
| `core/board/TaskPanel.tsx` L133-187 / L30-131 / L7-9 / L11-28 | `board/TaskPanel.tsx` (~60, keeps the RAC `TooltipTrigger` lock tooltip L158-169) / `board/RequirementTree.tsx` (~60) / use `CheckIcon` from `core/ui/icons` / **`core/board/labels.ts`** | `{ task }` / `{ node, root }` |
| `core/submissions/TeamSubmissionsList.tsx` | `page/SubmissionsDrawer.tsx` | `{ isOpen, submissions, onClose, onSubmit }`; core `Dialog`, `ScreenshotThumb`, `SubmissionStatusBadge` |
| `SubmissionModal.tsx` L43-265 | `headless/useSubmissionFlow.ts` + `submissionFlowLogic.ts` | everything non-JSX |
| L268-272 + L431-435 | `submission/SubmissionModal.tsx` (~60) | `{ flow }`; core `Dialog`/`DialogHeader`; composes the six child slots via `useSlot`; keep "Submit completion" / "Submit for review" |
| L273-301 / L303-329 / L332-344 / L346-375 / L377-406 / L408-429 | `ScreenshotDropzone` (the `<button type="button">` dropzone + hidden input) / `AnalysisPanel` / `TilePicker` / `TaskPicker` (+ manual `Notice`) / `RequirementPicker` (`key={requirement.pickerKey}`) / `StagedClaimsList` | props-only; core `Field`, `Notice`, `Button`, `SearchableSelect` |
| `themes/ThemeRoot.tsx`, `themes/default/tokens.ts` | deleted (folded into `ThemeProvider`, `themes/tokens.ts`) | |

## 5. Tokens

Two layers, both already partly in place — do **not** add a third:
- **App design system** (`index.css` `@theme`, build-time): `--color-bg/surface/surface-raised/surface-hover`,
  `--color-line/line-strong`, `--color-fg/fg-muted/fg-subtle`, `--color-accent/accent-fg`,
  `--color-ok/warn/danger/info`, `--radius-*`, `--shadow-pop`, `--font-mono`, plus the RAC state variants
  (`pressed`/`selected`/`hovered`/`current`) and overlay keyframes. Leave it as-is.
- **Per-theme runtime tokens** (`themes/tokens.ts`, applied by `ThemeProvider` as inline CSS vars on the page
  root): `ThemeTokens = { tile: { bg; border; empty; accent; complete; frozen } /* today's --tile-* from
  themes/default/tokens.ts */; chrome?: Partial<{ bg; surface; surfaceRaised; surfaceHover; line; lineStrong;
  fg; fgMuted; fgSubtle; accent; accentFg }> }`. `tokensToCssVars` emits `--tile-*` and, for `chrome`, the
  matching `--color-*` names. Tailwind v4 utilities compile to `var(--color-…)` (the `@theme` block is not
  `inline`), so a theme setting `--color-bg` on the provider div re-skins every `bg-bg`/`text-fg` utility beneath
  it without any component change — this is what makes chrome themeable for free. Verify once in Phase 3 by
  temporarily setting `chrome.bg` in `defaultTokens` and confirming the page background changes; then revert.
- Default-theme components keep their semantic utility classes (`bg-surface`, `text-fg-muted`, …) and the
  `--tile-*` var usage exactly as the restyle left them. No new hardcoded colours.

## 6. Admin settings (cheap, include in Phase 5)

`core/admin/BingoSettingsForm.tsx`: the theme `Input` → a core `Select` (`core/ui/Field.tsx`) over `THEME_KEYS`
from `themes/keys.ts`. If `bingo.theme` isn't in the list, add it as an extra option labeled
`"<value> (unknown — falls back to default)"` so an existing value is never silently rewritten on save.
Imports only the key list, so no theme code enters the admin bundle. Server unchanged.

## 7. Phases (commit after each; the app must work after each)

**Phase 1 — pure extraction, zero UI change.**
Create `core/board/labels.ts` (move `leafLabel`/`compositeLabel` from `TaskPanel.tsx:11-28`; temporarily
re-export from `TaskPanel.tsx` so `SubmissionModal.tsx`'s import keeps compiling), `headless/types.ts`,
`headless/boardModel.ts`, `headless/submissionFlowLogic.ts` (move `getAvailableTasks`, `getRowCategory`). Point
existing components at the moved fns. Build passes; nothing visible changes.

**Phase 2 — providers + hooks; existing JSX stays.**
Add `useNowTick`, `useTileSearch`, `useViewingTeam`, `usePageEvents`, `BingoPageProvider`, `BoardProvider`,
`useBingoPage`. `pages/BingoPage.tsx` wraps itself in the provider and reads `page`/`board` models but keeps its
JSX inline (including the local `TileSearch` component, now fed by `page.search`). `BoardGrid` takes
`board: BoardModel` (drop raw props, the tick, `selected`; `TileModal` moves up to BingoPage driven by
`page.openTile`, still always-mounted with `tile | null`). `TileCell`/`TileModal`/`TaskPanel` switch to
`TileModel`/`TaskModel`/`RequirementNodeModel` props — the per-cell recompute fix lands here. Run §8 for
search/team/tiles/stage branches.

**Phase 3 — registry + ThemeProvider + default theme by moving JSX.**
Create `themes/{slots,context,tokens,registry,keys,ThemeProvider}`; create `themes/default/**` by moving the
Phase-2 components and slicing `BingoPage.tsx` into `page/*` slots; every nested render goes through `useSlot`.
`pages/BingoPage.tsx` becomes the ~40-line shell. Delete `ThemeRoot.tsx`, `default/tokens.ts`, and the emptied
`core/board/*.tsx`. Do the §5 chrome-token verification. `SubmissionModal` still lives in `core/submissions/`,
mounted by `BoardPageLayout` via direct import for one more phase. Run §8.

**Phase 4 — submission flow decomposition.**
`headless/useSubmissionFlow.ts` + `SubmissionFlowHost.tsx`; split `SubmissionModal.tsx` into the seven
`themes/default/submission/*` slots; `BoardPageLayout` mounts
`{page.submit.open && <SubmissionFlowHost initialTileId onClose>{(flow) => <SubmissionModal flow={flow}/>}</SubmissionFlowHost>}`.
Delete `core/submissions/SubmissionModal.tsx` and `TeamSubmissionsList.tsx`; remove the Phase-1 re-export. Run
§8 (submission section carefully — the OCR/auto-select behavior).

**Phase 5 — lazy loading, admin select, docs.**
Wire `loaders` + the async `resolveTheme` path. Verify with a throwaway `themes/_probe/index.ts` that overrides
only `TileCell` and sets `tokens.chrome.accent` (set a bingo's theme to `_probe`; confirm only the cell and the
accent change), **then delete it**. Admin `Select`. Rewrite `docs/implementation-plan.md` §3's "Theme contract"
paragraph (slots/headless + import rules) and add `docs/theming.md`: how to write a theme (folder,
`ThemeDefinition`, registering in `loaders` + `keys.ts`, the slot list, the always-mounted-dialog rule, what a
`BoardPage` override may import, that `core/ui/*` + `react-aria-components` are the expected building blocks).

## 8. Verification

- **Every phase**: `npm run build -w client` and `npm test` (server vitest — must stay green; no server files change).
- **Optional**: vitest in `client/` for `boardModel.ts` / `submissionFlowLogic.ts` — only if wanted.
- **Manual checklist against a throwaway DB** (never `server/data/bingo.db`):
  ```
  DB_PATH=<scratch>/theme-refactor.db npm run db:migrate -w server
  DB_PATH=<scratch>/theme-refactor.db npm run db:seed:dev -w server
  DB_PATH=<scratch>/theme-refactor.db DEV_LOGIN_ENABLED=true npm run dev
  ```
  As a member and as a mod (dev-login picker):
  1. Stage branches: planning + captains `EmptyState` copy, signup (SignupForm), draft (countdown before start → "Open draft room" pointer while running → `TeamRoster` reveal after; a non-signup user sees the generic copy), reveal/live/complete boards; the stage stepper + milestone countdown row on every stage; a `stage_changed` WS event shows a toast.
  2. Header (`AppHeader`): back link, name, subtitle = "remaining" countdown when `endsAt && live` else the stage label; Rules only with markdown; Stats when revealed or mod; Mod panel with pending badge; Submissions count; Submit only when `canSubmit`; avatar menu → log out.
  3. Mod team menu: opens/closes (RAC), selecting switches board + banner ("Viewing as moderator"), Submit hidden for another team, "you" marker.
  4. Search: dims non-matches, 8-cap + "N more", arrow/Enter opens the tile dialog, Escape/blur close, ✕ clears + refocuses.
  5. Tile cell: image/fallback, points badge, per-task dots (>1 tasks, hidden when not_started), complete overlay, ⏱ marker, frozen overlay with live countdown (freeze tile; `startsAt` = now − 1 min), ticking stops after unlock; pre-start (`startsAt` in the future) shows the `Notice` banner and the board stays clickable.
  6. Tile dialog: accent border, category badge, pts, freeze badge, Submit disabled when complete/frozen, task columns with the RAC lock tooltip, tree dim/strike/progress, root-ALL heading suppression, "Pre-load allowed", notes, submissions with task labels; closing animates.
  7. Submission modal: window drag-over highlight, file button, preview, analysis states, tile picker excludes complete + frozen and groups by category, single task auto-selects, single leaf auto-selects (read-only picker), SUM child quantity with max, stage/remove extra claims, manual-task notice, error, disabled during analyze/submit, closes on success; approve from a mod tab → member tab updates without reload.
  8. Drawer: newest first, `ScreenshotThumb`, tile + task badges, summary, "by …", reviewer notes, status badge, Submit only when `canSubmit`.
  9. Rules dialog open/close. 10. Mod/stats/draft/list pages unchanged. 11. Admin Settings theme select shows `default`; save preserves it.
- **E2E** (deferred — do not run or fix): `e2e/full-flow.spec.ts` and `e2e/special-tile-rules.spec.ts` cover
  these surfaces but were not updated for the restyle (`.bg-slate-800.*` and the yellow points span are already
  gone; `"Search items…"` never existed) — pre-existing drift. Preserve the §0 list so the eventual fix is small.

## 9. Comic-theme readiness (what the follow-up will rely on)

- Imports: the `headless` barrel (`useBingoPage`, `useBoardModel`, `useTileModel`, `usePageEvent`,
  `SubmissionFlowHost`, model types), `themes/context` (`useSlot`, `useThemeTokens`), `themes/slots` types,
  `themes/registry` (`ThemeDefinition`), all of `core/ui/*` and `react-aria-components` (for its own dialogs,
  menus, tooltips — the accessibility comes for free), `SignupForm`, `TeamRoster`, `Markdown`, `SubmissionRow`,
  `ScreenshotThumb`.
- A whole-surface layout needs: navigation (`page.actions`, plus core `AppHeader` if it wants the standard
  header), identity (`page.user`), stage branch + copy (`page.stageView`, `page.bingo.stageLabel`,
  `page.milestone`), countdown targets, team switching (`page.teamSelector`), search (`page.search`), all
  overlay open/close state, `board.grid`/`board.lines`, per-tile everything (`TileModel`), the submission flow,
  the draft reveal data (`page.draft`) — all present. Nothing forces it to touch `api/*` or `context/*`.
- Re-skinning chrome without touching components: `tokens.chrome` (§5).
- Registering: one `loaders` line, one `keys.ts` entry, `themes/comic/index.ts` exporting `{ key, tokens, slots }`.
- Watch item: team member avatars would need `teams[].members` (not in `BingoShellResponse`) — server addition, not in this plan.

## 10. Risks / things that bite

- `now` lives only in `BoardContext`; `finalizeTileModels` preserves identity → only frozen cells re-render per tick.
- Keep the three OCR/auto-select effects and their dependency arrays byte-for-byte.
- Always-mounted dialogs: never conditionally render an `isOpen` slot (exit animation + RAC focus restore break). The submission modal is the deliberate exception.
- `themes/context.ts` ↔ `default/index.ts` import cycle — `context.ts` imports only `slots.ts`/`tokens.ts` types.
- Shell loading/error renders default slots before the theme is known — one round-trip of default spinner on a themed bingo; acceptable.
- Moving `TileModal` from `BoardGrid` to `BoardPageLayout` changes DOM position; it's the same core `Dialog`, so role/heading queries hold.
- `MilestoneCountdown` currently takes a `Bingo`; either build a `Pick<Bingo,…>` from the model or widen its prop — do not pass the raw shell.
- `SubmissionModel.detail` is the one raw server shape a theme *could* touch — optional, documented.
- The default theme stays eager (it's the fallback); nothing is code-split until a second theme exists.
