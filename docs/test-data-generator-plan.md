# Test data generator: implementation plan

Status: **approved plan, ready to implement.** Written to be executed without
conversation context. The requirements are in
`docs/test-data-generator-requirements.md`; this is how they get built.
`docs/audit-log.md` explains the audit log the generator has to feed, and
`CONTEXT.md` the vocabulary (tile, part/task, requirement, claim, line).

## What is being built

A CLI, run against a locally running dev server, that imports the real
board (`tectonic-comics-bingo-export.json` at the repo root), creates fake
users, signs them up, forms teams through the real draft, and then plays
the bingo forward through the **real HTTP endpoints** (submissions,
reviews, stage changes), with every action stamped at a realistic
spoofed time. Plus a teardown that removes everything it made.

```
npm run testdata -- --stage live --progress 0.5            # half way through a live bingo
npm run testdata -- --stage draft --seed 7                 # mid-draft, reproducible
npm run testdata -- --stage complete --me 123456789012345678
npm run testdata:teardown -- --slug testdata-20260919-1432 # or --all
```

## Decisions already made (do not re-open)

- Timestamps are spoofed with a dev-only request header, `X-Dev-Now`,
  honoured only when dev mode is on. Services read the request clock instead
  of `new Date()`. See Phase 1.
- Signups go through the real `POST /api/bingos/:slug/signup` endpoint, with
  the WOM/RuneProfile fetch turned off by env (`PLAYER_STATS_FETCH_DISABLED`)
  and the clan-membership check off by leaving `TECTONIC_API_URL` blank.
- OCR is skipped per request with a dev-only header, `X-Dev-Skip-Ocr: 1`
  (not by env), so a dev server with OCR on isn't slowed down by the
  generator but keeps OCR for manual submissions.
- Teams are formed through the **real draft**: captains' teams are created
  in the captains stage, the draft is started, and captains pick in turn
  (duo pairs are drafted together). `--stage draft` leaves the draft
  mid-way.
- Scale: **6 teams of 14** (84 players), 3 mods besides the site admin,
  a 9-day event.
- `--me <discordId>` puts that real user on a team (they sign up too) and
  makes them a mod.
- Generate raised hands on tiles (tile interests). Point adjustments: a
  couple per run at most (they are rare in practice). No bug reports.
- Teardown is a dev-only endpoint that deletes the bingo, its audit rows,
  its uploaded screenshots and any testbot users left on no other bingo,
  and refuses any slug that doesn't start with `testdata-`.
- CLI only; no UI.

## Facts this plan relies on (verified 2026-09-19)

- **Dev gate:** `process.env.NODE_ENV !== "production" && process.env.DEV_LOGIN_ENABLED === "true"`
  (`server/src/routes/auth.ts:36`, `routes/mod.ts:226`, `routes/me.ts:10`,
  `index.ts:191`). Dev-only routes are registered inside that `if`.
- **Dev login:** `POST /auth/dev-login { discordId }` logs the session in as
  any existing `users` row (`routes/auth.ts:46`); `GET /auth/dev-users`
  lists users except `dev-seed-%` ones. Auth routes are mounted at `/auth`,
  everything else at `/api/...`. The session is an `express-session` cookie
  (`index.ts:127`); the server listens on `PORT` (default 3001).
- **Import:** `POST /api/admin/bingos/import { slug, name?, document }`
  (`routes/siteAdmin.ts:52`) creates the bingo (with tile images), creator
  becomes a mod. Site-admin routes need `user.isAdmin`. The export is
  5×5: 25 tiles, 12 lines, no categories, no signup questions,
  `signupMode: "duo"`, no dates.
- **Board shape:** every tile has two parts, "Page 1" (40 pts) and "Page 2"
  (60 pts), plus a 20-pt full-tile bonus. 13 tiles submit-gate Page 2
  behind Page 1 (`submitGateNodeId`), 8 tiles have a 120-minute freeze
  (`hasFreezePeriod`, `freezeDurationMinutes`). Parts are `SUM`
  (quantity over ITEM leaves), `COUNT` (minCount distinct ITEM leaves,
  e.g. PETS with 61), or `ANY` (children may be composites). `GET
  /api/bingos/:slug/board` returns `{ tiles, lines }` with full node trees
  (`shared/src/index.ts` `Tile`, `GraphNode`, `BoardLine`).
