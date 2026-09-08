# E2E UI Testing Plan — Playwright full-flow coverage

> Historical build-out record (Phases E1-E5, all done). Its Phase E5 (`special-tile-rules.
> spec.ts`) describes the pre-PR#2 flat-item-list flags (`requiresCompleteSet`,
> `minSubmissions`, `allowsPreviouslyAcquired`, options groups) — that spec file has since
> been rewritten twice: once left `test.skip`'d by PR #2 (whose commit introduced the
> requirement-tree model this phase predates), then rewritten again for the node-graph
> model (`docs/node-graph-model.md`). The actual spec files (`e2e/*.spec.ts`) are
> authoritative for current E2E coverage; this file is kept as a log of how they were
> built, not updated to match.

Written 2026-09-01 to be executed phase-by-phase by another model, standalone. Goal: real-browser
end-to-end tests covering the entire bingo lifecycle — an admin builds a Pokémon-themed bingo
through the UI, players sign up, teams get drafted, and submissions get made and scored — with
zero reliance on real Discord OAuth or external APIs.

Work each phase in order. Each has its own DoD; run `npm run test:e2e` (headed with
`--headed` when debugging) and get it green before moving on. Commit per phase.

## 0. Ground rules and landmines (read first, all of these have bitten before)

- **Never touch `server/data/bingo.db`** — that's the user's live dev database. E2E gets its own
  file (`server/data/e2e.db`) via the `DB_PATH` env var. NEVER run `npm run db:reset` as cleanup;
  it wipes the dev DB.
- **Env loading order**: `server/src/index.ts`'s first import is `./env` (loads the monorepo root
  `.env`). TS/esbuild hoists imports, so any env-gated top-level code runs after `./env` only
  because it is literally the first import — don't reorder it.
- **dotenv does not override already-set env vars.** This is the mechanism for forcing
  integrations OFF in E2E even though the root `.env` has real keys: set `TECTONIC_API_URL: ""`
  (etc.) in the Playwright `webServer.env` — the empty string wins over `.env`, and
  `getTectonicConfig()` treats empty as unset.
- **The tectonic membership gate must be off in E2E.** When `TECTONIC_*` are set, new signups
  from users the tectonic-api doesn't know get a 403 ("clan members only",
  `server/src/routes/bingos.ts` POST `/:slug/signup`). With the env blanked the gate never
  engages and free-text RSN signup works — that's the E2E path.
- **Windows.** This repo runs on Windows (Git Bash / PowerShell). Kill process trees with
  `taskkill //PID <pid> //T //F` — a plain kill leaves orphaned `tsx`/`vite` children holding
  ports and the SQLite file. Playwright's `webServer` manages its own children; this matters only
  if you start servers manually while debugging.
- If `npx` fails with a doubled `node_modules\node_modules` path (has happened in some shells on
  this machine), invoke binaries directly: `node node_modules/@playwright/test/cli.js test`.
- **Playwright starts `webServer` before `globalSetup`, not after.** DB prep (migrate + seed)
  must NOT be a `globalSetup` — it must finish before the server process starts at all, or the
  server opens/auto-creates an empty file first and never sees later migrations. This is why DB
  prep is chained into the server `webServer.command` itself (`e2e/prepare-db.cjs`). Full
  explanation in Phase E1 below; don't rediscover this the hard way.
- Ports: E2E runs its own server+client pair on 3101/5273 (see Phase E1), separate from the
  normal dev ports (3001/5173) so it doesn't collide with a manually-running dev server. Vite
  proxies `/api`, `/auth`, `/uploads`, `/ws` to the server port either way, so the browser and API
  share one origin — session cookies depend on this; always drive tests through
  `http://localhost:5273`, never the server port directly.
- Selector policy: prefer `getByRole`/`getByLabel`/`getByText`. The codebase has no test ids. If
  a control genuinely can't be reached accessibly, add an `aria-label` to the component (an
  accessibility improvement, commit it) rather than sprinkling `data-testid`.
- Screenshot uploads land in `server/uploads/` as real files. Tiny fixture PNGs accumulating
  there is acceptable; don't try to redirect it (the path is hardcoded).

## 1. How auth works in E2E (no Discord)

`POST /auth/dev-login` with `{"discordId": "..."}` logs the browser in as any **existing** user
row, through the real session machinery. It exists only when `NODE_ENV !== "production"` and
`DEV_LOGIN_ENABLED === "true"` (route registration itself is gated — see
`server/src/routes/auth.ts`). The login page also renders a clickable "Dev tools — log in as"
panel, but tests should log in programmatically:

```ts
// helpers.ts — cookies from page.request share the page's browser context
export async function loginAs(page: Page, discordId: string) {
  const res = await page.request.post("/auth/dev-login", { data: { discordId } });
  if (!res.ok()) throw new Error(`dev-login failed for ${discordId}: ${res.status()}`);
}
```

Users must exist first — global setup inserts them directly into the e2e DB (below). Site-admin
status is just `users.is_admin = 1` on the row; no `ADMIN_DISCORD_IDS` bootstrapping needed.

## 2. Phase E1 — Scaffolding — DONE (2026-09-02)

What shipped, for later phases to build on:

- **`playwright.config.ts`** (repo root): `testDir: "e2e"`, chromium only, `baseURL:
  "http://localhost:5273"`, `timeout: 180_000`, `fullyParallel: false`, `workers: 1`. Two
  `webServer` entries on **ports 3101 (server) / 5273 (client)**, not 3001/5173 — a manually-run
  dev server is routinely up on those during normal work on this repo (this whole session had
  one running); reusing them would collide or silently test against someone's live session.
- **`client/vite.config.ts`** now reads `VITE_PORT`/`VITE_API_TARGET` env vars (falls back to
  5173/`http://localhost:3001`, so normal `npm run dev` is unaffected) with `strictPort: true` so
  a port collision fails fast instead of Vite silently picking a different one out from under
  Playwright's health check.
- **`e2e/prepare-db.cjs`** — plain CommonJS (no build step), builds `server/data/e2e.db` from
  scratch (delete stale file, apply every `server/drizzle/*.sql`, seed `e2e-admin` +
  `e2e-p1`…`e2e-p5`) and is chained into the **server** `webServer.command` itself:
  `"node e2e/prepare-db.cjs && npm run dev --workspace=server"` — **not** a Playwright
  `globalSetup`. This matters and is not obvious: Playwright's runner starts `webServer` plugins
  *before* running `globalSetup` (`createGlobalSetupTasks` in `playwright/lib/runner/*.js` orders
  plugin setup first). A `globalSetup` that deletes+recreates the DB file races the server, which
  opens (and, via `better-sqlite3-session-store`, auto-creates) the file the moment it boots —
  the server keeps its original file handle even after the directory entry is unlinked and
  recreated, so migrations applied by a later `globalSetup` are invisible to it; it just serves
  500s ("no such table: bingos") against an empty, sessions-table-only database forever, and the
  webServer health check times out. Chaining prep into the server's own startup command instead
  guarantees the file is fully built before the server process even exists. Confirmed by
  reproducing the bug (empty DB, 60s webServer timeout) before this fix.
- **`e2e/helpers.ts`**: `E2E_USERS` (must stay in sync with `prepare-db.cjs`'s literals — that
  file is intentionally not TS/no shared import, see its header) and `loginAs(page, discordId)`
  via `page.request.post("/auth/dev-login", ...)`.
- **`e2e/fixtures/screenshot.png`**: a tiny (70-byte) valid PNG fixture.
- **Root `package.json`**: `"test:e2e": "playwright test"`, `"test:e2e:headed": "playwright test
  --headed"`.
- **`.gitignore`**: added `test-results/`, `playwright-report/` (`server/data/*.db` already
  covered `e2e.db`).
- **Prerequisite code change — hermetic stats fetch**: `playerStatsService.ts`'s
  `fetchAndPersistPlayerStats` now returns immediately when
  `process.env.PLAYER_STATS_FETCH_DISABLED === "true"` (set in the server `webServer.env`),
  before it would otherwise hit the real WOM/RuneProfile APIs on every signup. Documented in
  `.env.example`; covered by a new test in `playerStatsService.test.ts`.
- **Smoke spec** `e2e/full-flow.spec.ts`: one `test("full bingo lifecycle", ...)` using
  `test.step(...)` blocks (this file grows through every later phase — a single test keeps state
  continuity trivial, at the cost of not being independently re-runnable per step). Current step:
  "admin logs in" — `loginAs`, goto `/`, assert `e2e_admin` visible.
- Also fixed in passing: `.env.example` had an accidental duplicated `RUNEPROFILE_API_KEY=` line
  from an earlier commit.

**DoD E1 — met:** `npm run test:e2e` passes from a clean checkout; a second consecutive run also
passes (confirmed — `prepare-db.cjs` fully resets the e2e DB each run). `npm run test
--workspace=server` green (126 tests, `PLAYER_STATS_FETCH_DISABLED` test included). No leftover
Playwright-spawned processes after a run (checked via `Get-CimInstance Win32_Process`).

