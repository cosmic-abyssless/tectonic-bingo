# Audit log: points as their own entries, item-level submission labels, condensed activity feed

Status: **approved plan, ready to implement.** Written to be executed without
conversation context. Read `docs/audit-log.md` first (the day-to-day guide to
the audit log); `docs/audit-log-plan.md` has the original design if something
here is unclear.

Three changes to the audit log, mostly for the "Recent activity" list in a
team's info dialog:

1. **Scoring is separated from submission approval.** Today the only trace of
   points is the `(+70 pts)` suffix on a `submission.approved` label, which
   mixes task points, a full-tile bonus and a line bonus into one number.
   Every point change becomes its own `points.earned` / `points.lost` entry
   that says which kind it was ("task points", "tile bonus", "line bonus") and
   for what.
2. **A submission's label names what was submitted.** `NavalOfficer submitted
   a screenshot for "GWD ISSUE 2"` becomes `NavalOfficer submitted 1 Armadyl
   crossbow for "GWD ISSUE 2"`.
3. **An optional `condensed` form of the log.** `?condensed=1` on the read
   endpoints collapses runs of alike entries: five `comfy hug approved a
   submission for …` rows become `comfy hug approved 5 submissions for …`,
   and the points rows underneath them become one `Comfy earned +200 pts (…)`
   row. The team activity feed uses it; the mod panel's Audit log tab does not.

Work in the order below and **commit after each phase** (each leaves the app
working and the suites green). Verification commands are at the end.

---

## Facts this plan relies on (verified 2026-09-19)

- Labels are rendered **at read time** from each row's `details` by the
  registry in `shared/src/audit.ts` (`AUDIT_ACTIONS[action].label`, called via
  `renderAuditLabel`, `shared/src/audit.ts:489`). Changing a label renderer
  changes old rows too. Nothing is stored as text.
- `AuditDetailsMap` (`shared/src/audit.ts:44`) is one key per action;
  `AUDIT_ACTIONS` (`:204`) must define every key (compile error otherwise).
- `audit(tx, {...})` (`server/src/audit/record.ts:47`) writes one row. Ids are
  autoincrement, so **rows written later in the same transaction get higher
  ids**, and every read orders by `id desc` (newest first).
- The team feed is `queryTeamActivity` (`server/src/audit/query.ts:123`),
  served by `GET /api/bingos/:slug/teams/:teamId/activity`
  (`server/src/routes/bingos.ts:167`). It only includes actions in the
  categories `["submission", "points", "team"]` (`query.ts:107`), so the new
  `points.*` actions show up there automatically. The mod tab is
  `queryAuditLog` (`query.ts:83`). Both paginate with `paginate()`
  (`query.ts:77`): keyset cursor on the raw row id, `limit + 1` fetch.
- `approveSubmission` (`server/src/services/scoringService.ts:93`) and
  `undoSubmissionReview` (`:189`) already compute `before` (rows of
  `teamNodeState` for the team) and `after` (the `Map<nodeId, {completedAt,
  pointsAwarded}>` returned by `rebuildTeamState`, `:36`). Points can change on
  a node **without** it newly completing (a points gate opening releases a
  task's withheld points), so per-node point deltas must come from comparing
  `pointsAwarded` before vs. after, not from `newlyCompletedNodeIds`.
- Which kind of node holds points: a tile's root node is `tiles.nodeId`, a
  line's root node is `bingoLines.nodeId`; anything else with points is a task
  (or a node inside a task). `tileForLeaf(tx, nodeId, tileByNodeId)`
  (`server/src/services/submissionService.ts:18`) walks up to the tile a node
  belongs to.
- `rescoreBingo` (`scoringService.ts:65`) rebuilds every team after a board
  edit made while the bingo is live (issue #84); today it writes no audit row,
  so a team's points can change silently.
- `submission.created` details already carry
  `claims: { nodeId, itemName: string | null, quantity }[]` and `taskLabels`
  (`shared/src/audit.ts:108`, written at
  `server/src/services/submissionService.ts:122-134`). `itemName` is null for
  MANUAL claims only.
- The client feed: `useTeamActivity` (`client/src/api/queries.ts:459`) →
  `useTeamActivityModel` (`client/src/headless/useTeamActivity.ts`) →
  `ActivityEntryModel` (`client/src/headless/types.ts:8`) → rendered by
  `client/src/core/teams/TeamInfoDialog.tsx:63-72` and
  `client/src/themes/comic/page/TeamInfoDialog.tsx:90-108`. The comic one
  turns the leading actor name into a `PlayerName` link when
  `label.startsWith(actorName)` (`:98`). The mod tab
  (`client/src/core/mod/AuditLog.tsx`) shows `label` and a `DetailsView` of
  `details`, and exports CSV from `label`.
- `routeCoverage.test.ts` only checks that every non-GET route is **listed**
  in `AUDITED_ROUTES` (`server/src/audit/routePolicy.ts`); the action arrays
  are documentation, not enforced. Keep them accurate anyway.
- The e2e suite is deferred in this repo (see `docs/e2e-testing-plan.md`);
  do not run or fix it as part of this work.

---

## Phase 1 — points as their own audit entries

### 1a. Registry (`shared/src/audit.ts`)

Add to `AuditDetailsMap`, next to `"points.adjusted"`:

```ts
/** One row per node whose awarded points changed when a submission was reviewed (or a review undone). */
"points.earned": PointChangeDetails;
"points.lost": PointChangeDetails;
/** Net change for one team after a board edit re-scored the bingo (only written when non-zero). */
"points.rescored": { delta: number };
```

and the shared shape (put it next to `TaskSnapshot`):

```ts
export interface PointChangeDetails {
  /** Which kind of points: a task's own points, a tile's full-completion bonus, or a line bonus. */
  source: "task" | "tile_bonus" | "line";
  nodeId: string;
  /** What to call it: the task's label (or item name), the tile's name, or "Row 3" / "Column 2" / "Diagonal 1". */
  nodeLabel: string;
  /** The tile it belongs to (null for a line). */
  tileName: string | null;
  /** Always positive; earned vs. lost is the action. */
  points: number;
  submissionId: string;
}
```

Registry entries (category `"points"`, visibility `"team"`):

| action | tone | title | label |
|---|---|---|---|
| `points.earned` | `ok` | `Points earned` | see below |
| `points.lost` | `warn` | `Points lost` | see below |
| `points.rescored` | `info` | `Points re-scored` | `${team}'s points changed by ${signed delta} after a board change` |

