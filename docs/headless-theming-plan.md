# Headless board layer + per-bingo UI themes — implementation plan

**Status:** approved plan, not yet implemented (2026-09-08).
**Scope of this doc:** the headless layer + refactoring the current UI into the
`default` theme. The first real theme ("retro comic book") is a follow-up that
builds on top of this; this plan must leave nothing it needs missing.

## For the implementer

- Work on a branch off `main` (suggested: `headless-theming`). Commit at the end
  of **every phase** in §7 — the app must build and behave identically after
  each one. Do not squash phases together.
- **Acceptance bar is "no behavior change."** This is a refactor. If you find a
  bug while moving code, note it in the commit message and leave the behavior
  as-is unless it blocks the refactor.
- Verification after every phase: `npm run build -w client` and `npm test`
  (server vitest — no server file should change; a red server suite means
  something leaked). Manual checklist in §8 at the end of phases 2, 3, 4.
- E2E (`e2e/*.spec.ts`) is **deferred** per repo policy — do not run or fix it
  as part of this work; preserve the selectors listed in §0 so it stays fixable.
- Reuse the existing pure helpers listed in §2 — do not rewrite their logic.
- Keep every file under ~300 lines (repo convention). Split rather than grow.
- Read `docs/implementation-plan.md` §3 (client architecture) first; this plan
  supersedes its "Theme contract" paragraph, which Phase 5 rewrites.

## Context

Each bingo should be able to ship its own custom player-facing UI — not a CSS
skin, but real React code (the last event was Pokémon-themed with one-off UI).
Today that's impossible without forking the board: `pages/BingoPage.tsx`
(430 lines) owns every query hook, all page state, and five stage-branched
surfaces; `core/submissions/SubmissionModal.tsx` (473 lines) owns
upload/OCR/staged-claims plus its own mutations; the board subtree threads
*raw server arrays* (`nodeStates`, `teamSubmissions`) three levels deep and
`TileCell` re-derives progress per cell on every render. The existing theme
skeleton (`themes/registry.ts`, `ThemeRoot`, 4 tokens) is inert —
`useThemedComponent` is never called and nothing reads the tokens.

Goal: a **headless layer** (view-model hooks + a typed slot registry + a theme
provider) with the current UI refactored into the `default` theme on top of
it, so a theme only ever writes presentational components against data-only
view models and never touches API code.

## 0. Settled decisions and the acceptance bar

- **Themeable**: the board (grid, tile cell, tile modal, task panel), the
  `/b/:slug` page chrome (header, team selector, countdown, rules modal,
  submissions drawer, stage empty states), and the submission modal.
  **Never themed**: mod, admin, stats, draft room, bingo list, login.
  `SignupForm` stays core, rendered inside the themed signup state.
- **Override model: hybrid** — a theme overrides individual named slots
  (default fallback) *or* replaces a whole surface's composition; both consume
  the same headless hooks.
- **Current UI becomes the `default` theme** (single code path).
- Themes are **lazy-loaded**; `bingo.theme` selects one, unknown key → default.
- Conventions: files ≲300 lines; server state only in the query cache; client
  never re-implements gating; types only from `@bingo/shared`; admin/mod import
  `core/*` directly and never mount a theme.
