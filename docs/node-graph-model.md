# Tectonic Bingo — Node-graph scoring model

> Status: **proposed, agreed in principle (2026-09-07)**. Successor to the requirement-tree
> model in `docs/data-model-proposal.md`. Part 1 is the design; Part 2 is the phased
> implementation plan, written so a lower-tier model can execute it phase by phase.
> `server/src/db/schema.ts` remains authoritative for what is *currently* live.

---

# Part 1 — Design

## 1. Motivation

PR #2 introduced a pure evaluator, `requirementService.evaluateNode`, over a per-task tree
of `ALL | ANY | COUNT | ITEM | MANUAL`. Everything *above* the task is still hand-rolled:

- Tile completion is `ALL` over tasks, reimplemented as a count query (`scoringService.isTileCompleteForTeam`).
- Line completion is `ALL` over tiles, reimplemented as a loop that only runs when a tile completes (`recordCompletedLinesForTile`).
- Points live on two tables (`tileTasks.points`, `bingoLines.points`) and are summed by two paths (`teamService.getTeamProgress`, `statsService.getPointsOverTime`).
- Team state is a mutable cache (`teamTaskProgress`, `teamCompletedLines`) patched incrementally at approval. That is where the soft spots are: `releaseWithheldPointsOnNext` only releases the *next* task and uses `pointsAwarded === 0` as the "withheld" sentinel; completed tasks are never downgraded; one `taskCompleted` boolean satisfies every `MANUAL` leaf a submission touches.
- Nothing can express "bonus for Part A on every demonic tile", a tile that is `ANY` of its parts, or a leaf shared by two tasks.

The fix: **one graph of nodes per bingo**. Tiles, tasks, lines and requirements are all
nodes; any node may carry points; a node may have several parents (a tile sits in a row,
a column and maybe a diagonal). Team state is a pure function of the graph and the
team's approved claims, recomputed bottom-up. Tiles remain a UI/submission abstraction.

## 2. Shape

```
nodes (id, bingoId, kind: ALL|ANY|COUNT|ITEM|MANUAL,
       label?, description?, notes?, points int default 0,
       minCount?, quantity?, distinctItems bool default false, itemGroupId?,
       pointsGateNodeId?, submitGateNodeId?, allowsPreLoad bool default false)
nodeEdges (parentId → nodes, childId → nodes, sortOrder)      -- DAG; UNIQUE(parentId, childId)
nodeItems (nodeId → nodes, itemName)                           -- inline accepted names; UNIQUE(nodeId, itemName)

tiles      (…grid/image/category/freeze columns as today…, nodeId → nodes UNIQUE)  -- presentation
bingoLines (id, bingoId, nodeId → nodes UNIQUE, lineType, lineIndex)               -- presentation
itemGroups / itemGroupItems                                    -- unchanged
tileWildcards (tileId, itemName, maxRedemptionsPerTeam, description, applicableNodeId?)  -- unchanged

submissions (teamId, submittedByUserId, status, submittedAt, reviewedAt, reviewedByUserId, reviewerNotes)
  └─< claims (submissionId, nodeId → ITEM/MANUAL leaf, itemName NULL for MANUAL, quantity, wildcardId?)  -- unchanged

teamNodeState (teamId, nodeId, completedAt, pointsAwarded)     -- derived cache; one row per COMPLETE node; UNIQUE(teamId, nodeId)
teamPointAdjustments (teamId, bingoId, amount, reason, createdByUserId)  -- unchanged; the only manual points input
```

"Task" and "line" are **not kinds**. A task is a direct child of a tile's node, rendered in
edge `sortOrder`; a line is a node referenced by a `bingoLines` row. `kind` is purely logical.
The graph is per-bingo.

Removed: `tileTasks`, `requirementNodes` (→ `nodes`), `requirementNodes.parentId` /
`.taskId` (→ `nodeEdges`), `requirementNodeItems` (→ `nodeItems`), `bingoLines.points`
(→ node), `bingoLineTiles` (→ edges), `teamTaskProgress`, `teamCompletedLines`,
`submissions.pointsAwarded`, `tileTasks.scoringMode` (a manual task is a `MANUAL` node),
`submitRequiresPrevious` / `pointsRequirePrevious` (→ the two gate FKs).

