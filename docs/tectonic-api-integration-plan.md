# Tectonic API Integration — Viability & Refactor Plan

Investigated 2026-09-01 against the source at `../tectonic-api`. Verdict up front: **highly viable**,
with one clean join key, a simple auth model, and every read endpoint we need already existing.
The integration is additive — no core bingo flow has to change shape, and the whole thing can be
feature-flagged off by simply not configuring it.

## 1. What tectonic-api is

A Go + Postgres REST API (huma framework, sqlc queries) backing the clan's Discord-bot ecosystem.
Relevant entities:

| Entity | Shape | Notes |
|---|---|---|
| `guilds` | `guild_id` (Discord guild snowflake) PK | Multi-guild by design |
| `users` | `(user_id, guild_id)` composite PK, `points` | **`user_id` is the Discord user snowflake** — documented as "User Snowflake ID" in the handlers |
| `rsn` | `(wom_id, guild_id)` PK → `rsn`, `user_id` | A user holds **one or more RSNs**, each verified against Wise Old Man at creation (`CreateUser` resolves the RSN via the WOM client before inserting) |
| rank tiers | name, icon, discord `role_id`, `min_points` | Points-threshold clan ranks — **not** an authorization system |
| events / records / achievements | per-guild | Placements, boss PBs, achievement grants |

## 2. The join key

```
tectonic-bingo users.discordId  ===  tectonic-api users.user_id
```

Both are Discord snowflakes. Our OAuth login already stores it; no schema gymnastics needed to
correlate identities.

## 3. Auth & operational model

- Tectonic-api uses a **single static API key** (`Authorization` header, `API_KEY` env on its side).
  There are no per-user tokens. This makes it a **server-to-server data source**: the bingo server
  holds the key and proxies everything; the key must never reach the browser.
- Rate limiting: global 120 req/s limiter with burst 10 — generous for our use with light caching.
- Local dev: `docker compose --profile dev up` in `../tectonic-api`, API on `:8080`, docs at `/docs`.

## 4. Endpoints we would consume

| Endpoint | Use |
|---|---|
| `GET /api/v1/guilds/{gid}/users/basic/{user_ids}` | Batch membership check + points, keyed by Discord IDs (comma-separated) |
| `GET /api/v1/guilds/{gid}/users/{user_ids}` | Detailed users: RSNs (+ WOM ids), points, rank tier, events, achievements |
| `GET /api/v1/guilds/{gid}/leaderboard?user_limit=N` | **Full guild roster** with RSNs + points — this alone resolves the "guild-wide Discord user search" backlog item without a Discord bot token |
| `GET /api/v1/guilds/{gid}/users/rsn/{rsns}` | Reverse lookup by RSN (`ILIKE`, case-insensitive) |
| *(later, writes)* `PUT .../users/{ids}/points/custom/{points}`, `POST .../events` | Post-bingo point awards / registering the bingo as a clan event |

## 5. What tectonic-api is NOT a source of truth for

- **Display identity** (Discord username / nick / avatar): not stored there at all. Discord OAuth in
  the bingo app remains the source. Tectonic's value is *membership, verified RSNs, points, ranks*.
- **Authorization**: rank tiers are point thresholds, not permissions. `users.isAdmin` and
  `bingo_moderators` stay exactly as they are.
- **Authentication**: no user-level auth exists there. Bingo keeps its own OAuth + sessions.

## 6. Risks / gaps and their answers

1. **Availability coupling** — tectonic-api may be down or unconfigured (e.g. fresh local dev).
   Answer: nullable-integration pattern already used for the AI client (`getAIClient()` returns
   null when unconfigured); every consumer degrades to current behavior. A startup log line states
   enabled/disabled, like the dev-mode line.
2. **Players not registered in tectonic** — clan staff register members via the bot; a signup from
   someone absent there can't be verified. Answer: warn-don't-block by default — signups carry an
   `rsnVerified` flag instead of hard-failing. A strict mode can come later if wanted.
3. **Multi-bingo ↔ multi-guild mapping** — the platform hosts many bingos; tectonic hosts many
   guilds. Decision: start with a single env-configured `TECTONIC_GUILD_ID` (one-clan deployment
   reality). A nullable per-bingo `tectonicGuildId` override is a cheap follow-up if ever needed.
4. **Key hygiene** — all calls go through the bingo server; new env vars are server-side only and
   documented in `.env.example`.

## 7. Value delivered (why bother)

1. **Verified RSNs at signup** — auto-filled from the player's linked RSNs (select when they have
   several), WOM-verified, no typos or fakes. RSN is now load-bearing across the draft room and
   rosters, so correctness matters.
2. **Membership signal** — mods see instantly whether a signup is a registered clan member.
3. **Guild roster for mod tooling** — captain search / user pickers can draw from the full clan
   roster instead of only users who have logged in (closes the standing backlog item).
4. **Draft-room enrichment** — clan points (and rank tier) as sortable columns in the undrafted
   pool table: real signal for captains making picks. Slots directly into the sortable PoolTable.
5. *(Later)* **Write-back** — award clan points / register the event when a bingo completes.

---

