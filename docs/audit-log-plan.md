# Audit log — design and implementation plan

Status: approved design, not yet implemented. This document is self-contained: an implementer should be able to work from it plus the referenced files without the original design conversation.

## 1. Context

There is no audit log today. `docs/implementation-plan.md` ("Timeline/statistics note") explicitly chose "no separate event-log table", so `server/src/services/statsService.ts` reconstructs a 4-type, player-facing highlight-reel *timeline* from `stage_transitions`, `draft_picks`, `team_node_state`, and `team_point_adjustments`. Everything else is untracked: the whole admin surface (settings, team rename/color/codeword, member add/remove, tiles/tasks/lines/categories/questions, moderator grants), every player-side signup/pairing action, and every system writer (OCR results, WOM sync). Where an actor *is* stored it is a single overwriting column (`submissions.reviewedByUserId`; `signups.buyin*` is nulled on unmark, so history is lost). Timestamps are 1-second resolution and already cause tie-ordering issues (`statsService.test.ts`, "same-second ties").

Goal: an append-only, structured, filterable audit log covering almost any action on a bingo, built so that **a new action added later cannot silently escape it**, with two consumers:

1. a mod-panel tab showing the full log (all bingo mods + site admins), and
2. a **team-scoped feed** for players, driven by per-record visibility — different records have different permission gating.

### Decisions already made

- Keep everything: no FK to `bingos`; site-level actions (create/delete bingo, admin grants, item groups) are logged with `bingoId = null`; entries survive bingo deletion.
- No backfill of historical data — the log starts at deploy.
- Update details are **changed fields only, before/after**. Secrets are recorded as changed-only; large JSON blobs are never included.
- The team feed surfaces as a "Recent activity" section in `client/src/core/teams/TeamInfoDialog.tsx`.
- `statsService` and `stage_transitions` stay untouched (additive change). Follow-up, out of scope: have `statsService.getTimeline` read `audit_log`.

### Verified facts the design relies on

- Drizzle's better-sqlite3 `db.transaction(cb)` is fully synchronous and commits when `cb` returns; nested `tx.transaction` is a SAVEPOINT (`node_modules/drizzle-orm/better-sqlite3/session.js`).
- Every route handler goes through `asyncHandler` (`server/src/middleware/errorHandler.ts`).
- `server/src/routes/admin.ts` lines ~29-36 already has a router-level `res.on("finish")` interceptor (broadcasts `bingo_changed` for any successful non-GET) — the precedent for the fallback middleware.
- There is no request-scoped context anywhere; actor ids are threaded as explicit params only where the schema already stores them.
- Services take `db` as the first parameter, are synchronous, and mutate inside `db.transaction((tx) => ...)` where atomicity matters. `type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]` exists in `scoringService.ts`, `submissionService.ts`, `itemGroupService.ts`; `Db` and `Tx` are used interchangeably in practice.
- Node 24, Express 4.22, react-query 5.90 (`useInfiniteQuery` available), vitest with `createTestDb()` from `server/src/testUtils/testDb.ts` (applies every `server/drizzle/*.sql` in order).

## 2. Architecture

An append-only `audit_log` table written by a small `audit(dbOrTx, entry)` helper called **inside each service function, inside the caller's transaction** (atomic with the mutation). Actor and requestId come from an `AsyncLocalStorage` request context created by an app-level middleware; `asyncHandler` re-enters that context so multipart (multer) routes don't lose it. A `res.on("finish")` fallback writes an `http.mutation` row for any successful non-GET `/api/*` request that recorded nothing (nothing is ever silently lost) and warns loudly outside production. A vitest route-coverage test asserts every non-GET route is either in `AUDITED_ROUTES` or explicitly `auditSkip`ped, so adding a route without an audit decision fails CI. A typed action registry in `shared/src/audit.ts` (category, tone, default visibility, label renderer, per-action `details` type) is shared by server and client — adding an action without a details type or registry entry is a compile error. A per-record `visibility` column drives the team feed.

Three layers of "future actions can't escape":

| Layer | Mechanism | Catches |
|---|---|---|
| Compile time | `AuditDetailsMap` + `AUDIT_ACTIONS` registry are keyed by the same union | an action name with no details type or no registry entry |
| Test time | `routeCoverage.test.ts` enumerates every non-GET express route | a new mutating route with no `AUDITED_ROUTES` entry and no `auditSkip` |
| Run time | finish-middleware fallback writes `http.mutation` + warns | any successful mutation that recorded nothing (still visible to mods, never lost) |

## 3. Schema — `server/src/db/schema.ts`

Add (import `index` from `drizzle-orm/sqlite-core`). Comment the three convention exceptions: autoincrement integer id, ms timestamps, no FKs.