## 3. Invariants (enforced in the service layer on every write)

- The edge set is acyclic. Every edge joins two nodes with the same `bingoId`.
- `ITEM` and `MANUAL` nodes have no children. Composite kinds may have zero children:
  empty `ALL` ⇒ true, empty `ANY`/`COUNT` ⇒ false (today's semantics, kept).
- Claims target leaves only (`ITEM`/`MANUAL`), as `createSubmission` enforces today.
- `pointsGateNodeId` / `submitGateNodeId` reference a node in the same bingo that is not a
  descendant of the gated node.
- A tile's node and a line's node are each referenced by exactly one presentation row.
  A node referenced by `tiles` must not also be referenced by `bingoLines`.
- `ITEM` accepted names = `nodeItems` ∪ the group's items (union, matching the current
  code in `requirementService.getRequirementTrees`; the old doc's "XOR" wording is dropped).

## 4. Engine

One pure function per team. Input: the bingo's graph, the team's **approved** claims
(joined to `submissions.reviewedAt`), the team's adjustments. No DB access inside.

```ts
type NodeResult = { complete: boolean; completedAt: Date | null };

function evaluate(node, memo): NodeResult {           // memoised by node.id — a DAG is topological
  if (memo.has(node.id)) return memo.get(node.id)!;
  let r: NodeResult;
  switch (node.kind) {
    case "ITEM": {
      // claims on this node whose itemName is accepted (case-insensitive) OR carry a wildcardId,
      // ordered by reviewedAt. Tally = Σ quantity, or count of distinct names when distinctItems.
      // complete when tally >= (quantity ?? 1); completedAt = reviewedAt of the claim that first reached it.
    }
    case "MANUAL": {
      // complete when ≥1 approved claim on this node; completedAt = earliest reviewedAt.
    }
    case "ALL":   { /* every child;              completedAt = max(children.completedAt) */ }
    case "ANY":   { /* some child;               completedAt = min over complete children */ }
    case "COUNT": { /* ≥ (minCount ?? 1) children; completedAt = minCount-th smallest child completedAt */ }
  }
  memo.set(node.id, r); return r;
}

awarded(node) = complete(node) && (node.pointsGateNodeId == null || complete(gate)) ? node.points : 0
total(team)   = Σ awarded(node) over all nodes  +  Σ adjustments.amount
```

`ITEM` tally semantics are exactly today's `evaluateNode` (including the quirk that a
claim with a `wildcardId` bypasses the accepted-name check). What changes by construction:

- Withheld points release as a cascade — there is no release code.
- Rejecting (or, later, revoking) any submission is "recompute"; points and lines claw back correctly.
- `MANUAL` is decided per node by an approved claim on that node, not a boolean threaded through the submission. A mod approving a submission that touches a `MANUAL` leaf is approving that claim.
- Order of evaluation cannot affect the result.

## 5. Persistence of team state

- `teamNodeState` is rebuilt for the affected team **inside** the approve/reject
  transaction: run `evaluate` over every node in the bingo, upsert rows for complete nodes
  (`completedAt`, `pointsAwarded = awarded(node)`), delete rows for nodes no longer complete.
  It is a cache; `evaluate` is the truth. A `rebuildTeamState(tx, teamId)` helper is the only writer.
- Soft statuses are **not stored**. The board read path derives a status per node from the
  team's submissions: complete ⇒ `completed`; a pending claim anywhere in the subtree ⇒
  `pending_approval`; an approved claim in the subtree ⇒ `in_progress`; else `not_started`.
- Stats read `teamNodeState.completedAt` (points over time, "first to complete") instead of
  two tables.
- Approving a `MANUAL` claim with "not completed" = rejecting that submission. There is no
  third state.

## 6. Submission-time rules (outside the engine, unchanged in spirit)

