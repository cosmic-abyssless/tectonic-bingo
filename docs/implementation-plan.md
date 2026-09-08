# Bingo Platform — Implementation Plan

> Historical record of the v1→v2 phased build-out below (Phases 1-8, all done). Its
> tile-task data model (`tile_tasks`/`tile_task_items`, flags like `requiresCompleteSet`,
> `minSubmissions`, `allowsPreviouslyAcquired`) was superseded first by PR #2's
> requirement-tree model (`docs/data-model-proposal.md`), then by the node-graph model
> (`docs/node-graph-model.md`) — the schema and scoring-engine sections here predate both
> and no longer describe the live code. Kept as-is (not rewritten) since it's a phase
> log, not a living spec; `server/src/db/schema.ts` and `docs/node-graph-model.md` are
> authoritative for the current model.

This plan turns the single-event Pokémon bingo tracker into a generic, multi-bingo platform per `docs/abstraction-plan.md`. It is written to be executed phase-by-phase by an implementing agent. **Do not skip ahead**: each phase has a Definition of Done (DoD) that must pass before starting the next.

## Decisions already made (do not re-litigate)

| Decision | Choice |
|---|---|
| Rebuild vs. build-on | Keep the repo and stack; rewrite the core (schema v2, service layer, event-scoped API, client core/theme split). Reuse good pieces per the Port Map below. |
| Historical Pokémon data | **Fresh start.** New schema starts empty. Archive the old SQLite file (rename to `server/bingo-v1.sqlite.bak`); do not write migration scripts for old data. |
| Tile model | **N ordered tasks per tile.** A/B becomes the common case (2 tasks), not the schema. |
| Signup questions | **Admin-defined per bingo** (question builder in admin panel). |
| Stage advancement | **Manual.** Each stage has a scheduled date shown to users (countdowns), but a mod explicitly advances the stage. No auto-transitions. |
| Discord team roles/channels | De-scoped to the final phase (bot integration sketch only). |

## Stack (unchanged unless listed)

- Monorepo npm workspaces: `server/` (Express 4, Drizzle + better-sqlite3, Passport-Discord, `ws`, multer, Anthropic SDK) and `client/` (React 19, Vite, react-router 7, Tailwind v4).
- **New:** `shared/` workspace for types shared by client and server. **New deps:** `@tanstack/react-query` (client), `vitest` (server dev), a SQLite-backed session store (`better-sqlite3-session-store`), `react-markdown` (client, for rules rendering). No other new dependencies without asking the user.

## Conventions for the implementing agent

