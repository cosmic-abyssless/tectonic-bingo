# Board preview: implementation plan

Status: **approved plan, ready to implement.** Issue #27. Written to be executed without conversation context. Read
`CONTEXT.md` (stages, tile, part/task) first.

## The problem

Players can't see the board until the `reveal` stage. Admins want to show it earlier, while signups are open, without
committing to the details: tasks, items and quantities get adjusted to the number of participants, and the rules text
isn't final. So the early board shows which tiles there are and where they sit, and nothing about what completing them
takes.

## Decisions (settled, don't reopen)

1. **What a preview shows:** each tile's **name, image, position and category colour**. Nothing else: no points, parts,
   items, quantities, counts, descriptions, notes, freeze settings or lines. Opening a tile shows a modal with its name
   and a large **"?"**: "Details are revealed when teams are set." The rules text and exclusive item lists stay hidden
   until `reveal`, as they are today.
2. **The server strips the data.** A player never receives anything the preview doesn't show. Hiding it only in the UI
   is not enough, because the network tab would still show it.
3. **Control: an admin toggle**, "Show board preview", on the bingo. Off by default. It takes effect during `signup`,
   `captains` and `draft`. In `planning` the bingo is hidden from players anyway, and from `reveal` on everyone sees
   the full board whatever the toggle says. Site admins can change it, the same people who can change the stage.
4. **Placement:** during `signup`, `captains` and `draft`, the board page gets two tabs: the stage's own screen (the
   signup form, the captains notice, the draft card) and **"Board preview"**. The stage screen is the default tab.
5. **Rename:** the `reveal` stage is labelled **"Prep"** (teams set, full board visible, submissions not open). Only
   the label changes. The stored key stays `reveal`, so there is no migration, and `revealScheduledAt` keeps its name.

## Phase 1: server

- **Column:** add `boardPreviewEnabled` (`board_preview_enabled`, integer boolean, not null, default `false`) to
  `bingos` in `server/src/db/schema.ts`, and generate the migration with `npm run db:generate --workspace=server`.
  It's additive, so `migration-safety` passes. It reaches the client through `toPublicBingo` without extra work. Add
  it to the shared `Bingo` type.
- **Visibility rule** in `bingoService.ts`, next to `isBoardRevealed`:
  ```ts
  // Players see names/images only: the board isn't revealed, an admin turned the preview on, and signups have opened.
  export function isBoardPreviewed(bingo): boolean {
    return bingo.boardPreviewEnabled && (bingo.stage === "signup" || bingo.stage === "captains" || bingo.stage === "draft");
  }
  ```
  `canViewTiles` and `toViewerBingo` don't change: the preview is a separate, smaller response, not the full board.
- **`GET /:slug/board`** (`server/src/routes/bingos.ts`): for a non-mod when `!canViewTiles && isBoardPreviewed`,
  respond `{ preview: true, tiles: PreviewTile[], lines: [] }`. Otherwise respond as today, adding `preview: false`.
  Mods keep getting the full board; how they see the preview is decided on the client (phase 2).
  - `PreviewTile` (new, in `shared/src/index.ts`) is `{ id, name, imageUrl, categoryId, boardRow, boardCol }`. Build
    it by **picking** these fields, never by deleting fields from a full `Tile`. That way a field added to tiles later
    can't leak into the preview by accident.
- **Toggle:** accept `boardPreviewEnabled` in the admin bingo update route (`server/src/routes/admin.ts`, the same
  PATCH the settings form uses; that router already requires a site admin, like stage changes). Write an audit entry for it, in the
  style of the existing bingo-settings audit entries (`docs/audit-log.md`).
- **Export/import:** leave it out. It's live state like `stage`, not board design.
- **Tests** (`server/src/routes/*.test.ts`), for `/board`:
  - player, stage `signup`, toggle off → empty board, `preview: false`
  - player, stage `signup`/`captains`/`draft`, toggle on → `preview: true`, tiles have exactly the `PreviewTile` keys,
    and no `node`, points or lines
  - player, stage `planning`, toggle on → no tiles
  - player, stage `reveal`/`live`, toggle either way → full board, `preview: false`
  - mod, any stage → full board
  - a non-admin can't change the toggle; a change writes an audit entry

## Phase 2: client data

- `shared`: add `PreviewTile`. The board response type becomes
  `{ preview: false; tiles: Tile[]; lines: BoardLine[] } | { preview: true; tiles: PreviewTile[]; lines: [] }`.
- `client/src/api/boardCache.ts`: bump `BOARD_CACHE_SCHEMA` to 2, because the response has a new shape.
- `BingoPageProvider`: add `page.preview`:
  - `available`: the stage is `signup`/`captains`/`draft` and (the viewer is a mod, or `bingo.boardPreviewEnabled`)
  - `visibleToPlayers`: `bingo.boardPreviewEnabled` (for the mod-only notice in phase 3)
  - `tab` / `setTab`: `"stage" | "board"`. Remember the tab in `sessionStorage`, with best-effort try/catch access
    like `boardCache.ts` does.