`createSubmission` keeps: stage must be `live` and `now >= startsAt`; ≥1 claim; every claim
targets a leaf; all claims on one tile (still a single check, see §11); tile freeze window;
wildcard belongs to the tile, respects `applicableNodeId`, and the per-team cap (count of
approved claims with that `wildcardId`); `ITEM` claims carry an `itemName`.
New: **`submitGateNodeId`** — a claim on a leaf under node N is rejected while N's gate node
is not complete for this team (replaces `submitRequiresPrevious`; the admin UI's
"requires previous task" checkbox sets the gate to the previous sibling).
`allowsPreLoad` stays a display hint on the node.

## 7. Worked examples (shapes from `server/src/db/seed-dev.ts`)

1. **Vorkath** — tile node `ALL` → [Part A `ALL`(ITEM Tanzanite fang, ITEM Magic fang) 25 pts;
   Part B `ITEM`(…) 35 pts, `pointsGateNodeId = A`, `submitGateNodeId = A`]. If B's claims
   are approved first: B `complete = true, awarded = 0`. When A completes, both award — nothing
   else runs.
2. **Cerberus** — Part A and Part B are `ITEM` leaves on the same item group; the jar wildcard
   has `applicableNodeId = Part A`.
3. **Barrows** — `ANY` → [`ALL`(4 Ahrim's leaves), `ALL`(4 Dharok's leaves)]; `completedAt` is
   the set that finished first.
4. **Wintertodt** — `COUNT(minCount 2)` over 3 leaves; one screenshot claiming two leaves completes it.
5. **K'ril** — one `ITEM` with `quantity 2, distinctItems true` over three names. This is why
   items stay leaves: "5 of any Cerberus drop" needs a quantity *sum* across names, which a
   `COUNT` over per-name nodes cannot express.
6. **Row line** — node `ALL` over the 7 tile nodes, `points 15`, one `bingoLines` row
   (`lineType 'row', lineIndex 0`). A tile node therefore has up to three parents.
7. **New** — "Part A on every demonic tile": `ALL` over the 7 Part-A nodes, `points 30`, no
   presentation row. Impossible today; free here.

## 8. Mapping from the current model

| Today | Node graph |
|---|---|
| `tileTasks` row (label, description, points, notes, sortOrder) | child node of the tile node; fields on `nodes`, order on the edge |
| `tileTasks.scoringMode = 'manual'` | task node with `kind = 'MANUAL'` |
| `requirementNodes.taskId` / `parentId` | `nodeEdges` |
| `requirementNodeItems` | `nodeItems` |
| `bingoLines.points` + `bingoLineTiles` | line node `points` + edges to tile nodes |
| `teamTaskProgress` (status, pointsAwarded, completedAt) | `teamNodeState` (complete nodes only) + derived soft status |
| `teamCompletedLines` | `teamNodeState` row for the line node |
| `submissions.pointsAwarded` / `pointsAwardedOverride` | removed; mod creates a `teamPointAdjustments` row |
| `pointsRequirePrevious` | `pointsGateNodeId` |
| `submitRequiresPrevious` | `submitGateNodeId` |
| `approveSubmission({ taskCompleted })` | approving the submission approves its `MANUAL` claim |
| `getApprovedClaimsForTask` | one query: the team's approved claims across the bingo |
| `isTileCompleteForTeam` / `recordCompletedLinesForTile` / `releaseWithheldPointsOnNext` / `refreshTaskProgressStatus` | deleted |
| `Claim.taskId`, `ReviewSubmissionResponse.taskIds`, WS `submission_reviewed.taskIds` | `nodeIds` (the leaf ids touched); clients map leaf → tile via the graph |

## 9. Where the abstraction deliberately stops

- Items are `ITEM` leaves (names ∪ group, quantity, distinct), not one node per item name.
- Tiles keep a table: grid position, image, category, freeze are presentation/submission concerns.
- Points are a property of a complete node. No per-claim points, no partial credit.
- No cross-bingo nodes or edges.

## 10. Open questions for review

