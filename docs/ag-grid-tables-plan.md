# AG Grid for the signup roster

Status: decided 2026-09-22, ready to implement. Branch off `signup-draft-ux` (which holds six independent
table fixes that stay). The implementer is expected to be a cheaper model: every API named below was checked
against the AG Grid v36 docs on 2026-09-22 and the source is cited; the few things that could not be confirmed
from the docs are in "Verify on first use" with a fallback, so nothing has to be guessed.

## Why

The mod panel's signup roster (`client/src/core/mod/SignupRoster.tsx`) is slow to mount and slow to un-filter,
and it is the table every #112 request landed on (search, column reorder, visibility, sticky header, truncation).
Profiled with React's `Profiler` on the 63-row test bingo, dev build (numbers are React render time for one commit):

| what | ms |
|---|---|
| mount, all columns | 327 |
| mount with Partner column hidden | 184 → Partner alone ≈ 143 |
| mount with Status + Buy-in + Collected-by hidden | 185 → those three ≈ 142 |
| mount with all four hidden | 146 |
| … and the 6 question columns hidden | 117 |
| only `#` and RSN | 59 |
| clearing the search box (13 → 63 rows) | 278 |

The cost is not the table mechanics; it is what every row mounts eagerly: five or six `useMutation` hooks, two or
three react-aria buttons, and (for each unpaired player) a `<Select>` with ~30 options — times 63. The tooltip
stack, the search plumbing and the height hook were each ruled out by measurement.

AG Grid fixes this structurally, not by being faster at the same work: rows outside the viewport are not rendered
at all, and its editing model renders a cell as text until the mod interacts with it, so the select/checkbox
controls only exist while being used. It also replaces most of what was hand-built for #112.

## Decisions

1. **AG Grid Community, MIT.** Packages `ag-grid-community` and `ag-grid-react`, **pin 36.2.0** (current on
   2026-09-22; React 19 is a supported peer). Nothing Enterprise: no row grouping, no set filter, no rich select,
   no side bar, no column chooser menu. If a need for one appears, that is a decision for a person, not a fallback.
2. **Signup roster only.** The draft pool table (`DraftRoom.tsx`) stays hand-rolled: its duo units (one `<tbody>`
   per pair, `rowSpan` for the rating and the Draft button) do not map onto AG's row model, and it already works.
3. **Adopt AG's patterns; do not port our components into cells.** Concretely:
   - A cell is text (`field` + `valueFormatter`) unless it must be interactive. Interactive cells use AG's
     provided editors (checkbox, select) or a small custom renderer with a *native* `<button>`. No react-aria
     `Button`/`IconButton`/`Select`, no `Truncate`/`Tooltip`/`Highlight` from `core/ui` inside the grid.
   - Edits never write into grid data. `readOnlyEdit: true`; the grid raises `cellEditRequest`, one handler maps
     it to the React Query mutation, and the refetched query data flows back in as `rowData`. The grid is a view of
     the query, exactly like the current table.
   - Hidden columns and column order are grid state, persisted via AG's own state API, not `useHiddenColumns`.
4. **Look:** AG's Quartz theme parameterised with the app's existing CSS variables (design tokens only — no
   hard-coded colours, per the UI rule). It will read as a grid inside the app; that is accepted.
5. **Modules registered individually**, not `AllCommunityModule`, to keep the bundle down (the client chunk is
   already 1.2 MB). Dev-only validation is switched on so a missing module fails loudly in dev.

## Verified facts (v36 docs, 2026-09-22)

Each line names the doc page it came from. Anything not on this list is in "Verify on first use".

- **Modules** (`react-data-grid/modules`): register with `ModuleRegistry.registerModules([...])` (global) or
  `<AgGridProvider modules={[...]}>`; both exist. Community modules for what we use: `ClientSideRowModelModule`,
  `TextEditorModule`, `SelectEditorModule`, `CheckboxEditorModule`, `TooltipModule`, `QuickFilterModule`,
  `ExternalFilterModule`, `RowStyleModule`, `CellStyleModule`, `ColumnApiModule` (also covers column
  moving/resizing/pinning), `EventApiModule`, `RenderApiModule`, `RowApiModule`. Sorting needs no module.
  `enableDevValidations()` (call once, non-production only) is the dev-time validation.