## 8. Refactor plan (phased, in order)

### Phase T1 — Tectonic client + config — DONE
Implemented in `server/src/services/tectonicService.ts` (+ `.test.ts`, 10 tests, fetch injected as
a constructor arg — no live API in tests). What exists, for the phases below to build on:

- `getTectonicClient(): TectonicClient | null` — memoized singleton, null unless
  `TECTONIC_API_URL`, `TECTONIC_API_KEY`, `TECTONIC_GUILD_ID` are all set. **Every consumer must
  handle null** (integration off) — that's the entire feature-flag mechanism.
- `client.getRoster(limit?)` → `TectonicRosterUser[] | null` — full guild roster (user_id =
  Discord snowflake, points, rsns), leaderboard-ordered, capped 1000.
- `client.getDetailedUsers(discordIds)` → `TectonicDetailedUser[] | null` — RSNs, points, rank,
  tier, records (boss PBs), events, achievements. IDs unknown to tectonic are absent from the
  result (absence = not a clan member).
- `client.getDetailedUser(discordId)` → single-user convenience, null when absent/failed.
- All methods return **null on any failure** (logged `[tectonic]` warning) — never throw. 60s
  in-memory TTL cache per URL; failures are not cached.
- Types (`TectonicDetailedUser` etc.) mirror tectonic-api's snake_case JSON exactly.
- Startup log line in `index.ts` states ENABLED/disabled; env vars documented in `.env.example`
  (also removed the long-dead v1 `TEAM_ROLE_*`/`MOD_ROLE_ID` block while in there).

**DoD met:** unit-tested with mocked fetch; boots clean and logs "disabled" with env unset. A live
smoke test against a locally running tectonic-api is still worth doing at the start of T2.

### Phase T2 — Verified signups — DONE

