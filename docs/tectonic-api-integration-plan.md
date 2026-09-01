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

### Phase T1 — Tectonic client + config
`server/src/services/tectonicService.ts`: typed fetch client for the four read endpoints. Env:
`TECTONIC_API_URL`, `TECTONIC_API_KEY`, `TECTONIC_GUILD_ID` — all optional; any missing ⇒
`getTectonicClient()` returns null and the integration is off everywhere. Small in-memory TTL cache
(~60s) for roster/leaderboard and per-id lookups. Startup log line. Unit tests with an injected
fetch mock (no live API in tests). Document the env vars + local `docker compose` workflow in
`.env.example`.
**DoD:** with tectonic-api running locally, a smoke call round-trips real data; with env unset,
server boots clean and logs "disabled".

### Phase T2 — Verified signups
Schema (fresh migration regen per repo convention): `signups` gains `womId text` (nullable) and
`rsnVerified boolean not null default false`. New player-facing endpoint `GET /:slug/signup/rsns`
returning the logged-in user's linked RSNs from tectonic (empty when integration off / not a
member). `SignupForm`: when RSNs come back, render a select (auto-picked when exactly one) instead
of the free-text input; free-text fallback otherwise, stored unverified. `createSignup`
re-validates the chosen RSN server-side (never trust the client's claim) and stamps
`rsnVerified`/`womId`. Roster + captain candidates + draft pool show a verified badge.
**DoD:** live browser run — a member with a linked RSN gets it auto-filled and badge-verified; a
user unknown to tectonic falls back to free text and shows unverified; with the integration
unconfigured, signup behaves exactly as today.

### Phase T3 — Roster & draft enrichment
Mod-facing user pickers (captain assignment etc.) gain a tectonic-roster-backed search/merge so
mods can find any clan member, not just prior log-ins. Draft pool: `getDraftState` enriches pool
entries with clan points + tier (when integration on), surfaced as sortable columns in PoolTable.
**DoD:** captains can sort the pool by clan points in a live draft; a non-configured environment
shows the table unchanged.

### Phase T4 — Write-back (optional; ask before building)
Mod-triggered action on bingo completion: award custom points per placement and/or register the
bingo as a tectonic event with placements. Needs product decisions (point amounts, event naming) —
explicitly de-scoped until requested.

## 9. Out of scope

- Replacing Discord OAuth or sessions.
- Deriving bingo mod/admin permissions from tectonic rank tiers.
- Any writes to tectonic-api before Phase T4 is green-lit.