- **Submission rules** (`server/src/services/submissionService.ts:37-130`):
  bingo must be live and started (`effectiveStartsAt`, `bingoStart.ts`);
  ≥1 claim; no duplicate leaf in one submission; claims must be leaves;
  **one tile per submission**; frozen tile rejected before
  `start + freezeDurationMinutes`; every ancestor's `submitGateNodeId`
  must already be complete for the team; ITEM claims need `itemName`
  equal (case-insensitive) to the leaf's. Route: `POST
  /api/bingos/:slug/submissions`, multipart, field `screenshot` (image,
  `middleware/upload.ts`) and field `claims` = JSON string of
  `{ nodeId, itemName?, quantity? }[]` (`routes/bingos.ts:187`). OCR then
  runs in the background when `isOcrEnabled()` (`routes/bingos.ts:228`).
- **Review:** `PATCH /api/bingos/:slug/mod/submissions/:id { action:
  "approve"|"reject"|"undo", reviewerNotes? }` (`routes/mod.ts:40`).
  Mod routes need the user to be a bingo mod (`bingoService.isBingoMod`).
  `GET /api/bingos/:slug/mod/submissions` lists all; `GET
  /api/bingos/:slug/teams/:teamId/progress` gives `nodeStates` (complete
  nodes) for gating decisions.
- **Stage:** `POST /api/bingos/:slug/mod/stage { toStage }`
  (`routes/mod.ts:104`); any order allowed, recorded in `stage_transitions`
  with `createdAt` (`bingoService.advanceStage`, takes `now`).
  `effectiveStartsAt` = `bingo.startsAt` or the last time it went live.
- **Settings:** `PATCH /api/bingos/:slug/admin/settings` accepts
  `startsAt`, `endsAt`, `signupOpensAt`, `draftScheduledAt`,
  `revealScheduledAt` (ISO strings) plus `leftoverMode`, `signupMode`
  (`routes/admin.ts:44`).
- **Signup:** `POST /api/bingos/:slug/signup { rsn, answers: [] }`
  (`routes/bingos.ts:307`). Calls `getTectonicMembership` (no-op when
  `TECTONIC_API_URL` is blank) and fire-and-forget
  `fetchAndPersistPlayerStats` (skipped when
  `PLAYER_STATS_FETCH_DISABLED=true`, `playerStatsService.ts:60`).
- **Duo pairing:** `POST /api/bingos/:slug/signup/pairing { targetDiscordId }`
  by the requester (both must have signed up), then the target `POST
  /api/bingos/:slug/signup/pairing/:pairingId/respond { accept: true }`
  (`routes/bingos.ts:416-456`). The pairing id comes back from the request.
- **Teams and draft:** `POST /api/bingos/:slug/admin/teams { captainUserId,
  coCaptainUserId?, name? }` (captain must have an active signup; co-captain
  must be their accepted partner), `POST /api/bingos/:slug/mod/draft/start`,
  then `POST /api/bingos/:slug/draft/pick { userId }` **as the captain of the
  team on the clock** (`draftService.makePick`; picking either half of a pair
  drafts both; site admins may pick for the current team). Pick order:
  `draftService.pickOrderTeamIndex(teamCount, pickNumber)` (snake).
  Leftovers per `bingo.leftoverMode`. `GET /api/bingos/:slug/draft` gives
  the draft state (pool, whose turn). Team names: `PATCH
  /api/bingos/:slug/teams/:teamId { name }` by the captain, before live.
- **Mods:** `POST /api/bingos/:slug/admin/mods { userId }`.
- **Hands:** `PUT /api/bingos/:slug/tiles/:tileId/tasks/:taskId/interest
  { interested }` by a team member, reveal or live only.
- **Adjustments:** `POST /api/bingos/:slug/mod/teams/:teamId/adjustments
  { amount, reason }`.
- **Delete:** `DELETE /api/admin/bingos/:id` → `bingoService.deleteBingo`
  (`bingoService.ts:177`), which removes every row hanging off the bingo
  but **not** `audit_log` rows, uploaded files, or users.
- **Timestamps today:** 21 columns default to `unixepoch()` in
  `server/src/db/schema.ts` (grep `unixepoch`), and services call
  `new Date()` in 22 places (grep in `server/src/services`,
  `server/src/audit/record.ts:73`). `audit()` and `advanceStage` /
  `createSubmission` already accept a `now`. The per-request
  `AuditContext` lives in AsyncLocalStorage
  (`server/src/audit/context.ts`), opened by `auditContext` middleware
  (`server/src/audit/middleware.ts:11`) for every request.
- **Route coverage test:** every non-GET `/api/*` route must be in
  `AUDITED_ROUTES` (`server/src/audit/routePolicy.ts`) or `auditSkip()`'d
  (`server/src/audit/routeCoverage.test.ts`). `/auth/*` routes are not
  under `/api` and are not checked.
- A placeholder screenshot exists: `e2e/fixtures/screenshot.png`.
- The E2E suite is deferred (`docs/e2e-testing-plan.md`): don't run or fix it.

---

## Phase 1 — a request clock the dev tools can set

### 1a. `server/src/clock.ts`

```ts
import { getAuditContext } from "./audit/context";
/** The current time for this request: the dev-only X-Dev-Now override when one is set, else the real clock. */
export function now(): Date {
  return getAuditContext()?.now ?? new Date();
}
```

Add `now?: Date` to `AuditContext` (`audit/context.ts`). In
`auditContext` middleware (`audit/middleware.ts`), when the dev gate is on
and the request has an `X-Dev-Now` header: parse it as ISO 8601; on an
invalid date respond `400 { error: "X-Dev-Now must be an ISO date" }`;
otherwise set `ctx.now`. Outside dev mode the header is ignored (never an
error). Export the dev-gate check as one function,
`isDevModeActive()` in `server/src/devMode.ts`, and use it in the four
places that currently inline the check (`auth.ts:36`, `mod.ts:226`,
`me.ts:10`, `index.ts:191`).

### 1b. Use it

Replace `new Date()` with `now()` (import from `../clock`) in every
service under `server/src/services` and in `audit/record.ts:73`
(`input.now ?? now()`), **except** `bingoExportService.ts:135`
(`exportedAt` is metadata, leave it). Where a function already takes a
`now` param (`advanceStage`, `createSubmission`), keep the param and
default it to `now()`.

Then stop relying on the DB default for the columns the generator writes.
For each insert below, pass the timestamp explicitly (`createdAt: now()`
etc.). Find each one with `grep -n "\.insert(<table>)"` in `services/`:

| table | columns to pass |
|---|---|
| `signups` (`signupService.ts:181`) | `createdAt`, `updatedAt` |
| `signupPairings` (`pairingService.ts:210, 286`) | `createdAt` |
| `teams` (`teamService.ts:243`) | `createdAt` |
| `teamMembers` (`teamService.ts:247, 248, 319`, `draftService.ts:294`) | `joinedAt` |
| `draftPicks` (`draftService.ts:292`) | `createdAt` |
| `tileInterests` (`teamService.ts:117`) | `createdAt` |
| `submissions` (`submissionService.ts:103`) | `submittedAt`, `createdAt`, `updatedAt` |
| `submissionScreenshots` (`submissionService.ts:108`) | `uploadedAt` |
| `teamPointAdjustments` (`teamService.ts:142`) | `createdAt` |
| `bingoModerators` (`bingoService.ts:121, 239`) | `createdAt` |
| `users` (Phase 2's dev route only) | `createdAt`, `updatedAt` |

Check each table's column names in `schema.ts` before writing; the list
above is from the schema as of today. `updatedAt` on updates (signups,
submissions, teams) should also use `now()`.

### 1c. Tests

- `server/src/clock.test.ts`: `now()` returns the override inside
  `runWithAuditContext({ ..., now: fixed })` and the real time outside.
- `server/src/audit/middleware.test.ts`: with the dev gate on, a request
  with `X-Dev-Now: 2026-01-05T10:00:00Z` records audit rows at that time
  and a submission created in it has `submittedAt` equal to it; with the
  gate off the header is ignored; a garbage value is a 400. Set
  `process.env.DEV_LOGIN_ENABLED` / `NODE_ENV` inside the test and restore
  them after (see how `auth.ts`'s gate is exercised in existing tests, or
  stub `isDevModeActive` with `vi.mock`).
- Existing service tests that assert `createdAt`/`submittedAt` are "about
  now" must still pass.

Commit: `Add a per-request clock that dev tools can set`.

---

## Phase 2 — dev-only routes the generator needs

All inside the existing dev-gate `if` blocks (or a new
`server/src/routes/dev.ts` mounted at `/api/dev` only when
`isDevModeActive()`; do that, it keeps the gate in one place). Add every
new non-GET route to `AUDITED_ROUTES` with the actions it records, or
`auditSkip("dev tooling")` when it records nothing.

1. **Create a user:** `POST /api/dev/users { discordId, discordUsername,
   discordGlobalName?, discordAvatar? }` → 201 `{ user }`; 409 if the
   discordId exists. Inserts a `users` row (`inGuild: true`, `isAdmin:
   false`, timestamps via `now()`). Audit: `auditSkip` (site-level, no
   bingo; the seed tool doesn't audit user creation either).
2. **Skip OCR:** in `routes/bingos.ts:228`, run the background OCR only
   when `isOcrEnabled() && !(isDevModeActive() && req.header("x-dev-skip-ocr") === "1")`.
3. **Teardown:** `DELETE /api/dev/bingos/:slug` (site admin only, reuse
   `requireAdmin` from `siteAdmin.ts`). Refuses (400) unless the slug
   starts with `testdata-`. In one transaction, after collecting what to
   remove:
   - the storage URLs of every `submission_screenshots` row of the bingo,
     and every tile `imageUrl`, that live under `/uploads/`;
   - the set of user ids that are members of this bingo's teams or have a
     signup on it whose `discordId` starts with `testdata-` (Phase 3's
     prefix);
   - then `bingoService.deleteBingo(tx, id)` (make it accept a `Tx`; it is
     called with `db` today), `DELETE FROM audit_log WHERE bingo_id = ?`,
     and delete those testbot users **only if** they have no team
     membership or signup on any other bingo (and no audit rows as actor
     elsewhere, `audit_log.actor_user_id`, after the bingo's rows are
     gone).
   After the transaction, unlink the collected files (and their image
   variants: look at `middleware/imageVariants.ts` for the naming) and
   ignore missing ones. Respond `{ deleted: { users, files } }`. Audit:
   `auditSkip` (the bingo's log is gone with it; write one
   `console.info`).
   Also add `GET /api/dev/bingos` listing bingos whose slug starts with
   `testdata-` (id, slug, name, stage, createdAt) for `--all`.

Tests (`server/src/routes/dev.test.ts`, on an in-memory DB via
`createTestDb` from `server/src/testUtils/testDb.ts`; drive the handlers
the way `server/src/audit/middleware.test.ts` drives its middleware, with
stubbed `req`/`res` rather than a network socket): user create + conflict;
OCR skipped when the header is present; teardown refuses a non-prefixed
slug, removes bingo + audit rows + orphaned testbots, keeps a testbot that
is on another bingo, and returns the file list.

Commit: `Dev-only routes for the test data generator`.

---

## Phase 3 — the CLI: through the stages

Location: `server/scripts/testdata/` (TypeScript, run with `tsx`).
Add to `server/package.json`:

```json
"testdata": "tsx scripts/testdata/generate.ts",
"testdata:teardown": "tsx scripts/testdata/teardown.ts"
```

and to the root `package.json`: `"testdata": "npm run testdata --workspace=server --"`,
`"testdata:teardown": "npm run testdata:teardown --workspace=server --"`.

### Files

- `generate.ts`: arg parsing, orchestration, progress output.
- `teardown.ts`: `--slug <slug>` or `--all`; lists then deletes via the
  Phase 2 routes; prints what went.
- `client.ts`: a tiny HTTP client over Node's `fetch` with **one cookie
  jar per user** (`Map<discordId, cookie>`): `loginAs(discordId)` posts
  `/auth/dev-login` and stores the `set-cookie` value; `as(discordId).get/post/patch/put/delete(path, body?)`
  sends the cookie, `X-Dev-Now` (from the simulation clock, see below) and
  `X-Dev-Skip-Ocr: 1`; throws on non-2xx with the response body in the
  message. `upload(path, fields, file)` builds a `FormData` with a `Blob`
  from `e2e/fixtures/screenshot.png`.
- `rng.ts`: a seeded PRNG (mulberry32 over `--seed`, default a random
  seed that is printed so a run can be repeated) with `float()`,
  `int(a,b)`, `pick(arr)`, `weighted(pairs)`, `shuffle(arr)`,
  `normal(mean, sd)`. **All randomness goes through it.**
- `timeline.ts`: the dates, from `--stage`, `--progress` and `--days`.
- `people.ts`: fake users, skills, activity windows, mods.
- `board.ts`: reads the board and derives per-tile/part difficulty and
  claim plans (Phase 4 uses it; Phase 3 needs it only for hands).
- `simulate.ts` (Phase 4).

### Options

| option | default | meaning |
|---|---|---|
| `--stage` | `live` | one of `signup`, `captains`, `draft`, `reveal`, `live`, `complete` |
| `--progress` | `0.5` | live only: fraction of the event elapsed, 0–1 |
| `--days` | `9` | event length |
| `--teams` | `6` | |
| `--team-size` | `14` | |
| `--mods` | `3` | mods besides the admin |
| `--me` | none | a real user's discordId to sign up, draft onto a team and make a mod |
| `--admin` | first `isAdmin` user from `GET /auth/dev-users` | the site admin who imports and administers |
| `--seed` | random | PRNG seed (printed) |
| `--base` | `http://localhost:3001` | server URL |
| `--slug` | `testdata-<yyyymmdd-hhmm>` | must start with `testdata-` |
| `--dry-run` | off | print the timeline and counts, make no requests |

