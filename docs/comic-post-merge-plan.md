# Comic theme post-merge fixes (issue #58) — implementation plan

**Status:** approved plan, not yet implemented. Written 2026-09-18 against
`main` at `d89d65d` (PR #59 merged).
**Scope:** the punch list in
https://github.com/cosmic-abyssless/tectonic-bingo/issues/58 — 18 items,
all client-side except one server audit filter. **No schema or migration
changes anywhere in this plan.**

## For the implementer

- Work on a branch off `main` (suggested: `comic-post-merge`). Commit at the
  end of **every phase** below; the app must build and behave after each.
  Phases are ordered cheap-and-safe → larger. Do not reorder; do not squash.
- Verification after every phase: `npm run build` (root: server `tsc` +
  client `tsc && vite build`) and `npm test` (server vitest). Then the
  phase's manual checklist in the browser at `http://localhost:5173/b/<slug>`
  with the comic theme. E2E (`e2e/*.spec.ts`) is **deferred** per repo
  policy — do not run or fix it.
- Line numbers below are against `d89d65d`. **Re-verify each ref before
  editing** — `client/src/themes/comic/board/TileModal.tsx` is ~1700 lines
  and shifts easily. Search for the quoted code, not the number.
- Do not grow `TileModal.tsx`. Anything new goes in its own file under
  `client/src/themes/comic/` (repo convention: files under ~300 lines).
- The tile↔modal book hand-off is pixel-exact and fragile: **do not edit
  `ClosedBook.tsx` geometry, `bookFlight.ts`, `measureFlight`, `poseAtTile`,
  or the enter/exit `AnimationSequence`s** except where a phase says so.
- "Consider …" items in the issue are implemented in their minimal form
  written here; do not expand them.

## Phase 1 — Copy and small fixes (TileModal, dialogs, forms)

### 1a. Frozen-tile box (`TileModal.tsx:1400-1409`, `SummaryPage`)

Today: `{freeze.hasFreezePeriod && <CaptionBox tone="cyan" title={isFrozen
? "On ice" : "Freeze period"}>` … `Locks for ${durationMinutes} min after
each approval`. Change:

- Guard → `freeze.hasFreezePeriod && (freeze.isFrozen || freeze.unlocksAt === null)`
  (`unlocksAt` is `null` before the bingo starts — `core/board/tileProgress.ts:96`;
  once thawed the box must not render at all).
- Title: `"Frozen"` while frozen, else `"Freeze period"`.
- Body: while frozen keep the countdown but say
  `Unlocks in ${formatCountdown(freeze.remainingMs)}`; otherwise
  `` `Locked for ${freeze.durationMinutes} minutes after the start of the bingo` ``.
- `TileModal.tsx:1525` `"On ice until the freeze ends."` →
  `"Frozen until the freeze period ends."`
- `ui/Stamp.tsx:13` `frozen: "ON ICE"` → `"FROZEN"`.

### 1b. In-fiction copy → plain terms

| File:line | Now | Replace with |
|---|---|---|
| `page/TeamInfoDialog.tsx:34` | `The crew · N members` | `Team · N members` |
| `page/TeamInfoDialog.tsx:81` | `Editor-in-chief` / `Deputy editor` / `Staff writer` | `Captain` / `Co-captain` / `Member` |
| `page/TeamInfoDialog.tsx:91` | `Recently in the newsroom` | `Recent activity` |
| `page/TeamInfoDialog.tsx:15` | docstring "The Crew" | update to match |
| `page/RulesDialog.tsx:9` | `Read before you play, true believer.` | `Read before you play.` |
| `submission/Pickers.tsx:8` | `Which issue?` | `Tile` |
| `submission/Pickers.tsx:18` | `Which item?` | `Requirement` |
| `submission/Pickers.tsx:30` | `How many?` | `Quantity` |
| `submission/ScreenshotDropzone.tsx:17` | `Exhibit A` | `Screenshot` |
| `submission/ScreenshotDropzone.tsx:46` | `Paste photo here` | `Drop or paste a screenshot` |
| `submission/TaskPicker.tsx:14` | `Which part?` | `Part` |
| `submission/TaskPicker.tsx:56` | `Editor's desk` | `Judged by a mod` |
| `submission/StagedClaimsList.tsx:13` | `P.S. also in this photo` | `Also in this screenshot` |
| `submission/AnalysisPanel.tsx:25` | `Meanwhile, at the lab…` | `Analyzing screenshot…` |
| `board/TaskPanel.tsx:74` | `Editor's note` | `Notes` |
| `board/TileModal.tsx:1416` | `In this issue` | `Parts` |
| `board/TileModal.tsx:1644` | `Be the first to write in!` | `Submit the first one.` |

Leave decorative words alone: `fx/SfxLayer.tsx:16` WORDS (POW! etc.), the
"SUBMIT!" bursts (`PageHeader.tsx:75`, `SubmissionsDrawer.tsx:62`), stamp
words APPROVED / REJECTED / PENDING / DONE! / LOCKED, and the "Tectonic"
masthead. Also grep `themes/comic` for `issue`, `crew`, `editor`, `newsroom`,
`exhibit`, `true believer` afterwards and fix any you find that a player
would read.

### 1c. Nested submissions box (`TileModal.tsx:1648-1656`, `SubmissionsPage`)

The old rounded card is the wrapper `<div className="relative rounded-2xl
border-[3px] px-4 py-3" style={{ backgroundColor: PAPER_RAISED, borderColor:
INK, boxShadow: "3px 3px 0 rgba(0,0,0,0.2)" }}>` around each
`<SubmissionBubble>`. Delete the wrapper; render
`<SubmissionBubble key={s.id} submission={s} />` directly in the list.
`SubmissionBubble`'s `Stamp` is positioned `-right-2 -top-3`
(`SubmissionBubble.tsx:23`) and the page scroller clips overflow — if the
stamp gets cut, add `pt-3 pr-2` to the list container, nothing else.

### 1d. Field label attached to its input (`submission/ComicField.tsx:25-30`)

The label is an `inline-block` tab with `border-[2px] border-b-0 mb-1`; the
`mb-1` leaves a 4px gap above controls that have their own 3px border
(`Pickers.tsx:9,19,31`, `ScreenshotDropzone.tsx:21`). Change the tab to
`border-[3px] border-b-0 -mb-[3px] relative z-[1] rounded-t-sm` so it
overlaps the control's top border like a folder tab. Check all four fields
in the submit modal.

### 1e. Failed codeword analysis out of the team log (server, one line)

`server/src/audit/query.ts:110`
`TEAM_ACTIVITY_EXCLUDED_ACTIONS = ["team.tile_interest_set"]` → add
`"submission.screenshot_analysis_failed"` and
`"submission.screenshot_analyzed"`. (Both are `visibility: "mods"` in
`shared/src/audit.ts:343-350`, so players never saw them; this removes them
from the **team** feed for mods too. The mod panel's Audit tab uses
`queryAuditLog` directly and keeps them.) Add a case to the existing
`server/src/audit/*.test.ts` that asserts an excluded action is absent from
the team activity result.

**Checklist 1:** frozen tile shows the new wording and the box disappears
after the freeze; no in-fiction strings in the submit modal / team dialog /
rules; a tile with submissions shows one bordered bubble per entry, no outer
rounded card; field labels touch their inputs; `npm test` green.

## Phase 2 — Buttons, links, hover, header text

All in `client/src/themes/comic/`.

### 2a. `ComicButton` gets hover + cursor (`ui/ComicButton.tsx:63,86`)

- Add `cursor-pointer` to both `ComicButton` and `ComicIconButton` class
  strings (today neither has it; `TileCell.tsx:124` / `TileModal.tsx:1217,1261`
  add it by hand).
- Raised variants: `hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--comic-ink)]`
  (the lift `TileModal.tsx:1261` already uses). `.comic-press`'s transition
  (`comic.css:94`) already covers transform/box-shadow.
- `primary` / `yellow`: add `hover:brightness-95`.
- `ScreenshotDropzone.tsx:18` raw `<button>`: add `cursor-pointer`.

### 2b. Links are links (`ui/ComicButton.tsx`, `comic.css`, `page/PageHeader.tsx`)

- Add `.comic-link` to `comic.css`: `color: var(--comic-ink); text-decoration:
  underline; text-decoration-thickness: 2px; text-underline-offset: 3px;
  cursor: pointer;` hover → `background: var(--comic-yellow)` (same highlight
  `TeamSelector.tsx:48` uses).
- `ComicButton`: add `href?: string` to `ComicButtonProps` (`:16`). When set,
  render a react-router `<Link to={href}>` with the same size classes,
  `comic-link`, Bangers font, no raise/shadow. Keep `variant="ghost"` for
  non-navigating actions only.
- `PageHeader.tsx`: **Stats** (`:54`) and **Mod panel** (`:59`) currently call
  `navigate(...)` from `ComicButton`s — switch them to `href=` (paths from
  `headless/BingoPageProvider.tsx:180-181`). Rules (`:49`, opens a dialog)
  stays a ghost button. Submissions/Submit/team selector stay buttons.
- `board/SubmissionBubble.tsx:27` raw `<a>` for the screenshot: give it
  `comic-link`.

### 2c. Mod panel button clearer (`page/PageHeader.tsx:58-63`)

After 2b it is link-styled and no longer looks like Submissions. Also add a
leading icon (pick a shield/wrench from `core/ui/icons`) and move it to sit
right after the team selector, away from Submit. Keep the pending `Counter`
badge (`:87-94`).

### 2d. Hard shadow on white header text

`headerStyle.ts:16` already gives the title `comic-outline-text` (outline +
`0.08em 0.08em 0 #000`, `comic.css:64-72`). What is white without a shadow
is `primary` button text (`ComicButton.tsx:30`, `#fffaf0` on red — the
Submit button). Add `textShadow: "0.06em 0.06em 0 #000"` to the `primary`
fill. Tile-cover text stays as is (the issue says so).

**Checklist 2:** every header control changes cursor and shows hover
feedback; Stats and Mod panel are underlined links that still route; the
mod panel button is not next to Submit; Submit's white text has a hard
black drop shadow.

## Phase 3 — Dialog backdrop sunbeams (`ui/ComicDialog.tsx`, `board/TileModal.tsx`)

Goal: the submission modal (and every `ComicDialog`) gets the same rotating
sunbeams the tile modal has, per the issue's screenshot.

- New file `ui/ComicBurst.tsx` exporting `ComicBurstRays({ reduceMotion }:
  { reduceMotion: boolean })`: move `BURST_COLOR` (`TileModal.tsx:170`) and
  the **inner disc only** of `ComicBurst` (`TileModal.tsx:201-219`: 180vmax
  square, `repeating-conic-gradient(${BURST_COLOR} 0deg 7deg, transparent 7deg
  18deg)`, the `closest-side` radial mask `black 0-18% → transparent 96%`,
  `opacity: 0.4`, `mix-blend-mode: screen`). Rotation: use the existing
  `comic-rays-spin` class (`comic.css:75-84`, 90s) instead of the Tailwind
  arbitrary animation so the ≤767px no-spin rule (`ComicDialog.tsx:36-38`)
  and the reduced-motion rule (`comic.css:166-170`) apply; when
  `reduceMotion` is true, no spin class.
- `TileModal.tsx`: `ComicBurst` keeps its `fixed inset-0` wrapper, its
  `burstRef`, and its place in the enter/exit sequences — it just renders
  `<ComicBurstRays reduceMotion={reduceMotion} />` inside. **Do not change
  the sequences.**
- `ui/ComicDialog.tsx:29-38` (`ComicBackdrop`): replace the `.comic-rays`
  div at `:34` with `<ComicBurstRays reduceMotion={useReducedMotion()} />`
  positioned `absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2`,
  layered above the ink scrim (`:33`) and below the halftone (`:35`). Lower
  the scrim from 0.78 to ~0.7 so the rays read. Fade-in/out comes from the
  existing `comic-backdrop-in/out` keyframes (`comic.css:150-164`).
- Remove the now-dead `.comic-rays` rule from `comic.css` if nothing else
  uses it (grep first).

**Checklist 3:** open the submit modal, rules, team dialog, submissions
drawer — each has slow-spinning warm beams behind it; the tile modal's
flight/open/close is unchanged (beams still fade in only after the cover
opens, out the instant it starts closing); ≤767px no spin.

## Phase 4 — Page footer strips and spread tab (`board/TileModal.tsx`)

Replace the page number at `TileModal.tsx:1290-1295` (a centered
`{no} / {total}` in `BookPage`) with the strip from the issue's screenshot:

- New file `board/PageFooter.tsx`: a full-width strip pinned to the bottom of
  the page, `borderTop: bw(0.006) solid RULE`, height `bw(0.05)`, Bangers
  font at `bw(0.026)`, uppercase. Two labels: **outer edge** = `PAGE n`,
  **spine edge** = the page's role. `BookPage` knows `side` ("left"/"right"):
  outer = left for a left page, right for a right page.
- Role label per page: summary → `CONTENTS`, task page → `PART k OF m`
  (`k` = task index+1, `m` = `tile.tasks.length`), submissions →
  `SUBMISSIONS`. Thread it in via a new `role: string` prop on `BookPage`
  from `face()` (`TileModal.tsx:1089-1093`), which already knows the page
  index.
- Nav (`TileModal.tsx:1229-1237`): replace the "Pages L–R of N" text with a
  yellow tab `SPREAD s / N` (`background: var(--comic-yellow)`, ink border,
  Bangers) hanging from the bottom-center of the book frame, between the
  prev/next `NavButton`s. `s = spread + 1`, `N = lastSpread + 1`.
- Page content padding: `BookPage` already reserves `paddingBottom: bw(0.12)`
  (`:1285-1289`) — keep the strip inside that.

**Checklist 4:** every page shows PAGE n on its outer edge and its role at
the spine; the tab under the book reads SPREAD 1 / N and updates on turn;
the page curl still peels cleanly over the strip.

## Phase 5 — Page scrolling under the edge strips (`board/TileModal.tsx`, `ClosedBook.tsx`)

Cause (verified on desktop Chrome): the page scroller itself works
(`ClosedBook.tsx:438-461`, `Page` → `overflow-y-auto`). What eats the wheel
is `EdgeBand` (`TileModal.tsx:1319-1340`): an absolute sibling of the pages;
on `pointerEnter` it sets `held` and widens from 12% to 45% of the page
(`EDGE_BAND_HELD`, `:1323`) until the pointer leaves it, so wheel events over
the outer ~45% of a page hit the strip and scroll nothing.

- Add `onWheel` to `EdgeBand`. `TileDetails` passes it a `getScroller: () =>
  HTMLElement | null` prop for that side's visible page: for the right band
  the front face of leaf `spread+1`, for the left band the back face of leaf
  `spread` (cover inside when `spread === 0`), i.e.
  `root.querySelector(`${leafSelector(k)} > [data-face="front"|"back"] .overflow-y-auto`)`.
  Handler: `e.preventDefault(); scroller?.scrollBy({ top: e.deltaY })`.
- `ClosedBook.tsx:456` (the `overflow-y-auto` div): add
  `overscrollBehavior: "contain"`.
- While there, check leaf 1's front page (page 2) renders its content — in
  one test it painted blank while its scroller had content height. If you
  reproduce it, suspect the `translateZ(1px)` + `overflow-hidden` on faces
  (`ClosedBook.tsx:366`) and report before changing geometry.
- Touch/trackpad: the strips are mouse-only (`:1317`). Re-test on a phone;
  if scrolling still fails there, the cause is different — write it down in
  the commit and stop (Phase 8 covers mobile layout).

**Checklist 5:** on a long task page, wheel-scroll works anywhere over the
page including its outer edge after hovering the edge; hover-curl still
works; page turns still work.

## Phase 6 — Mobile header menu (`page/PageHeader.tsx`)

`core/ui/AppHeader.tsx:47,63` just `flex-wrap`s the comic buttons into 2–3
rows on phones. Reuse the popover pattern `TeamSelector.tsx:26-66` already
builds (`MenuTrigger` + `Popover` + `AriaMenu`, paper panel, yellow hover):

- Wrap Rules / Stats / Mod panel / Submissions in a `hidden md:flex` group.
- Add a `md:hidden` `ComicIconButton` with a hamburger icon (add one to
  `core/ui/icons` if missing) that opens a menu with the same four entries
  as `AriaMenuItem`s — Stats and Mod panel with `href`, Rules and
  Submissions calling the same handlers. Show the pending `Counter` next to
  Mod panel / Submissions inside the menu too.
- **Submit stays outside the menu**, always visible; the team selector stays
  as is.

**Checklist 6:** at 390px the header is one row: back, team, hamburger,
Submit; the menu opens/closes and every entry works; ≥768px unchanged.

## Phase 7 — Profile links in the team log; themed bug-report & profile dialogs

### 7a. Actor names open the player profile (`page/TeamInfoDialog.tsx:90-101`)

- `headless/types.ts:8-16` `ActivityEntryModel`: add `actorId: string | null`.
- `headless/useTeamActivity.ts:11-22`: set `actorId: e.actor?.id ?? null`
  (`core/mod/AuditLog.tsx:150` shows `entry.actor.id` exists).
- `TeamInfoDialog.tsx:95`: labels are server-built sentences that begin with
  the actor name. If `entry.actorId && entry.actorName &&
  entry.label.startsWith(entry.actorName)`, render
  `<PlayerName userId={entry.actorId}>{entry.actorName}</PlayerName>` +
  `entry.label.slice(entry.actorName.length)`; else the plain label.
  `PlayerName` (`core/tectonic/PlayerName.tsx`) already works in this
  portal (`TeamInfoDialog.tsx:78` uses it).

### 7b. Dialog slots so core dialogs can be comic (`themes/slots.ts`)

`core/ui/BugReportDialog.tsx:38` and `core/tectonic/PlayerProfileDialog.tsx:19,32,42`
use core `Dialog`/`DialogHeader` directly, so they are un-themed in the
comic theme. Add two slots:

```ts
DialogFrame: ComponentType<{ isOpen: boolean; onClose: () => void; size?: "md" | "lg" | "xl"; isDismissable?: boolean; children: ReactNode }>;
DialogHeader: ComponentType<{ title: ReactNode; subtitle?: ReactNode; onClose: () => void; action?: ReactNode }>;
```

These match `core/ui/Dialog.tsx:18-30,45` and `ui/ComicDialog.tsx:45-59,84`
already. Default theme → core `Dialog`/`DialogHeader`; comic theme →
`ComicDialog`/`ComicDialogHeader` (register in both `themes/*/index.ts`).
Then `BugReportDialog` and `PlayerProfileDialog` call
`useSlot("DialogFrame")` / `useSlot("DialogHeader")`. `useSlot` throws
outside `ThemeProvider` (`themes/context.ts:16-19`): confirm every mount of
these two dialogs (`pages/{BingoPage,DraftPage,ModPage,StatsPage}.tsx` via
`PlayerProfileProvider`, `AppHeader.tsx:43,67-70`) is inside the provider
before switching. `SiteAdminPage` uses `BugReportsPanel`, not the dialog.

**Checklist 7:** clicking a name in the team activity list opens that
player's profile; the bug-report and profile dialogs look comic on the
comic theme and unchanged on the default theme; `npm test` green.

## Phase 8 — Halftone on book paper

Use the existing, currently unused `.comic-shade` (`comic.css:56-59`, 5px
dots in `--comic-shade-ink`, written for exactly this):

- Covers: in `board/BookCoverArt.tsx` add an `absolute inset-0 comic-shade`
  div **under** the artwork `<img>`, masked `linear-gradient(to top, black,
  transparent 60%)` so the shading sits in the cover's lower half.
- Pages: in `ClosedBook.tsx` add a `comic-shade` layer at `opacity: 0.12`
  inside `PageFace` (`:358`) and the cover inside (`:237`) — **not** on the
  dog-ear flap, and **no geometry changes** (a plain absolutely-positioned
  child, first in DOM order so content paints over it).
- Delete `client/src/themes/comic/dotGrid.ts` — unreferenced since #59
  (`fx/Halftone.tsx` + `fx/ComicPage.tsx` replaced it). Verify with grep.
- "Fitting comic-book background": the `fx/Halftone` page layers already are
  one; the board's plain-color clearing (`BoardGrid.tsx:26-36`) is
  intentional (asked for in the animations branch). No further change
  without product input — note that in the commit.

**Checklist 8:** covers show dot shading in the lower half behind the art;
pages have a faint halftone; the dog-ear hand-off between tile and modal is
still pixel-exact (open/close a dog-eared tile and watch the landing).

## Phase 9 — Single page at a time on phones (`board/TileModal.tsx`)

Largest item; do it last and only after everything else is committed.
MVP is **pan, don't relayout**: keep the 4:3 two-page book exactly as is
and show one half of it at a time.

- In `FlyingBook`, `single = matchMedia("(max-width: 640px)").matches`
  (subscribe to changes) and `focus: "left" | "right"` state, initial
  `"right"` (the closed book flies to the right half, so `measureFlight`
  (`:285-329`, `pageWidth = rootRect.width / 2`) stays valid).
- Wrap the `TileDetails` root in a viewport div with `overflow: hidden`
  when `single`; give the root `width: 200%` and animate
  `translateX(focus === "right" ? "-50%" : "0%")` with Motion.
- Nav becomes page-stepping: next = `focus === "left" ? setFocus("right") :
  (flipTo(spread + 1), setFocus("left"))`; prev mirrors it. Keys
  (`:981-985`) and `NavButton`s use the same functions. Make the
  `NavButton`s large and always visible on phones (edge strips are
  mouse-only, `:1317`).
- Risks to check: no horizontal scrollbar on the overlay (`:997`,
  `overflow-y-auto`) — the wrapper must clip; page height = 1.5 × viewport
  width plus the floating art and nav must fit 390×844; `BOOK_MAX_WIDTH`
  (`:165`) must not bind on phones; the curl layer spans both pages
  (`:1163-1189`) and is clipped by the wrapper — fine.
- If this phase destabilises the desktop modal or the flight, revert the
  phase and leave a note; the other eight phases stand on their own.

**Checklist 9:** at 390px one page fills the width, next/prev step through
pages 1→N and back, the book still flies out of and back into its tile;
≥641px is unchanged.

## Acceptance bar

- Every phase builds (`npm run build`) and the server suite passes
  (`npm test`).
- Desktop tile modal: flight in/out, cover open, page curl and turn, dog-ear
  and its `P` mark, beams timing — all identical to `d89d65d` except where a
  phase says otherwise (footer strips, spread tab, scrolling, halftone).
- Default theme: no visible change except the two new dialog slots resolving
  to the same core components.
- Server: only `server/src/audit/query.ts` and its test change. **No
  `schema.ts`, no `drizzle/` changes** — CI's migration check must stay
  green without a new migration.

## Must not change

- `client/src/themes/comic/board/bookFlight.ts`, `ClosedBook.tsx` exports
  (`bw`, `CLOSED_BOOK`, `LEAF_GAP`, `BASE_DEPTH`, staggers, `BASE_SHADOW`,
  `DOG_EAR*`), `measureFlight`, `poseAtTile`, `enterSequence` /
  `exitSequence` timings.
- `TileCell.tsx` (the board tile) — nothing in this issue touches it.
- The board's radial clearing in `BoardGrid.tsx`.
- Any `shared/src/audit.ts` visibility values (1e is a server-side exclusion,
  not a visibility change).