- **Preview board model:** `buildPreviewBoard({ tiles, categories, rows, cols })` in `client/src/headless/boardModel.ts`
  returns a `BoardModel` with `preview: true`. Its `TileModel`s carry name, image, position and category, with empty
  `tasks`, `taskStatuses` and `submissions`, zeroed `progress` and a freeze that is off. Add `preview: boolean` to
  `BoardModel`.
  - A **mod** gets the full tiles from the server, but in these stages the preview tab still goes through
    `buildPreviewBoard` (a full `Tile` has every `PreviewTile` field). So a mod sees exactly what players see.
  - Tile search in the preview matches tile names only (`tileMatchesSearch` looks at the requirement tree, which a
    preview tile doesn't have).
- `BoardProvider`: when `preview`, render with `buildPreviewBoard` and none of the team-dependent inputs. There's no
  team, no progress and no submitting, and hands-up stays off, because `canToggleInterest` already requires
  `reveal`/`live`.

## Phase 3: UI (both themes, `comic` and `default`)

Follow `docs/theming.md`, and use design tokens only: no hex, rgb or `bg-black` in components. If a colour is
missing, add a token.

- **Tabs** in both `themes/*/page/BoardPageLayout.tsx`: when `page.preview.available`, the `signup`, `captains`
  (`PlanningStage`) and `draft` branches render a two-tab switcher, "Signups" / "Captains" / "Draft" + "Board
  preview". Use the tab pattern the mod page already has, and make it keyboard accessible (`role="tablist"`). The
  board tab renders `TileSearch` + `BoardGrid` against the preview board model.
- **Mod notice:** above the preview board, when the viewer is a mod and `!visibleToPlayers`, show "Players can't see
  the preview yet. Turn it on under Stage controls."
- **Tile cells:** when `board.preview`, the cell slots draw the name, image and category accent only: no task dots,
  points, freeze clock, completion state or hands-up. For comic this is `ClosedBook`/`BoardGrid`, with no dog-ear
  page marks. Check the mobile book layout (`docs/mobile-book-plan.md`) at phone width.
- **Preview modal:** a new slot, `PreviewTileModal`, in `themes/slots.ts`, implemented per theme. It shows the tile
  name, the image if any, a large "?" and "Details are revealed when teams are set." It closes like the existing tile
  modal (Esc, backdrop, close button).
  - Comic: a plain comic panel with the "?" in the display font. Don't reuse the book fly-out; it expects tasks.
  - Default: a simple dialog.
  - `BoardPageLayout` renders it instead of `TileModal` when `board.preview`.

## Phase 4: admin control

- `client/src/core/mod/StageControls.tsx`: add a "Show board preview" switch under the stage stepper. It's visible
  during `planning`, `signup`, `captains` and `draft` (it can be set up in `planning` ahead of time), and enabled only
  when `canChange`. Explain it under the switch: "Players see tile names and images only, no tasks, items or points.
  The full board still appears at Prep." Save it through the admin bingo update used by `BingoSettingsForm`, and
  invalidate the shell and board queries.
- From `reveal` on, hide the switch. It has no effect by then.

## Phase 5: the "Prep" rename

- `shared/src/index.ts`: `STAGE_LABEL.reveal` → `"Prep"`. `nextMilestone`: the `draft` case's label `"Board reveal"`
  → `"Prep starts"`.
- `StageControls.tsx` `ENTER_EFFECT.reveal` → "Teams are set and players see the full board (tasks, items, points) to
  plan. Submissions don't open until Live." Drop "The board locks for editing": it's no longer true
  (`assertBoardEditable` allows edits until `complete`).
- Copy that says the board is revealed next: `core/draft/DraftRoom.tsx` ("The board is revealed next.",
  "Advance to the reveal stage…") and `themes/default/page/DraftStage.tsx` → "Prep" wording.
- `core/admin/BingoSettingsForm.tsx`: the "Reveal scheduled" label → "Prep starts".
- `CONTEXT.md`: the stage list's `reveal` entry becomes "`reveal` (shown as **Prep**) — Teams are set; the full board
  is visible for prep…". Add a **Board preview** entry: what it shows, when it applies, who controls it.
- Grep `client/src` and `shared` for other player-facing "reveal" copy about the board. Leave the draft pick "reveal"
  animations alone: that's a different meaning.

## Phase 6: verify

- `npm run build`, `npm test`, `npm test --workspace=client`.
- In Claude in Chrome, against a dev bingo (see the `generate-bingo` skill), in both themes, light and dark, at
  desktop and phone width:
  - as a **player** in `signup`, toggle off: no tab. Toggle on: the tab appears, with names and images only. The
    network response for `/board` has only `PreviewTile` fields. A tile opens the "?" modal.
  - as a **mod**: the tab is present with the toggle off, and shows the notice. The board looks the same as the
    player's. Flipping the switch works and is audited.
  - advance to `reveal`: the stepper and header say "Prep", the tabs are gone, and the full board and modal behave as
    before.
- e2e: add one Playwright case for a player's preview (tab → grid → "?" modal) if the e2e suite is green on `main`
  at the time. Otherwise note it in the PR.

## Out of scope

- Showing the rules text, lines or points in the preview.
- A scheduled preview time. The toggle is enough for now; `revealScheduledAt` shows how one would be added.
- Renaming the stored `reveal` key.