- Routes stay thin: parse/validate input, call a service, shape the response. All domain logic lives in `server/src/services/`.
- Every multi-write goes through `db.transaction(...)`. The v1 code has none; v2 must have no multi-write outside a transaction.
- All IDs in APIs, WS messages, and client state are UUIDs. **Never identify a team, bingo, or user by name string** (v1's core disease).
- Types used by both sides live in `shared/`; the client must not hand-mirror server types (delete the v1 pattern).
- Timestamps: keep the v1 pattern (`integer(..., { mode: 'timestamp' })`, `unixepoch()` defaults).
- Keep components/services under ~300 lines; split rather than grow.
- Do not carry forward: the `[DEV] Override` button, `localStorage("dev_board_override")`, `TEAM_ROLE_*` / `MOD_ROLE_ID` env vars, name-string team lookup, the duplicated `timeAgo`/`STATUS_STYLE`/badge-color maps.

---

# 1. Schema v2

Fresh Drizzle migration set: delete `server/drizzle/*` and the dev DB, rewrite `server/src/db/schema.ts`, regenerate migration 0000. Table-by-table spec (columns beyond v1 norms only; all tables get UUID text PK + `createdAt` unless noted):

### Identity & platform

- **`users`** — as v1 (`discordId` unique, username/globalName/guildNick/avatar) **minus `isModerator`**, plus `isAdmin` (boolean, default false). On login upsert, set `isAdmin = true` if the Discord ID is in the `ADMIN_DISCORD_IDS` env var (comma-separated). Admins can create bingos and grant mod/admin from the UI; `ADMIN_DISCORD_IDS` is only the bootstrap.
- **`bingos`** (replaces `bingo_events`) — `slug` (unique, URL-safe, admin-set), `name`, `description`, `theme` (text, default `'default'`; selects the client theme folder), `stage` (enum: `planning | signup | captains | draft | reveal | live | complete`, default `planning`), `boardRows`, `boardCols` (ints), `buyinAmount` (GP, nullable), `bonusPotAmount` (int, default 0 — extra GP added on top of buy-ins, e.g. sponsorships; the actual pot total is computed as `buyinAmount × paid signups + bonusPotAmount`, not stored), `rulesMarkdown` (text, nullable — replaces the hardcoded RulesModal), scheduled dates: `signupOpensAt`, `draftScheduledAt`, `revealScheduledAt`, `startsAt`, `endsAt` (all nullable timestamps), `createdByUserId`.
- **`bingo_moderators`** — `bingoId`, `userId`, unique pair. Mod is **per-bingo**, not global (fixes v1's global boolean).
- **`stage_transitions`** — `bingoId`, `fromStage`, `toStage`, `changedByUserId`, `createdAt`. Append-only audit log; feeds the timeline view.

### Signup & draft

- **`signup_questions`** — `bingoId`, `prompt`, `type` (enum: `text | textarea | select | boolean`), `optionsJson` (text, JSON array of strings; only for `select`), `required` (bool), `sortOrder`.
- **`signups`** — `bingoId`, `userId`, `rsn` (notNull — RSN is structural, always asked), `status` (enum: `active | withdrawn`, default `active`), buy-in tracking: `buyinReceivedAt` (nullable), `buyinCollectedByUserId` (nullable — who physically collected the GP), `buyinRecordedByUserId` (nullable — the mod who marked it). Unique `(bingoId, userId)`.
- **`signup_answers`** — `signupId`, `questionId`, `value` (text; booleans stored as `"true"`/`"false"`). Unique `(signupId, questionId)`.
- **`teams`** — `bingoId`, `captainUserId` (FK users), `name` (default `"<captain displayName>'s Team"`; captain can rename until stage = `live`), `codeword` (auto-generated word pair, admin-editable, unique per bingo), `color` (hex, nullable, mod-assigned), `draftOrder` (int, nullable until draft starts). Unique `(bingoId, captainUserId)`.
- **`team_members`** — `teamId`, `userId`, `isCaptain` (bool), `joinedAt`. Unique `(teamId, userId)`. Service-enforced: a user joins at most one team per bingo.
- **`draft_picks`** — `bingoId`, `pickNumber` (1-based), `teamId`, `userId` (the drafted player), `pickedByUserId` (captain or mod acting for them). Unique `(bingoId, pickNumber)` and `(bingoId, userId)`.

### Board & rules

- **`tile_categories`** (replaces the `badge_category` DB enum) — `bingoId`, `label`, `colorHex`, `sortOrder`. Optional per bingo; drives row labels/colors when the admin uses them.
- **`tiles`** — `bingoId`, `name`, `imageUrl` (nullable — replaces the client-side `tileImages.ts` map; images uploaded via admin panel to `/uploads/bingos/<bingoId>/tiles/`), `categoryId` (nullable FK), `boardRow`, `boardCol`, `hasFreezePeriod`, `freezeDurationMinutes`, `notes`. Unique `(bingoId, boardRow, boardCol)`.
- **`tile_tasks`** (replaces `tile_sides`) — `tileId`, `label` (e.g. "Part A"), `sortOrder`, `points`, `description`, `scoringMode` (enum `automatic | manual`, default `automatic` — the admin escape hatch for a one-off custom challenge that can't be codified as an item list: `tileTaskItems` are optional/ignored, and a mod directly decides completion + points per submission instead of `evaluateTaskCompletion` computing it; see scoring engine section), gating flags: `submitRequiresPrevious` (bool — server rejects submissions until the previous task is complete; v1's `requiresPartA`, now actually enforced), `pointsRequirePrevious` (bool — task can complete early but points stay 0 until the previous task completes; v1's Part-B-withholding), rule flags carried from v1 sides: `requiresNoDuplicates`, `allowsPreviouslyAcquired`, `allowsPreLoad`, `minSubmissions` (int, default 1), `requiresCompleteSet`, `notes`. Unique `(tileId, sortOrder)`.
- **`tile_task_items`** — `taskId`, `itemName`, `quantity`, `optionsGroup` (nullable), `sortOrder`. Semantics identical to v1 `tile_side_items`.
- **`tile_wildcards`** — `tileId`, `itemName`, `maxRedemptionsPerTeam`, `description`, `applicableTaskId` (nullable FK `tile_tasks`; null = any task on the tile).
- **`bingo_lines`** — `bingoId`, `lineType` (`row | column | diagonal | custom`), `lineIndex`, `points` (no hardcoded 15 anywhere — always read this column). Generated by a service call from `boardRows`/`boardCols` (diagonals only when square); admin can edit points or delete lines.
- **`bingo_line_tiles`** — as v1.

### Progress & submissions

- **`team_task_progress`** (replaces the column-per-side `team_tile_progress`) — `teamId`, `taskId`, `status` (enum: `not_started | in_progress | pending_approval | completed`), `pointsAwarded` (int, default 0), `completedAt` (nullable). Unique `(teamId, taskId)`.
- **`submissions`** — `teamId`, `taskId`, `submittedByUserId`, `status` (`pending | approved | rejected`), `submittedAt`, `reviewedAt`, `reviewedByUserId`, `reviewerNotes`, `pointsAwarded`, `isWildcardRedemption`, `wildcardId`.
- **`submission_screenshots`** — as v1 (incl. scrape fields).
- **`submission_item_claims`** — as v1 (`taskItemId` FK instead of `tileSideItemId`).
- **`team_wildcard_usage`** — `teamId`, `tileWildcardId`, `submissionId`, `usedAt`. **No unique index** on `(teamId, tileWildcardId)`; the cap is enforced by counting rows inside the approval transaction. **Bug fix vs v1: the usage row is written on *approval*, not submission** (v1 burns the redemption on submit, and its unique index breaks `maxRedemptionsPerTeam > 1`).
- **`team_completed_lines`** — as v1, but the scoring service actually writes it (v1 never did — line scoring was dead code).
- **`team_point_adjustments`** — as v1.

**Timeline/statistics note:** no separate event-log table. The timeline view derives from timestamped rows that already exist: `stage_transitions`, `draft_picks`, `submissions`, `team_task_progress.completedAt`, `team_completed_lines.completedAt`, `team_point_adjustments`. Every state change must therefore record its timestamp and actor — keep that invariant when writing services.

---

# 2. Server architecture

```
server/src/
  index.ts                 wiring only (sessions, cors, static, ws, routers)
  db/  (schema.ts, index.ts)
  auth/discord.ts          identity only (see below)
  middleware/
    requireAuth.ts
    requireBingo.ts        resolves :slug → bingo, attaches req.bingo, 404s
    requireBingoMod.ts     bingo_moderators row OR users.isAdmin
    requireAdmin.ts        users.isAdmin
  services/
    bingoService.ts        CRUD, stage machine, mods mgmt
    boardService.ts        tiles/tasks/items/categories/wildcards CRUD, line generation, reveal gating
    signupService.ts       questions CRUD, signup create/withdraw, buy-in marking
    draftService.ts        captains, draft start (randomize order), snake pick logic
    teamService.ts         rename, colors, codeword generation
    submissionService.ts   create submission (all server-side gating), wildcard path
    scoringService.ts      the ported scoring engine (see below)
    statsService.ts        timeline + aggregate queries (phase 8)
  routes/
    auth.ts
    bingos.ts              public/player routes under /api/bingos
    mod.ts                 /api/bingos/:slug/mod/*
    admin.ts               /api/admin/* and /api/bingos/:slug/admin/*
  ws.ts                    envelope broadcast (see below)
  ai.ts                    screenshot analysis, prompt uses a hardcoded OSRS hint (AI_HINT)
```

### Auth changes

- Discord scopes drop to `identify` (+ optionally `guilds.members.read` **only if** `DISCORD_GUILD_ID` is set, to fetch the guild nickname for display). Team and mod status no longer come from Discord roles.
- Delete required env vars `TEAM_ROLE_*`, `MOD_ROLE_ID`. New: `ADMIN_DISCORD_IDS`.
- Sessions: store **only** `{ userId }` in the session (`serializeUser`); `deserializeUser` loads the user row per request. Fixes v1's frozen-at-login roles. Replace MemoryStore with the SQLite session store.

### Stage machine (`bingoService`)

Allowed forward transitions: `planning → signup → captains → draft → reveal → live → complete`. Mods may also step **backward one stage** (confirmation required in UI). Every transition writes a `stage_transitions` row and broadcasts `stage_changed`. Stage gates enforced **server-side** in services:

`captains` sits between `signup` and `draft`: signups close (the `signup`-only gate on create/withdraw means they're automatically closed the moment a mod advances past it) and mods assign team captains from the pool of active signups (`teamService.getCaptainCandidates`) before the snake draft starts. A captain must have an active signup for the bingo — enforced in `teamService.createTeam`, not just this stage's UI. Admins typically add a boolean signup question ("willing to captain?") to help pick, but that's just an ordinary admin-authored question — there's no structured flag for it.

| Action | Allowed stages |
|---|---|
| Edit board/tasks/questions | `planning`, `signup`; site admin only, not just any bingo mod (`admin.ts` requires `requireAdmin`, not `requireBingoMod`) |
| Create/withdraw signup | `signup` |
| Assign a captain (create team) | any stage — but the captain must have an active signup; `captains` is just the intended UI window |
| Mark buy-in | `signup`, `captains`, `draft`, `reveal` |
| Draft picks | `draft` |
| Captain renames team | `draft`, `reveal` |
| Mod assigns colors | any stage before `complete` |
| Fetch tiles (non-mod) | `reveal`, `live`, `complete` — before that, board endpoints return the bingo shell without tiles |
| Create submission | `live` only, and `now >= startsAt`, and tile not frozen (`now >= startsAt + freezeDurationMinutes`) — **all enforced server-side** (v1 enforced freeze only in the client) |
| Review submission | `live`, `complete` |

### Scoring engine port (`scoringService`)

Port v1's approval logic (v1 `api.ts` ~953–1263) with these required changes:

1. **Deduplicate.** v1 duplicates the completion-check verbatim for the cascade case. Write one pure function `evaluateTaskCompletion(task, items, approvedClaims, opts): { complete, points }` and call it everywhere. Pure = no DB access; callers fetch data. This function is the primary unit-test target.
2. **Generalize A/B → task chain.** "Previous task" means the task with the next-lower `sortOrder` on the same tile. On task N completing: release withheld points for any later task with `pointsRequirePrevious` that already completed; re-evaluate task N+1 with folded prior-task claims when it has `allowsPreviouslyAcquired` (the v1 Cerberus auto-complete case). Claim folding matches on `itemName` lowercase, as v1 does.
3. **Line completion (new — dead code in v1).** A tile is complete when all its tasks are `completed`. After any task completes, check the lines containing that tile (via `bingo_line_tiles`); insert `team_completed_lines` for newly completed ones using `bingo_lines.points`.
4. **Wildcard cap** checked and usage row written inside the approval transaction (see schema note).
5. Everything from claim-tally to progress/lines/points runs in **one transaction**.
6. Mod may override `pointsAwarded` on approval (optional request field; default = task points). v1 ignored this.
7. Rejection behavior as v1: revert `pending_approval → in_progress` only when no other pending submissions exist for that team+task.
8. **Manual scoring mode.** When `task.scoringMode === 'manual'`, skip `evaluateTaskCompletion` entirely — `approveSubmission` requires an explicit `taskCompleted: boolean` in the request and throws 400 if it's missing. Everything downstream (withheld points via `pointsRequirePrevious`, cascade to a folding next task, line completion) treats the mod's decision exactly like a computed one — no separate code path past that point. `submissionService.createSubmission` also drops its "at least one item claim" requirement for manual tasks, since there's no item list to claim against.

Write vitest coverage for `evaluateTaskCompletion` and the cascade/line logic before wiring routes: quantity tallies, options groups, `requiresCompleteSet` (Barrows), `minSubmissions` (K'ril), withheld-points release, `allowsPreviouslyAcquired` folding, line completion including line points from the DB, and the manual-scoring path (missing `taskCompleted` rejected, mod decision drives completion/points, still interacts correctly with `pointsRequirePrevious`).

### API surface (v2)

All bingo-scoped routes live under `/api/bingos/:slug`. No route may fall back to "the active event" — v1's `isActive`-with-arbitrary-fallback pattern is deleted.

| Method & path | Auth | Purpose |
|---|---|---|
| GET `/api/me` | auth | Current user (from DB, not session snapshot) + their per-bingo roles |
| GET `/api/bingos` | none | List bingos (id, slug, name, stage, theme, dates) |
| GET `/api/bingos/:slug` | none | Bingo shell: config, stage, scheduled dates, rulesMarkdown, categories, teams (id/name/color/captain), board dims. **No tiles before reveal (non-mods).** |
| GET `/api/bingos/:slug/board` | none* | Tiles + tasks + items + wildcards (stage-gated as above) |
| GET `/api/bingos/:slug/teams/:teamId/progress` | auth | Points breakdown + per-task progress. Own team, or any team for mods; all teams for everyone once stage = `live` (scoreboard is public within the app) |
| GET `/api/bingos/:slug/teams/:teamId/submissions` | auth | Own team, or mods |
| POST `/api/bingos/:slug/submissions` | auth (team member) | Create submission (multipart), server-side gating |
| POST `/api/bingos/:slug/submissions/analyze` | auth | AI screenshot analysis (prompt + item list from this bingo; hardcoded OSRS hint prepended) |
| GET/POST/DELETE `/api/bingos/:slug/signup` | auth | Read own signup / create (answers + rsn) / withdraw |
| GET `/api/bingos/:slug/signup/questions` | auth | Question list for the form |
| GET `/api/bingos/:slug/draft` | auth (signed-up or mod) | Draft state: order, picks, pool, whose turn |
| POST `/api/bingos/:slug/draft/pick` | auth (captain on turn, or mod) | Make a pick |
| PATCH `/api/bingos/:slug/teams/:teamId` | auth (captain or mod) | Rename (captain, stage-gated); color/codeword (mod) |
| **Mod:** GET `/mod/submissions`, GET `/mod/pending-count`, PATCH `/mod/submissions/:id` | bingo mod | As v1, scoped to the bingo. On approve, `taskCompleted: boolean` is required when the task's `scoringMode` is `manual` (the mod's own completion call instead of an automatic tally) |
| **Mod:** GET `/mod/signups`, PATCH `/mod/signups/:id/buyin` | bingo mod | Signup roster; mark/unmark buy-in (collectedBy, recordedBy = caller) |
| **Mod:** POST `/mod/stage` | bingo mod | Advance/step-back stage |
| **Mod:** POST `/mod/draft/start` | bingo mod | Randomize `draftOrder`, enter draft |
| **Admin (per bingo):** CRUD under `/admin/*` | bingo mod | tiles, tasks, items, wildcards, categories, questions, lines (+ `POST /admin/lines/generate`), mods, captains, tile image upload, bingo settings/rulesMarkdown |
| **Site admin:** POST `/api/admin/bingos`, PATCH `/api/admin/users/:id` (grant admin) | isAdmin | Create bingo; manage admins |

### WebSocket v2

Envelope: `{ type, bingoId, payload }` where payload carries **IDs only** (v1 leaked team names to all clients). Types: `submission_created { teamId }`, `submission_reviewed { teamId, taskId }`, `stage_changed { stage }`, `draft_started`, `draft_pick { pickNumber, teamId, userId }`, `team_updated { teamId }`. Single connection per client (move the socket to a context/provider so Home + ModPanel don't open two, as v1 does); client filters by the bingo it's viewing and refetches via query invalidation.

---

# 3. Client architecture

```
client/src/
  api/                  typed fetch wrapper + TanStack Query hooks (useBingo, useBoard,
                        useTeamProgress, useDraft, useSignup, mutations…). All server
                        state lives in the query cache — no more callback-prop lifting.
  core/                 theme-agnostic building blocks, styled with neutral tokens only
    ui/                 SearchableSelect (port as-is), Modal, StatusBadge, CountdownTimer,
                        timeAgo.ts (ONE copy), Markdown
    board/              BoardGrid (renders bingos.boardRows × boardCols from data,
                        category row labels from tile_categories), TileCell, TileModal,
                        TaskPanel (port of v1 SidePanel, N-task aware)
    submissions/        SubmissionModal, SubmissionRow (ported, task-chain aware)
    draft/              DraftRoom, PickList, TeamColumn
    signup/             SignupForm (renders admin-defined questions), SignupClosed
    mod/                ReviewQueue (ported ModPanel), SignupRoster, StageControls
    admin/              BingoSettings, BoardEditor, TaskEditor, QuestionBuilder,
                        TeamManager, LineEditor
  themes/
    registry.ts         theme key → partial component/token overrides
    default/            complete neutral theme (tokens + any component overrides)
  pages/                thin route components composing core/* via the active theme
  context/              AuthContext, WebSocketProvider (single socket)
```

**Theme contract:** `bingos.theme` selects a folder. A theme exports design tokens (CSS variables set on the bingo page root: category palette fallback, surfaces, accents) and *optional* component overrides; `useThemeComponent('TileCell')` returns the override or the core default. Admin and mod surfaces **never** theme — they always use core components directly (requirement: admin panel looks the same regardless of theme). A future themed bingo (e.g. another Pokémon one) is a new folder overriding `TileCell`/`BoardGrid` visuals; nothing else changes.

**Routing:** `/` bingo list · `/login` · `/b/:slug` stage-aware page (planning: countdown + rules; signup: form/roster; draft: link or embedded draft room; reveal: board preview + countdown to start; live/complete: board) · `/b/:slug/draft` · `/b/:slug/mod` (unified panel — see below) · `/b/:slug/stats` · `/admin`. Auth: viewing is public where the API allows; acting requires login (v1's blanket ProtectedRoute on `/` goes away).

**Mod Panel consolidation (post-Phase-5):** `/b/:slug/admin` was folded into `/b/:slug/mod` as a single page with 8 tabs — Submissions and Signups are visible to every bingo mod; Settings/Board/Lines/Signup Questions/Teams/Moderators are visible (and their content only rendered) for site admins only, hidden entirely for a per-bingo mod who isn't. This mirrors a real server-side split, not just a UI one: `admin.ts` now requires `requireAdmin` (site admin) instead of `requireBingoMod`, while `mod.ts` (submissions, signups, stage, draft, dev-seed) stays open to every per-bingo mod. `/b/:slug/admin` redirects to `/b/:slug/mod` for old links.

**Styling:** stay Tailwind, but the five duplicated badge/status color maps collapse into: category colors from `tile_categories.colorHex` (inline CSS vars) and one `StatusBadge`. Delete `tileImages.ts` (images come from `tiles.imageUrl`); delete the Login page's inline-style object (use Tailwind).

---

# 4. Port map (v1 → v2)

| v1 file | Disposition |
|---|---|
| `server/src/routes/api.ts` | Dissolved into `routes/bingos.ts`, `routes/mod.ts`, `routes/admin.ts` + services. The scoring block becomes `scoringService`; the analyze route's prompt moves to `ai.ts`, parameterized. |
| `server/src/auth/discord.ts` | Rewrite: identity only, session stores userId only, role-map object deleted. |
| `server/src/db/seeds/*` | Deleted. Replaced by: `db/seed-dev.ts` (one admin user stub + one demo bingo with a small board covering every rule flag, for dev) — production boards are authored in the admin panel. |
| `server/src/ws.ts`, `ai.ts`, middleware | Extended per §2, same shape. |
| `client/src/components/SearchableSelect.tsx` | Port to `core/ui/` as-is. |
| `SidePanel.tsx` | Port to `core/board/TaskPanel.tsx`, N-task aware. |
| `ModPanel.tsx`, `SubmissionRow.tsx`, `TeamSubmissionsModal.tsx` | Port to `core/mod/` + `core/submissions/`; dedupe helpers; ModPanel becomes a real routed page. |
| `SubmissionModal.tsx` | Port to `core/submissions/`; delete client-side freeze/gating re-implementations (server enforces; client only mirrors for UX using flags from the API). |
| `BingoBoard.tsx`, `TileCell.tsx`, `TileModal.tsx` | Rebuild in `core/board/` data-driven (dims, categories, images from API). Dev-override button deleted. |
| `RulesModal.tsx` | Replaced by `core/ui/Markdown` rendering `bingos.rulesMarkdown`. |
| `Home.tsx` | Dissolved into `pages/` + query hooks. |
| `client/src/types.ts`, `tileImages.ts` | Deleted (types → `shared/`; `displayName`/`avatarUrl` → `core/ui/user.ts`; images → DB). |

---

# 5. Phases

### Phase 1 — Foundations
Create `shared/` workspace (types only, consumed via TS project references or a plain package). Add TanStack Query provider to the client. Swap session MemoryStore for the SQLite store. Add vitest to server with one passing smoke test. Add `ADMIN_DISCORD_IDS` handling; delete the `TEAM_ROLE_*`/`MOD_ROLE_ID` boot requirements (auth keeps working against the old schema for now).
**DoD:** app still runs end-to-end as today (`npm run dev`); login works with only the reduced env set; sessions survive a server restart; `npm test -w server` passes.

### Phase 2 — Schema v2 + auth rewrite
Archive old DB + migrations. Write schema v2 (§1), generate migration 0000, write `seed-dev.ts` (demo bingo: 3×3 board, 2-task and 1-task and 3-task tiles, one of each rule flag, two teams with members, a wildcard, generated lines). Rewrite `auth/discord.ts` (identity-only, userId-only session). Old routes will be broken after this phase — that is expected; do not patch them.
**DoD:** `db:reset` produces a seeded DB; login creates a user and honors `ADMIN_DISCORD_IDS`; drizzle-kit generates no diff; vitest still passes.

### Phase 3 — Server core (the big one)
Implement services + routes + middleware per §2, including the scoring engine port with its unit tests, stage machine, server-side submission gating, line completion, wildcard fix, WS envelope. Delete `routes/api.ts`.
**DoD:** vitest covers the scoring cases listed in §2 and passes; exercising the demo bingo via curl works: fetch board (reveal-gated), submit as a member, approve as mod, see task/points/line progress update; a frozen tile and a `submitRequiresPrevious` violation are rejected server-side with 4xx.

### Phase 4 — Client re-architecture (player + mod surfaces) — DONE
Built `api/` hooks, `core/ui`, `core/board`, `core/submissions`, `core/mod`, theme registry + default theme, new routing, WebSocketProvider. Ported the v1 player experience (board, tile modal, submission flow incl. AI analyze + drag/drop screenshots, team switcher for mods, search, freeze/pre-start countdowns from API data) and mod review queue — including a manual-scoring branch in the review queue (mark-complete toggle + points field driving `taskCompleted`, done here rather than deferred to Phase 5) — against the v2 API.

Two gaps found and fixed in the server while building against it (not caught in Phase 3 because nothing had exercised these responses end-to-end yet): `GET /api/bingos/:slug` didn't tell the client which team the logged-in user is on (`myTeam` was missing — added, resolved via `teamService.getUserTeamForBingo`), and `getTeamSubmissions`/`getAllSubmissionsForBingo` returned bare submission rows with no screenshots, item claims, or submitter info attached (the client can't render a submission history or review queue without them — fixed via `submissionService.attachDetails`, 2 new tests).

**DoD:** verified in a real Chrome browser (via the `claude-in-chrome` skill, driving the actual dev server — no test harness) against the seeded demo bingo: login as `dev-member-a` → view board (categories, freeze lock+countdown correctly rendered) → open Wintertodt tile → submit with a screenshot (AI analyze ran for real and correctly reported no codeword/item match) → submission appears pending in the tile's history → log in as `dev-admin` in a second tab → mod panel shows the pending submission with thumbnail → approve → **member's tab, left untouched, updates from 0→20 pts and the tile turns green with no manual refresh** (WS → query invalidation → refetch, confirmed working). Zero console errors, zero failed network requests across both tabs. `grep` confirms zero hardcoded category or team-name literals in `client/src`. One real bug caught and fixed during this pass: `avatarUrl()` called `BigInt(user.id)` on our internal UUID instead of `user.discordId` (the actual Discord snowflake), which threw and crashed the whole page with no error boundary.

### Phase 5 — Admin panel — DONE
Built `/admin` (create bingo, grant site admin) and `/b/:slug/admin`: bingo settings (dates, buy-in/pot, rules markdown editor with preview, theme, aiHint), stage controls (reused Phase 4's `StageControls`), mods management (user search over all registered users, add/remove), category editor (color-coded, inline add/delete), board editor (grid of the configured dims; click an empty cell to create a tile, click a filled one to open a full edit panel: name, image upload, category, freeze, per-task editor with every rule flag incl. the `scoringMode` toggle — automatic shows the item/options-group editor, manual hides it in favor of just the description a mod judges against — plus wildcards scoped to "any task" or one specific task), line generator (rows+cols+diagonals from the board's actual dimensions, editable/deletable per-line points, safe to re-run after resizing), signup question builder (add/reorder-by-arrows/edit/delete, `select` questions get a comma-separated options editor), and team management — manual team creation (captain search → auto-generated word-pair codeword + captaincy membership) and roster add, since the Phase 7 draft flow doesn't exist yet and Phase 5's own DoD needs a playable team without it.

Server: `userService` (global user search, isAdmin grant/revoke), `signupService` (question CRUD), and large `boardService`/`teamService`/`bingoService` extensions — full CRUD for categories/tiles/tasks/items/wildcards with cascading delete, `generateLines` (computed from `boardRows`/`boardCols`, replaces rather than duplicates on re-run), `createTeam`/`addTeamMember` with real business-rule enforcement (one captaincy per bingo, one team per user, can't remove a captain). `bingoService.assertBoardEditable` gates every structural mutation to pre-live stages (`planning` through `reveal`). New routes: `routes/siteAdmin.ts` (`/api/admin/*`) and `routes/admin.ts` (`/api/bingos/:slug/admin/*`, ~35 endpoints). 10 new tests targeting the riskiest logic (line geometry, cascading delete, team business rules) — 44 total.

**DoD — verified for real, not just built:** migrated a genuinely empty SQLite DB (zero seed data, two bootstrapped users — one site admin, one plain user for the captain role, the minimum a real Discord login would produce), then in a live Chrome browser: created a bingo via `/admin`, set its dates, built a 2×2 board (one tile fully through clicking the actual UI — name, category, task, item; three more via the same admin API to keep the run practical), generated all 6 lines, added a signup question, created a team by searching for and selecting the captain, advanced the stage six times (planning → signup → draft → reveal → live) with the confirm dialog firing each time, then logged in as the captain and confirmed the board rendered exactly as configured, submitted a completion with a screenshot (AI analysis correctly reported no codeword match against a blank test image and the team's real auto-generated codeword), and approved it as the admin — moving it from Pending to Approved. Zero console errors throughout. The board-reveal gate, freeze/date logic, and scoring engine all worked unmodified against data that came entirely from the admin UI rather than `seed-dev.ts`, which is the real proof this phase's DoD was after.

### Phase 6 — Signup UX — DONE
`BingoPage` is now fully stage-aware for `planning`/`signup`/`draft` (previously only handled "not revealed yet" generically): `signup` stage renders `core/signup/SignupForm.tsx` (RSN + one field per admin-defined question — text/textarea/select/boolean — pre-filled and switching to "Edit your signup" + Withdraw once a signup exists), `planning`/`draft` render distinct waiting messages instead of a generic one.

Server: `signupService` gained the player half (Phase 5 only had question CRUD) — `createSignup`/`updateSignup`/`withdrawSignup`, all gated to the `signup` stage via `assertSignupOpen`, plus `getAllSignups` (roster, joined with the user row and every answer) and `markBuyin` (separate `collectedByUserId`/`recordedByUserId` fields, gated to signup/draft/reveal, supports unmarking). New routes: `GET/POST/PATCH/DELETE /api/bingos/:slug/signup` + `GET .../signup/questions` (player-facing), `GET .../mod/signups` + `PATCH .../mod/signups/:id/buyin` (mod-facing). 10 new tests (64 total).

`core/mod/SignupRoster.tsx` (added as a "Signups" tab in `ModPage`, alongside the existing review queue): a table with one column per admin question, a buy-in checkbox that — when checking it on — offers an optional collector search (reusing `UserSearchInput`) before confirming, and a "Copy as CSV" button.

Also added `api.delete` to the client's fetch wrapper (adminApi.ts had its own ad-hoc `fetchDelete` duplicate before this — replaced with the real thing since the player-facing withdraw route needed DELETE too).

**DoD verified live in browser:** stepped the demo bingo back to `signup`, signed up as a member (all four question types rendered and saved correctly, confirmed via a direct re-fetch), watched it appear instantly in the mod roster with the right answers, marked buy-in received, copied the CSV. Then advanced to `draft` and confirmed both directions of the stage gate: a raw `POST /signup` was rejected server-side with the exact "only open during the signup stage" message, and the client correctly swapped the form out for the closed-stage message. Zero console errors.

### Phase 7 — Draft UX — DONE
Server: new `draftService.ts` — `pickOrderTeamIndex(teamCount, pickNumber)` is the pure snake-order function (odd round ascending, even round descending), `startDraft` randomizes `teams.draftOrder` (requires the `draft` stage, ≥2 teams already created via the Phase 5 admin Teams tab, and refuses to re-run once started), `makePick` validates it's the acting captain's team's turn (or a mod acting on the on-the-clock team's behalf — mods can't jump the queue either), that the target is an active signup not already on a team, then inserts the `draft_picks` row and the `team_members` row in one transaction. `getDraftState` returns teams (ordered once started), picks (with the drafted user attached), the undrafted pool (signups minus everyone already on a team), and the current pick — pool entries only carry `answers` when the requester is a mod or a captain. New routes: mod-only `POST /mod/draft/start`; player-facing `GET /:slug/draft` (gated to mods, captains, and anyone with a signup for this bingo) and `POST /:slug/draft/pick`; a captain-self-service `PATCH /:slug/teams/:teamId` (name-only — mods still have the unrestricted admin version). 16 new tests (70 total) covering the snake function, start/pick validation, and pool/answer gating.

Client: `core/draft/DraftRoom.tsx` + `pages/DraftPage.tsx` (new `/b/:slug/draft` route, same fixed-overlay "room" pattern as `ModPage`) — team list with live "on the clock" highlight and inline captain self-rename, current-pick banner, undrafted-player pool with an expandable answers panel and a `Draft` button gated to whoever can actually act, and a picks log. `BingoPage`'s `draft`-stage placeholder gained an "Open Draft Room" button. The `draft_started`/`draft_pick` WS cases in `WebSocketContext.tsx` — stubbed since Phase 4 with a comment pointing at this phase — now invalidate the new `draftState` query key plus `bingo` (a drafted player's shell gains a `myTeam`).

**DoD verified live:** built a real draft end-to-end via the actual server/API (bingo → 2 signups+2 captains → 2 teams → start), then in a live browser: opened the draft room as a non-captain signed-up user (correctly read-only, "on the clock" highlight visible, no Draft button); confirmed server-side that an out-of-turn captain's pick was rejected (403) and the correct captain's pick succeeded; had the mod pick the final player on behalf of the on-the-clock team — the open browser tab flipped to "Draft complete!" with zero manual refresh (WS → invalidation confirmed working); confirmed via direct DB query that both teams ended with the correct snake-order rosters (captain + 1 drafted member each, matching pick order); logged in as the captain and renamed their team inline through the UI, which updated instantly and cascaded into the picks log's team name too. Zero console errors.

### Phase 8 — Stats & timeline — DONE
Server: `statsService.ts`, read-only and derived entirely from existing tables (no new schema). `getPointsOverTime` reconstructs a chronological, per-team running total from exactly the same rows `teamService.getTeamProgress` sums (completed `teamTaskProgress`, `teamCompletedLines`, `teamPointAdjustments`) — since it's the identical set of numbers, a team's final `cumulativePoints` always reconciles with its scoreboard total by construction, not by a separate check. `getTimeline` merges stage transitions, draft picks, line completions, and "first team to complete a task" (earliest `completedAt` per task) into one chronological feed. `getContributionCounts` ranks players by their own approved-submission count. `getTileHeatmap` returns a (team, tile) completed/total cell for every combination. New route `GET /:slug/stats`, gated the same as the board (`bingoService.canViewTiles` — mods always, others once revealed). 7 new tests (77 total); one (`first_completion` tie-break) needed a fix mid-write — `completedAt` is stored at 1-second resolution, so two approvals in the same test tick landed in the same second and the "earliest" comparison depended on unordered DB row return order; fixed by forcing a real time gap in the test rather than changing production behavior, since a genuine same-second tie in production has no principled "true" winner anyway.

Client: `core/stats/StatsView.tsx` + `pages/StatsPage.tsx` at the new `/b/:slug/stats` route (same fixed-overlay pattern as Mod/Draft) — an inline hand-rolled SVG line chart (no charting library in this repo, so points-over-time is a plain `<polyline>` + `<circle>` per team; circles matter because a single-event team has nothing for a polyline to connect and would otherwise render as an empty chart), a reverse-chronological timeline list, a contributor leaderboard, and a team-selectable tile-completion heatmap shaded by completion fraction. A "Stats" button was added to `BingoPage`'s header next to Rules, gated on the same `boardRevealed` flag the rest of the header already uses.

**DoD verified live:** approved one real submission end-to-end via the API (Wintertodt, +20 for Alpha's Team) against the seeded demo bingo, confirmed the API response's `pointsOverTime`/`timeline`/`contributions`/`heatmap` all matched by hand, then loaded `/b/demo/stats` in a real browser: the chart showed a single red dot for Alpha's Team (the polyline-vs-single-point gap was caught and fixed right here), the timeline correctly read "Alpha's Team was first to complete Wintertodt — Part A", the contributor list showed `member_alpha — Alpha's Team: 1`, and switching the heatmap's team selector from Beta's (all dark, zero completions) to Alpha's lit the Wintertodt cell fully bright while every other cell stayed dark. Confirmed the header's Stats button navigates correctly. Zero console errors.

### Phase 9 — Discord bot (de-scoped; design sketch only until user green-lights)
Separate bot token (`DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`); on a mod-triggered action post-draft, create a role + text channel per team and assign members; store created `discordRoleId`/`discordChannelId` on `teams` for idempotent re-runs and cleanup. Requires the bot invited with Manage Roles/Channels. **Ask the user before implementing.**

## Backlog (not scheduled)

- **Guild-wide Discord user search.** `userService.searchUsers` (used by `UserSearchInput` for picking mods/captains) only queries the local `users` table — rows only exist for people who have logged into the site at least once via Discord OAuth. It cannot find someone who hasn't logged in yet, even if they're in the clan's Discord server. Fix: reuse (or add) `DISCORD_BOT_TOKEN` to call `GET /guilds/{guild.id}/members/search?query=` server-side and merge/dedupe those results with local `users` rows in the search response. Same bot token Phase 9 needs, so worth doing alongside it.

---

# 6. Env vars (v2)

Required: `DATABASE_PATH`, `SESSION_SECRET`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_CALLBACK_URL`, `CLIENT_URL`, `ADMIN_DISCORD_IDS`.
Optional: `ANTHROPIC_API_KEY` (AI analyze disabled without it), `DISCORD_GUILD_ID` (guild-nick display; later the bot), `DISCORD_BOT_TOKEN` (phase 9).
Deleted: `MOD_ROLE_ID`, all `TEAM_ROLE_*`.

# 7. Known v1 bugs that must not survive the port

1. Wildcard redemption burned on submit + unique index defeats `maxRedemptionsPerTeam > 1` → fixed in schema/scoring (§1, §2).
2. Freeze + Part-B submit gating enforced only client-side → server-side in `submissionService`.
3. Line scoring never awarded (nothing wrote `team_completed_lines`; 15 hardcoded) → `scoringService` step 3.
4. No transactions around multi-write paths → transaction convention.
5. Session snapshot freezes roles until re-login → userId-only sessions.
6. Duplicate WS connections (Home + ModPanel) → single provider.
7. `[DEV] Override` board-reveal bypass in production code → deleted; reveal is server-gated.