Before doing anything, `GET /auth/me` as the admin must report
`devMode: true`, else exit with: "start the server with
DEV_LOGIN_ENABLED=true PLAYER_STATS_FETCH_DISABLED=true
WOM_COMPETITION_SYNC_DISABLED=true TECTONIC_API_URL= (blank)". The script
can't see the server's env, so also print that reminder at startup.

### The timeline (`timeline.ts`)

`D = --days` in ms. `start` and `end` depend on `--stage`:

| stage | start | end | "now" of the run is |
|---|---|---|---|
| `live` | `now − p·D` | `start + D` | mid-event |
| `complete` | `now − D − 1d` | `start + D` | a day after the end |
| `reveal` | `now + 2d` | `start + D` | between reveal and start |
| `draft`, `captains`, `signup` | `now + 5d` | `start + D` | before the draft |

Pre-live moments, relative to `start`: signups open `start − 21d`
(`signupOpensAt`), captains stage `start − 5d`, draft `start − 3d`
(`draftScheduledAt`; the draft itself takes about 2 hours), reveal
`start − 2d` (`revealScheduledAt`), live at `start`, complete at
`end + 1h`. Signups arrive over the signup window front-loaded
(about 50% in the first two days, a long tail after). Stage changes are
sent with `X-Dev-Now` at those moments. Settings (`startsAt`, `endsAt`,
and the three scheduled dates) are set once via the settings PATCH right
after the import, at the "bingo created" time (`start − 28d`).