```ts
export const auditLog = sqliteTable('audit_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),          // total insertion order; keyset cursor
  bingoId: text('bingo_id'),                                       // null = site-level; no FK, outlives deleteBingo
  requestId: text('request_id'),                                   // groups entries from one HTTP request
  action: text('action').notNull(),                                // AuditAction, dotted entity.verb
  visibility: text('visibility', { enum: ['mods', 'team', 'public'] }).notNull(),
  actorType: text('actor_type', { enum: ['user', 'system', 'dev'] }).notNull(),
  actorRole: text('actor_role', { enum: ['admin', 'mod', 'player', 'system'] }).notNull(),
  actorUserId: text('actor_user_id').references(() => users.id),   // users are never deleted
  onBehalfOfUserId: text('on_behalf_of_user_id').references(() => users.id),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  entityLabel: text('entity_label'),                               // name at the time; entity may be deleted later
  teamId: text('team_id'),                                         // denormalized; no FK
  details: text('details').notNull().default('{}'),                // JSON, AuditDetailsMap[action], capped 8 KB
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (t) => [
  index('audit_log_bingo_idx').on(t.bingoId, t.id),
  index('audit_log_bingo_action_idx').on(t.bingoId, t.action, t.id),
  index('audit_log_bingo_team_idx').on(t.bingoId, t.teamId, t.id),
  index('audit_log_bingo_actor_idx').on(t.bingoId, t.actorUserId, t.id),
  index('audit_log_bingo_created_idx').on(t.bingoId, t.createdAt),
  index('audit_log_entity_idx').on(t.entityType, t.entityId),
]);
```

`category` is **not** stored — it is derived from the registry (`actionsInCategory(category)` → `inArray(action, ...)`), so re-categorising an action needs no migration.

Migration: in `server/` run `npm run db:generate`, rename the generated `drizzle/0006_<random>.sql` to `0006_audit_log.sql` and update its `tag` in `drizzle/meta/_journal.json` (same convention as `0003_duo_signups`), then `npm run db:migrate`. Tests pick it up automatically via `testDb.ts`. **`bingoService.deleteBingo` must not add `auditLog` to its 20-table cascade.**

## 4. Module layout and contracts

```
shared/src/audit.ts                 registry + types (re-export everything from shared/src/index.ts)
server/src/audit/context.ts         AsyncLocalStorage store
server/src/audit/record.ts          audit(), markAuditedNoop(), diffFields(), redactBody()
server/src/audit/describe.ts        denormalizers (describeSubmission, describeTaskNode, userLabel)
server/src/audit/middleware.ts      auditContext (app-level) + auditSkip(reason) marker + fallback
server/src/audit/routePolicy.ts     AUDITED_ROUTES map
server/src/audit/query.ts           queryAuditLog(), queryTeamActivity(), toAuditEntry()
```

### `shared/src/audit.ts`

```ts
export type AuditVisibility = "mods" | "team" | "public";
export type AuditActorType = "user" | "system" | "dev";
export type AuditActorRole = "admin" | "mod" | "player" | "system";
export type AuditTone = "neutral" | "info" | "ok" | "warn" | "danger";     // = client/src/core/ui/Card.tsx TONE keys
export type AuditCategory =
  | "bingo" | "settings" | "board" | "signup" | "draft" | "team" | "submission" | "points" | "moderation" | "system" | "http";
export type AuditEntityType =
  | "bingo" | "user" | "item_group" | "category" | "tile" | "node" | "line" | "question" | "team" | "submission" | "adjustment" | "signup" | "pairing" | "http";

export type FieldChanges<T> = { before: Partial<T>; after: Partial<T> };

// One key per action; the value is the exact `details` shape (see §6).
export interface AuditDetailsMap { /* ... */ }
export type AuditAction = keyof AuditDetailsMap;

export interface AuditLabelInput<A extends AuditAction> {
  details: AuditDetailsMap[A]; entityLabel: string | null; actorName: string | null; teamName: string | null; onBehalfOfName: string | null;
}
export interface AuditActionDef<A extends AuditAction> {
  category: AuditCategory;
  tone: AuditTone;
  visibility: AuditVisibility;            // default; overridable per audit() call
  title: string;                          // static badge text, e.g. "Team renamed"
  label(e: AuditLabelInput<A>): string;   // sentence, e.g. `${actorName} renamed ${before.name} to ${after.name}`
}
export const AUDIT_ACTIONS: { [A in AuditAction]: AuditActionDef<A> };
export function renderAuditLabel(entry: Pick<AuditEntry, "action" | "details" | "entityLabel" | "actor" | "team" | "onBehalfOf">): string;
export function actionsInCategory(category: AuditCategory): AuditAction[];

export interface AuditEntry {
  id: number; bingoId: string | null; at: string /* ISO, ms */;
  action: AuditAction; category: AuditCategory; label: string; tone: AuditTone; visibility: AuditVisibility;
  actor: MinimalUser | null; actorType: AuditActorType; actorRole: AuditActorRole; onBehalfOf: MinimalUser | null;
  entityType: AuditEntityType; entityId: string | null; entityLabel: string | null;
  team: { id: string; name: string; color: string | null } | null;
  requestId: string | null; details: unknown;
}
export interface AuditLogResponse { entries: AuditEntry[]; nextCursor: number | null }
export interface AuditLogFilters {
  action?: AuditAction[]; category?: AuditCategory; actorUserId?: string; teamId?: string;
  entityType?: AuditEntityType; entityId?: string; visibility?: AuditVisibility; since?: string; until?: string; q?: string;
}
```

