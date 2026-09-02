# E2E UI Testing Plan — Playwright full-flow coverage

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

## 4. Phase E3 — Signups, buy-ins, captains, teams

1. For each of `e2e-p1`…`e2e-p5`: log in (reuse the page — `loginAs` switches the session
   in-place; reload after), goto `/b/pokemon`, fill the signup form (free-text RSN — use
   `Trainer1`…`Trainer5`; answer the required select; p1 and p2 answer "Willing to captain?" yes)
   and submit. Assert the "Saved!"/edit state.
2. One negative check: p1 opens the form again and sees the edit state, then withdraws and
   re-signs up (exercises withdraw + the "already signed up" unique constraint is NOT hit through
   the UI — re-signup after withdraw is blocked by the DB design, so instead just cancel the
   withdraw confirm; keep this small).
   ⚠️ If withdraw-then-resignup turns out to be impossible by design (unique `(bingoId, userId)`
   even for withdrawn rows), don't fight it — assert the withdraw confirm dialog works and cancel.
3. As `e2e-admin` in the mod panel Signups tab: mark buy-in received for all 5 (checkbox toggles
   freely; "who collected it" search is a separate column), assert the pot total on the Settings
   tab or bingo header reflects 5 × 10M + 50M.
4. Advance signup → captains. Teams tab: the captain picker is a `<select>` of signed-up
   candidates with a team-size summary line. Create 2 teams with p1 and p2 as captains.
5. Advance captains → draft.

**DoD E3:** suite green; Teams tab shows 2 teams; 3 undrafted players remain.

## 5. Phase E4 — The draft

Screens: `/b/pokemon/draft` (`client/src/core/draft/DraftRoom.tsx`). The draft is snake order;
teams' captain RSNs head per-team columns; the pool is a sortable table (no WOM/RuneProfile stat
columns will render — stats fetch is disabled, `womStats`/`accountType` are null, and the columns
hide themselves when nobody has data; assert they're absent as a bonus).

1. As admin: open the draft room, click "Start Draft" (needs ≥2 teams).
2. Determine who's on the clock from the "▼ On the clock" indicator. Log in as the OTHER captain
   and assert no pick is offered (out-of-turn captains simply don't get pick buttons —
   `canPick` gating; assert no "Draft" button in the pool table).
3. As the on-the-clock captain: assert the "It's your turn to pick!" banner, draft a player.
4. Alternate captains (snake order: with 2 teams the order is A, B, B, A —
   `pickOrderTeamIndex`) until all 3 players are drafted. Assert "Draft complete!" renders.
5. Site-admin override sanity check: at least one of the picks in step 4 should be made while
   logged in as `e2e-admin` (admins may pick on behalf of the team on the clock).
6. As admin: advance draft → reveal → live (two advances; the reveal stage exists between).

**DoD E4:** suite green; both teams have captain + at least 1 member; stage is "Live".

## 6. Phase E5 — Submissions and scoring

Screens: board at `/b/pokemon`, tile modal, SubmissionModal
(`client/src/core/submissions/SubmissionModal.tsx` — the file input is hidden
(`className="hidden"`); Playwright's `setInputFiles` on `input[type="file"]` works on hidden
inputs, or use the drag-drop zone), mod review queue (mod panel Submissions tab).

1. As a drafted player (e.g. p3): open the board, click "Wintertodt", submit via the tile/submit
   flow — select the "Bruma torch" item (it should auto-select as the only item), attach
   `e2e/fixtures/screenshot.png`, submit. AI analysis is disabled (no ANTHROPIC key) — the modal
   must not block on it; assert the submission lands (modal closes / pending indicator).
2. As admin: Submissions tab → Pending shows the Wintertodt submission with a thumbnail. Expand,
   approve (leave notes blank). Assert it moves to Approved.
3. Back as the player (reload is fine; observing the WebSocket-driven live update without reload
   is Phase E6): the Wintertodt tile shows complete and the team's points show 20.
4. Rejection path: p3 submits "Vorkath" Part A; admin rejects it with a note; player sees the
   tile NOT complete and can see rejection state in their team submissions view.
5. Manual-scoring path: p3 submits "GOTR Speedrun" (no item list); admin approves — manual tasks
   require the mod to explicitly mark task completion / points on approval (see the review UI and
   `scoringService`'s `taskCompleted` handling). Assert 20 more points land.
6. Withheld-points path (bonus, cheap to add): submit and approve Vorkath Part B *before* Part A
   is complete — its points must stay withheld (team total unchanged), then complete Part A and
   assert both land per the `pointsRequirePrevious` rule. Only do this if the earlier steps left
   Vorkath Part A un-approved; otherwise skip.

**DoD E5:** suite green; final team points assertion matches the sum of exactly the approved,
non-withheld tasks.

## 7. Phase E6 — Stretch (only after E1–E5 are green)

- **Line bonus:** complete all 3 row-0 tiles for one team and assert +15 line points appear.
- **Live WS update:** open two pages in one test — player's board and admin's review queue —
  approve on one, and `expect(...).toPass()` the points update on the other WITHOUT reload.
- **CI wiring** (GitHub Actions) — out of scope unless asked; the suite must merely be CI-shaped
  (no reliance on pre-existing local state).

## 8. Verification discipline

- After each phase: `npm run test:e2e` twice in a row (setup must be idempotent), plus the unit
  suite `npm test` and both typechecks (`node node_modules/typescript/bin/tsc --noEmit` in
  `server/` and `client/` — root has no typecheck script).
- Flake policy: no arbitrary `waitForTimeout`; wait on visible UI state (`expect(...).toBeVisible()`,
  `toPass()`), since mutations invalidate TanStack Query caches and re-render.
- If a step can't find a control, read the component source (paths are given above) before
  inventing selectors — and prefer adding an `aria-label` over a test id if the DOM is genuinely
  unreachable.