- **Theming** (`theming-parameters`, `theming-colors`): `import { themeQuartz } from "ag-grid-community"`;
  `themeQuartz.withParams({...})`; pass as the `theme` grid option. Colour params (`backgroundColor`,
  `foregroundColor`, `accentColor`, `borderColor`, `headerBackgroundColor`, `headerTextColor`,
  `oddRowBackgroundColor`, `rowHoverColor`, …) accept any CSS colour **including `var(--x)`**; length params
  (`spacing`, `rowHeight`, `headerHeight`, `borderRadius`, …) accept any CSS length or a bare number (px).
  `fontFamily`, `fontSize`, `headerFontSize` exist. No CSS import is needed with the theming API.
- **Editing** (`cell-editing`, `cell-editing-start-stop`, `value-setters`): `editable` (bool or callback);
  `singleClickEdit` (grid or per column); `suppressClickEdit`; `stopEditingWhenCellsLoseFocus`;
  `readOnlyEdit: true` makes editors not touch the data and fires `cellEditRequest` with
  `{ data, node, colDef, column, newValue, oldValue, rowIndex, source }`. Editing starts on double-click / Enter /
  F2 / typing; Escape cancels; Tab commits and moves.
- **Provided editors** (`provided-cell-editors*`): `agSelectCellEditor` with `cellEditorParams: { values,
  valueListGap, valueListMaxHeight, valueListMaxWidth }`; `agCheckboxCellEditor`; `agTextCellEditor`.
  `agRichSelectCellEditor` is **Enterprise** — do not use. `cellEditorParams` may be a function of params, so the
  option list can differ per row (`cell-editors`). `refData` maps stored keys to labels for both display and the
  select's options (`reference-data`).
- **Boolean cells** (`cell-data-types`): `cellDataType: 'boolean'` renders `agCheckboxCellRenderer` and edits with
  `agCheckboxCellEditor`; `cellRendererParams: { disabled: true }` for read-only; Space toggles from the keyboard.
- **Cell renderers** (`component-cell-renderer`, and `packages/ag-grid-react/src/reactUi/cells/cellComp.tsx`):
  `cellRenderer: MyComponent`; props include `value`, `data`, `node`, `colDef`, `api`, `context`, `refreshCell`;
  `cellRendererParams` merge in. The React UI renders a user component **as JSX inside the grid's own React
  tree** (`<CellRendererClass {...params} />`, no portal), so React context from providers above `<AgGridReact>`
  (`PlayerProfileProvider`, `WebSocketProvider`, `AuthProvider`) is available inside renderers and hooks work.
  Wrap renderers in `memo`. Keep `columnDefs`, `defaultColDef`, `context` referentially stable (`useMemo`).
- **Refresh** (`view-refresh`): cells refresh automatically when their value changes; renderers that depend on
  something other than the cell value need `api.refreshCells({ force: true, columns: [...] })`.
- **Row identity / updates** (`row-ids`, `data-update-row-data`): `getRowId` must return a stable unique
  string; with it, replacing `rowData` is a delta update (add/remove/update by id, order follows the new list,
  row state kept); a row with the same id and the **same object reference is skipped**, a different reference is
  updated. React Query's structural sharing gives exactly that.
- **Quick filter** (`filter-quick`): `quickFilterText` grid option; `includeHiddenColumnsInQuickFilter`;
  per-column `getQuickFilterText`; matches on column values (formatted), default parser splits on spaces.
- **External filter** (`ExternalFilterModule`; grid options `isExternalFilterPresent` /
  `doesExternalFilterPass(node)`, re-run with `api.onFilterChanged()`): the buy-in and pairing chips.
- **Tooltips** (`tooltips`): column `tooltip: true | string | (params) => string` (replaces the old
  `tooltipField`/`tooltipValueGetter`), `headerTooltip: true` shows the header name; grid options
  `tooltipShowDelay` (default 2000 — set it low), `tooltipHideDelay` (default 10000), `tooltipInteraction`,
  `tooltipTrigger: 'hover' | 'focus'`, and **`tooltipShowMode: 'whenTruncated'`** shows a tooltip only when the
  cell text overflows. Custom `tooltipComponent` receives `value`, `data`, `colDef`, `context`, ….