## 3. Phase E2 — Admin builds the Pokémon bingo through the UI — DONE (2026-09-02)

All as `e2e-admin`. Built a 3×3 board named "Pokemon Bingo" (slug `pokemon`, explicitly overriding
the auto-slug "pokemon-bingo"), NOT the real event's 7×7 49-tile board — 3×3 exercises every
mechanic without 49 tiles' worth of UI-click flake surface. Tiles: "Vorkath" (Part A 25pts/item
"Vorki", Part B 35pts/item "Draconic visage"/`pointsRequirePrevious`), "Wintertodt" (20pts/item
"Bruma torch"), "GOTR Speedrun" (20pts/`scoringMode: manual`, no items). 8 lines generated. Two
signup questions (required select + optional boolean). Advanced planning → signup.

**Accessibility fixes made along the way (small, surgical, one per field actually touched — not a
sweep of the whole app), because this codebase's form labels are siblings of their inputs, not
`htmlFor`-linked, so `getByLabel` doesn't resolve them at all by default:**
- `htmlFor`/`id` pairs: `SiteAdminPage.tsx` (Name/Slug/Board size), `BingoSettingsForm.tsx`
  (Name/Theme/Description/Buy-in/Bonus pot), `TileEditorPanel.tsx` (tile Name),
  `TaskEditor.tsx` (Label/Points/Description — **id must be task-scoped**,
  e.g. `` `task-${task.id}-label` ``, since multiple tasks can be expanded at once and would
  otherwise collide).
- `aria-label`: `BoardEditor.tsx`'s grid cell buttons (`"Create tile at row {r}, column {c}"` /
  `"Edit tile at row {r}, column {c}: {name}"` — otherwise unaddressable, no text/title at all),
  `Modal.tsx`'s `✕` close button (`aria-label="Close"` — otherwise ambiguous against per-item `✕`
  delete buttons once a tile has items), `QuestionBuilder.tsx`'s new-question type `<select>`
  (`aria-label="New question type"` — otherwise indistinguishable from each existing question's
  own type select).
- `TaskEditor.tsx`'s collapse/expand header was a plain `<div onClick>` — changed to a real
  `<button type="button" aria-label="{Expand|Collapse} task: {label}">` (interactive elements
  should be real buttons regardless of testing; this one was also the only way to reliably target
  "the task I just added" via `.filter({ has: ... })`, since a freshly-added task's other fields
  still say generic defaults like "Part A").
- Fields with an existing `placeholder` (QuestionBuilder's new-question prompt/options,
  TaskEditor's item name/options-group) needed no change — `getByPlaceholder` already worked.

**Real gotchas hit, worth knowing before Phase E3+:**
- **`getByLabel("Points")` is a substring match by default** and matched both the Points input
  *and* the "Withhold **points** until previous" checkbox label. Any short label word (Points,
  Label, Name, Description) needs `{ exact: true }` once checkbox/flag labels with overlapping
  words are on the same page — cheaper to always pass `exact: true` on short field labels than to
  discover the collision per-field.
- **Controlled checkboxes race `.check()`.** `TaskEditor.tsx`'s flag checkboxes (and
  `QuestionBuilder.tsx`'s "Required") are `checked={someServerValue}`, not `defaultChecked` — the
  visual state only flips once the PATCH round-trips and the query refetches. Playwright's
  `.check()` clicks once and immediately verifies, which can lose that race and throw "Clicking
  the checkbox did not change its state". Fix: `.click()` then a separate
  `await expect(locator).toBeChecked()`, which polls/retries and absorbs the round-trip. Same
  fix applies anywhere else a controlled (not default-) checkbox/input gets toggled.
- **`page.getByDisplayValue(...)` does not exist in Playwright** (that's a Testing Library API —
  easy mistake coming from that world). To assert an input's live value, get a *locator* however
  you can (scope by container position/structure) and use `expect(locator).toHaveValue(text)`.
- Multiple unrelated components in this codebase share the exact same Tailwind class string
  (e.g. `TaskEditor`'s and `QuestionBuilder`'s row wrappers are both
  `"bg-slate-900 border border-slate-700 rounded-lg ..."` with one differing trailing class) —
  a CSS-class locator scoped this way is fragile in the abstract but fine in practice here since
  the two never render on screen simultaneously (different tabs). Don't reuse one tab's scoping
  locator on another without checking for this.
- `getByRole("button", { name: "Board" })` (no `exact`) also matched the mod panel header's
  "Back to board" button — substring matching bites on tab names too, not just form labels.

**DoD E2 — met:** suite green (both fresh and re-run — DB rebuild is idempotent via Phase E1's
`prepare-db.cjs`); spot-checked the e2e.db directly after a run and confirmed the bingo, all 3
tiles with correct positions, all 4 tasks with correct points/`pointsRequirePrevious`/
`scoringMode`, all 3 items, 8 lines, and both questions with correct `required` flags — not just
"the UI showed the right thing," the persisted data is actually correct. `npm run test
--workspace=server` and both `tsc --noEmit` still green.

## 4. Phase E3 — Signups, buy-ins, captains, teams — DONE (2026-09-02)

Shipped as planned: `e2e-p1`…`e2e-p5` each log in (`loginAs` + fresh `page.goto`, no explicit
reload needed since navigating to a new URL already refetches auth state), sign up free-text
(`Trainer1`…`Trainer5`, required combat-style select, p1/p2 also check "Willing to captain?"),
one withdraw-then-cancel negative check on p1, admin marks all 5 buy-ins received, advances
signup → captains, assigns Trainer1 and Trainer2 as captains via the Teams tab, advances
captains → draft.

**Two more `htmlFor`/`id` fixes**, same pattern as Phase E2: `SignupForm.tsx`'s RSN field (shared
id since it's either a `<select>` or an `<input>` depending on whether the signer has linked
tectonic RSNs, never both at once) and `QuestionField`'s per-question field in the same file
(question-id-scoped, same reasoning as `TaskEditor`'s task-scoped ids — multiple question fields
render simultaneously). `TeamManager.tsx`'s captain-picker `<select>` got
`aria-label="Assign a captain"` (no accessible name at all before).