Implemented and live-verified 2026-09-01 (browser screenshots: signup form renders the RSN as a
select with a green "✓ Verified against your linked clan account" note; mod roster shows "Lynx
titan ✓"). What exists, for T3 to build on:

- Schema: `signups.womId` (nullable) + `signups.rsnVerified` (default false), fresh migration
  `0000_unusual_king_bedlam.sql`. `shared.Signup` matches.
- `GET /:slug/signup/rsns` — the caller's tectonic RSNs (`[]` when unconfigured/not a member).
- `POST`/`PATCH /:slug/signup` — the route (not signupService, which stays sync/DB-pure) case-
  insensitively matches the submitted RSN against the caller's tectonic RSNs via
  `resolveRsnVerification()` in `routes/bingos.ts`, and only that path can set `rsnVerified: true`.
  A client-sent verified claim is never trusted.
- `SignupForm.tsx` — `useMyTectonicRsns` renders a `<select>` of linked RSNs (auto-selects when
  there's exactly one) in place of free text when ≥1 come back; keeps a signer's already-saved
  but no-longer-linked RSN selectable instead of silently dropping it.
- Verified badges: green "✓" in `SignupRoster.tsx`'s roster table and in `TeamManager.tsx`'s
  captain-candidate `<select>` options, both driven directly by `signup.rsnVerified`.
- `signupService.test.ts` covers `womId`/`rsnVerified` passthrough and reset-on-omit.

**Real bug found and fixed along the way (unrelated to tectonic-api itself, but blocked live
verification):** `server/src/index.ts` had `dotenv.config()` textually before its other imports,
but TS/esbuild hoists all `import` declarations above interleaved plain statements in the compiled
output — so every other import in that file (and everything *they* transitively require) was
actually evaluated before `dotenv.config()` ran. This silently broke three things on every real
cold start (not just this feature): `routes/auth.ts`'s and `routes/mod.ts`'s dev-only gates always
saw `DEV_LOGIN_ENABLED` as `undefined` (routes never registered — this was probably the real cause
of the "dev-login/seed-signups worked after a restart" confusion documented earlier in this
project, previously misattributed each time to orphaned watch processes), `auth/discord.ts` always
saw `DISCORD_GUILD_ID` as `undefined` (silently requesting fewer OAuth scopes than configured), and
`db/index.ts` always ignored a custom `DB_PATH`. Fixed by moving the dotenv call into its own
import-free-of-app-code module (`server/src/env.ts`) and making `import "./env"` the literal first
line of `index.ts` — since hoisting preserves relative order *among* imports, that guarantees it
runs before anything else. Worth knowing if something env-gated still misbehaves: check whether
its gate lives in a file that's a *transitive* import reached another way before `index.ts`'s own
import chain would visit `./env`.

Old implementation notes below, left for reference (repo conventions apply throughout: fresh
migration regen — delete `server/drizzle/` + the dev DB file, `drizzle-kit generate`, never layer a
new migration; kill dev-server processes with `taskkill //PID <pid> //T //F` (tree kill); NEVER run
a full `db:reset` as cleanup if the dev DB may hold the user's own test bingos — it wipes
everything; back up `data/bingo.db` first and ask before a destructive regen if it might):

1. **Schema** (`server/src/db/schema.ts`): `signups` gains `womId: text('wom_id')` (nullable) and
   `rsnVerified: integer('rsn_verified', { mode: 'boolean' }).notNull().default(false)`.
   Update `shared/src/index.ts`'s `Signup` interface to match (`womId: string | null`,
   `rsnVerified: boolean`). Regenerate the migration.
2. **Server** — new function in `signupService.ts` or a thin route handler in
   `routes/bingos.ts`: `GET /:slug/signup/rsns` (requireAuth + requireBingo). Body:
   `const client = getTectonicClient(); if (!client) return res.json({ rsns: [] });` then
   `client.getDetailedUser(req.user!.discordId)` → `res.json({ rsns: user?.rsns ?? [] })`.
3. **Server** — `createSignup`/`updateSignup` in `signupService.ts`: accept the chosen RSN as
   today, but the ROUTE handler (not the service — the service stays sync/DB-pure; do the async
   tectonic call in the route before invoking the service) looks up the user's tectonic RSNs and,
   if the submitted RSN case-insensitively matches one, passes `womId` + `rsnVerified: true` into
   the service params. Never trust a client-sent "verified" claim. Service param interfaces gain
   the two optional fields.
4. **Client** — `core/signup/SignupForm.tsx`: new query hook (`useMyTectonicRsns(slug)` in
   `api/queries.ts`, key `["myTectonicRsns", slug]`) hitting the new endpoint. If ≥1 RSN comes
   back: render a `<select>` of them (auto-select when exactly one) in place of the free-text RSN
   input, with a small "verified" note. If 0 come back: current free-text input unchanged.
5. **Badges** — `core/mod/SignupRoster.tsx` (roster table) and the captain-candidates dropdown in
   `core/admin/TeamManager.tsx`: a small green "✓" / "verified" marker where `signup.rsnVerified`.
   `RosterEntry.signup` already carries the full Signup row so no new plumbing needed.
6. **Tests** — signupService tests for the new params passing through; route-level behavior is
   covered by the live DoD run (this repo doesn't do route-level unit tests).

**DoD — met:** live-verified against a real `docker compose --profile dev up` tectonic-api
instance: a registered clan member's linked RSN auto-fills, selects, and shows the verified badge
on both the signup form and the mod roster; a submitted RSN that doesn't match any linked RSN
falls back to `womId: null, rsnVerified: false`; the client-side free-text fallback for zero linked
RSNs and the "off" behavior are covered by the existing unit tests (both are a simple
`tectonicRsns.length === 0` / `getTectonicClient() === null` branch, already exercised there).
Zero console errors in the browser check.

### Phase T3 — Roster & draft enrichment

The user's stated priority here: **give captains real signal at draft time to evaluate picks.**
Tectonic's detailed user data is rich — points, rank tier, boss PB records, past event placements,
achievements — surface enough of it without turning the pool table into a wall.

Implementation notes:

1. **Draft pool enrichment** — `draftService.getDraftState` is sync/DB-pure; keep it that way.
   Instead, the ROUTE handler for `GET /:slug/draft` (in `routes/bingos.ts`) makes one batched
   `client.getDetailedUsers(poolDiscordIds)` call after getting the state, and merges a new
   optional `tectonic` field onto each pool entry:
   `{ points, tierName, records: topN, events: recentN } | null`. Add the matching optional field
   to `DraftPoolEntry` in `shared/src/index.ts`. Gate it the same as `answers` (mods/captains
   only) or show to everyone — captains and mods are the audience that matters; simplest is to
   include it whenever the integration is on.
2. **Pool table columns** — `core/draft/DraftRoom.tsx`'s `PoolTable` already has generic
   sortable headers (`SortKey` is a string; `poolSortValue` maps key → comparable string). Add
   "Clan pts" (numeric sort — pad or compare numerically, don't localeCompare numbers!) and
   "Rank" (tier name) columns when any pool entry carries tectonic data. For deeper detail
   (PBs/events), an expandable row or hover popover per player beats more columns.
3. **Mod user pickers** — captain-candidate flow already lists signups, which is correct (captains
   must be signed up). The roster-backed search matters for the general-purpose
   `UserSearchInput`/mod tooling ("guild-wide Discord user search" backlog item in
   `docs/implementation-plan.md`): merge `client.getRoster()` results (matched on
   `users.discordId`) into `GET /:slug/admin/users` search results, labeling entries that have no
   local account yet (they can be shown but not selected for roles requiring a login).
4. **Numeric sorting gotcha** — `PoolTable` currently sorts everything with `localeCompare`;
   clan points needs a numeric comparator branch keyed on the tectonic sort keys.

**DoD:** in a live draft with the integration on, captains see and can sort by clan points; a
player row can be expanded/hovered for PBs and event history; with the integration off, the table
renders exactly as today. Zero console errors.

### Phase T4 — Write-back (optional; ask before building)
Mod-triggered action on bingo completion: award custom points per placement and/or register the
bingo as a tectonic event with placements. Needs product decisions (point amounts, event naming) —
explicitly de-scoped until requested.

## 9. Out of scope

- Replacing Discord OAuth or sessions.
- Deriving bingo mod/admin permissions from tectonic rank tiers.
- Any writes to tectonic-api before Phase T4 is green-lit.
