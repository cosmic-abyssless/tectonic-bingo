# Writing a bingo theme

A theme is real React code, not a CSS skin. It can restyle the board, the
`/b/:slug` page chrome, and the submission modal — nothing else (mod, admin,
stats, draft room, bingo list, and login are never themed).

## How resolution works

- `bingos.theme` (a string column) is looked up in `themes/registry.ts`'s
  `loaders` map. `"default"` and any unrecognized key resolve to the
  `default` theme **synchronously** — a typo or a deleted theme never
  breaks the page.
- A recognized key is lazy-loaded (`import()`), cached per key, and merged
  over the `default` theme (`mergeTheme`): your `tokens` and `slots` are
  shallow-merged on top of the defaults, so you only write what you're
  changing. While the import is in flight, the page renders under the
  `default` theme (its `PageLoading` slot is what a cold load shows).
- If your theme's module throws on import, it's caught, logged with
  `console.warn`, and the page falls back to `default` — never a blank
  page.

## Folder shape

```
client/src/themes/<key>/
  index.ts     exports a ThemeDefinition: { key, tokens?, slots? }
  page/...     PageHeader, TeamSelector, StageRow, TileSearch, ... (optional)
  board/...    BoardGrid, TileCell, TileModal, TaskPanel, ... (optional)
  submission/... SubmissionModal, TilePicker, TaskPicker, ... (optional)
```

Register it in two places:

```ts
// themes/registry.ts
const loaders: Record<string, () => Promise<{ default: ThemeDefinition }>> = {
  comic: () => import("./comic"),
};
```

```ts
// themes/keys.ts — import-free, used by the admin theme <Select>
export const THEME_KEYS = ["default", "comic"] as const;
```

## What a slot may import

Everything a slot needs comes from the **headless barrel**
(`client/src/headless/index.ts`) and `themes/context`:

- `useBingoPage()`, `useBoardModel()`, `useTileModel(id)`, `usePageEvent` —
  the whole-surface `BoardPage` slot is the only place that normally calls
  these directly; leaf slots just receive props.
- `useSlot("SlotName")` (from `themes/context`) to render a nested slot —
  **always** go through `useSlot`, never a direct import of another
  component, or a partial override that doesn't touch that nested slot
  will silently not apply.
- `useThemeTokens()` if you need a raw token value in JS (rare — prefer the
  CSS variables).
- View-model types from `headless/types.ts` (`TileModel`, `BoardModel`,
  `BingoPageModel`, `SubmissionFlowModel`, `RequirementNodeModel`, …) — a
  slot never sees a raw `Tile`, `TeamNodeState[]`, or `SubmissionDetails[]`.
  The one deliberate exception is `SubmissionModel.detail`, a raw
  `SubmissionDetails` kept only so `core/submissions/SubmissionRow` can
  still render it.
- `core/ui/*` (Button, Dialog, Menu, Card, Field, AppHeader, StageStepper,
  icons, …) and `react-aria-components` directly — these are the expected
  building blocks and bring accessibility (focus management, keyboard
  nav) for free.
- `core/submissions/{SubmissionRow, ScreenshotThumb}`, `core/signup/SignupForm`,
  `core/draft/TeamRoster` — shared, non-themed pieces a theme may reuse.
- `@bingo/shared` types and the `STAGE_LABEL`/`STAGE_ORDER`/`nextMilestone`
  constants/helpers.

A theme **never** imports `api/*` or `context/*` — that's the boundary that
keeps a slot from needing to know how data is fetched, cached, or
invalidated. (Review guard: `grep -rn "from \"../../api\|from \"../../context" client/src/themes` should be empty.)

## The always-mounted-dialog rule

`core/ui/Dialog.tsx` is controlled by `isOpen`, not by conditional
rendering — that's what lets it animate out. Every overlay slot
(`TileModal`, `RulesDialog`, `SubmissionsDrawer`) follows the same
contract: it's always rendered by its parent, and takes `isOpen` as a prop.
**Never** wrap one of these slots in `{condition && <Slot .../>}` — you'll
lose the close animation and RAC's focus restore.

The one deliberate exception is the submission flow: `SubmissionFlowHost`
(and the `SubmissionModal` slot it wraps) is mounted only while
`page.submit.open` is true, because **unmounting is what resets its
state** — closing the dialog and reopening it should start from a clean
form, not remember the last screenshot.

## The slot list

See `themes/slots.ts` for the authoritative, typed list — it's the source
of truth and will drift less than a doc copy. Broadly:

- **Whole-surface**: `BoardPage` (may call headless hooks directly; every
  other slot is props-only).
- **Page chrome**: `PageLoading`, `PageError`, `PageHeader`, `TeamSelector`,
  `TeamBadge`, `StageRow`, `TileSearch`, `TeamBanner`, `PlanningStage`,
  `SignupStage`, `DraftStage`, `NoTeamStage`, `RulesDialog`,
  `SubmissionsDrawer`.
- **Board**: `BoardGrid`, `RowLabel`, `EmptyCell`, `TileCell`,
  `PreStartBanner`, `TileModal`, `TaskPanel`, `RequirementTree`,
  `TileSubmissions`.
- **Submission flow**: `SubmissionModal`, `ScreenshotDropzone`,
  `AnalysisPanel`, `TilePicker`, `TaskPicker`, `RequirementPicker`,
  `StagedClaimsList`.

You only need to provide the slots you're actually changing — everything
else falls back to the `default` theme's implementation via `mergeTheme`.

## Tokens

Two layers, and a theme only ever touches the second:

- The app-wide design system (`index.css`'s `@theme` block) is build-time
  and not themeable.
- `themes/tokens.ts`'s `ThemeTokens` — `tile: { bg, border, empty, accent,
  complete, frozen }` (the six board colors) and an optional `chrome:
  Partial<{ bg, surface, surfaceRaised, surfaceHover, line, lineStrong, fg,
  fgMuted, fgSubtle, accent, accentFg }>`. `ThemeProvider` applies these as
  inline CSS variables (`--tile-*`, `--color-*`) on the page root. Because
  Tailwind v4 compiles utilities like `bg-bg`/`text-fg` to
  `var(--color-bg)`/`var(--color-fg)`, setting `chrome.bg` re-skins every
  one of those utilities under the provider for free — no component needs
  to know it's themed.

## Reusing default's building blocks

A theme that wants to change one slot without rewriting the rest can import
`themes/default/**` components directly and wrap or extend them — they're
just React components. There's nothing special about `default` except that
it's the eager fallback and the merge base.