Labels are rendered **at read time** from self-contained details (details always carry denormalized names, so no DB lookups); wording can improve retroactively, and the client can render labels too (CSV export, headless model). The server still puts `label` on each entry, matching the existing server-rendered-label convention of `TimelineEvent`.

`BroadcastEvent` (`shared/src/index.ts`, "WebSocket envelope") gains:
`| { type: "audit_appended"; bingoId: string; payload: { teamId: string | null; visibility: AuditVisibility } }` — ids only, per the unauthenticated-broadcast rule in `server/src/ws.ts`.

### `server/src/audit/context.ts`

```ts
export interface AuditContext {
  requestId: string;             // crypto.randomUUID()
  actorUserId: string | null;    // req.user?.id
  actorType: AuditActorType;     // 'user' when req.user, else 'system'
  actorRole: AuditActorRole;     // 'admin' if req.user.isAdmin else 'player'; requireBingoMod upgrades to 'mod'
  recorded: number;              // audit() increments; the fallback checks === 0
  skip: string | null;           // set by auditSkip(reason)
}
export function runWithAuditContext<T>(ctx: AuditContext, fn: () => T): T;
export function getAuditContext(): AuditContext | undefined;
```
Augment `Express.Request` in `server/src/types.ts` with `audit?: AuditContext`.

### `server/src/audit/record.ts`

```ts
type Queryable = Db | Tx;

export interface AuditInput<A extends AuditAction> {
  action: A;
  bingoId: string | null;                                   // explicit (null = site-level) — every service already has it in hand
  entity: { type: AuditEntityType; id: string | null; label?: string | null };
  details: AuditDetailsMap[A];
  teamId?: string | null;
  visibility?: AuditVisibility;                             // default AUDIT_ACTIONS[action].visibility
  actor?: "system" | { userId: string | null; type?: AuditActorType; role?: AuditActorRole };  // explicit wins over context; no context → system
  onBehalfOfUserId?: string | null;
  now?: Date;                                               // test injection, like advanceStage's `now`
}
export function audit<A extends AuditAction>(db: Queryable, input: AuditInput<A>): number;   // returns inserted id
export function markAuditedNoop(): void;   // "a decision was made, nothing changed" — suppresses the http.mutation fallback (empty-patch updateTeam, addModerator of an existing mod)
export function diffFields<T extends object>(before: T, after: T, opts?: { only?: (keyof T)[]; exclude?: (keyof T)[]; redact?: (keyof T)[] }): FieldChanges<T> | null;
//   changed keys only; Dates → ISO strings; redacted keys → "[redacted]" on both sides when changed; null when nothing changed
export function redactBody(body: unknown, maxBytes?: number): unknown;   // strips keys matching /code|secret|token|password|verification/i; truncates
```

`audit()` behaviour: resolve actor (explicit → context → system); resolve visibility (explicit → registry); `JSON.stringify(details)` with an 8 KB cap (arrays truncated with a `truncated: true` marker); `db.insert(auditLog)...run()`; `ctx.recorded++` if a context exists; then `broadcast({ type: "audit_appended", bingoId, payload: { teamId, visibility } })` when `bingoId != null`.

Broadcasting immediately, even inside a transaction, is safe here: the server is single-process and the transaction callback is synchronous, so a client's refetch cannot be processed before COMMIT; a rollback only causes a harmless spurious invalidation. This also handles post-response system writers with no special case. If the app is ever clustered, switch to queueing on the context and flushing at finish.

### `server/src/audit/middleware.ts`

```ts
export function auditContext(req, res, next): void;         // app.use(auditContext) in server/src/index.ts after passport.session(), before the routers
export function auditSkip(reason: string): RequestHandler;   // sets req.audit.skip; the returned fn carries `.auditSkipReason` so the coverage test can find it on the route layer
```

`auditContext` builds the context, sets `req.audit`, registers the finish handler **against the closed-over `ctx`** (event-emitter callbacks are not guaranteed to run inside the ALS context — do not call `getAuditContext()` there), then `runWithAuditContext(ctx, next)`.