- **Preserve verbatim** (e2e selectors / behavior): the three `SubmissionModal`
  auto-select effects and their dependency arrays (current L102-143);
  `TileCell`'s `title={tile.name}` and the `pointsAwarded/totalPoints` badge
  text; core `Modal`'s wrapper class `.bg-slate-800.rounded-xl` with an `<h2>`
  inside the tile modal; team points as `span.text-xl.font-bold.text-yellow-400`;
  submission modal title "Submit Completion", button "Submit for Review",
  placeholders "Search tiles…" / "Search requirements…", hidden
  `input[type="file"]`, "This task is judged manually" copy; drawer header
  "Close" aria-label.

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
                             getRowCategory (moved from BoardGrid.tsx:9)
    submissionFlowLogic.ts   pure: getAvailableTasks (moved from SubmissionModal.tsx:12), computeOpenLeaves,
                             buildTileOptions, buildCurrentClaim, isFlowValid
    useNowTick.ts            1 s tick until a deadline (ports BoardGrid.tsx:52-66 exactly)
    useTileSearch.ts         query/focus/highlight/keydown + the 150 ms blur timeout (BingoPage.tsx:51-111, 294-308)
    useTeamSelector.ts       viewing team, auto-select myTeam on shell load, dropdown + outside-click (BingoPage.tsx:26-41)
    useModNotifications.ts   WS submission_created → browser Notification for mods (BingoPage.tsx:57-67, verbatim)
    BingoPageProvider.tsx    loads shell/board/progress/submissions/pending; provides BingoPageModel (+ internal raw context)
    BoardProvider.tsx        nested inside; owns the tick; provides BoardModel
    useBingoPage.ts          useBingoPage(), useBoardModel(), useTileModel(id), usePageEvent (re-export of useWebSocketEvent)
    useSubmissionFlow.ts     the submission state machine; owns useCreateSubmission/useAnalyzeScreenshot
    SubmissionFlowHost.tsx   render-prop wrapper around useSubmissionFlow so leaf slots stay props-only
  core/
    board/   tileProgress.ts, taskClaims.ts, requirementTree.ts   (unchanged)
             labels.ts   NEW — leafLabel/compositeLabel moved out of TaskPanel.tsx:17-33
             BoardGrid/TileCell/TileModal/TaskPanel .tsx → DELETED in Phase 3 (moved to themes/default/board)
    submissions/ SubmissionRow.tsx, claimsSummary.ts (unchanged)
             SubmissionModal.tsx, TeamSubmissionsList.tsx → DELETED in Phase 4 (moved)
    ui/, signup/  unchanged — themes may use Modal/ModalHeader, StatusBadge, Markdown, SearchableSelect,
             CountdownTimer, time.ts, user.ts, SignupForm
  themes/
    keys.ts          export const THEME_KEYS = ["default", …] — import-free, safe for the admin bundle
    tokens.ts        ThemeTokens type, defaultTokens, tokensToCssVars()
    slots.ts         ThemeSlots interface + every slot's props type (imports headless/types only)
    context.ts       ThemeContext, useSlot(), useThemeTokens()   (imports slots.ts types only — avoids cycles)
    registry.ts      ThemeDefinition, ResolvedTheme, lazy `loaders` map, resolveTheme(key), mergeTheme()
    ThemeProvider.tsx  <ThemeProvider themeKey> — resolves, merges over default, sets CSS vars on the root div
    default/
      index.ts       defaultTheme: ThemeDefinition (eager, complete slot map)
      page/     BoardPageLayout PageHeader TeamSelector TeamBadge EndCountdown TeamBanner TileSearch
                StageEmptyState SignupStage RulesModal SubmissionsDrawer PageStates
      board/    BoardGrid RowLabel EmptyCell TileCell PreStartOverlay TileModal TaskPanel RequirementTree TileSubmissions
      submission/ SubmissionModal ScreenshotDropzone AnalysisPanel TilePicker TaskPicker RequirementPicker StagedClaimsList
      ui/icons.tsx   CheckIcon (from TaskPanel.tsx:4-14), LockIcon, UploadIcon, SearchIcon
    ThemeRoot.tsx, default/tokens.ts → DELETED in Phase 3
  pages/BingoPage.tsx   ~40 lines: params → BingoPageProvider → ThemeProvider → BoardPage slot
```

Import rules (review guard: `grep -rn "from \"../../api\|from \"../../context" client/src/themes` must be empty):

| From | May import |
|---|---|
| `themes/**` | `headless` barrel, `themes/{context,slots,tokens}`, `core/ui/*`, `core/submissions/SubmissionRow`, `core/signup/SignupForm`, `@bingo/shared` types |
| `headless/**` | `api/*`, `context/*`, `core/board/*.ts`, `core/submissions/claimsSummary.ts`, `core/ui/{time,user}.ts` |
| `core/admin/**`, `core/mod/**` | never `headless/*` or `themes/*` (only `themes/keys.ts`, for the settings select) |
| `pages/BingoPage.tsx` | `headless`, `themes/ThemeProvider`, `themes/context` |

## 2. Headless view models (`headless/types.ts`)

Slots receive only these + callbacks — never `Tile`, `TeamNodeState[]`,
`SubmissionDetails[]`, or `LeafClaimMaps`.

```ts
CategoryModel { id; label; color: string|null; tint: string|null /* `${color}1a` — the alpha convention from
                BoardGrid.tsx:108 / TileModal.tsx:60 / BingoPage.tsx:137,167,340, computed once here */; sortOrder }
TeamModel     { id; name; color; tint; isMine }
UserModel     { displayName; avatarUrl }