**Real gotchas hit:**
- **A required field's label text includes a trailing `" *"`** (rendered as a nested `<span>`),
  which broke `getByLabel("RuneScape name", { exact: true })` — `exact` compares against the
  *full* accessible name including that marker, so it never matched and the test hung until the
  180s test timeout. Symptom to recognize: a `locator.fill`/`.click` that just times out with no
  other error, on a field whose label has a required-asterisk. Fix: drop `exact: true` on any
  label that might carry one, unless you match the marker too.
- **`teamSizeSummary()` in `TeamManager.tsx` is a moving target, not a final answer** — it
  returns `null` (nothing renders) until at least one team exists, then recomputes as
  `remainingCandidates / currentTeamCount` after *each* captain assignment — it does not wait
  until all captains are assigned to show a stable "N teams of M". With 5 total participants:
  after 1 captain it reads "There will be 1 team of 5…", only after the 2nd does it become
  "There will be 2 teams of 2 based on the 5 total participants. 1 team will have an extra
  player." Asserting the final-shape text before any captain is assigned just times out (element
  never appears, since it's `null` at that point, not merely different text).
- **`useMarkBuyin` only invalidates the signup-roster query, not the bingo query that
  `BingoSettingsForm` reads `paidSignupCount`/`potTotal` from** — after marking buy-ins, the
  Settings tab's "Total pot" stays stale until something else refetches it. No WS broadcast
  covers this either (`invalidateForEvent` in `WebSocketContext.tsx` has no case for a buy-in
  change). Worked around with a `page.reload()` before checking the total; **this is a real gap
  in the app, not fixed here** — flagging in case it's worth a real fix (`useMarkBuyin` invalidating
  `queryKeys.bingo(slug)` too) independent of this test suite.
