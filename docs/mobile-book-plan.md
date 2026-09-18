# Comic tile modal on phones: full cover fold, edge-swipe page curl — implementation plan

**Status:** approved plan, not yet implemented. Written 2026-09-18 against
`main` at `062595a` (the unmerged `caching` branch does not touch `TileModal.tsx`).
**Scope:** the comic theme's tile modal (`client/src/themes/comic/board/`) when the
viewport is a phone (`matchMedia("(max-width: 640px)")`, called `single`). **Desktop
behaviour must not change.** No schema, API or server changes.

## What the user asked for (decisions already made)

1. On a phone the **front cover folds over a full 180°**, revealing **a single page**.
2. That first page is **always the summary/contents page**; pages then follow the
   **same order as desktop** (summary → the parts in `orderTasks` order →
   submissions). Page numbers/footers/"Part k of m" therefore match desktop.
3. **Swipe to turn pages**, with **the same finger-following page curl** as the
   desktop hover peel. Swipes are **isolated to the left and right screen edges**
   (edge zones), so they never fight vertical scrolling.
4. **The floating tile image (the rotated sticker top-left) is removed on phones.**
5. **Vertical scrolling stays, but only *inside* a page** that is taller than the
   viewport (long checklists, many submissions). The **modal overlay itself must not
   scroll**, and there is no pagination of long content.

## Facts about the current code (verified; don't re-derive)

All symbols are in `TileModal.tsx` unless noted — search by name, not line.

- **Phone mode today** is still a *two-page-wide book panned to show one half*.
  `single` (in `FlyingBook`) is a live `matchMedia`. `TileDetails` makes the root
  exactly one page wide, so `--bw` is `100cqw` (50cqw on desktop). A `[data-pan]`
  wrapper is 200% wide and translated `-50% 0` (right half showing) or `0 0` (left
  half), with a 350 ms transition. `focus` is which half shows; `step(dir)` pans
  left→right and turns a spread when crossing right→left. The tab reads
  `Page 2*spread + (focus === "left" ? 1 : 2) / pageCount`.
- **Opening on phones today:** the cover already swings to `OPEN_ANGLE` (−180°) over
  `COVER_SWING` onto the off-screen left half; the book lands on the right half, and a
  **900 ms timer** then pans left to show the cover's inside (page 1 = summary) with the
  first task (page 2) on the right. On exit `[isPresent]` snaps the pan back right
  before measuring (`measureFlight` measures `[data-pan]`).