For a stage before `live`, the run stops at that stage: `signup` stops with
~60% of the signups in; `captains` with every signup in and the captains'
teams created (no draft); `draft` mid-draft with about half the picks made;
`reveal` fully drafted, reveal done.

### People (`people.ts`)

- Users are created via `POST /api/dev/users` with `discordId =
  testdata-<slug-suffix>-<n>` and OSRS-style usernames (build a pool of
  ~150 names from two word lists, e.g. adjective + noun, deterministic via
  the PRNG) and no avatar. `--me` is not created; it is logged in as is.
- Every player has a `skill` in 0–1 (`normal(0.5, 0.2)` clamped), an
  `activity` in hours/day (`normal(3, 1.2)` clamped to 0.5–8), and an
  `offset` in hours (their timezone/schedule, mostly −6..+2 from UTC,
  a few Australians at +10) used by the diurnal curve: active mainly
  17:00–01:00 local, some 12:00–17:00, almost nothing 02:00–09:00.
- Mods: `--mods` players are also made mods (`POST .../admin/mods`), plus
  `--me`. Each mod has a schedule: two or three review windows a day
  (e.g. 08:30, 13:00, 22:30 local) and reviews in batches (Phase 4).
- Duo: ~60% of players are paired: pair them up, requester posts the
  pairing, partner accepts, each a few minutes after the later of the two
  signups.
