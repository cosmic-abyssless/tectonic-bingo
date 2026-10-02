# Writing a bingo theme

A theme is real React code, not a CSS skin. It can restyle the board, the
`/b/:slug` page chrome, the submission modal, and the draft room and stats
pages — nothing else (mod, admin, bingo list, and login are never themed).

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

And end `index.ts` with this snippet — every theme needs it, verbatim:

```ts
if (import.meta.hot) {
  import.meta.hot.accept((mod) => {
    if (mod) pushThemeHmrUpdate(mod.default as ThemeDefinition);
  });
}
```

Without it, editing tokens/slots still works, but only shows up after a
full page reload instead of live. The reason it's needed (and can't be
handled centrally in `registry.ts` instead) is a genuine Vite HMR quirk:
a plain re-`import()` of a lazily-loaded module is cached by the browser's
native ESM registry forever, regardless of server-side content changes —
only the module's *own* `import.meta.hot.accept` callback is guaranteed to
hand back the freshly re-evaluated exports. `pushThemeHmrUpdate` (from
`themes/registry.ts`) takes that fresh `ThemeDefinition` directly and
writes it into the shared theme cache, no re-import involved. This is
dev-only — tree-shaken out of the production bundle entirely, since
`import.meta.hot` is statically `undefined` in a production build.

## What a slot may import

Everything a slot needs comes from the **headless barrel**
(`client/src/headless/index.ts`) and `themes/context`:

- `useBingoPage()`, `useBoardModel()`, `useTileModel(id)`, `usePageEvent` —
  the whole-surface `BoardPage` slot is the only place that normally calls
  these directly; leaf slots just receive props.