- Keep the same-tile restriction on submissions, or lift it now that combos are nodes? (Design assumes keep; it is one `if`.)
- Should the admin UI expose `points` on inner requirement nodes, or only on tile children and lines? Engine supports either; UI can hide it initially.
- `completedAt` for `COUNT`: k-th smallest child time (proposed) — equals the approval that tipped it. Confirm.

---

# Part 2 — Implementation plan

Conventions carried over from `docs/implementation-plan.md` §"Conventions for the
implementing agent" apply verbatim (thin routes, every multi-write in a transaction,
UUIDs everywhere, shared types in `shared/`, ~300-line files). Plus, from experience on
this repo:

- **Fresh migration, no data migration.** Delete `server/drizzle/*` and the dev DB, rewrite
  `schema.ts`, run `npm run db:generate --workspace=server` to produce a new `0000_init.sql`.
  Never write an incremental migration for this.
- Never run `npm run db:reset` as cleanup on a DB the user cares about; use it only on a
  throwaway dev DB.
- Kill a stray dev server with `taskkill //T //F //PID <pid>` (tree kill), not by PID alone.
- Verify each phase with `npm run build --workspace=server`, `npm run build --workspace=client`
  (that runs `tsc`), and `npm run test --workspace=server`. Current baseline: **159 tests, all passing**.
- Do not start the next phase until the previous one's DoD is green.

### Phase N1 — Schema + shared types

Files: `server/src/db/schema.ts`, `shared/src/index.ts`, `server/drizzle/*` (regenerated).

- Add `nodes`, `nodeEdges`, `nodeItems`, `teamNodeState` per §2. Add `tiles.nodeId`
  (unique, FK). Rewrite `bingoLines` (`nodeId`, drop `points`). Drop `tileTasks`,
  `requirementNodes`, `requirementNodeItems`, `bingoLineTiles`, `teamTaskProgress`,
  `teamCompletedLines`, `submissions.pointsAwarded`.
- `shared`: replace `RequirementNode`/`RequirementNodeInput`/`TileTask`/`TileTaskBase` with
  `GraphNode` (read shape: all node columns + `children: GraphNode[]` in edge order +
  `acceptedItemNames`) and `GraphNodeInput` (write shape, recursive, plus optional `id` so
  edits can preserve leaf ids that claims point at). `Tile` gets `node: GraphNode`; the
  board response adds `lines: { id, lineType, lineIndex, node: GraphNode }[]`. `Claim.taskId`
  → `nodeId` only. `TeamNodeState { nodeId, completedAt, pointsAwarded }` replaces
  `TeamTaskProgress` + `CompletedLine`. `ReviewSubmissionResponse` / WS
  `submission_reviewed` carry `nodeIds` and `newlyCompletedNodeIds`.
- DoD: `db:generate` produces one fresh `0000_init.sql`; `tsc` in `shared` passes. Server and
  client will not compile yet — that is expected until N2/N4.

### Phase N2 — Graph service + engine

Files: new `server/src/services/graphService.ts` (replaces `requirementService.ts`),
new `server/src/services/engine.ts` (pure, no DB imports).

- `engine.ts`: `evaluateTeam(nodes, edges, approvedClaims): Map<nodeId, NodeResult>` and
  `awardedPoints(nodeId, results, nodes)` exactly per §4. Unit-test it with in-memory
  fixtures for every kind, the gate, the DAG (one leaf under two parents evaluates once and
  counts for both), `completedAt` for each kind, and the empty-composite rules.
- `graphService.ts`: `loadGraph(db, bingoId)` (nodes + edges + inline items + group items →
  `GraphNode` roots and a flat map); `replaceSubtree(tx, rootNodeId, input)` (delete the
  subtree's nodes not referenced elsewhere, re-insert, preserve ids given in the input so
  existing claims keep pointing at their leaf); `addEdge` / `removeEdge` with the acyclicity
  and same-bingo checks from §3; `assertGateValid`. Null out `tileWildcards.applicableNodeId`
  for deleted nodes as today.
- DoD: engine tests + graphService tests green; `requirementService.ts` deleted.

### Phase N3 — Scoring, submissions, board, stats, teams