- Team array order from the API isn't guaranteed — don't assert on `teamCards.nth(0)` /
  `.nth(1)` positionally; compare values as a set instead
  (`teamNameInputs.evaluateAll(...)` → `Set` comparison, wrapped in `expect(async () => {...}).toPass()`
  since `evaluateAll` doesn't auto-retry the way locator assertions do).

**DoD E3 — met:** suite green, fresh and re-run. Spot-checked e2e.db: all 5 signups active and
paid, exactly 2 teams with the right names/captains, bingo stage `draft`. `npm run test
--workspace=server` and both `tsc --noEmit` still green.

## 5. Phase E4 — The draft — DONE (2026-09-02)

Shipped as planned, with the picking strategy adapted to reality: `startDraft` shuffles team
order, so which captain (Trainer1's or Trainer2's) goes first is randomized per run. Rather than
hardcoding an order, the test reads the "▼ On the clock" indicator right after "Start Draft" to
learn who's first, then drives the rest of the draft from that.

With 2 teams and 3 pool players, `pickOrderTeamIndex`'s snake math (`round = ceil(pickNumber /
teamCount)`) puts pick 1 on team A, and picks 2 *and* 3 both on team B (round stays 1 for pick 2,
only pick 3 rolls to round 2) — team A never comes back on the clock. That shape is exactly what's
needed for both required checks without extra logins: pick 1 as captain A (asserts "It's your turn
to pick!", drafts Trainer3), then immediately assert zero "Draft" buttons are visible anywhere for
captain A (the out-of-turn check — no separate "log in as the other captain and confirm no button"
round-trip needed, since captain A is *already* out of turn the instant their pick lands). Pick 2
as captain B (drafts Trainer4). Pick 3 as `e2e-admin` (drafts Trainer5) — the site-admin
pick-on-behalf-of override, satisfying the "at least one admin-made pick" requirement. Then
"Draft complete!" asserts, and admin advances draft → reveal → live (two separate `StageControls`
advances — `nextStage` reads directly off `STAGE_ORDER`, so the button text is literally "Advance
to reveal →" then "Advance to live →").

No new `htmlFor`/`id`/`aria-label` fixes were needed — `DraftRoom.tsx`'s existing text/class
surface (exact `"Round {n} — Pick {n}"`, `"It's your turn to pick!"`, `"Draft complete!"`, the
`"Draft"` per-row button, and the `CaptainColumn`'s two nested divs) was targetable as-is by
scoping locators (pool row via `tr` + `getByText(rsn, {exact:true})`; on-clock captain via the
`.flex.flex-col.items-center.text-center.gap-1.min-w-0` container filtered by `hasText: "On the
clock"`).

**Real gotchas hit:**
- **Round numbers don't increment per pick** — round is `ceil(pickNumber / teamCount)`, so with 2
  teams, picks 1 and 2 are both "Round 1"; only pick 3 becomes "Round 2". Assumed a fresh round per
  pick initially and asserted "Round 2 — Pick 2", which never renders (actual text is "Round 1 —
  Pick 2") — verified against `pickOrderTeamIndex` in `server/src/services/draftService.ts` before
  writing the fix rather than guessing.
- No WOM/RuneProfile stat columns rendered (as predicted — `PLAYER_STATS_FETCH_DISABLED` keeps
  `womStats`/`accountType` null for every pool entry), so `showWomStats` stays false and the
  columns never render; no assertion needed since their absence is just the pool table rendering
  one column set instead of two, nothing to break.

**DoD E4 — met:** suite green, fresh and re-run twice (idempotent). Spot-checked `e2e.db` directly:
bingo stage `live`; 2 teams with distinct `captain_user_id`s; 3 `draft_picks` rows — pick 1
`picked_by_user_id` equals team 1's captain, pick 2's equals team 2's captain, pick 3's is a third,
distinct id (the admin) acting on team 2's behalf — confirming the admin-override pick actually
happened server-side, not just that the UI didn't error. `npm run test --workspace=server` (126
tests) and both `tsc --noEmit` still green.

## 6. Phase E5 — Submissions and scoring — DONE (2026-09-02)

Shipped as planned, including the withheld-points bonus path (step 6) — Part A stayed rejected
through the rest of the flow, so it applied. First submission uses the tile-click flow (open
"Wintertodt", click its modal's own "Submit"); later ones use the header's global "Submit" +
`SearchableSelect` tile/task pickers, exercising both entry points into `SubmissionModal`. Order:
Wintertodt submit → approve (auto item-select, single task) → Vorkath Part A submit → reject with
a note → player sees "Rejected" + the note in their team submissions list → GOTR Speedrun submit
(manual, no items) → approve with the review form's untouched defaults (`taskCompleted: true`,
`points: task.points`) → Vorkath Part B submit *before* Part A is done → approve, points withheld
→ Vorkath Part A resubmit → approve, which both awards Part A's points and releases Part B's
withheld points per `pointsRequirePrevious`.