- **Column state** (`column-state`, `grid-state`): `api.getColumnState()` / `api.applyColumnState({ state,
  applyOrder, defaultState })`; `api.setColumnsVisible(keys, visible)`; `api.moveColumns(keys, toIndex)`;
  column `suppressMovable` / `lockPosition`. Whole-grid state: `initialState` (read once at creation; fields
  `columnOrder`, `columnVisibility: { hiddenColIds }`, `columnSizing`, …), `stateUpdated` event with the latest
  state, `api.getState()`, `api.setState()`.
- **Column menu / chooser** (`column-menu`): Community has no header menu and no "choose columns" — visibility
  is via API only. So the existing `ColumnPicker` UI stays and drives `api.setColumnsVisible`.
- **Sorting** (`row-sorting`): `comparator(valueA, valueB, nodeA, nodeB, isDescending)`; `sortingOrder` per
  column or in `defaultColDef`; Shift-click multi-sort by default (`suppressMultiSort` to turn off);
  programmatic sort via `applyColumnState`.
- **Layout** (`grid-size`): `domLayout: 'normal'` (default) needs a container with a height and scrolls inside
  it; `autoHeight` grows with rows and must not be given a height.
- **Rows** (`row-styles`): `rowClassRules` (class → boolean/function; re-evaluated on refresh), `getRowClass`;
  striping is simplest as the `oddRowBackgroundColor` theme param.
- **Keyboard** (`keyboard-navigation`): focusing a cell with a custom renderer focuses the cell, not its
  buttons; `suppressKeyboardEvent` on the column lets Tab move between focusable children;
  `suppressCellFocus: true` disables cell focus entirely.
- **Virtualisation** (`dom-virtualisation`, community list): row and column virtualisation are Community and on
  by default; `rowBuffer` controls the overscan.

## Design

### Files

- `client/src/core/ui/agGrid.ts` — one-time setup: module registration, `enableDevValidations()` under
  `import.meta.env.DEV`, and the shared theme. Imported once (from `main.tsx`), never per table.
- `client/src/core/mod/SignupRosterGrid.tsx` — the grid: column defs, renderers, edit handler, state persistence.
- `client/src/core/mod/SignupRoster.tsx` — keeps everything around the table (dev seed panel, leftover notice,
  counts, search box, filter chips, ColumnPicker, CSV export, the mutations) and renders `SignupRosterGrid`.
  `buildPartnerRsnMap`, `rosterSearchValues`-style logic and `buildCsv` stay here.

### Setup (`agGrid.ts`)

```ts
import { ModuleRegistry, themeQuartz, ClientSideRowModelModule, TextEditorModule, SelectEditorModule,
  CheckboxEditorModule, TooltipModule, QuickFilterModule, ExternalFilterModule, RowStyleModule, CellStyleModule,
  ColumnApiModule, EventApiModule, RenderApiModule, RowApiModule } from "ag-grid-community";

ModuleRegistry.registerModules([ClientSideRowModelModule, TextEditorModule, SelectEditorModule,
  CheckboxEditorModule, TooltipModule, QuickFilterModule, ExternalFilterModule, RowStyleModule, CellStyleModule,
  ColumnApiModule, EventApiModule, RenderApiModule, RowApiModule]);

if (import.meta.env.DEV) {
  const { enableDevValidations } = await import("ag-grid-community"); // exact export name: see Verify on first use
  enableDevValidations();
}

// Every value is one of the app's tokens (see client/src/index.css) — never a literal colour.
export const gridTheme = themeQuartz.withParams({
  backgroundColor: "var(--color-surface)",
  foregroundColor: "var(--color-on-surface)",
  headerBackgroundColor: "var(--color-surface)",
  headerTextColor: "var(--color-on-surface-subtle)",
  borderColor: "var(--color-outline)",
  accentColor: "var(--color-accent)",
  oddRowBackgroundColor: "color-mix(in srgb, var(--color-surface-muted) 40%, transparent)",
  rowHoverColor: "var(--color-surface-hover)",
  fontFamily: "inherit",
  fontSize: "0.875rem",
  headerFontSize: "0.75rem",
  spacing: 6,
  rowHeight: 44,
  headerHeight: 40,
  borderRadius: 6,
  wrapperBorder: false,
});
```