- Signup count = `teams × teamSize + 4`; with the export's `leftoverMode`
  the 4 extra are left over. (Sign up `--me` first if given.)

### Captains, draft, teams, reveal

- Captains stage: pick `--teams` captains: the highest-skill unpaired
  players, or a paired player with their partner as co-captain (mix both).
  `POST .../admin/teams` for each (no name yet). Teams get names in the
  reveal stage from the captain (`PATCH /teams/:id { name }`), from a
  list of comic-flavoured names.
- Draft: as the admin `POST .../mod/draft/start`, then loop: `GET
  /api/bingos/:slug/draft` for whose turn and the pool; the captain on the
  clock picks (`POST .../draft/pick { userId }`) with a spoofed time about
  30–120 s after the previous pick. Captains prefer higher skill with some
  noise (they can't see skill; use `skill + normal(0, 0.25)`), and the
  admin makes a pick on a captain's behalf now and then (2–3 per draft) to
  exercise that path. Stop when the pool (minus leftovers) is empty, or
  half way for `--stage draft`.
- After reveal, hands: each team raises 10–25 hands across parts they
  intend to do (players on tiles that suit their skill), spread over the
  reveal window, a few of them lowered again later.

### Output

Print each phase with counts and the spoofed date range, and at the end:
the slug, the seed, the admin and (if given) `--me`, and the teardown
command. `--dry-run` prints the timeline table and counts only.

Commit: `Test data generator: import, people, signups, draft, reveal`.

---

## Phase 4 — playing the live bingo (`simulate.ts`, `board.ts`)

### Difficulty (`board.ts`)

Hand-tuned per tile: `effort` = expected player-hours a capable player
needs for Page 1, and `eligible` = the share of players who can do it at
all. Page 2 costs `× 2.5` effort and `× 0.6` eligibility unless overridden.

| tile | effort h | eligible | note |
|---|---|---|---|
| SLAYER BOSSES, WILDY ISSUE 1, WILDY ISSUE 2, BLOOD SHARDS (COMBAT ONLY), DAGANNOTH KINGS | 3 | 0.95 | everyone can |
| ZULRAH, GAUNTLET, GWD ISSUE 1, GWD ISSUE 2, HUEYCOATL, DT2 ISSUE 1 | 5 | 0.8 | |
| DT2 ISSUE 2, DOUBLE FEATURE, YAMA, NIGHTMARE | 8 | 0.55 | |
| PETS | 6 | 0.7 | COUNT: many small drops |
| COX ISSUE 1, TOA ISSUE 1, TOB ISSUE 1 | 6 | 0.6 | raids; 2h freeze |
| COX ISSUE 2, TOA ISSUE 2, NEX, DOOM OF MOKHAIOTL | 10 | 0.4 | |
| TOB ISSUE 2 | 10 / Page 2: 40 | 0.4 / Page 2: 0.12 | Page 2 needs a Scythe or hard mode |
| COLOSSEUM | 8 | 0.35 | |

Match by tile name (case-insensitive); an unknown tile gets `5 / 0.7`
and a warning. Per player `eligible` is rolled once per part
(`rng.float() < eligible × (0.5 + skill)`, clamped), so a team's
capable subset is fixed for the run.

### Claim plans

`planPart(part)` returns the ordered list of submissions (each: one tile,
1–2 claims) that would complete a part, from the node tree:

- `ITEM` leaf → one claim `{ nodeId, itemName, quantity: 1 }`.
- `SUM(quantity)` → claims on its ITEM children, cycling through them with
  quantities of 1 (occasionally 2–3 for stackables) until the sum reaches
  `quantity`.
- `COUNT(minCount)` → `minCount` distinct ITEM children, one claim each.
- `ANY` → the cheapest child by the part's effort table (an ITEM child is
  one claim; a composite child recurses). For TOB ISSUE 2 Page 2 that is
  the hard-mode SUM for most, the Scythe ITEM for a few.
