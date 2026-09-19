# Audit log

Ubiquitous, append-only log of almost every mutation on a bingo (and a few
site-level ones). Full design rationale lives in `docs/audit-log-plan.md`;
this doc is the quick reference for using and extending it day to day.

## Reading the log

- **Mod panel → Audit log tab** (`client/src/core/mod/AuditLog.tsx`): every
  entry for the bingo, filterable by category/team, mod/admin only
  (`GET /api/bingos/:slug/mod/audit-log`).
- **Team info dialog → Recent activity** (`client/src/core/teams/TeamInfoDialog.tsx`,
  via `client/src/headless/useTeamActivity.ts`): one team's own feed, visible
  to that team's members and site mods (`GET /api/bingos/:slug/teams/:teamId/activity`).
  Only reachable from `page.myTeam` today — a mod browsing another team's
  board can't open that team's dialog; use the mod panel's Audit log tab
  (filtered by team) instead.
- **Site admin** (`GET /api/admin/audit-log`): every bingo, or `?bingoId=<id>`
  / `?bingoId=null` to scope to one bingo or site-level entries only. Not yet
  wired to a page — call it directly if you need it.

### Condensed form

Add `?condensed=1` to any of the three reads to collapse runs of alike
entries within the page: five `comfy hug approved a submission for …` rows
become `comfy hug approved 5 submissions for …`. A run is consecutive entries
by the same actor for the same team; inside it, every action that defines a
`condense` renderer in the registry (submission created/approved/rejected,
team member added) is merged into one entry at its newest member's position,
with `condensed: { count, ids, oldestAt }` set. Everything else is left as it
is, deliberately including every `points.*` entry, so point awards stay
granular. The cursor still counts raw rows, so a group never spans two pages.
The team dialog's Recent activity asks for it; the mod panel's tab does not.
The grouping itself is `condenseAuditEntries` in `shared/src/auditCondense.ts`.

### Scoring entries

Points are recorded apart from the submission that earned them: each node
whose awarded points changed on an approval or an undone review gets a
`points.earned` / `points.lost` entry (`source`: `task`, `tile_bonus` or
`line`), written just before the `submission.*` entry so newest-first the
feed reads the approval followed by its points. A board edit made while the
bingo is live records a net `points.rescored` per team whose total moved.
`submission.created` labels name what was submitted (`describeClaims`).

Every read goes through `server/src/audit/query.ts`'s `queryAuditLog` /
`queryTeamActivity`, which resolve actor/team names and render each entry's
`label` from `shared/src/audit.ts`'s registry at read time (not stored) —
wording can change retroactively.

## Adding a new audited action

1. **Add the details shape.** In `shared/src/audit.ts`, add a key to
   `AuditDetailsMap` for your new `"entity.verb"` action, and an entry in
   `AUDIT_ACTIONS` (category, tone, default visibility, title, label
   renderer). Missing either one is a TypeScript error the moment you try to
   call `audit()` with that action — that's the point. Optionally add a
   `condense(inputs)` renderer if a run of this action should read as one line
   in the condensed feed (see above); leave it off when each row must stay
   visible on its own.
2. **Call `audit()` inside the mutation's own transaction.** In the service
   function, right where the row-level side effect happens:
   ```ts
   audit(tx, {
     action: "team.updated",
     bingoId: existing.bingoId,          // null for a site-level entity
     entity: { type: "team", id: teamId, label: existing.name },
     teamId,                              // omit for site-level actions
     details: { changes },                // must match AuditDetailsMap[action]
   });
   ```
   - Wrap the mutation in `db.transaction` if it wasn't already — the audit
     row must commit atomically with the change it describes.
   - Omit `actor` to use the ambient request context (the usual case for a
     route-driven mutation); pass `actor: "system"` for fire-and-forget
     writers (OCR, WOM sync, player-stats fetch) so they're never
     misattributed to whoever's request happened to trigger them.
   - Never put a secret value in `details` — redact it (`diffFields(...,
     { redact: [...] })` or `{ changed: true }`) the way `settings.updated`
     and `team.updated` do for `womGroupVerificationCode` / `codeword`.
   - When a mutation is a deliberate no-op (an empty patch, adding a mod who's
     already a mod), call `markAuditedNoop()` instead of `audit()` — this
     still tells the fallback middleware "handled", without writing a
     meaningless row.
3. **Map the route.** Add `"METHOD /api/full/mount/path": ["your.action"]` to
   `AUDITED_ROUTES` in `server/src/audit/routePolicy.ts`. If the route is a
   deliberate exception (read-only, no state change), call
   `auditSkip("why")(...)` on it instead of adding it to the map.
   `src/audit/routeCoverage.test.ts` enumerates every non-GET `/api/*` route
   and fails if you forget both — that's the CI-enforced backstop for
   anything the two steps above didn't already catch at compile time.
4. **Add a test.** One assertion in the service's own `*.test.ts` (query
   `audit_log` after calling the function, assert the action/visibility/
   details) is enough — see any existing `describe("audit trail", ...)` block
   for the pattern.

## Fallback: `http.mutation`

`server/src/audit/middleware.ts`'s `auditContext` middleware watches every
response; if a non-GET `/api/*` request finishes successfully (`< 400`) and
nothing called `audit()` or `markAuditedNoop()` during it, it writes an
`http.mutation` row itself (method, URL, redacted body) and — outside
production — logs a `console.warn`. This exists so a route added without
going through the steps above still leaves a trace instead of vanishing
silently; it is not a substitute for proper instrumentation (no semantic
`details`, no correct `entityType`), and `routeCoverage.test.ts` should catch
it before it ships anyway.

## Visibility

Each row's `visibility` is `"mods"`, `"team"`, or `"public"`, set by the
registry's default (can be overridden per call). `queryTeamActivity` applies
it: a team's own members see their team's `team`/`public` rows plus every
site-wide `public` row; a mod viewing that same endpoint sees everything
scoped to the team regardless of visibility. There's no per-row mod-only
"extra" payload — a `team`/`public` row must never carry data the team
shouldn't see (e.g. `submission.approved`'s `reviewerNotes` is already shown
to teams elsewhere, so it's safe there too).