Finish handler: if `req.method !== "GET" && res.statusCode < 400 && ctx.recorded === 0 && !ctx.skip && req.originalUrl.startsWith("/api/")`, then
`audit(db, { action: "http.mutation", bingoId: req.bingo?.id ?? null, entity: { type: "http", id: null, label: \`${req.method} ${req.originalUrl}\` }, details: { method, originalUrl, routePath: req.route?.path ?? null, params: req.params, body: redactBody(req.body), file: req.file?.filename ?? null }, visibility: "mods" })`
and `console.warn("[audit] unaudited mutation ...")` when `NODE_ENV !== "production"`.

### `asyncHandler` re-entry — `server/src/middleware/errorHandler.ts`

```ts
return (req, res, next) => {
  const run = () => fn(req, res, next).catch(next);
  req.audit ? runWithAuditContext(req.audit, run) : run();
};
```
Why: multer/busboy resume the request through stream events on the pre-existing socket resource, which do not carry the ALS store created later in the request. Without re-entry, `submissionService.createSubmission` (multipart route in `routes/bingos.ts`) would be attributed to `system`. Since every handler goes through `asyncHandler`, this is future-proof for any middleware placed before a handler.

Fire-and-forget promise chains started inside a handler **inherit** the context (OCR after `res.json` in `routes/bingos.ts`; `fetchAndPersistPlayerStats` in the signup routes; WOM syncs in `routes/mod.ts`, `routes/admin.ts`, `routes/bingos.ts`). Those call sites must pass `actor: "system"` explicitly, otherwise the entry is attributed to the requesting player. They keep the inherited `requestId`, which is a feature: the OCR entry links to `submission.created`.

### Role tagging

`server/src/middleware/requireBingoMod.ts` sets `req.audit.actorRole = req.user.isAdmin ? "admin" : "mod"` before `next()`; `requireAdmin.ts` sets `"admin"`. Player is the default. This is how a single `team.updated` action distinguishes an admin-panel rename (`routes/admin.ts` PATCH `/teams/:id`) from a captain self-rename (`routes/bingos.ts` PATCH `/:slug/teams/:teamId`) — both call `teamService.updateTeam`.

### `server/src/audit/routePolicy.ts`

```ts
// Keyed "METHOD <mount prefix><route path>" using the express patterns, e.g.
// "PATCH /api/bingos/:slug/admin/teams/:id": ["team.updated"].
// Mount prefixes come from server/src/index.ts: /api/admin, /api/bingos, /api/bingos/:slug/mod, /api/bingos/:slug/admin.
export const AUDITED_ROUTES: Record<string, AuditAction[]>;
```
Explicit skips via the marker on the route itself: `POST /api/bingos/:slug/submissions/analyze` (`auditSkip("read-only OCR analysis")`). `/auth/*` routes are outside `/api/` and ignored by both the fallback and the coverage test.

### `server/src/audit/query.ts`

```ts
export function queryAuditLog(db: Db, scope: { bingoId: string | null | "all" }, filters: AuditLogFilters, page: { cursor?: number; limit?: number }): AuditLogResponse;
//   ORDER BY id DESC, WHERE id < cursor, LIMIT limit+1 to probe for more; limit default 100, max 500; category → inArray(actionsInCategory(category))
export function queryTeamActivity(db: Db, bingoId: string, teamId: string, opts: { isMod: boolean; cursor?: number; limit?: number }): AuditLogResponse;
//   players: (team_id = :teamId AND visibility IN ('team','public')) OR (team_id IS NULL AND visibility = 'public')
//   mods:    team_id = :teamId OR team_id IS NULL, no visibility filter
```
`toAuditEntry` batch-resolves `actor`/`onBehalfOf` (pattern: `MINIMAL_USER_COLS` in `statsService.ts`) and `team` via one `inArray(teams.id, ...)`; deleted teams resolve to `null` (labels fall back to denormalized names in `details`). `q` is a `LIKE` over `entity_label` and `action`.

## 5. Visibility model

- One `visibility` per record: registry default, per-call override.
- Consumers: mod tab → `queryAuditLog` (everything for the bingo); team feed → `queryTeamActivity` with the rule above; site admin → `queryAuditLog({ bingoId: "all" | null | id })`.
- `http.mutation` fallback rows are always `mods`.
- No split payload in v1: every team-visible action only carries data the team already sees today (reviewer notes are rendered to teams in `SubmissionsDrawer`; adjustment reasons via `getTeamProgress`). If a mod-only extra is ever needed, add a nullable `mod_details` JSON column rather than emitting two rows (two rows would double-count actions and break per-request grouping).
- Secrets are never stored at any visibility: `womGroupVerificationCode` → `"[redacted]"` in `settings.updated`; `teams.codeword` → `{ changed: true }`; `signups.womDataJson` / `runeProfileDataJson` never included.