Files: `scoringService.ts`, `submissionService.ts`, `boardService.ts`, `statsService.ts`,
`teamService.ts`, their `*.test.ts`, `seed-dev.ts`, `devSeedService.ts`.

- `scoringService`: `approveSubmission(tx, id, reviewer, notes)` — flip status, then
  `rebuildTeamState(tx, teamId)` (§5), return `{ nodeIds, newlyCompletedNodeIds, pointsDelta }`.
  `rejectSubmission` — flip status, `rebuildTeamState`. Delete the four helpers listed in §8.
  Wildcard cap check stays.
- `submissionService.createSubmission`: keep every gate in §6; replace the
  `submitRequiresPrevious` block with the `submitGateNodeId` check (walk from the claimed
  leaf up to the tile node; any ancestor's gate must be complete in `teamNodeState`).
- `boardService`: `getBoardTiles` returns tiles with `node` subtrees and the bingo's lines;
  `createTile` creates the tile node (`ALL`, 0 pts); task CRUD becomes
  `createChildNode(tileNodeId, input)` / `updateNode` / `deleteNode` / `reorderChildren`;
  `generateLines` creates line nodes + edges (rows, columns, diagonals when square; 15 pts
  default) and `bingoLines` rows, wiping previous line nodes first.
- `teamService.getTeamProgress`: `totalPoints = Σ teamNodeState.pointsAwarded + Σ adjustments`;
  return `nodeStates` instead of `taskProgress` + `completedLines`.
- `statsService`: `getPointsOverTime` = `teamNodeState` deltas + adjustments; `getTimeline`
  "first to complete" over tile-child nodes; `getTileHeatmap` counts complete tile-children.
- `seed-dev.ts`: rebuild the demo board with the §7 shapes, including one line and the
  "Part A on every tile in row 0" bonus node.
- DoD: server `tsc` clean; every existing test in these files ported (expect the count to
  land near the current 159, with the deleted-helper tests replaced by engine tests);
  `db:reset` on a throwaway DB + `db:seed:dev` run clean.

### Phase N4 — Routes + client

Files: `server/src/routes/{admin,mod,bingos}.ts`; client `core/board/*`, `core/submissions/*`,
`core/mod/ReviewQueue.tsx`, `core/admin/{TaskEditor,RequirementTreeEditor,TileEditorPanel,LineEditor}.tsx`,
`api/*`.

- Routes: task endpoints become node endpoints under the tile
  (`POST /tiles/:tileId/nodes`, `PATCH|DELETE /nodes/:nodeId`, `POST /nodes/:nodeId/edges`);
  approve drops `taskCompleted` and `pointsAwardedOverride`; add
  `POST /teams/:teamId/adjustments` if not already exposed to mods.
- Client: `TaskPanel` renders a tile-child node (recursion already exists); `TileModal` lists
  `tile.node.children`; `SubmissionModal.getAvailableTasks` uses `submitGateNodeId` against
  `nodeStates`; `ReviewQueue` drops the manual `taskCompleted` toggle (approving a MANUAL
  claim is the decision) and gains an "adjust points" affordance that posts an adjustment;
  `TileCell` badge = Σ awarded over the tile's subtree / Σ points in the subtree;
  `RequirementTreeEditor` gains `points`, the two gate pickers (sibling dropdown), and
  `MANUAL` as a root kind; `LineEditor` edits the line node's points.
- DoD: client `tsc`/build clean; live browser pass (claude-in-chrome) on a fresh seeded DB:
  submit B before A on Vorkath → shows complete with 0 pts → approve A → both award;
  complete a row → line points appear; reject a pending submission → statuses recompute.

### Phase N5 — E2E + docs

- `e2e/full-flow.spec.ts`: item entry now goes through the node editor (labels change);
  `e2e/special-tile-rules.spec.ts`: un-skip and rewrite against gates.
- Update `docs/data-model-proposal.md` to "superseded by node-graph-model.md"; fix the stale
  flag references in `docs/implementation-plan.md` §1/§3 and `docs/e2e-testing-plan.md`.
- DoD: `npm run test:e2e` green; this file's Status line flipped to "implemented".