- `ALL` → every child in order.
- `MANUAL` → one claim `{ nodeId }`.

Submissions from one plan are spread over the part's effort in player-hours,
with a little jitter, and each is made by one of the part's capable
players on that team.

### The team's strategy

Every simulated hour, for each team, each active member (per the diurnal
curve and their activity budget) contributes `skill × 1h` of effort to the
team's **current target part**, chosen per player by score:

- base 1;
- +3 if it's Page 2 of a tile whose Page 1 is complete (chasing the tile
  bonus), +1.5 if Page 1 is pending review;
- +2 per line the tile would complete if finished, +0.7 per line it would
  bring to one-tile-from-done (use `board.lines` and team progress);
- ×`teamPref[tile]` (each team draws a preference in 0.6–1.6 per tile at
  the start: different teams push different tiles);
- ×0 if the player isn't capable of it, if the tile is frozen right now,
  if Page 2 is submit-gated and Page 1 isn't approved yet, or if the part
  is done or already pending.

When the accumulated effort on a part reaches the next submission's cost,
that submission is posted with `X-Dev-Now` at that hour plus minutes
jitter, by that player. Everything a team does is capped by its own
target: at the start each team draws `finalCompletion` in 0.55–0.95 of all
parts; effort scales by `finalCompletion` so that by `end` the team lands
near it, and by `now` (progress `p`) near `p × finalCompletion`, with the
better teams (higher mean skill) slightly ahead.