- `useSignupForm(slug)`, `usePartnerPanel(slug)` — the signup form and a duo
  bingo's partner step as view models, for a `SignupStage` slot that draws its
  own form instead of wrapping `core/signup/SignupForm` (the comic theme's does).
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
  `core/draft/{TeamRoster, DraftRoom}`, `core/stats/StatsView` — shared,
  non-themed pieces a theme may reuse (the latter two are what the default
  `DraftPage`/`StatsPage` slots wrap wholesale).
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
- **Bingo pages (non-board)**: `DraftPage`, `StatsPage` — whole-page layout
  (header + `core/draft`/`core/stats` content), but unlike `BoardPage`
  still props-only — they don't have a headless model of their own.
- **Draft reveal**: `DraftPickBurst` — the shape that pops up for everyone
  watching when a player is drafted. The theme draws only the shape (a
  fixed-size card or burst with the player names and team); `core/draft`
  does the pop, the hold and the flight to the team's roster.
- **Page chrome**: `PageLoading`, `PageError`, `PageHeader`, `TeamSelector`,
  `TeamBadge`, `StageRow`, `TileSearch`, `TeamBanner`, `PlanningStage`,
  `SignupStage`, `DraftStage`, `NoTeamStage`, `RulesDialog`,
  `SubmissionsDrawer`.
- **Board**: `BoardGrid`, `RowLabel`, `EmptyCell`, `TileCell`,
  `PreStartBanner`, `TileModal`, `TaskPanel`, `RequirementTree`,
  `TileSubmissions`.
- **Rewind** (`/b/:slug/rewind`, Finished Bingos only): `RewindPage` (whole-surface
  like `BoardPage`: calls `useRewindModel()` and `useBoardModel()`, which is the
  viewed Team's Board at the moment being viewed, and draws it with `BoardGrid`),
  and the props-only `RewindTimeline`, `RewindControls`, `RewindScoreboard` and
  `RewindPopup`. `RewindPopup` draws only the card; the page places it and plays
  it in and out. While playing, the popup's `holdMs` says how long it stays, for
  a countdown (null when paused or stepping). `BoardGrid`'s `highlightedTileId` marks the Tile the current
  Submission landed on. The Team selector (`teamSelector.allTeams`) adds an **All Teams** view (`?team=all`):
  `useBoardModel()` is then the shared layout with no one's progress, `rewind.tileTeams` holds every Team's
  progress per Tile, and the page draws it through `BoardGrid`'s `tileOverlay` prop (which every `BoardGrid`
  must render over the cell) with the props-only `RewindTileMarkers` (the marks for the Teams that completed a
  Tile) and `RewindTileTeams` (the dialog a Tile opens, every Team's progress on it). Ticks carry `teamColor`
  in that view.
- **Wrapped** (`/b/:slug/wrapped`, a Finished Bingo's story, once published or as a
  Moderator's preview): the `Wrapped*` slots are one group. `WrappedPage` is whole-surface
  (calls `useWrappedModel()`): the frame, the scroll progress indicator, and each section in
  order through its props-only slot: `WrappedIntro`, `WrappedYou`, `WrappedDuo`,
  `WrappedCaptain`, `WrappedModerator`, `WrappedTeam`, `WrappedBingo`, `WrappedOutro`. The
  model leaves out a section (or a part of one) that has nothing to say for this viewer, so a
  slot only draws what it's given. Build sections from `core/wrapped`'s `WrappedScene` (one
  screen) and `Reveal` (a line that fades up with the scroll, and just fades in under reduced
  motion); `WrappedParts` and `PointsChart` are there to reuse. `WrappedBanner` is the Board's
  way in: every `BoardPage` must draw it when `page.wrapped.canOpen`.
- **A guided Wrapped page** (the comic theme's, #419): a `WrappedPage` that doesn't scroll holds a
  `createWrappedProgressStore()`, wraps the sections in `WrappedProgressProvider` and, from its
  camera, tells each Scene `store.setSceneState(id, { reached, current })`. A Scene is one page and
  a `Reveal` step one panel on it; a step the section has no `Reveal` at is skipped. The provider's
  `reveal` prop gives the page's own component to draw each `Reveal` (the comic's inked panel,
  empty until the camera arrives, then painted in by a brush stroke), and a `Reveal` that brings its
  own frame says `bare`. Scenes and Reveals carry `data-wrapped-scene` and `data-wrapped-step` for
  the page to find them. The comic page lays every page out at a fixed 420px width (`wrapped/camera`'s
  `WRAPPED_PAGE_WIDTH`, at least 2:3 tall, taller to fit its content) and frames it with a camera,
  so a comic section is written for that one page width, with no viewport breakpoints. It paints the
  default sections' `sm:` sizes back to their phone sizes meanwhile. The book adds its own contents
  page, and the Outro's first Scene is the back cover (its other Scenes, the share cards, are pages
  like any other: `WrappedShareCardItem` draws one with its buttons). The comic Team and Bingo
  sections (#421, `themes/comic/wrapped/sections/`) show how a section is laid out for it: a grid or
  flex column of `Reveal`s inside each Scene (Reveals at one step are framed as one stop), a long
  section dealt over several Scenes so no page grows taller than a wide screen frames well (about
  800px), and a panel that has to fill its page's height grow with `flex-1`. A panel that is empty
  until its step hides its content with `visibility`, which `StickerArt` honours.
- **Wrapped share cards** (#232, #314): `WrappedOutro` shows the viewer's cards (`section.cards`:
  a Player's Player and Team cards, none for anyone else) before its way out,
  drawn with `core/wrapped`'s `WrappedShareCards`, which previews each one scaled to fit and
  adds Copy image, Download and Share, and the "Preview" watermark in a Moderator's preview.
  Each card is drawn by the `WrappedShareCard` slot at exactly 540×675 CSS px and turned into
  a 1080×1350 PNG in the viewer's browser (never on the server) by redrawing that DOM, so the
  slot must stand on its own: its own background, the Bingo's name in its header, no
  animation, system fonts only (web fonts aren't carried into the image), and every image
  through `core/wrapped`'s `CardImage` (loaded with CORS and copied into a data URL, so
  drawing the card fetches nothing; a missing item icon falls back cleanly), the Coins icon
  (`card.coinsIconUrl`) beside every GP figure included. Text is never shrunk to fit: a full
  Player card leaves out its driest streak, then EHB, then Achievements. `WrappedPage`
  calls `actions.outroReached()` once the viewer gets to the Outro and, when
  `outroReachedBefore` and the Outro has cards, offers a jump to them (`WRAPPED_CARDS_ID`).
  Only the default theme draws cards; others fall back to it.
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