- **No curl on phones:** `EdgeBand` (the strip along each page's outer edge) is only
  rendered under `!single`. Phones page with the nav buttons; crossing a spread runs the
  scripted turn across the full frame, half of it off-screen.
- **The peel is DOM-write driven:** `curl(leaf, side, at)` computes
  `depth = min(0.5W, W − distanceFromSpine)` and `v` from the pointer's y, calls
  `setCurlCopy` once, then `draw()` → `renderCurl` writes straight to the DOM every
  move (face `clip-path`, curl layer `clip-path`, the copy's matrix, shade gradient,
  SVG outline, `drop-shadow`). Leaving eases depth to 0 (0.22 s, `animateValue`).
  `peelGeometry` already supports depth up to 2W; only `MAX_HOVER_PEEL` clamps it.
- **Commit today is a click:** `EdgeBand` click → `flipTo(spread)` → the `[spread]`
  effect animates 0→1 over `TURN_DURATION`, **continuing from `curling.current.state`**
  (current depth and `v`), so a finger-driven state carries on smoothly.
  `turning.current` makes `curl()` a no-op during a turn.
- **Touch is explicitly ignored:** every `EdgeBand` pointer handler is gated by an
  `isMouse` check; nothing sets `touch-action` or pointer capture.
- **Scrollers:** only `Page` in `ClosedBook.tsx` scrolls per page (`overflow-y-auto`,
  `overscrollBehavior: contain`, rtl trick so the scrollbar sits on the spine side);
  `EdgeBand` forwards wheel events to it. **The overlay also scrolls**
  (`overflow-y-auto p-4`, content `py-10`): at 402×681 the modal is 727 px tall,
  46 px over. `BOOK_MAX_WIDTH` uses `100vh` (ignores iOS toolbars).
- **Page overflow (measured, iPhone 16 Pro profile 402×681, page scroll area
  370×547):** 12 of 100 pages overflow. Pets (both task pages): 1865 px (~3.4 phone
  pages); Slayer Bosses (both): 1254 px; Wildy 1 p3 +68, Yama +32, Wildy 2 +31, TOB 1
  submissions +17 (4 bubbles), TOA 1/2 +1. Summary pages never overflow with ≤3
  parts; submissions overflow past ~4–5 entries.
- **The sticker** is the `<img data-extra … -rotate-12>` in `TileDetails`; it is
  absolute-positioned outside the book, **not part of `measureFlight` or the flight**,
  and only one of the `EXTRAS` (`[data-extra]`) faded/popped by the enter/exit
  sequences. Removing it is self-contained.

## Architecture (recommended and decided)

**Keep the two-page-wide frame, the closed book on the right half, and the whole
tile↔modal flight untouched** — `measureFlight` assumes page = half of `[data-pan]`
(`originX = 0.75 * width`, the crop insets come from `pageWidth`) and `poseAtTile` /
`FLYER` / `BACK_VIEW` are keyed to a closed book on the right half. Everything below
works *inside* that.

- **Phones stop panning.** `focus` is fixed to `"right"`; the 900 ms pan timer, the exit
  snap, the pan transition and the `single` left/right bookkeeping go away for phones.
- **One leaf per page on phones.** Every page sits on the **front of its own leaf**,
  on the right half; leaf *backs are blank paper* (never seen at rest; they show as the
  fold-back during a peel, like a real single-sided page). The cover folds 180° onto the
  off-screen left half (already what happens), revealing **page 1 (summary) as the
  first leaf's front**. Turning a page lifts the current leaf; it lands on the
  off-screen left half. Desktop keeps two pages per leaf (front/back).
- **Turns become `flipTo(±1)`.** On phones `step` and `onGoToTask(position)` (the
  contents rows) call `flipTo` directly; there is no `focus` toggling.
- **Touch peel** (edge zones only, below) reuses `curl` / `draw` / `renderCurl` /
  `peelGeometry`, extends the depth range, and commits on release like the click does.

## For the implementer

- Work on a branch off `main` (suggested: `mobile-book`). Commit at the end of **every
  phase**; the app must build and behave after each. Do not reorder; do not squash.
- Verification after every phase: `npm run build` and `npm test` (server suite; client
  `npm test -w client`). E2E is **deferred** per repo policy.
- **Desktop regression check after every phase** (this file is shared): at a desktop
  width open a tile, hover-peel both edges, turn with click, arrow keys, the contents
  rows, close, and reopen — the flight must still land exactly on the tile.
- `TileModal.tsx` is ~1900 lines. **Do not grow it.** Put new code in new files under
  `client/src/themes/comic/board/` (e.g. `phoneBook.ts` for pure layout/threshold
  helpers, `useEdgeSwipe.ts` for the gesture) and keep them under ~300 lines.
- **Do not edit** `measureFlight`, `poseAtTile`, the enter/exit `AnimationSequence`s,
  `BACK_VIEW`, `bookFlight.ts` or `ClosedBook.tsx` geometry — except the explicit
  leaf-content change in Phase 2, which is data (which pages go on which faces), not
  geometry.
- Testing tools: the Chrome MCP tab freezes animation between calls (see memory
  `chrome-mcp-animation-testing`), so verify gestures with **Playwright Chromium and the
  `iPhone 16 Pro` device profile** (`@playwright/test` at the repo root; log in with
  `POST /auth/dev-login {discordId:"dev-admin"}`; see memory `ios-webkit-testing`).
  Touch **drags** need CDP: `const cdp = await context.newCDPSession(page)` then
  `cdp.send("Input.dispatchTouchEvent", { type: "touchStart"|"touchMove"|"touchEnd", touchPoints: [{x, y}] })`
  (`page.touchscreen` only taps). Playwright's Windows WebKit does **not** paint the
  cover faces — use it only for layout numbers. The user's real iPhone is the final check.

## Phase 1 — Layout: no overlay scroll, no sticker (phones only)

### 1a. Remove the floating tile image
Delete the `<img data-extra … -rotate-12 …>` block in `TileDetails` **for `single`**
(render it only when `!single`). It is only one of the `EXTRAS`; the enter/exit
sequences fade whatever `[data-extra]` exists, so nothing else changes.

### 1b. The overlay no longer scrolls; the book fits the visible viewport
On phones the modal must fit in the *visible* viewport with **no overlay scrolling**:
- Size the book by **`dvh`** (dynamic viewport height — accounts for iOS toolbars), not
  `100vh`: `BOOK_MAX_WIDTH` uses `100vh` today. The page is 2:3, so page width
  `= min(viewportWidth − sideMargins, (100dvh − navRowHeight − verticalMargins) / 1.5)`.
  Keep the `--bw` unit system: the root stays exactly one page wide (`--bw: 100cqw`), so
  only the *width the root is given* changes.
- Remove the overlay's phone `overflow-y-auto` and the `py-10`/`p-4` that caused the 46 px
  overflow; centre the book + nav row in the visible area. Reserve the nav row height
  (`mt-5` + 40 px) in the calculation. The close button (`-right-4 -top-4`) overlaps the
  page corner and the part-number badge today: keep it but make sure it stays inside the
  viewport (inset it on phones).
- Vertical scrolling **inside a page stays** (`Page` in `ClosedBook.tsx`); nothing else
  scrolls.

**Manual check** (Playwright iPhone profile, 402×681 and also 375×667): open any tile —
`document.documentElement.scrollHeight === innerHeight`, the overlay's
`scrollHeight === clientHeight`, the book and nav row fully visible, no sticker.
Desktop: unchanged.

## Phase 2 — One leaf per page; cover folds to reveal the summary; no panning (phones)

### 2a. `bookShape` and the leaf contents
`bookShape(tile)` returns `pageCount = tasks + 2` and, for desktop, `innerLeaves` with
two pages per leaf (leaf k: front = page 2k, back = page 2k+1). Add a phone variant
(`single`): **`pageCount` unchanged** (same numbers/footers as desktop), but
`innerLeaves = pageCount` and leaf k's **front = page k** (1-based; page 1 = summary on
the first leaf) and **back = blank paper** (`undefined` face content). In `TileDetails`
where `leaves`/`face()`/`roleOf()` are built, branch on `single`. The cover's inside
(`coverInside`) on phones is **blank paper** (page 1 is now the first leaf, not the
inside of the cover).
`PageFooter`/`BookPage`: every phone page is a right-hand page (`side="right"`,
`no = its page number`, its role text unchanged).