RequirementNodeModel {
  id; kind: NodeKind; label /* leafLabel()/compositeLabel() already applied */; isLeaf; status: NodeStatus;
  complete; submitted /* any non-rejected claim (LeafRow "submitted" dim) */;
  notNeeded /* an enclosing ANY/COUNT is already satisfied (TaskPanel ancestorSatisfied) */;
  dim /* complete || notNeeded */; progress: { current; target } | null /* SUM only */;
  showHeading /* !(root && kind === "ALL") */; children: RequirementNodeModel[];
}
TaskModel {
  id; label; description; notes; points; kind; isManual; allowsPreLoad;
  status; complete; locked; lockedReason: string|null /* TileModal.tsx:96-105 text */;
  available /* getAvailableTasks semantics: not complete, submit gate satisfied */;
  tree: RequirementNodeModel | null /* null for MANUAL */;
}
SubmissionModel {
  id; status: SubmissionStatus; submittedAt; timeAgo; thumbnailUrl: string|null; summary /* claimsSummary() */;
  submittedBy: string|null; reviewerNotes: string|null; tileId: string|null; tileName: string|null; taskLabels: string[];
  detail: SubmissionDetails /* escape hatch so core SubmissionRow still works — the ONE raw shape a theme may see; optional */;
}
TileModel {
  id; name; imageUrl; row; col; category: CategoryModel|null;
  accentColor: string|null /* category color; the SLOT falls back to useThemeTokens().tileAccentFallback */;
  progress: { completedTasks; totalTasks; pointsAwarded; totalPoints; allComplete };
  taskStatuses: { id; index; label; status: NodeStatus }[] /* TileCell's dot row */;
  freeze: { hasFreezePeriod; durationMinutes; unlocksAt: number|null; isFrozen; remainingMs };
  tasks: TaskModel[]; submissions: SubmissionModel[] /* groupSubmissionsByTile() for this tile */;
  dimmed /* search miss */; canSubmit /* page.canSubmit && !allComplete && !isFrozen — TileModal's submitDisabled inverted */;
}
LineModel  { id; lineType; lineIndex; tileIds: string[]; points; complete; pointsAwarded }
           // not rendered by the default theme; exposed now so a theme can draw line overlays.
           // BoardLine.node.children are the tile root nodes (server boardService.ts:210); complete = line.nodeId ∈ nodeStates.
BoardModel {
  rows; cols; grid: (TileModel|null)[][] /* [row][col] */; tiles: TileModel[]; tileById: ReadonlyMap<string, TileModel>;
  rowCategories: (CategoryModel|null)[]; showRowLabels; lines: LineModel[]; now: number;
  preStart: { isPreStart; startsAt: number|null }; totalPoints: number|null /* progressData.totalPoints */;
}
StageView = "signup" | "draft" | "hidden" | "noTeam" | "board"
TileSearchModel  { query; setQuery(q); clear(); focused; setFocused(f); blur() /* hook owns the 150 ms timeout */;
                   results: { id; name }[]; overflowCount; showDropdown; highlightedIndex;
                   onKeyDown(e: React.KeyboardEvent<HTMLInputElement>); choose(tileId); inputRef }