### Mods

Every simulated hour, each mod whose local time is inside one of their
review windows (and with probability 0.8 that they actually show up)
reviews **all pending submissions** in one batch, oldest first, spaced
20–90 s apart. Result: pending piles up overnight and gets cleared in
bursts. Approvals ≈ 97%. Rejections: in the first 24 h of the event, 20%
of a player's first submission is rejected with `reviewerNotes` "Codeword
not visible in the screenshot, please re-submit with it showing"; the
player re-submits the same claims 10–60 min later. After day one,
rejections are 1% with a note from a short list ("Wrong item", "Can't see
the drop", "Duplicate of an earlier submission"). One undo per run
(`action: "undo"` then re-approve, a few minutes apart) to exercise it.

After every review batch, refresh each affected team's progress (`GET
.../teams/:teamId/progress`) so gating and line logic use the server's
truth, not the script's guess.

### Adjustments

With probability 0.5 per run, one adjustment: `+15` to a random team,
reason "Bonus: best screenshot of the day", by a random mod, at a random
hour. Never more than two.

### Ending

For `--stage live`, stop the loop at `now`. Submissions posted in the last
few simulated hours may be left pending (realistic). For
`--stage complete`, run to `end`, let mods clear the queue over the next
hour, then advance to `complete` at `end + 1h`.

### Sanity check at the end

As the admin, fetch `GET /api/bingos/:slug/stats` (or each team's
progress) and print per team: parts done, points, pending. Assert that no
team exceeds its `finalCompletion` by more than 10 percentage points and
that every submission time is within `[start, now]`; fail loudly
otherwise (a bug in the simulation, not the app).

Commit: `Test data generator: play the live bingo`.

---

## Phase 5 — docs and scripts

- `docs/test-data-generator.md`: how to run it (the env line, the
  commands, options table, what `--me` does, how to tear down), what is
  and isn't realistic, and how to tune the difficulty table.
- `README.md`: one line under development pointing at that doc.
- `.env.example` (server): add the four dev-only variables with comments.

Commit: `Document the test data generator`.

---

## Must not change

- Nothing in this plan may run when the dev gate is off: no header is
  honoured, no dev route exists, `isDevModeActive()` is the single check.
- Production timestamps: with no `X-Dev-Now`, `now()` is `new Date()`;
  every existing test keeps passing.
- `bingoService.deleteBingo` keeps its behaviour for the site-admin route
  (audit rows are kept there; only the dev teardown deletes them).
- Real signups still fetch stats and check membership unless the env says
  otherwise; the generator only sets request headers, never env.
- The export file is read, never written.
- Don't touch the E2E suite.

## Verification

```
cd server && ../node_modules/.bin/tsc --noEmit && ../node_modules/.bin/vitest run
```

Then, with the dev server running (`npm run dev` at the root, server env
as printed by the script):

```
npm run testdata -- --stage live --progress 0.5 --seed 1
npm run testdata -- --stage live --progress 0.5 --seed 1   # second run: a different slug, same numbers
npm run testdata -- --stage draft --seed 2
npm run testdata -- --stage complete --seed 3
npm run testdata:teardown -- --all
```

Check by hand: open the live bingo as `--me` (dev login) and as a mod —
the board shows a plausible spread, the mod queue has a small overnight
pile, the team dialog's activity feed reads in order with realistic
times, the audit tab has no `http.mutation` rows for the generator's
requests, and after teardown `GET /api/dev/bingos` is empty, the
`uploads/` folder has no generator files, and the audit tab of another
bingo is untouched.

## Acceptance

- A single command produces a bingo at any stage with the requested
  progress, reproducibly for a given seed, in under ~5 minutes for a full
  live run.
- Every generated row went through a real endpoint; timestamps are spread
  realistically over the event and the audit log reads like a real one.
- Teardown removes everything the run created and nothing else.
