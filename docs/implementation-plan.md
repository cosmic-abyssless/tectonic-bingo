# Bingo Platform — Implementation Plan

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
- **`bingos`** (replaces `bingo_events`) — `slug` (unique, URL-safe, admin-set), `name`, `description`, `theme` (text, default `'default'`; selects the client theme folder), `stage` (enum: `planning | signup | draft | reveal | live | complete`, default `planning`), `boardRows`, `boardCols` (ints), `buyinAmount` (GP, nullable), `potAmount` (nullable), `rulesMarkdown` (text, nullable — replaces the hardcoded RulesModal), `aiHint` (text, nullable — appended to the screenshot-analysis prompt), scheduled dates: `signupOpensAt`, `draftScheduledAt`, `revealScheduledAt`, `startsAt`, `endsAt` (all nullable timestamps), `createdByUserId`.
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
  ai.ts                    screenshot analysis, prompt parameterized by bingo.aiHint
```

### Auth changes

- Discord scopes drop to `identify` (+ optionally `guilds.members.read` **only if** `DISCORD_GUILD_ID` is set, to fetch the guild nickname for display). Team and mod status no longer come from Discord roles.
- Delete required env vars `TEAM_ROLE_*`, `MOD_ROLE_ID`. New: `ADMIN_DISCORD_IDS`.
- Sessions: store **only** `{ userId }` in the session (`serializeUser`); `deserializeUser` loads the user row per request. Fixes v1's frozen-at-login roles. Replace MemoryStore with the SQLite session store.

### Stage machine (`bingoService`)

Allowed forward transitions: `planning → signup → draft → reveal → live → complete`. Mods may also step **backward one stage** (confirmation required in UI). Every transition writes a `stage_transitions` row and broadcasts `stage_changed`. Stage gates enforced **server-side** in services:

| Action | Allowed stages |
|---|---|
| Edit board/tasks/questions | `planning`, `signup` (admin routes; warn in UI after signup opens) |
| Create/withdraw signup | `signup` |
| Mark buy-in | `signup`, `draft`, `reveal` |
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
| POST `/api/bingos/:slug/submissions/analyze` | auth | AI screenshot analysis (prompt + item list from this bingo; `aiHint` appended) |
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

**Routing:** `/` bingo list · `/login` · `/b/:slug` stage-aware page (planning: countdown + rules; signup: form/roster; draft: link or embedded draft room; reveal: board preview + countdown to start; live/complete: board) · `/b/:slug/draft` · `/b/:slug/mod` · `/b/:slug/admin` · `/b/:slug/stats` · `/admin`. Auth: viewing is public where the API allows; acting requires login (v1's blanket ProtectedRoute on `/` goes away).

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

### Phase 4 — Client re-architecture (player + mod surfaces)
Build `api/` hooks, `core/ui`, `core/board`, `core/submissions`, `core/mod`, theme registry + default theme, new routing, WebSocketProvider. Port the full v1 player experience (board, tile modal, submission flow incl. AI analyze + paste/drag screenshots, team switcher for mods, search, freeze countdowns from API data) and mod review queue against the v2 API.
**DoD:** the demo bingo is fully playable in the browser: login → view board → submit with screenshot → mod approves → board/points/lines update live over WS. No component imports another's color maps; grep finds zero hardcoded category or team-name literals in `client/src`.

### Phase 5 — Admin panel
`/admin` (create bingo, grant admin) and `/b/:slug/admin`: bingo settings (dates, buy-in/pot, rules markdown editor with preview, theme, aiHint), stage controls (advance/step-back with confirm, showing scheduled dates), mods & captains management (user search over signed-in users), category editor, board editor (grid of the configured dims; click a cell to create/edit a tile: name, image upload, category, freeze; task list per tile with all rule flags including a scoringMode toggle — automatic hides/disables item-list-driven flags like minSubmissions/requiresCompleteSet, manual hides the item editor entirely in favor of just the free-text description the mod judges against; items with options groups; wildcards), line generate/edit, signup question builder (reorder, types, options). The mod review queue (ported from Phase 4) also needs a manual-task branch: instead of the auto-computed completion preview, show a "mark complete" toggle + points field driving `taskCompleted` on approve.
**DoD:** starting from an empty DB (no seed), an admin can build a playable bingo entirely through the UI — create bingo → board → tasks → lines → questions → advance stages — and a member can then play it as in Phase 4.

### Phase 6 — Signup UX
Public stage-aware `/b/:slug` page for `planning`/`signup`; signup form rendering admin questions (+ RSN), edit/withdraw; mod signup roster with buy-in marking (who collected, auto-recorded by whom) and CSV-ish copy export.
**DoD:** a non-mod user can sign up during `signup` and not during other stages (server-enforced); mod roster shows answers and buy-in state live.

### Phase 7 — Draft UX
Mod pre-draft: designate captains from signups (creates teams). `POST /mod/draft/start` randomizes order. Draft room (visible to signed-up users + mods): snake order (`round odd → order asc, round even → desc`), current-pick highlight, pool of undrafted signups with their answers visible to captains, pick action for the captain-on-turn (mods can pick for anyone), WS-live updates, completion → mod advances to `reveal`; captains rename teams, mods assign colors; codewords auto-generate on team creation.
**DoD:** two browsers (captain + mod) can run a full draft live; picks are rejected out-of-turn server-side; teams end with correct snake-order rosters; unit test for the snake-order function.

### Phase 8 — Stats & timeline
`statsService` + `/b/:slug/stats`: cumulative points-over-time per team (task completions + line bonuses + adjustments), event timeline (stage changes, draft picks, first-completions, line completions), per-player contribution counts, tile completion heatmap. Read-only, derived entirely from existing tables.
**DoD:** stats page renders for a completed demo bingo; numbers reconcile with the scoreboard totals.

### Phase 9 — Discord bot (de-scoped; design sketch only until user green-lights)
Separate bot token (`DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`); on a mod-triggered action post-draft, create a role + text channel per team and assign members; store created `discordRoleId`/`discordChannelId` on `teams` for idempotent re-runs and cleanup. Requires the bot invited with Manage Roles/Channels. **Ask the user before implementing.**

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