TeamSelectorModel{ teams: TeamModel[]; selectedId: string|null; select(id); open; toggle(); close(); containerRef /* outside-click */ }
BingoPageModel {
  slug; themeKey;
  bingo: { name; stage: Stage; rulesMarkdown: string|null; startsAt: number|null; endsAt: number|null;
           signupOpensAt: string|null; boardRows; boardCols };
  user: UserModel; isMod; myTeam: TeamModel|null; teams: TeamModel[]; categories: CategoryModel[];
  stageView: StageView; boardRevealed;
  hiddenStage: { title; message; signupOpensAt: string|null } | null /* the three copy strings from BingoPage.tsx:255-265 */;
  viewing: { team: TeamModel|null; isOtherTeam; submissionCount }; canSubmit; pendingCount;
  showEndCountdown /* endsAt && stage === "live" */;
  submissions: SubmissionModel[] /* whole team, newest first (drawer) */;
  teamSelector: TeamSelectorModel; search: TileSearchModel;
  openTile: { id: string|null; open(id); close() } /* replaces BOTH BingoPage.openTileId and BoardGrid.selected */;
  rules:  { open; show(); hide() };  drawer: { open; show(); hide() };
  submit: { open; initialTileId: string|undefined; show(tileId?); hide() };
  actions: { logout(); goHome(); goToStats(); goToMod(); goToDraft() };
}
SubmissionFlowModel {
  screenshot: { file: File|null; previewUrl: string|null; dragOver; error: string|null; pick(file); openFilePicker();
                inputProps: { ref; type: "file"; accept: "image/*"; onChange(e) } };
  analysis:   { status: "idle"|"analyzing"|"done"|"failed";
                result: { codewordFound; codeword; warnings: string[]; detected: { itemName; tileName } | null } | null };
  tile:       { selectedId; options: { id; label; group? }[]; select(id) };
  task:       { selectedId; options: { id; label }[]; select(id); current: { id; label; isManual } | null;
                autoSelected /* options.length === 1 */ };
  requirement:{ visible; selectedId; options: { id; label }[]; readOnly; select(id);
                pickerKey /* `${tileId}-${taskId}` — the SearchableSelect remount key from SubmissionModal.tsx:402 */ };
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
`tileMatchesSearch` (`core/board/requirementTree.ts`), `claimsSummary`
(`core/submissions/claimsSummary.ts`), `timeAgo` (`core/ui/time.ts`),
`displayName` (`core/ui/user.ts`).

- `buildRequirementTree(node, maps, statusByNodeId, ancestorSatisfied = false, root = true): RequirementNodeModel | null`
  — returns null for MANUAL; ports `TaskPanel.tsx` RequirementTree/LeafRow/SumRow rules 1:1.
- `buildTaskModels(tile, summary, maps): TaskModel[]` — ports `TileModal.tsx:95-107` gate/lock + `getAvailableTasks`.
- **Two-stage tile memo** (the per-cell recompute fix for `TileCell.tsx:29`):
  `buildTileModelsStatic({ tiles, categories, nodeStates, teamSubmissions, bingoStartsAt })` runs once per data
  change (calling `summarizeTileProgress` per tile inside the single memo is fine at board scale);
  `finalizeTileModels(static, now, matchIds, canSubmit, prev)` is the cheap per-tick pass and **returns the
  previous object for any tile whose isFrozen/remainingMs/dimmed/canSubmit didn't change**, so
  `React.memo(TileCell)` only re-renders frozen cells. Key the memo on the query *data references*
  (`boardData?.tiles`, `progressData?.nodeStates`, `submissionsData?.submissions`), never on `?? []`
  fallbacks created per render — hoist stable `EMPTY` constants.
- `buildLineModels(lines, tiles, nodeStates)`, `buildSubmissionModels(tiles, submissions)` (ports
  `TeamSubmissionsList` taskLookup + `TileModal` taskLabelByLeafId; sorted newest first).

### Providers / hooks
- `BingoPageProvider({ slug, children, renderLoading, renderError })` — calls `useAuth`, `useBingo`,
  `useBoard`, `useTeamSelector`, `useTeamProgress(slug, viewingTeamId)`, `useTeamSubmissions`,
  `usePendingCount(slug, !!shell?.isMod)`, `useModNotifications`, `useNavigate`, `useTileSearch`, and the
  open-state `useState`s. Early returns exactly as `BingoPage.tsx:69-71` (`!user → null`, loading, error);
  these render the **default** theme's `PageLoading`/`PageError` slots because the theme key isn't known
  until the shell loads (acceptable — a themed bingo shows the default spinner for one round-trip).
  `stageView` uses the exact branch order `signup → draft → !boardRevealed → !viewingTeamId → board`
  (`BingoPage.tsx:234-282`; the draft branch sits above the revealed check on purpose — see the comment there).
  The context value is **tick-free** (no `now`) so header/search don't re-render every second. Raw query
  data goes in a separate internal `BingoPageRawContext` that only `headless/` reads.
- `BoardProvider` — internal; `useNowTick(startMs + maxFreezeMs)` (same `tickUntil` as today), the two-stage
  memo, `buildLineModels`; provides `BoardContext`.
- `useSubmissionFlow({ initialTileId, onClose, onSuccess })` — reads raw data from `BingoPageRawContext`;
  owns `useCreateSubmission` + `useAnalyzeScreenshot` (FormData assembly from `SubmissionModal.tsx:145-156`
  and `230-246` moves here); the window drag/drop listeners (L173-201) move unchanged; the three
  auto-select effects (L102-117, L120-143) move **with identical dependency arrays and their
  eslint-disable comments** — the second one re-fires on board refetch and resets qty to 1; that is a
  pre-existing quirk, do not fix it here. `tileOptions` keep using `Date.now()` at compute time (not the
  board tick) to stay identical. WS invalidation stays transparent: `useCreateSubmission`'s `onSuccess`
  already invalidates `teamProgress`/`teamSubmissions` (`api/queries.ts:86-89`) → provider refetches →
  models rebuild → slots re-render.
- `SubmissionFlowHost({ initialTileId, onClose, children(flow) })` — mounted only while `page.submit.open`,
  so unmount = reset (as today).

## 3. Slot registry

`themes/slots.ts`:
```ts
export interface ThemeSlots {
  // whole-surface composition (may call headless hooks)
  BoardPage: ComponentType<Record<string, never>>;
  // page chrome (props-only)
  PageLoading: ComponentType<Record<string, never>>;  PageError: ComponentType<{ message: string }>;
  PageHeader: ComponentType<{ page: BingoPageModel }>;   // default composes TeamSelector/TeamBadge + nav buttons from page.actions
  TeamSelector: ComponentType<{ selector: TeamSelectorModel; myTeamId: string | null }>;
  TeamBadge: ComponentType<{ team: TeamModel }>;
  EndCountdown: ComponentType<{ endsAt: number }>;
  TileSearch: ComponentType<{ search: TileSearchModel }>;
  TeamBanner: ComponentType<{ team: TeamModel; isOtherTeam: boolean; totalPoints: number | null }>;
  SignupStage: ComponentType<{ slug: string }>;         // default renders <SignupForm slug/>
  StageEmptyState: ComponentType<{ view: "draft" | "hidden" | "noTeam"; isMod: boolean; hiddenStage: BingoPageModel["hiddenStage"]; onOpenDraft(): void }>;
  RulesModal: ComponentType<{ markdown: string; onClose(): void }>;
  SubmissionsDrawer: ComponentType<{ submissions: SubmissionModel[]; onClose(): void; onSubmit?: () => void }>;
  // board
  BoardGrid: ComponentType<{ board: BoardModel; onOpenTile(tileId: string): void }>;
  RowLabel: ComponentType<{ category: CategoryModel | null }>;
  EmptyCell: ComponentType<{ row: number; col: number }>;
  TileCell: ComponentType<{ tile: TileModel; onOpen(): void }>;
  PreStartOverlay: ComponentType<{ startsAt: number }>;
  TileModal: ComponentType<{ tile: TileModel; onClose(): void; onSubmit?: () => void }>;
  TaskPanel: ComponentType<{ task: TaskModel }>;
  RequirementTree: ComponentType<{ node: RequirementNodeModel; root?: boolean }>;
  TileSubmissions: ComponentType<{ submissions: SubmissionModel[] }>;
  // submission flow
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
//   "default" or unknown → the merged default, synchronously; a known lazy key → a module-level cached
//   Promise that merges over default; import failure → console.warn + default (never throws)
export function mergeTheme(base: ResolvedTheme, def: ThemeDefinition): ResolvedTheme   // shallow merge of tokens and slots
```
`themes/keys.ts`: `export const THEME_KEYS = ["default"] as const` — keep in sync with `loaders` (comment it).

`themes/context.ts`: `ThemeContext`, `useSlot<K extends SlotName>(name: K): ThemeSlots[K]`, `useThemeTokens()`.
Must import only `slots.ts`/`tokens.ts` types — never `registry.ts` or `default/index.ts` (import cycle:
default slot components import `useSlot` from here).

`themes/ThemeProvider.tsx` — `useState<ResolvedTheme>(() => sync default)`; `useEffect` on `themeKey`: if lazy,
await `resolveTheme` and set, guarding against a stale key with a ref. **Not** `React.lazy`/`Suspense` (we need a
whole definition object, caching across remounts, and an admin theme-key edit must not re-suspend the tree).
While a non-default theme is loading, render the default `PageLoading` slot (avoids a default→theme reskin
flash). Renders `<div style={tokensToCssVars(theme.tokens)} data-theme={theme.key}>` — replaces `ThemeRoot`.
Mounted **only** in `pages/BingoPage.tsx`, below `BingoPageProvider`; mod/admin/stats/draft never mount it.

Resolution rule for the default theme: **every nested slot render goes through `useSlot`, never a direct
import** — otherwise partial overrides silently don't apply. A theme supplying only `TileCell` inherits
default `BoardPage → BoardGrid → useSlot("TileCell")`; a theme supplying `BoardPage` composes whatever it
wants from the same hooks.

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

| Existing code | → `client/src/themes/default/…` | Now receives / notes |
|---|---|---|
| `pages/BingoPage.tsx` L17-111 (queries, state, effects, search logic) | — | → `headless/*` hooks |
| BingoPage L113-115, 233, 427-428 shell + branch L234-282 + mounts L358-426 | `page/BoardPageLayout.tsx` (the BoardPage slot, ~120) | calls `useBingoPage()`, `useBoardModel()`, `useSlot(...)` for every child; renders `TileModal` here driven by `page.openTile` (moved out of BoardGrid); mounts `SubmissionFlowHost` |
| BingoPage L116-231 header | `page/PageHeader.tsx` (~110) | `{ page }`; `EndCountdown`/`TeamSelector`/`TeamBadge` via `useSlot`; buttons call `page.actions.*`, `page.rules.show`, `page.drawer.show`, `page.submit.show()` |
| L132-163 team dropdown / L164-172 badge / L123-127 countdown | `page/TeamSelector.tsx`, `TeamBadge.tsx`, `EndCountdown.tsx` | `team.tint` replaces the inline `${color}1a` math; `selector.containerRef` for outside-click |
| L235 / L236-281 / L284-336 / L337-355 / L397-409 / L70-71 | `SignupStage`, `StageEmptyState`, `TileSearch`, `TeamBanner` (keep `span.text-xl.font-bold.text-yellow-400`), `RulesModal`, `PageStates` (`PageLoading`, `PageError`) | props-only |
| `core/board/BoardGrid.tsx` | `board/BoardGrid.tsx` (~70) | `{ board, onOpenTile }`; iterates `board.grid`; `RowLabel`/`TileCell`/`EmptyCell`/`PreStartOverlay` via `useSlot`; no tick, no `selected`, no TileModal |
| BoardGrid L98-115 / L139-148 | `board/RowLabel.tsx`, `board/PreStartOverlay.tsx` | |
| `core/board/TileCell.tsx` | `board/TileCell.tsx`, wrapped in `React.memo` | `{ tile, onOpen }`; keeps local `imgFailed`; `--tile-accent` = `tile.accentColor ?? useThemeTokens().tileAccentFallback`; keep `title={tile.name}` + points badge |
| `core/board/TileModal.tsx` | `board/TileModal.tsx` (~80) + `board/TileSubmissions.tsx` | `{ tile, onClose, onSubmit }`; `tile.tasks` → `TaskPanel` slot; `disabled={!tile.canSubmit}`; core `Modal size="lg"` + `<h2>` (e2e) |
| `core/board/TaskPanel.tsx` L137-199 / L38-134 / L4-14 / L17-33 | `board/TaskPanel.tsx` (~70) / `board/RequirementTree.tsx` (~60) / `ui/icons.tsx` / **`core/board/labels.ts`** (core, pure) | `{ task }` / `{ node, root }` reads `node.dim/submitted/complete/progress/showHeading` only |
| `core/submissions/TeamSubmissionsList.tsx` | `page/SubmissionsDrawer.tsx` | `{ submissions, onClose, onSubmit }`; reads `s.tileName/taskLabels/summary/timeAgo/thumbnailUrl/submittedBy/reviewerNotes`; keep `ModalHeader` "Close" aria |
| `core/submissions/SubmissionModal.tsx` L40-261 | `headless/useSubmissionFlow.ts` + `submissionFlowLogic.ts` | everything non-JSX |
| L263-267 + 461-470 | `submission/SubmissionModal.tsx` (~60) | `{ flow }`; composes the six child slots via `useSlot`; keep "Submit Completion" / "Submit for Review" |
| L268-303 / L305-336 / L339-353 / L355-395 / L397-431 / L433-459 | `ScreenshotDropzone` (`<input {...screenshot.inputProps} className="hidden"/>`) / `AnalysisPanel` / `TilePicker` ("Search tiles…") / `TaskPicker` / `RequirementPicker` (`key={requirement.pickerKey}`, "Search requirements…") / `StagedClaimsList` | props-only |
| `themes/ThemeRoot.tsx`, `themes/default/tokens.ts` | deleted | |
| `core/ui/CountdownTimer.tsx` | unchanged (core) | used by `EndCountdown`, `PreStartOverlay` |

## 5. Tokens

One mechanism: typed TS tokens → CSS custom properties on the theme root → optional Tailwind utilities.
- `themes/tokens.ts`: `ThemeTokens { surfaceBase; surfaceCard; surfaceRaised; border; textPrimary; textMuted; accent; accentHover; success; warning; danger; freeze; tileAccentFallback /* replaces NEUTRAL_ACCENT "#64748b" in TileCell.tsx:7 and the "#64748b" in TileModal.tsx:51 */ }`, `defaultTokens` = the current slate/indigo hexes, `tokensToCssVars(t): CSSProperties` → `--t-*`.
- `client/src/index.css`: replace the dead `@theme { --color-bg-* }` block with
  `@theme inline { --color-surface-base: var(--t-surface-base); --color-surface-card: var(--t-surface-card); --color-surface-raised: var(--t-surface-raised); --color-accent: var(--t-accent); }`
  so `bg-surface-card` / `text-accent` utilities resolve to runtime vars (Tailwind v4 `@theme inline` emits the `var()` reference directly).
- Default-theme components **keep their hardcoded slate/indigo classes** (minimal churn). Tokens are used only where inline `style` already exists: category/team `color`+`tint`, `--tile-accent`, the TileModal header border.
- Delete `themes/default/tokens.ts` (4 vars, never read) and `ThemeRoot.tsx`.

## 6. Admin settings (cheap, include in Phase 5)

`core/admin/BingoSettingsForm.tsx:91-93`: the free-text theme input → `<select id="settings-theme">` over
`THEME_KEYS` from `themes/keys.ts`. If `bingo.theme` isn't in the list, add it as an extra option labeled
`"<value> (unknown — falls back to default)"` so an existing value is never silently rewritten on save.
~12 lines; imports only the key list, so no theme code enters the admin bundle. Server unchanged
(`routes/admin.ts:35` accepts any string).

## 7. Phases (commit after each; the app must work after each)

**Phase 1 — pure extraction, zero UI change.**
Create `core/board/labels.ts` (move `leafLabel`/`compositeLabel`; temporarily re-export from `TaskPanel.tsx`
so `SubmissionModal.tsx:8` keeps compiling), `headless/types.ts`, `headless/boardModel.ts`,
`headless/submissionFlowLogic.ts` (move `getAvailableTasks`, `getRowCategory`). Point `SubmissionModal.tsx` /
`BoardGrid.tsx` at the moved fns. Build passes; nothing visible changes.

**Phase 2 — providers + hooks; existing JSX stays.**
Add `useNowTick`, `useTileSearch`, `useTeamSelector`, `useModNotifications`, `BingoPageProvider`,
`BoardProvider`, `useBingoPage`. `pages/BingoPage.tsx` wraps itself in the provider and reads `page`/`board`
models but keeps its current JSX inline and keeps rendering `core/board/BoardGrid`. `BoardGrid` now takes
`board: BoardModel` (drop raw props, the tick, and `selected`; `TileModal` moves up to BingoPage driven by
`page.openTile`). `TileCell`/`TileModal`/`TaskPanel` switch to `TileModel`/`TaskModel`/`RequirementNodeModel`
props — this is where the per-cell recompute fix lands. Run the §8 manual checklist for search/team/tiles.

**Phase 3 — registry + ThemeProvider + default theme by moving JSX.**
Create `themes/{slots,context,tokens,registry,keys,ThemeProvider}`; create `themes/default/**` by moving the
Phase-2 components and slicing `BingoPage.tsx` into `page/*` slots; every nested render goes through
`useSlot`. `pages/BingoPage.tsx` becomes the ~40-line shell. Delete `ThemeRoot.tsx`, `default/tokens.ts`, and
the now-empty `core/board/*.tsx`. Reconcile `index.css` (§5). `SubmissionModal` still lives in
`core/submissions/`, mounted by `BoardPageLayout` via direct import for one more phase. Run the §8 checklist.

**Phase 4 — submission flow decomposition.**
`headless/useSubmissionFlow.ts` + `SubmissionFlowHost.tsx`; split `SubmissionModal.tsx` into the seven
`themes/default/submission/*` slots; `BoardPageLayout` mounts
`<SubmissionFlowHost initialTileId onClose>{(flow) => <SubmissionModal flow={flow}/>}</SubmissionFlowHost>`.
Delete `core/submissions/SubmissionModal.tsx` and `TeamSubmissionsList.tsx`; remove the Phase-1 re-export.
Run the §8 checklist (submission modal section carefully — the OCR/auto-select behavior).

**Phase 5 — lazy loading, admin select, docs.**
Wire the `loaders` map + async `resolveTheme` path in `ThemeProvider`. Verify with a throwaway
`themes/_probe/index.ts` that overrides only `TileCell` (set a bingo's theme to `_probe`, confirm only the
cell changes and the rest of the page is default), **then delete it** — do not leave a second theme behind.
Admin `<select>`. Rewrite `docs/implementation-plan.md` §3's "Theme contract" paragraph to describe
slots/headless + the import rules, and add `docs/theming.md`: how to write a theme (folder, `ThemeDefinition`,
registering in `loaders` + `keys.ts`, the slot list, what a `BoardPage` override may and may not import).

## 8. Verification

- **Every phase**: `npm run build -w client` (tsc strict + vite) and `npm test` (server vitest — no server
  file changes, so it must stay green).
- **Optional**: add vitest to `client/` for the pure builders (`boardModel.ts`, `submissionFlowLogic.ts`) —
  a new devDependency; only if the reviewer wants it. The plan does not depend on it.
- **Manual checklist against a throwaway DB** (never `server/data/bingo.db`):
  ```
  DB_PATH=<scratch>/theme-refactor.db npm run db:migrate -w server
  DB_PATH=<scratch>/theme-refactor.db npm run db:seed:dev -w server
  DB_PATH=<scratch>/theme-refactor.db DEV_LOGIN_ENABLED=true npm run dev
  ```
  Then, as a member and as a mod (dev-login picker on the login page):
  1. Every stage branch: planning (copy + "Signups open …" when `signupOpensAt` set), signup (SignupForm), captains, draft ("Open Draft Room" navigates), reveal as non-mod (hidden copy), reveal as mod (board dimmed + "Bingo starts in" countdown — set `startsAt` in the future via Settings), live, complete.
  2. Header: back link, name, "remaining" countdown only when `endsAt && live`; Rules only with markdown; Stats only when revealed; Mod Panel with pending badge (create a pending submission); Submissions count badge; Submit only when `canSubmit`; avatar/name/Log out.
  3. Mod team selector: opens/closes, outside-click closes, selecting switches board + banner ("Viewing as moderator"), Submit hidden for another team, "you" marker on own team.
  4. Search: typing dims non-matching cells, dropdown caps at 8 with "N more" footer, arrow keys + Enter open the tile modal, Escape/blur close, ✕ clears and refocuses.
  5. Tile cell: image / fallback name, points badge, per-task dots (only for >1 tasks, hidden when not_started), green check overlay, ⏱ marker, frozen overlay with live H:MM:SS countdown (seed has a freeze tile; set `startsAt` = now − 1 min), ticking stops after unlock.
  6. Tile modal: header accent border, category pill, pts, freeze pill, Submit disabled when complete/frozen, task columns with gate lock tooltip, requirement tree dim/strike/progress, "Any one of:" heading + root-ALL heading suppression, "Pre-load allowed", notes, submissions section with task labels.
  7. Submission modal: drag over the window highlights the dropzone, file picker, preview, analysis states (analyzing / failed → "unavailable" copy / done with warnings + detected match), tile picker excludes complete + frozen tiles and groups by category, single available task auto-selects ("Submitting for …"), single open leaf auto-selects and the picker is read-only, SUM child shows the quantity field with max, stage / remove additional claims, manual-task copy, error surface, disabled states during analyze/submit, closes on success and board + drawer update via invalidation; in a second tab as mod, approve it and confirm the member tab updates without reload (WS).
  8. Submissions drawer: newest first, thumbnail link, tile name + task pills, summary, "by …", reviewer notes, status badge, Submit only when `canSubmit`.
  9. Rules modal open/close (backdrop + ✕).
  10. Mod page, stats page, draft page, bingo list render identically (they never see the provider/theme).
  11. Admin Settings: theme select shows `default`; saving keeps `bingo.theme`.
- **E2E** (deferred per repo policy — do not run or fix here): `e2e/full-flow.spec.ts` L367-439 and
  `e2e/special-tile-rules.spec.ts` L221-385 exercise these surfaces; the selectors in §0 must survive.
  (`special-tile-rules.spec.ts:312` references a wildcard checkbox that no longer exists — pre-existing
  drift, out of scope.)

## 9. Comic-theme readiness (what the follow-up will rely on)

- Imports available to a theme: the `headless` barrel (`useBingoPage`, `useBoardModel`, `useTileModel`,
  `usePageEvent`, `SubmissionFlowHost`, all model types), `themes/context` (`useSlot`, `useThemeTokens`),
  `themes/slots` types, `themes/registry` (`ThemeDefinition`), `core/ui/*`, `core/signup/SignupForm`,
  `core/ui/Markdown`, `core/submissions/SubmissionRow`.
- A whole-surface layout needs: navigation (`page.actions`), identity (`page.user`), stage branch + copy
  (`page.stageView`, `page.hiddenStage`), countdown targets (`page.bingo.startsAt/endsAt`, `board.preStart`),
  team switching (`page.teamSelector`), search (`page.search`), all modal open/close state,
  `board.grid`/`board.lines` (line overlays), per-tile everything (`TileModel`), the submission flow
  (`SubmissionFlowModel`) — all present. Nothing identified that would force it to touch `api/*` or `context/*`.
- Registering: one line in `registry.ts` `loaders`, one entry in `keys.ts`, `themes/comic/index.ts` exporting
  `{ key: "comic", tokens, slots }`. Heavy assets/fonts stay inside that lazy chunk.
- Watch item: team member avatars in a themed selector would need `teams[].members` (not in
  `BingoShellResponse` today) — a small server addition if wanted, not part of this plan.

## 10. Risks / things that bite

- `now` lives only in `BoardContext`; `finalizeTileModels` preserves object identity → only frozen cells
  re-render per tick (today every cell re-renders via the `now` prop).
- Keep the three OCR/auto-select effects and their dependency arrays byte-for-byte.
- `themes/context.ts` ↔ `default/index.ts` import cycle — `context.ts` imports only `slots.ts`/`tokens.ts` types.
- Shell loading/error renders default slots before the theme is known — one round-trip of default spinner on a themed bingo; acceptable.
- Moving `TileModal` from `BoardGrid` to `BoardPageLayout` changes DOM position; it's still a core `Modal`, so the `.bg-slate-800.rounded-xl` selector holds.
- `SubmissionModel.detail` is the one raw server shape a theme *could* touch — optional, documented.
- The default theme stays eager (it's the fallback); nothing is code-split until a second theme exists.