If a token named above does not exist, use the nearest one that does (`grep -- "--color-" client/src/index.css`);
add a token rather than a literal. The tokens flip with the colour scheme already, so no AG colour-scheme part
is needed.

### Grid options (in `SignupRosterGrid`)

```tsx
<AgGridReact<RosterRow>
  theme={gridTheme}
  rowData={rows}                          // from React Query; no copying, no mapping per render
  getRowId={(p) => p.data.signup.id}
  columnDefs={columnDefs}                 // useMemo
  defaultColDef={defaultColDef}           // useMemo: { sortable: true, resizable: true, minWidth: 80,
                                          //   headerTooltip: true, tooltip: true, suppressKeyboardEvent: tabWithinCell }
  context={gridContext}                   // useMemo: { slug, search, partnerRsnMap, unpairedActive, canWithdraw, ... }
  readOnlyEdit
  singleClickEdit
  stopEditingWhenCellsLoseFocus
  onCellEditRequest={onCellEditRequest}
  quickFilterText={search}
  includeHiddenColumnsInQuickFilter
  isExternalFilterPresent={() => buyinFilter !== "all" || pairFilter !== "all"}
  doesExternalFilterPass={(node) => matchesBuyin(node.data, buyinFilter) && matchesPair(node.data, pairFilter)}
  tooltipShowDelay={200}
  tooltipHideDelay={4000}
  tooltipShowMode="whenTruncated"
  initialState={initialState}             // read once from localStorage
  onStateUpdated={persistState}           // columnOrder + columnVisibility + columnSizing → localStorage
  animateRows={false}
  enableCellTextSelection
/>
```

Container: keep the current sizing — the wrapper div with `useDocumentTop` for `maxHeight` and the 30rem
`minHeight` — since `domLayout: 'normal'` wants a height and the "one scrollbar, fits the page" behaviour is
already right. Give the wrapper `height` (not just max) so the grid has a definite box.

When a filter chip changes, call `api.onFilterChanged()` (keep the api from `onGridReady`).

### Columns

`colId` values keep today's ids (`order`, `rsn`, `discord`, `tier`, `signedUp`, `status`, `caCurrent`,
`caPeak`, `ehb`, `ehp`, `buyin`, `collectedBy`, `partner`, and each question's id) so the ColumnPicker and CSV
export keep working unchanged.

| colId | kind | notes |
|---|---|---|
| `order` | text | `valueGetter: node.rowIndex + 1` is wrong under sort; keep the 1-based signup position on the row (`rows = signups.map((entry, i) => ({ ...entry, order: i + 1 }))`, memoised on the query data). `lockPosition: 'left'`, `suppressMovable`. |
| `rsn` | renderer `RsnCell` | `PlayerName` (already a native button when the profile provider is present) + verified check icon + refresh `<button>`. Highlight the search match (see Search). `lockPosition: 'left'`. |
| `discord` | text | `valueGetter: discordName(data.user)`; `tooltip: true`. |
| `tier` | renderer | `TierBadge` is presentational; fine to reuse. Hidden unless any row has a profile (as today). |
| `signedUp` | text | `valueGetter: createdAt` (ISO) with `valueFormatter: timeAgo`, `comparator` on the ISO string, `tooltip: toLocaleString`. |
| `status` | renderer `StatusCell` | badge + `at risk` badge + native withdraw button with the two-step confirm kept in renderer state. |
| `caCurrent`, `caPeak` | text | `valueGetter: points ?? -1` for sorting, `valueFormatter: formatCaTier(...)`, `tooltip: caTitle`. Spinner while `statsRefreshing` has the id → renderer only if the spinner is required; otherwise formatted text is enough. |
| `ehb`, `ehp` | text | `valueGetter: womStats?.ehb ?? -1`, `valueFormatter: formatWomStat`, `cellClass: "num"`. |
| `buyin` | editable boolean | `cellDataType: 'boolean'`, `editable: true`, `valueGetter: !!buyinReceivedAt`. Edit request → `markBuyin({ signupId, received: newValue })`. |
| `collectedBy` | editable select | `valueGetter: collectedByUser?.id ?? ""`, `editable: (p) => !!p.data.signup.buyinReceivedAt`, `cellEditor: 'agSelectCellEditor'`, `cellEditorParams: { values: ["", ...modIds] }`, `refData` built from mods + viewer + current collector (`"" → "Nobody yet"`). Edit request → `markBuyin({ signupId, received: true, collectedByUserId: newValue || null })`. |
| `partner` | paired: renderer; unpaired: editable select | Duo only. `valueGetter: partnerRsnMap.get(signup.id) ?? ""`. Paired rows: renderer shows the name (highlighted) + native unpair button; `editable: (p) => !p.data.pairing && p.data.signup.status === "active"`. Unpaired active rows: `agSelectCellEditor` whose `cellEditorParams` is a **function** returning `{ values: ["", ...unpairedActive.filter(not self).map(userId)] }` with `refData` userId → RSN. Choosing a value fires the edit request → `modPair({ userIdA: data.user.id, userIdB: newValue })`. No "Pair" button. |
| question columns | text | `valueGetter: formatSignupAnswer(type, answer)`, `maxWidth: 192` (12rem), `headerTooltip: true`, `tooltip: true`; highlight via renderer only if search highlighting is wanted here (it is today) — a tiny `HighlightCell` renderer that reads `context.search`. |