### 2b. The cover folds 180°, the first page is the summary
Nothing to change in `enterSequence` (it already rotates the cover to `OPEN_ANGLE`).
Remove the phone-only pan: the 900 ms "pan to the left half" timer in `FlyingBook`, the
`[data-pan]` `translate`/`transition` styling, the exit snap-back (`[isPresent]`),
`focus`/`setFocusBoth`/`onFocus` for phones, and the `Page N / M` tab's left/right
arithmetic (phones: `Page {spread+1} / {pageCount}` where `spread` is now the leaf
index). Keep `[data-pan]` as an unshifted 200% wrapper (translate `0`) so `measureFlight`'s
assumption still holds; the book/flyer stay on the right half.

### 2c. Navigation = `flipTo(±1)`
On phones, `step(dir)` → `flipTo(clamp(spread + dir))`; `onGoToTask(position)` (contents
rows) → `flipTo(position + 1)` (the part's page index). The nav arrows and the tab keep
working. The existing turn animation (`[spread]` effect / `TURN_DURATION`) turns one
leaf: the current page lifts and lands on the off-screen left half, exactly like
desktop's right-page → left-page turn, just one leaf at a time. Arrow keys likewise.

**Manual check:** open a tile on the iPhone profile — the cover folds off to the left and
the **summary** is showing at once; the tab says `Page 1 / N`; next arrow → page 2 (first
part) with a turn animation; the contents rows jump to the right part; back to page 1; close
→ the book returns to the tile pose with no jump. Desktop unchanged.

## Phase 3 — Edge-swipe page curl that follows the finger (phones)

Goal: on phones, dragging from an **edge zone** turns the page with the same live curl
as the desktop hover peel, committing or cancelling on release.

### 3a. Edge zones
Render the existing `EdgeBand` strips on phones too (today gated by `!single`), as **two
zones over the visible page**: a **right zone** (the page's outer edge) for going
forward, and a **left zone** (the spine-side edge, at the screen's left) for going back.
Each zone is ~44 px wide and full page height and ignores taps except as gestures (taps
still reach the page). **iOS caveat:** the OS/browser reserve the outermost ~20 px of the
screen for its own back/forward edge-swipe, so the zones must sit **inside** that:
inset them ≥ 20 px from the screen edge (the modal's own page margin already puts the
page ~16 px in; make the zone start there and extend inward, e.g. 20–64 px from the
screen edge). Nothing else on the page is a gesture surface — vertical scroll inside the
page and taps on buttons/links/rows are untouched.

### 3b. Gesture (`useEdgeSwipe.ts`)
Pointer events on each zone (`onPointerDown/Move/Up/Cancel`), primary pointer only,
`touch-action: none` on the zones (so the browser never scrolls/zooms from a zone touch),
`setPointerCapture` on down.
- **Forward (right zone):** down inside the zone, drag left. `depth` = finger travel from
  the edge, clamped to `2W` (`peelGeometry` supports up to 2W; widen the clamp used for
  hover — `MAX_HOVER_PEEL` — for touch). `v` (the fold angle) from the finger's y as the
  desktop peel does.
- **Backward (left zone):** the previous page is the leaf lying on the off-screen left
  half, so its visible part only appears once the fold has travelled past the spine:
  start the peel with `depth = W` (invisible) and add the finger's travel from the left
  edge, so the leaf enters from the left and follows the finger to the right.
- Reuse `curl(leaf, side, at)` / `draw()` / `renderCurl` — feed them a synthetic `at`
  point from the finger. `curl()` is a no-op while `turning.current` is set: if a new
  gesture starts during a turn animation, ignore it (don't queue).
- **Commit on release** when `depth` passes **0.35 W** *or* the release velocity is a
  flick (> ~0.5 px/ms toward the spine): call `flipTo(spread ± 1)`. The existing
  `[spread]` effect continues **from `curling.current.state`**, so the turn carries on
  from where the finger left it. Otherwise **cancel**: ease depth back to 0 with the
  existing `animateValue` (0.22 s), as when the hover leaves.
- Can't go past the ends: no forward gesture on the last page, no backward gesture on the
  first page (the cover is not a peelable page).
- Pointer-cancel (system gesture takes over) cancels like a failed swipe.

### 3c. Performance
`renderCurl` writes clip-paths, a matrix, a gradient and a `drop-shadow` filter each
move. On a phone the repaint cost is the risk: coalesce to one `draw()` per animation
frame (`requestAnimationFrame` around the last pointer position), and pre-render the
turn copy (`copyContent`) at gesture start (`setCurlCopy` once) so the first move doesn't
hitch on a React render. If the shadow filter is too heavy on a real device, drop the
`drop-shadow` while dragging on phones only (keep the shade gradient).

### 3d. Desktop stays as is
The `isMouse` gating on hover stays for desktop; the touch path is separate
(`useEdgeSwipe`), used only when `single`.

**Manual check** (Playwright iPhone profile + CDP touch): a drag from the right zone
shows the curl following the finger; releasing past 35% completes the turn and cancelling
short of it eases back flat; the same from the left zone goes back; a drag starting in the
middle of the page does **not** turn the page and vertical scroll of a long page (Pets)
still works; taps on the contents rows/Submit still work. On the real iPhone: confirm the
zones don't collide with the OS edge-swipe and adjust the inset if they do.

## Acceptance bar

- `npm run build`, `npm test` pass; client `npm test -w client` passes.
- Phone: no overlay scroll, no sticker; cover folds to reveal the **summary** first;
  order/numbers match desktop; nav buttons, tab, contents rows, arrow keys all page
  correctly; edge swipes curl and turn as above; long pages still scroll inside the page.
- Desktop: unchanged (spread layout, hover peel, click turns, the flight).
- Tile ↔ modal flight still lands exactly (open and close), on phone and desktop, for a
  normal tile and a finished (back-cover) tile.

## Must not change

- `measureFlight`, `poseAtTile`, the flyer/`BACK_VIEW` pose, the enter/exit sequences,
  `bookFlight.ts`, `ClosedBook.tsx` geometry, `--bw`'s definition (the root is one page
  wide on phones: `100cqw`; two on desktop: `50cqw`).
- Desktop page layout and the hover-peel behaviour.
- The content of the pages themselves (`SummaryPage`, `TaskPage`, `SubmissionsPage`).

## Out of scope

- Paginating long pages into continuation pages (decided: keep inner scroll).
- Making the cover itself swipeable/peelable (the cover opens on tap as today).
- The tile-cell pixel-density blur on high-DPI screens (separate, see memory
  `ios-webkit-testing`).