One accessibility fix: `BingoSettingsForm.tsx`'s 5 date fields (`DATE_FIELDS.map`) had no
`htmlFor`/`id` — added `id={`settings-${key}`}` uniformly across all five (needed to fill "Bingo
starts" so submissions aren't blocked by `submissionService`'s `now < bingo.startsAt` check —
`startsAt` is otherwise left null when a bingo is created through the admin form's minimal
Name/Slug/Board-size fields). No other fixes were needed: the manual-review checkbox
("Mark task complete") turned out to already work with `getByLabel` since its `<input>` is a
descendant of its `<label>` (Playwright's "wrapper label" pattern, not just `htmlFor`/`id`); the
review form's "Points" input and reject notes textarea were reachable via `input[type="number"]`
scoping and `getByPlaceholder`, no id needed.

**Real gotchas hit:**
- **`TileCell`'s accessible name is `"{tile.name} {awarded}/{total}"`, not just the tile name** —
  its points badge (`{summary.pointsAwarded}/{summary.totalPoints}`) is a *descendant* of the
  `<button>`, so `getByRole("button", { name: "Wintertodt", exact: true })` never matches (real
  name: `"Wintertodt 0/20"`) and hangs for the full test timeout. Dropped `exact: true` for board
  tile clicks specifically — `TileModal`'s own `<h2>{tile.name}</h2>` heading and
  `SearchableSelect`'s plain-text option buttons don't have this problem (no nested badge), so
  `exact: true` stays correct there.
- **This sparse 3x3 test board (only row 0 has real tiles) makes line bonuses fire far more
  eagerly than a full board would, and the math is easy to get wrong first-try.** `Generate lines
  from board` still produces one line per row/column/diagonal even when most of the grid is empty
  — an empty row (0 tiles) can never complete (nothing ever lists it as one of a tile's lines, so
  it's simply unreachable — not a vacuous-truth bug), but a column or diagonal that happens to
  contain exactly one real tile becomes a de facto duplicate of that tile's own completion, firing
  its 15-point bonus the instant that lone tile finishes. On this board: column 1 duplicates
  Wintertodt, column 2 *and* diagonal 1 both duplicate GOTR Speedrun (so GOTR's approval fires two
  line bonuses at once), and column 0 *and* diagonal 0 both duplicate Vorkath — whose own
  completion additionally finishes row 0 (the only line with real content, once all three tiles are
  done). First run asserted "20 pts" after the Wintertodt approval and got "35 pts" back; traced it
  by inspecting `bingo_line_tiles` row counts per line directly in `e2e.db` rather than guessing,
  found column 1 had exactly one tile row (Wintertodt), and rebuilt every point-total assertion
  from that. Final total: 100 task points + 6 fired line bonuses × 15 = 190 (row 1/row 2 never
  fire — 0 tiles each). This wasn't an app bug worth fixing — `isTileCompleteForTeam`/
  `recordCompletedLinesForTile` behave correctly for the real 7x7 fully-filled event board, where
  no line is ever a strict subset of another; it's purely an artifact of this suite's minimal
  3-tile test board, documented here since the next person to touch these assertions needs the
  same reasoning to change them correctly.

**DoD E5 — met:** suite green, fresh and re-run twice (idempotent). Spot-checked `e2e.db`:
`team_task_progress` sums to exactly 100 for the submitting team, `team_completed_lines` has
exactly 6 rows for that team (0 for the other), matching 100 + 6×15 = 190 shown in the UI —
confirmed server-side, not just that the page rendered the right text. `npm run test
--workspace=server` (126 tests) and both `tsc --noEmit` still green.

## 7. Phase E6 — Stretch — DONE (2026-09-02, live-WS-update only)

**Line bonus:** already covered as a side effect of Phase E5's point-math work — completing all
three row-0 tiles fires the row-0 line bonus (and five other lines this sparse board happens to
make into single-tile duplicates), verified both in the UI total and directly in `e2e.db`'s
`team_completed_lines`. No separate step needed.

**Live WS update — shipped:** reworked Phase E5's last two steps (which used to just re-login the
shared `page` as admin, approve, then re-login as p3 to check) into: p3's resubmit-Vorkath-Part-A
step now leaves `page` sitting on the board as p3 with no further navigation; a *second, independent*
`browser.newContext()` (own cookie jar, so admin and p3 can be logged in simultaneously) opens,
logs in as admin, approves the pending submission, and closes; the final assertion checks `page`
(p3's untouched tab) reaches "190 pts" with zero `goto`/reload in between. Passing this only proves
anything because `WebSocketContext.tsx`'s `invalidateForEvent` invalidates `["teamProgress"]` on
every `submission_reviewed` broadcast, for every connected client — this test is a real check of
that broadcast path, not just app plumbing that happens to work.

**CI wiring:** not done, per the plan's own "out of scope unless asked" — nobody asked.

**Real gotchas hit:** none new — this reused every pattern already established (multi-context
login via `browser.newContext()` + `loginAs` on that context's own page, `PENDING_ROW`/`teamPoints`
helpers from Phase E5).

**DoD:** suite green, fresh and re-run twice (idempotent). `npm run test --workspace=server` (126
tests) and both `tsc --noEmit` still green.

## 8. Phase E7 — Special tile-rule mechanics — DONE (2026-09-02)

Not in the original plan — added afterward because E1–E6's "pokemon" bingo only ever exercised
plain single-item tasks and `pointsRequirePrevious`. `TileTask` has a whole family of other flag
columns (`submitRequiresPrevious`, `requiresNoDuplicates`, `allowsPreviouslyAcquired`,
`allowsPreLoad`, `minSubmissions`, `requiresCompleteSet`) plus options-group items and wildcards
that were never touched by any test. New file: `e2e/special-tile-rules.spec.ts`, its own bingo
(slug `special-rules`), separate from `full-flow.spec.ts`'s `pokemon` — same shared `e2e.db` (one
`prepare-db.cjs` run serves both spec files), no signup questions, no buy-in, **no lines generated
at all** (deliberately — Phase E5 already showed how fast line-bonus math gets away from you on a
sparse board; this phase's whole point is per-task mechanics, so lines are just noise here). One
captain (`e2e-p4`, RSN "RuleTester") is also the team's only member — captain creation via
`createTeam` auto-adds the captain as a `teamMembers` row, so no draft is needed; `advanceStage`
has no draft-completeness gate either, so the draft/reveal stages are just clicked through empty.
Five tiles, one mechanic-cluster each:

- **Barrows** (`requiresCompleteSet` + an options group, plus `requiresNoDuplicates` for its badge)
  — one task, 8 items across two 4-item groups ("ahrim"/"dharok"). Submit+approve 3 of 4 Ahrim
  pieces → still 0 points (a partial set isn't a complete set). Approve the 4th → 30 points.
- **K'ril Tsutsaroth** (`minSubmissions: 2` + an options group) — one task, 3 items in one group.
  Submit+approve one item → still 0 points even though the group's item requirement is technically
  satisfied already (`evaluateTaskCompletion` gates on `approvedSubmissionCount` independently of
  the item tally — mirrors `scoringService.test.ts`'s own "gates on minSubmissions even when the
  item tally is already satisfied" case). Submit+approve a second, different item → 25 points.
- **Cerberus** (`allowsPreviouslyAcquired` folding + a wildcard capped at the schema default of 1
  redemption/team) — Part A (single item, `allowsPreLoad`), Part B (`allowsPreviouslyAcquired`,
  `minSubmissions: 2`, same single item). Submit Part A *with* the wildcard → approve → 25 points,
  wildcard usage 1/1. Submit Part B *with* the wildcard too (a second redemption, different task —
  the wildcard's `applicableTaskId` is left null/"Any task", and the admin item-creation UI has no
  field for `maxRedemptionsPerTeam` or item `quantity` at all, so this whole tile's design works
  around the schema defaults rather than chosen values) → the *submission* succeeds, but admin's
  *approval* is rejected server-side ("Cerberus jar has already been redeemed the maximum number of
  times for this team", surfaced in `ReviewQueue`'s own error banner) → reject that stuck
  submission → submit Part B for real (no wildcard) → approve → Part A's already-approved claim
  folds in via `allowsPreviouslyAcquired`, satisfying both the qty and the 2-submission minimum →
  40 points. Cerberus total: 65.
- **Colosseum** (`hasFreezePeriod`, negative path only) — one task, tile frozen for 120 minutes
  from a `startsAt` set to 10 minutes before the test runs it (bingo has "started" for every other
  tile, Colosseum specifically hasn't unfrozen). No positive freeze-unlock path is tested — that
  would mean actually waiting out a 2-hour timer, and the arithmetic boundary itself already has
  its own coverage elsewhere (`submissionService.ts`'s `now < unlockAt`). Both UI entry points
  already exclude the tile (`TileCell`'s 🔒 badge + disabled `TileModal` submit button; the header
  Submit's tile picker doesn't list it at all) — asserted, then a **raw `page.request.post` bypassing
  the UI entirely** proves the *server* itself rejects it too (400, message matches `/frozen/`),
  which is the actual point of the check per `submissionService.ts`'s own header comment ("the
  client mirrors these checks for UX, but this is the enforcement").
- **Duke Sucellus** (`submitRequiresPrevious`) — same shape as Colosseum's freeze check but for the
  chain gate: Part B is excluded from both UI entry points before Part A completes, and a raw API
  POST against Part B's task id is independently rejected (400, `/previous task/`). Then the
  positive path: complete Part A (20 pts) → Part B becomes available with no task picker (the only
  remaining option) → complete it (30 pts). Duke Sucellus total: 50.

Grand total: 30 (Barrows) + 25 (K'ril) + 65 (Cerberus) + 50 (Duke Sucellus) = **170 pts** — the
whole suite's final assertion, spot-checked directly in `e2e.db` (`team_task_progress` sums to
170 across exactly 6 rows, `team_wildcard_usage` has exactly 1 row despite 2 redemption attempts).

**Two real app bugs found and fixed, not test bugs:**
- **`SubmissionModal.tsx`'s "Submit with a wildcard" checkbox permanently disabled the submit
  button for any single-item task.** Checking it clears `selectedItemId` (switching the item
  picker's label between "what are you submitting?" and "which item does the wildcard count
  towards?"), but the effect that auto-selects the sole item for a single-item task only depends on
  `[selectedTaskId, currentTask]` — toggling the checkbox changes neither, so the effect never
  re-fires, and the item picker is `readOnly` for a single-item task (no way to manually reselect
  either). Net effect: wildcard + single-item task = permanently disabled "Submit for Review",
  full stop, no escape via the UI. Caught because Cerberus's wildcard-eligible tasks are realistic
  single-item ones (matches the real ruleset's own boss-jar wildcards). Fixed by adding
  `isWildcardMode` to that effect's dependency array. Test hung at the exact button-disabled state
  for the full 180s timeout before this was diagnosed — same "silent timeout, no other error"
  failure shape as the Phase E3 required-asterisk gotcha; screenshot showed a perfectly normal-
  looking form, so the cause had to be traced through the component's state logic, not the DOM.
- **`TileModal.tsx`'s own close button (`✕`) had no `aria-label`**, unlike every other modal's close
  button in this codebase (`ModalHeader`'s already got one from Phase E2). Not a functional bug,
  but a real accessibility gap and the reason `getByRole("button", { name: "Close" })` — which
  correctly closes every *other* modal — silently hung here instead of erroring.

**Real gotchas hit (test-side, no app changes):**
- **`TaskEditor.tsx`'s flag checkboxes and `TileEditorPanel.tsx`'s freeze-period checkbox are all
  DB-backed** (patch + query-invalidate on change), so every one of them needed the same
  `.click()` + separate `toBeChecked()` fix from Phase E2/E3 — a plain `.check()` raced the
  round-trip on all six.
- **An item with an options group renders as `"Ahrim's hood (group: ahrim)"`**, not just the item
  name — `getByText(item, { exact: true })` after adding an item never matched; dropped `exact`
  for every item-added assertion in this file.
- **RSN has a real `maxLength={12}`** (matches OSRS's actual limit) — "SpecialTester" (13 chars)
  silently truncated to "SpecialTeste", which then made the captain-assignment dropdown option
  label not match anything and time out. Renamed to "RuleTester".
- **Once a task becomes unavailable (completed, or the only one left), `SubmissionModal` stops
  rendering a task-picker button for it at all** — no button to *not* find, just a "Submitting for
  X" text indicator instead. Every later resubmission to a tile with a since-completed sibling task
  needed `pickTileAndTask(page, tileName)` with no task-label argument, not the task label from the
  first submission to that tile.
- **A bare string in Playwright's `multipart` option is sent as a text field, not a file** — the
  raw-API freeze/chain-gate checks first failed with "Screenshot is required" (multer's `req.file`
  never populated) until the screenshot field became an explicit
  `{ name, mimeType, buffer: readFileSync(...) }`.
- **The bare `request` fixture doesn't share cookies with `page`** — only `page.request` does (same
  browser context). The first raw-API attempt got 401s until every `getTaskId`/`rawSubmit` call
  switched from the test's `request` fixture to `page.request`.

**DoD E7 — met:** suite green (both spec files together), fresh and re-run twice (idempotent).
Spot-checked `e2e.db`: `team_task_progress` sums to exactly 170 across 6 rows for the one team,
`team_wildcard_usage` has exactly 1 row. `npm run test --workspace=server` (126 tests) and both
`tsc --noEmit` still green.

## 9. Verification discipline

- After each phase: `npm run test:e2e` twice in a row (setup must be idempotent), plus the unit
  suite `npm test` and both typechecks (`node node_modules/typescript/bin/tsc --noEmit` in
  `server/` and `client/` — root has no typecheck script).
- Flake policy: no arbitrary `waitForTimeout`; wait on visible UI state (`expect(...).toBeVisible()`,
  `toPass()`), since mutations invalidate TanStack Query caches and re-render.
- If a step can't find a control, read the component source (paths are given above) before
  inventing selectors — and prefer adding an `aria-label` over a test id if the DOM is genuinely
  unreachable.