`rsn` and `partner` renderers read `context.search`, `context.partnerRsnMap` etc.; when `search` changes,
call `api.refreshCells({ force: true, columns: ["rsn", "discord", "partner", ...questionIds] })` in an effect,
since the cell *value* did not change. Renderers are `memo`'d and read `PlayerProfileProvider` /
`useStatsRefreshingSignupIds()` from React context directly (verified: same React tree).

### Edits → mutations (one handler)

```ts
const onCellEditRequest = useCallback((e: CellEditRequestEvent<RosterRow>) => {
  const { colDef, data, newValue } = e;
  switch (colDef.colId) {
    case "buyin":       markBuyin.mutate({ signupId: data.signup.id, received: !!newValue }); break;
    case "collectedBy": markBuyin.mutate({ signupId: data.signup.id, received: true, collectedByUserId: newValue || null }); break;
    case "partner":     if (newValue) modPair.mutate({ userIdA: data.user.id, userIdB: newValue }); break;
  }
}, [markBuyin, modPair]);
```

The mutations (`useMarkBuyin`, `useModPair`, `useModUnpair`, `useModWithdrawSignup`, `useRefreshSignupStats`)
are called **once**, in `SignupRoster`, and reach renderers through `context` — that alone removes ~380 hook
instances. Per-row pending state, where a cell shows it, is `mutation.isPending && mutation.variables?.signupId ===
data.signup.id`. The query invalidation the mutations already do is what updates the grid (new `rowData`).

### Search

`quickFilterText` does the filtering across all columns including hidden ones. Provide `getQuickFilterText`
only where the displayed value is not the searchable text (`rsn`, `partner` renderers → return the plain string).
Match highlighting is not built in: the `rsn`, `discord`, `partner` and question cells use a renderer that reuses
the existing `Highlight` component's *logic* (regex split → `<mark>`), reading the query from `context.search`.
The "N of total" count next to the search box comes from `api.getDisplayedRowCount()` after `onModelUpdated`.

### Column visibility and order

Replace the roster's `useHiddenColumns("signupRoster")` with grid state: `initialState` from
`localStorage["pref:gridState:signupRoster"]` (parse defensively; ignore on error), `onStateUpdated` writes
`{ columnOrder, columnVisibility, columnSizing }` back. `ColumnPicker` stays as the UI (Community has no column
chooser): its `hidden` set is derived from `api.getColumnState()`, and `onHiddenChange` calls
`api.setColumnsVisible(ids, visible)`. Column reorder is AG's drag on the header — that closes the last #112 item.
Question columns that no longer exist are simply absent from `columnDefs`; stale ids in saved state are ignored
by the grid.

### What goes away from the roster