Labels do **not** start with the actor (the reviewer is the actor of record,
but the sentence is about the team). `team` = `i.teamName ?? "The team"`.
Write one helper used by both:

```ts
const pointsFor = (d: PointChangeDetails) =>
  d.source === "task" ? `task points for "${d.nodeLabel}" on "${d.tileName ?? "a tile"}"`
  : d.source === "tile_bonus" ? `the tile bonus for completing all of "${d.nodeLabel}"`
  : `the line bonus for ${d.nodeLabel}`;
// points.earned:  `${team} earned +${d.points} pts: ${pointsFor(d)}`
// points.lost:    `${team} lost ${d.points} pts: ${pointsFor(d)} (no longer complete)`
```

Then change two existing labels so points aren't shown twice:
- `submission.approved` (`shared/src/audit.ts:327`): drop the
  `` (+${pointsDelta} pts) `` suffix. Keep `pointsDelta` in the details shape
  (the mod tab's DetailsView and `ReviewSubmissionResponse` still use it).
- `submission.review_undone` (`:342`): drop the `` (${pointsDelta} pts) `` suffix.

### 1b. Writer (`server/src/services/scoringService.ts`)

Add one function and call it from both review paths:

```ts
// Writes a points.earned / points.lost row for every node whose awarded points
// changed, so the feed shows what kind of points moved and for what. Written
// BEFORE the submission row so that, newest first, the feed reads
// "approved a submission" followed by its points.
function recordPointChanges(
  tx: Tx,
  params: { bingoId: string; teamId: string; submissionId: string; reviewerUserId: string },
  before: { nodeId: string; pointsAwarded: number }[],
  after: Map<string, { pointsAwarded: number }>,
): void
```

Algorithm:
1. `beforeById = new Map(before.map(r => [r.nodeId, r.pointsAwarded]))`.
   Collect every nodeId in `before` or `after`; `delta = (after.get(id)?.pointsAwarded ?? 0) - (beforeById.get(id) ?? 0)`; skip `delta === 0`.
2. Classify each changed node (load once per call, not per node):
   - `tiles` rows for the bingo → `tileByNodeId`; if the node is a tile root: `source: "tile_bonus"`, `nodeLabel: tile.name`, `tileName: tile.name`.
   - `bingoLines` rows for the bingo → by nodeId; if a line root: `source: "line"`, `nodeLabel` = `lineLabel(line)` where `lineLabel` = `"Row "+(lineIndex+1)` / `"Column "+(lineIndex+1)` / `"Diagonal "+(lineIndex+1)` / for `"custom"` use `"a custom line"`; `tileName: null`.
   - otherwise `source: "task"`, `nodeLabel` = `nodes.label ?? nodes.itemName ?? "a task"`, `tileName` = `tileForLeaf(tx, id, tileByNodeId)?.name ?? null` (`scoringService.ts:8` already imports `tileForLeaf` from `./submissionService`).
3. Order the rows: tasks first, then tile bonuses, then lines (so the feed,
   newest first, shows line → tile bonus → task under the approval; either
   order is fine as long as it's deterministic — the test asserts it).
4. For each: `audit(tx, { action: delta > 0 ? "points.earned" : "points.lost", bingoId, entity: { type: "node", id, label: nodeLabel }, teamId, details: { source, nodeId: id, nodeLabel, tileName, points: Math.abs(delta), submissionId }, actor: { userId: reviewerUserId } })`.

Call sites:
- `approveSubmission` (`:110-125`): call `recordPointChanges(...)` after
  `rebuildTeamState` and **before** the existing `audit(... "submission.approved")`.
- `undoSubmissionReview` (`:203-210`): inside the `previousStatus === "approved"`
  branch, after `rebuildTeamState`, and before the `submission.review_undone`
  audit call. The actor is `params.undoneByUserId` (the mod doing the undo;
  see `UndoSubmissionReviewParams` at `:168`).
- `rescoreBingo` (`:65`): for each team, sum `pointsAwarded` before and after
  `rebuildTeamState`; when the sums differ, `audit(tx, { action: "points.rescored", bingoId, entity: { type: "team", id: team.id, label: team.name }, teamId: team.id, details: { delta: after - before } })`
  (no `actor`: the ambient request context is the admin who made the edit).
  Select `teams.name` alongside `teams.id` for the label.

`routePolicy.ts`: append `"points.earned", "points.lost"` to the
`PATCH /api/bingos/:slug/mod/submissions/:id` array, and `"points.rescored"` to
each admin tile/task/line/bonus route that calls `rescoreBingo` (see
`server/src/routes/admin.ts`; they are the routes with `rescoreBingo(db, ...)`).

### 1c. Tests (`server/src/services/scoringService.test.ts`)

Add a `describe("points audit entries")` using the file's existing helpers
(`seedBaseFixture`, `itemTask`, `submitAndReturn`, `approveSubmission`,
`updateTileBonusPoints`, `generateLines`, `undoSubmissionReview`, `rescoreBingo`):

1. Approving a task on a tile with a bonus and a full line writes three
   `points.earned` rows (`source` task / tile_bonus / line, correct
   `nodeLabel`/`tileName`/`points`), all with `teamId` set and ids **lower**
   than the `submission.approved` row's id.
2. A gated task (`pointsGateNodeId`) approved first writes **no** points row;
   approving the gate later writes two `points.earned` rows (the gate's own
   and the released one), even though only one node newly completed.
3. Undoing an approval writes `points.lost` rows mirroring what was earned,
   with positive `points`.
4. `rescoreBingo` after `updateTileBonusPoints` writes one `points.rescored`
   per team whose total changed (`delta` signed) and none for a team whose
   total didn't.
5. Update the existing assertion at `:222` ("records submission.approved …")
   only if it breaks; `details.pointsDelta` must still be `20`.

Add one label test in `server/src/audit/query.test.ts` (or a new
`server/src/audit/labels.test.ts` calling `renderAuditLabel` directly) for the
three `points.*` labels, including `teamName` null → "The team".

Commit: `Record point changes as their own audit entries`.

---

## Phase 2 — submission labels name what was submitted

`shared/src/audit.ts:320`, `submission.created` label. Replace with:

```ts
label: (i) => `${actor(i)} submitted ${describeClaims(i.details)} for "${i.details.tileName}"`,
```

with a module-level helper (exported, the condensed label in Phase 3 reuses it):

```ts
/** "1 Armadyl crossbow", "3× Bandos hilt and 1 Armadyl crossbow", "proof of Part B", or "a screenshot" when nothing is known. */
export function describeClaims(details: { claims?: { itemName: string | null; quantity: number }[]; taskLabels?: string[] }): string
```

Rules:
- Merge claims by `itemName` (sum quantities), keep first-seen order.
- Quantity 1 → `1 Armadyl crossbow`; more → `3× Bandos hilt` (no pluralising:
  item names are proper nouns).
- Claims with `itemName === null` → `proof of ${taskLabel}` using
  `taskLabels` in order (one per null claim; if there are more null claims
  than labels, fall back to `"proof"`), de-duplicated.
- Join with `", "` and a final `" and "` (`a`, `a and b`, `a, b and c`).
- Empty or missing `claims` (a row from before this field existed) → `"a screenshot"`.

Tests: `describeClaims` unit cases in the labels test file from Phase 1c
(single item, merged duplicates, manual + item mixed, empty). Grep the repo
for `submitted a screenshot` and update anything that asserts the old text.

Commit: `Say what was submitted in the audit label`.

---

## Phase 3 — condensed activity feed

### 3a. Shared shape and pure function

`shared/src/audit.ts`:
- `AuditEntry` gains `condensed?: { count: number; ids: number[]; oldestAt: string }`. Absent on a normal entry.
- `AuditActionDef` gains an optional `condense?(inputs: AuditLabelInput<A>[]): string`
  — the label for a group of two or more entries of this action (inputs newest
  first). Only actions that define it are ever grouped.

New file `shared/src/auditCondense.ts`, exported from `shared/src/index.ts`
with `export * from "./auditCondense.ts";` next to the existing
`export * from "./audit.ts";` (`index.ts:812`):

```ts
/**
 * Collapses runs of alike entries in one page of the log. A "run" is a stretch
 * of consecutive entries by the same actor for the same team; inside a run,
 * every action that defines `condense` is merged into one entry per action,
 * placed where its newest member was. Everything else is left alone.
 * Groups never span pages: the cursor still counts raw rows.
 */
export function condenseAuditEntries(entries: AuditEntry[]): AuditEntry[]
```

Algorithm (entries are newest first, as every query returns them):
1. Run key = `` `${entry.actor?.id ?? entry.actorType}|${entry.team?.id ?? ""}` ``. Walk the list, cutting a new run whenever the key changes.
2. Within a run, for each entry in order: if `AUDIT_ACTIONS[entry.action].condense` is undefined, emit it as-is. Otherwise append it to the bucket for `entry.action` (create the bucket at this position on first sight).
3. Emit buckets at the position of their first (newest) member. A bucket of one → its entry unchanged. A bucket of `n ≥ 2` → a copy of the newest member with `label = condense(members.map(toLabelInput))`, `condensed = { count: n, ids: members.map(m => m.id), oldestAt: members[n-1].at }`. `id`, `at`, `details`, `tone` stay those of the newest member.
4. `toLabelInput(entry)` is the same mapping `renderAuditLabel` does
   (`shared/src/audit.ts:489-494`); extract it into a small exported helper
   `toAuditLabelInput(entry)` and use it in both places.

`condense` renderers to add in `AUDIT_ACTIONS` (n = inputs.length; "tiles" =
distinct `details.tileName` in first-seen order, rendered as `"A", "B"` when
≤ 3 distinct, else `${count} tiles`):

| action | condensed label |
|---|---|
| `submission.created` | `${actor} submitted ${mergedClaims} for ${tiles}` where `mergedClaims` = `describeClaims` over the concatenation of every member's `claims`/`taskLabels` |
| `submission.approved` | `${actor} approved ${n} submissions for ${tiles}` |
| `submission.rejected` | `${actor} rejected ${n} submissions for ${tiles}` |
| `points.earned` | `${team} earned +${total} pts: ${breakdown}` |
| `points.lost` | `${team} lost ${total} pts: ${breakdown}` |
| `team.member_added` | `${actor} added ${names joined} to ${team}` |

`breakdown` lists the non-zero sources in the order task → tile bonus → line:
`${sum} task points (${count} tasks)` / `${sum} tile bonus` / `${sum} line bonus (${count} lines)` — singular when count is 1 — joined with `", "`. Example:
`Comfy earned +200 pts: 135 task points (5 tasks), 50 tile bonus, 15 line bonus (1 line)`.

Actor-led condensed labels must still **start with the actor name** so the
comic dialog's `PlayerName` link keeps working.

### 3b. Server

- `query.ts`: `paginate(db, conditions, limit, condensed: boolean)`; when
  true, `entries = condenseAuditEntries(entries)` after `toAuditEntries`.
  `nextCursor` is unchanged (computed from the raw rows before condensing).
  Add `condensed?: boolean` to the `opts`/`page` objects of `queryAuditLog`
  and `queryTeamActivity`.
- `routes/bingos.ts:167` (team activity), `routes/mod.ts:172` (mod audit log)
  and `routes/siteAdmin.ts:112` (site admin): read `req.query.condensed` and
  pass `condensed: req.query.condensed === "1" || req.query.condensed === "true"`.

Tests, new file `server/src/audit/condense.test.ts` (build `AuditEntry`
objects by hand; no DB needed):
1. Five `submission.approved` by one mod for one team, interleaved with their
   `points.earned` rows → two entries: `approved 5 submissions for "A", "B"`
   with `condensed.count 5`, and one `earned +… pts` with the breakdown; `ids`
   contain every member; positions are those of the newest members.
2. A different actor in the middle splits the run (two groups, not one).
3. An action without `condense` (e.g. `points.adjusted`) is passed through
   untouched, even inside a run.
4. A bucket of one entry is returned unchanged (no `condensed` field).
5. `submission.created` group merges item quantities across submissions.

And in `query.test.ts`'s `queryTeamActivity` block: `condensed: true` collapses
a seeded run and leaves `nextCursor` equal to what the raw query returns.

### 3c. Client

- `client/src/api/queries.ts:459`: request `/activity?condensed=1` and add
  `"condensed"` to the query key (`queryKeys.teamActivity`, `:33`), so the
  cache key differs from an uncondensed fetch. The mod tab keeps fetching the
  raw log.
- `client/src/headless/types.ts:8` `ActivityEntryModel`: add
  `count: number` (`entry.condensed?.count ?? 1`). `useTeamActivity.ts` fills it.
  Both dialogs need no change; if you want the count visible, the comic dialog
  may append a small `×5` `InkTag` after the label when `count > 1`, nothing
  else.
- `client/src/context/WebSocketContext.tsx`: no change (`teamActivity` is
  already invalidated on submission events, `:67`).

Commit: `Condensed form of the audit log for the team activity feed`.

---

## Phase 4 — docs

Add to `docs/audit-log.md`:
- under **Reading the log**: `?condensed=1` and what it does (one paragraph,
  including that groups don't span pages);
- under **Adding a new audited action**: the optional `condense` renderer;
- one line noting that scoring is recorded as `points.earned` / `points.lost`
  / `points.rescored`, separate from `submission.*`.

Commit: `Document points entries and the condensed audit log`.

---

## Must not change

- Existing action names, categories, visibilities, or `AuditDetailsMap`
  shapes (add fields/actions only). `submission.approved.details.pointsDelta`
  stays and stays correct.
- `ReviewSubmissionResponse` (`shared/src/index.ts:441`) and the mod review
  UI that consumes it.
- Visibility rules in `queryTeamActivity` and cursor semantics in `paginate`.
- The mod panel's Audit log tab keeps showing raw (uncondensed) rows.
- Do not touch the e2e suite.

## Verification

From the repo root (Windows: use `../node_modules/.bin/<tool>` from inside the
package, as below):

```
cd server && ../node_modules/.bin/tsc --noEmit && ../node_modules/.bin/vitest run
cd ../client && ../node_modules/.bin/tsc --noEmit && ../node_modules/.bin/vitest run && ../node_modules/.bin/vite build
```

Manual check on the dev server (`npm run dev` at the root, which starts
server and client; a dev-login is available in non-production): as a mod, approve a few submissions for one
team in a row, then open that team's info dialog. The Recent activity list
should show one "approved N submissions" line and one "earned +X pts: …"
breakdown line under it; the mod panel's Audit log tab should show every row
separately with the `points.*` rows carrying their own labels. Submit a
screenshot as a player and confirm the label names the item and quantity.

## Acceptance

- A submission approval produces one `submission.approved` row plus one
  `points.*` row per node whose points changed, each naming its kind.
- Undo and board-edit re-scoring are traced the same way.
- `submission.created` labels name the items (with quantities) or the task.
- `?condensed=1` collapses runs as specified; without it nothing changes.
- All suites green; no `http.mutation` warnings in the dev server log for the
  routes touched.