## 6. Instrumentation inventory

"wrap in tx" = the service currently runs a bare statement; wrap the statement + `audit()` in `db.transaction` so the pair is atomic. Entity label = denormalized name at the time. `teamId` is null unless stated. Line references are approximate as of this writing — locate by function name.

| Action | Service fn | Entity | teamId | vis | details |
|---|---|---|---|---|---|
| `bingo.created` | `bingoService.createBingo` (in tx) | bingo / name | — | mods | `{slug, name, theme, boardRows, boardCols}` |
| `bingo.deleted` | `bingoService.deleteBingo` — audit **before** the cascade; never delete audit rows | bingo / name | — | mods | `{slug, name, stage, counts: {teams, signups, submissions}}` |
| `user.admin_changed` | `userService.setUserAdmin` (wrap); `auth/discord.ts` ADMIN_DISCORD_IDS bootstrap with `actor: "system"` | user / displayName | — | mods | `{isAdmin: {before, after}, source: "admin_panel" \| "env_bootstrap"}`; bingoId null |
| `item_group.created` / `.updated` / `.deleted` | `itemGroupService` (in tx) | item_group / name | — | mods | created `{name, itemCount}`; updated `{changes, items: {added, removed}}`; deleted `{name, itemNames}`; bingoId null |
| `settings.updated` | `bingoService.updateBingoSettings` (wrap) | bingo / name | — | mods | `{changes: diffFields(existing, updated, {only: Object.keys(params), redact: ["womGroupVerificationCode"]})}`; `markAuditedNoop()` if null |
| `moderator.added` / `.removed` | `bingoService.addModerator` (existing → noop), `removeModerator` (`changes === 0` → noop) | user / displayName | — | mods | `{userId, displayName}` |
| `category.created` / `.updated` / `.deleted` | `boardService` category fns (wrap) | category / label | — | mods | created `{label, colorHex, sortOrder}`; updated `{changes}`; deleted `{label, tilesUnassigned}` |
| `tile.created` / `.updated` / `.deleted` | `boardService.createTile` / `updateTile` (wrap; the image-upload route flows through `updateTile` → `tile.updated` with an `imageUrl` change) / `deleteTile` | tile / name | — | mods | created `{name, boardRow, boardCol, categoryId}`; updated `{changes}`; deleted `{name, boardRow, boardCol, taskCount}` |
| `task.created` / `.updated` / `.deleted` | `boardService.createTask` / `updateNode` / `deleteTask` (snapshot the subtree before deleting) | node / label ?? kind | — | mods | `{tileId, tileName, before?, after?}` via `describeTaskNode` (bounded subtree: kind, label, points, minCount, quantity, itemName, children) |
| `line.generated` / `line.updated` / `line.deleted` | `boardService.generateLines` / `updateLinePoints` (read points before) / `deleteLine` | bingo, or line / `${lineType} ${lineIndex+1}` | — | mods | `{pointsPerLine, replaced, created: {row, column, diagonal}}` / `{points: {before, after}}` / `{lineType, lineIndex, points}` |
| `question.created` / `.updated` / `.deleted` / `.reordered` | `signupService` question fns (create/update/delete wrap) | question / prompt | — | mods | created `{prompt, type, required}`; updated `{changes}`; deleted snapshot; reordered `{order: prompts[]}` |
| `team.created` | `teamService.createTeam` (in tx) | team / name | new id | team | `{name, captainUserId, captainName, coCaptainUserId?, coCaptainName?, color}` |
| `team.updated` | `teamService.updateTeam` (wrap; empty patch → noop). Serves both the admin rename (actorRole admin) and the captain self-rename (actorRole player) | team / name (before) | id | team | `{changes: diffFields(name, color), codeword?: {changed: true}}` |
| `team.member_added` / `.member_removed` | `teamService.addTeamMember` / `removeTeamMember` (wrap) | user / displayName | id | team | `{userId, displayName}` |
| `team.deleted` | `teamService.deleteTeam` | team / name | id | mods | `{name, captainName, memberCount}` |
| `submission.created` | `submissionService.createSubmission` (in tx) | submission / `${tileName} — ${taskLabels}` | `params.teamId` | team | `{tileId, tileName, taskLabels, claims: [{nodeId, itemName, quantity}], screenshotUrl}` |
| `submission.approved` / `.rejected` | `scoringService.approveSubmission` / `rejectSubmission` (in tx) — record the semantic result, **never** the `team_node_state` rows the rebuild touches | submission | `submission.teamId` | team | `{tileName, taskLabels, nodeIds, newlyCompletedNodeIds, pointsDelta, reviewerNotes, submittedByUserId}` (rejected: no pointsDelta) |
| `points.adjusted` | `teamService.createPointAdjustment` (wrap) | adjustment / reason | id | team | `{amount, reason}` |
| `stage.changed` | `bingoService.advanceStage` (in tx; keep the existing `stage_transitions` insert) | bingo / name | — | public | `{from, to, startsAtBackfilled}` |
| `draft.started` | `draftService.startDraft` | bingo / name | — | public | `{order: [{teamId, name, draftOrder}]}` |
| `draft.pick` | `draftService.makePick` | user / picked displayName | `currentTeam.id` | team | `{pickNumber, userIds, displayNames, pair}`; `onBehalfOfUserId = currentTeam.captainUserId` when `actingIsAdmin && !isTeamLead` |
| `pairing.requested` / `.accepted` / `.declined` / `.cancelled` / `.dissolved` | `pairingService.requestPairing` (the mutual path goes through the private `accept()`, so put `pairing.accepted` there), `respondToRequest`, `cancelRequest` (wrap), `dissolveForUser` (runs inside `withdrawSignup`'s tx → shares requestId) | pairing / "A & B" | — | mods | `{requesterUserId, targetDiscordId, partnerUserId?, cause?: "withdrawal"}` |
| `pairing.admin_paired` / `.unpaired` | `pairingService.adminPair` / `unpair` (wrap) | pairing / "A & B" | — | mods | `{userIds, displayNames}` |
| `signup.created` / `.updated` / `.withdrawn` | `signupService.createSignup` / `updateSignup` / `withdrawSignup` (in tx) | signup / rsn | — | mods | created `{rsn, rsnVerified, answerCount, reactivated}`; updated `{rsn?: {before, after}, rsnVerified?, answersChanged: questionIds[]}`; withdrawn `{rsn}` |
| `signup.buyin_marked` | `signupService.markBuyin` (wrap) | signup / rsn | — | mods | `{received, collectedByUserId, collectedByName, before: {receivedAt}}` (preserves the history that nulling the columns loses) |
| `submission.screenshot_analyzed` / `.screenshot_analysis_failed` | `submissionService.recordScreenshotAnalysis` / `markScreenshotAnalysisFailed`; `actor: "system"` | submission | via submission row | mods | `{codewordVerified, detectedItemName, textLength}` / `{}` |
| `signup.stats_fetched` / `.stats_fetch_failed` | `playerStatsService.fetchAndPersistPlayerStats`; `actor: "system"`; bingoId via signup row | signup / rsn | — | mods | `{womFound, runeProfileFound}` / `{message}` (never the blobs) |
| `wom.competition_created` / `.roster_synced` / `.sync_failed` | `womCompetitionService.syncWomCompetitionAfterDraft` / `syncWomTeamRename`; `actor: "system"` | bingo / name | — | mods | `{competitionId}` / `{}` / `{operation: "create" \| "rename", message}` |
| `dev.signups_seeded` / `.signups_wiped` | `devSeedService.seedTestSignups` / `deleteAllSignups`; `actor: {type: "dev"}` | bingo / name | — | mods | `{count, source}` / `{deleted}`. The seed loop's `createSignup` calls also emit `signup.created` — acceptable dev-only noise |
| `http.mutation` | fallback middleware only | http / `METHOD url` | — | mods | see §4 |

Deliberately not audited: `POST /auth/logout`, `POST /auth/dev-login` (session, outside `/api/`); `POST /:slug/submissions/analyze` (`auditSkip`, read-only); `boardService.reorderChildren` (no route caller); `server/src/db/seed-dev.ts` (offline script — `broadcast` is a no-op there). Logins are not logged in v1 beyond the admin-bootstrap side effect.

## 7. Read API

- `GET /api/bingos/:slug/mod/audit-log` — add to `server/src/routes/mod.ts` behind the router's existing `requireAuth, requireBingo, requireBingoMod`. Query: `action` (comma list), `category`, `actorUserId`, `teamId`, `entityType`, `entityId`, `visibility`, `since`, `until` (ISO), `q`, `cursor` (integer id), `limit` (default 100, max 500). Returns `AuditLogResponse`.
- `GET /api/bingos/:slug/teams/:teamId/activity` — add to `server/src/routes/bingos.ts` next to the team-submissions route, with the same gate (team must belong to the bingo; `isMod || myTeam?.id === teamId` else 403). Query: `cursor`, `limit` (default 50). Returns `AuditLogResponse`.
- `GET /api/admin/audit-log` — add to `server/src/routes/siteAdmin.ts` (`requireAdmin`). Same filters plus `bingoId=<id>|null` (`null` = site-level entries; omitted = all). Reuses `queryAuditLog`.

## 8. Client

- `client/src/api/queries.ts`: `queryKeys.auditLog(slug, filters)` → `["auditLog", slug, filters]`; `queryKeys.teamActivity(slug, teamId)` → `["teamActivity", slug, teamId]`; `useAuditLog(slug, filters)` via `useInfiniteQuery` (`getNextPageParam: (last) => last.nextCursor`); `useTeamActivity(slug, teamId)` as a plain `useQuery` with `enabled: !!slug && !!teamId` (template: `useModSubmissions`).
- `client/src/context/WebSocketContext.tsx` `invalidateForEvent`: add `case "audit_appended"` → invalidate `["auditLog"]` and `["teamActivity"]`.
- `client/src/pages/ModPage.tsx` `TABS`: add `{ key: "audit", label: "Audit log", adminOnly: false }` (no `from`/`until` — meaningful in every stage) and a `<TabPanel id="audit"><AuditLog slug={slug} /></TabPanel>` **outside** the `isAdmin &&` fragment (like the `signups` panel).
- `client/src/core/mod/AuditLog.tsx`: `FilterChip` rows (category chips with counts from the loaded pages; team chips from `useBingo(slug).teams`; actor chips derived from loaded entries) mirroring `ReviewQueue.tsx`'s two chip rows; `Card` rows with `AuditActionBadge` + `label` + `displayName(actor)` + `timeAgo(at)` (`core/ui/time.ts`) with an absolute `title`; click-to-expand renders `details` (`changes.before/after` as a two-column diff, other keys as key/value); "Load more" on `hasNextPage`; "Copy as CSV" reusing the `csvEscape`/`buildCsv`/`copyCsv` pattern from `SignupRoster.tsx`.
- `client/src/core/ui/AuditActionBadge.tsx`: lookup on `AUDIT_ACTIONS[action].{title, tone}` (pattern: `StatusBadge.tsx`).
- Headless: add `ActivityEntryModel { id: number; label: string; tone: AuditTone; category: AuditCategory; at: number; timeAgo: string; actorName: string | null }` to `client/src/headless/types.ts`; new `client/src/headless/useTeamActivity.ts` exporting `useTeamActivityModel(slug, teamId): { entries: ActivityEntryModel[]; isLoading: boolean }` (maps `useTeamActivity` → models via `renderAuditLabel`); export from `client/src/headless/index.ts`.
- Surface: a "Recent activity" section under the roster list in `client/src/core/teams/TeamInfoDialog.tsx`, calling `useTeamActivityModel(slug, team.id)`. That dialog is the default theme's `TeamInfoDialog` slot and the comic theme does not override it, so both themes get it with no slot-signature or provider changes. Caveat: the dialog opens with `page.myTeam`, so a mod viewing another team uses the mod tab instead.

## 9. Tests (vitest in `server/`)

- `src/audit/record.test.ts`: a throw inside `db.transaction` after `audit()` → no row; explicit `actor: "system"` overrides a live context; `diffFields` (changed keys only, redaction, Date → ISO, `null` when unchanged); visibility default vs override; distinct ms timestamps across rapid inserts; `markAuditedNoop` bumps `recorded` without a row; details size cap.
- `src/audit/context.test.ts`: the store survives `await`, `setTimeout`, and a fire-and-forget `(async () => …)()` started inside `runWithAuditContext`; `asyncHandler` re-enters when called outside the ALS context with `req.audit` set (simulates multer).
- `src/audit/middleware.test.ts`: a minimal express app (`auditContext` + an audited route, an unaudited route, an `auditSkip` route) on `app.listen(0)` hit with Node's global `fetch`: unaudited POST → `http.mutation` row with a redacted body (assert `womGroupVerificationCode` absent) + `console.warn` spy; skipped POST, GET, and 4xx → nothing; `req.route?.path` is populated at finish time.
- `src/audit/query.test.ts`: filters, cursor pagination (limit+1 probe), and the team-feed rule (team X player sees own `team`/`public` rows and global `public` rows, not `mods` rows, not team Y rows; a mod sees `mods` rows for X).
- `src/audit/routeCoverage.test.ts`: set `process.env.DB_PATH = ":memory:"` and `DEV_LOGIN_ENABLED = "true"` first; `vi.mock("../ocr", () => ({ isOcrEnabled: () => false, analyzeSubmissionScreenshot: vi.fn() }))` (native module); dynamically `await import()` the four routers; enumerate `router.stack.filter((l) => l.route)` → `${method.toUpperCase()} ${mount}${l.route.path}` with mounts hard-coded from `index.ts`; assert every non-GET key is in `AUDITED_ROUTES` or has a layer whose `handle.auditSkipReason` is set, and that `AUDITED_ROUTES` has no stale keys.
- Per-service: one assertion per instrumented function in the existing `*.test.ts` files (e.g. `teamService.test.ts`: rename writes `team.updated` with `changes.before.name`/`after.name` and no codeword value; `scoringService.test.ts`: approve writes `submission.approved` with `pointsDelta`; `signupService.test.ts`: withdraw writes `signup.withdrawn` + `pairing.dissolved` with equal `requestId` under `runWithAuditContext`). Add an `auditRows(db, action?)` helper to `testUtils`.
- `statsService.test.ts` and `stage_transitions` untouched.

## 10. Sequencing

1. `shared/src/audit.ts` (types, registry, `AuditDetailsMap`), the `BroadcastEvent` case, re-export from `shared/src/index.ts`.
2. Schema + migration `0006_audit_log`; comment the convention exceptions; confirm `deleteBingo` does not cascade it.
3. `server/src/audit/*`; `asyncHandler` re-entry; `app.use(auditContext)` after `passport.session()` in `index.ts`; role tagging in `requireBingoMod`/`requireAdmin`; `types.ts` augmentation.
4. Instrumentation pass, service by service, extending each service's test file: bingoService → teamService → scoringService → submissionService → signupService → pairingService → draftService → boardService → itemGroupService/userService → system writers (submissionService OCR fns, playerStatsService, womCompetitionService, discord bootstrap) → devSeedService.
5. `AUDITED_ROUTES` + `auditSkip` markers + `routeCoverage.test.ts`.
6. Read endpoints (mod, team activity, site admin) + `query.test.ts`.
7. Client: keys/hooks, ws invalidation, `AuditActionBadge`, `AuditLog` tab, `useTeamActivityModel`, `TeamInfoDialog` section.
8. Docs: `docs/audit-log.md` (module overview + "how to add an action"); amend the "Timeline/statistics note" in `docs/implementation-plan.md` to point at `audit_log`.

## 11. How to add a new audited action (the recipe this design enforces)

1. Add `"entity.verb": { ...details shape }` to `AuditDetailsMap` in `shared/src/audit.ts`.
2. Add the matching `AUDIT_ACTIONS["entity.verb"] = { category, tone, visibility, title, label }` entry (compile error until you do).
3. Call `audit(tx, { action: "entity.verb", bingoId, entity, teamId?, details })` inside the service function, inside its transaction; pass `actor: "system"` for post-response/background writers; call `markAuditedNoop()` on early-return "nothing changed" paths.
4. Add the route to `AUDITED_ROUTES` (or wrap it with `auditSkip("reason")`) — `routeCoverage.test.ts` fails until you do.
5. Add one assertion in the service's test file.

## 12. Risks and mitigations

- ALS context loss across multer stream events → `asyncHandler` re-entry; the finish handler uses the closure, not `getAuditContext()`.
- Fire-and-forget writers inherit the requesting player's actor → mandatory explicit `actor: "system"` at those call sites (covered by tests).
- Express router internals (`router.stack`, `layer.route.path`/`methods`) are undocumented but stable across 4.x; the coverage test fails loudly rather than silently if they move. Importing routers has side effects (DB open, `mkdirSync` of upload dirs, native OCR module) → env vars + `vi.mock` in the test.
- `req.baseUrl` is not reliable at finish time; use `req.originalUrl` + `req.route?.path` (tested).
- Services that currently run bare statements are wrapped in `db.transaction` while instrumenting (listed per row in §6).
- Broadcast-before-commit is safe only single-process; the queue-on-context variant is the fallback if that changes.
- Growth ≈ one row per mutation (a busy bingo is low thousands of rows); details capped at 8 KB; task-tree snapshots are the largest payloads; all hot indexes are `bingoId`-prefixed. No retention policy needed now.
- Dev seeding emits `signup.created` × N with `actorType: "dev"` — dev-only noise.

## 13. Verification

1. `npm run test` in `server/` — all new audit tests plus per-service assertions pass; confirm `routeCoverage` actually guards by temporarily adding an unmapped `router.post` and watching it fail, then remove it.
2. `npx tsc --noEmit -p client` and `-p server` clean; adding a key to `AuditDetailsMap` without a registry entry must be a compile error.
3. `npm run dev`, then in the browser using the dev-login picker: as an admin, rename a team from Settings → Teams, change a setting including the WOM verification code, approve a submission; as a captain (e.g. `jugrah`), rename the team from the team badge dialog and submit a screenshot. In the mod panel "Audit log" tab: entries appear live (ws), category/team/actor chips filter, the expanded `settings.updated` shows `womGroupVerificationCode: "[redacted]"`, the two `team.updated` rows show `actorRole` admin vs player, and the OCR result appears as a `system` entry sharing the `requestId` of `submission.created`.
4. Open the team info dialog as the captain: "Recent activity" shows the rename, submission, and stage change, but no settings/moderation entries; `GET …/teams/:otherTeamId/activity` returns 403 for a player.
5. Trigger an unaudited path deliberately (a temporary bare `router.post`) and confirm an `http.mutation` row with a redacted body plus the `[audit] unaudited mutation` warning; remove it.