`SortHeader`, `useTableSort`, `rosterSortValue`, `rosterSearchValues`, `matchesSearch`, `TableSearchInput`'s
count plumbing (the input stays), `Truncate`/`Tooltip` usage, `STICKY_TOP`/`STRIPE_ODD`, the per-row memo'd cell
components with their own hooks. `tableSort.tsx`, `tableSearch.tsx`, `tableChrome.tsx` and `Tooltip.tsx` remain
for the draft pool table and other consumers — do not delete them.

## Phases

Each phase is one commit on a new branch off `signup-draft-ux`; run `npm run build` and `npm test --workspace=client`
before each commit. Do not touch `DraftRoom.tsx`, `ReviewQueue.tsx` or the shared `core/ui` table files.

1. **Install and set up.** Add the two packages at 36.2.0, `agGrid.ts` with modules + dev validations + theme,
   import it from `main.tsx`. Render an `AgGridReact` with `rowData={rows}`, `getRowId`, and text-only columns for
   `order`, `rsn` (plain text for now), `discord`, `signedUp`, `ehb`, `ehp`, `caCurrent`, `caPeak` in place of the
   `<table>`. Sorting, sticky header, virtualisation and striping come for free; check them in the browser.
   Accept: the roster renders, sorts by clicking headers, the header stays put while scrolling, rows alternate.
2. **Search, chips, tooltips.** Wire `quickFilterText`, external filter for the two chip groups (+
   `api.onFilterChanged()`), `tooltipShowMode="whenTruncated"` with the short delay, `headerTooltip`/`tooltip`
   on the wide columns, question columns with `maxWidth`. Accept: typing filters across hidden columns too;
   hovering a clipped header or answer shows the full text quickly; chips filter and their counts are right.
3. **Interactive cells, AG style.** `buyin` (boolean), `collectedBy` (select + refData), `partner` (renderer for
   paired, select for unpaired), `status` and `rsn` renderers with native buttons, `readOnlyEdit` +
   `onCellEditRequest`, mutations hoisted into `SignupRoster` and passed via `context`, `refreshCells` on search
   change for highlighting. Accept: every action a mod can do today works (toggle buy-in, set collector, pair,
   unpair, withdraw with confirm, refresh stats, open a profile), and the network tab shows the same requests as
   before.
4. **State persistence + ColumnPicker.** `initialState`/`onStateUpdated`, ColumnPicker backed by
   `setColumnsVisible`, drag-reorder. Accept: hide a column, reorder two, reload — both survive. Old
   `pref:hiddenColumns:signupRoster` entries can be ignored (not migrated).
5. **Measure and clean up.** Re-run the profiling from "Why" (wrap the grid in `<Profiler>` temporarily): mount
   and clear-search commits on the 63-row test bingo. Target: both under 60 ms in dev. Remove dead roster code.
   Update `docs/`/comments that mention the old table (`CONTEXT.md` glossary is unaffected).

## Verify on first use

Facts the docs did not state outright. Each has a fallback so implementation never blocks.

- **`enableDevValidations` export**: docs name the function; confirm the import (`ag-grid-community`) from the
  installed types. Fallback: register `ValidationModule` (from `ag-grid-community`) in dev instead.
- **Checkbox toggle without edit mode**: with `cellDataType: 'boolean'` + `editable`, confirm a single click on the
  rendered checkbox raises `cellEditRequest` directly. If it requires entering edit mode first, set
  `singleClickEdit` on that column (already on grid-wide) or replace it with a two-line custom renderer whose
  native `<input type="checkbox">` calls the mutation itself.
- **`api.setColumnsVisible(keys, visible)`** exists in the API list; confirm the signature from the installed
  types (`(keys: (string | Column)[], visible: boolean)` expected).
- **`ColumnMovedEvent.finished`** — not needed if persistence uses `stateUpdated`, which is documented; use that.
- **Bundle size**: not measured. After phase 1, compare `vite build` output size before/after and note it in
  the PR. If the grid chunk is > ~400 kB min, that is expected for AG; individual modules are already the
  mitigation.

## Non-goals

Draft pool table migration; Enterprise features; migrating old hidden-column preferences; virtualising or
changing any other table; component tests for the grid (the repo has none for these tables; keep
`SignupRoster.test.ts` for the pure helpers).
