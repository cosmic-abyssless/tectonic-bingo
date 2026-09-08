# Tectonic Bingo — Data Model

> Historical note: this file originally held the PostgreSQL proposal with `tile_sides` /
> `tile_side_items` / `options_group`. That model (and its SQLite successor with
> `tile_task_items` + per-task rule flags) has been replaced by the requirement-tree
> model below. `docs/implementation-plan.md` still describes the older flags where it
> talks about `tile_task_items`; the schema in `server/src/db/schema.ts` is authoritative.
>
> Proposed successor (not yet implemented): `docs/node-graph-model.md` — one node graph per
> bingo replacing tiles/tasks/lines/requirements as separate concepts.

## Shape

```
tiles ─< tileTasks (ordered: label, points, scoringMode, submitRequiresPrevious,
                    pointsRequirePrevious, allowsPreLoad, notes)
          └─ requirementNodes (exactly one root per task; tree via parentId)
               kind: ALL | ANY | COUNT(minCount) | MANUAL
                   | ITEM(quantity, distinctItems, itemGroupId XOR requirementNodeItems.itemName[])

submissions (teamId, submittedByUserId, status, review fields, pointsAwarded)
  └─< claims (nodeId → an ITEM/MANUAL leaf, itemName NULL for MANUAL, quantity, wildcardId NULL)

itemGroups (global, name UNIQUE) ─< itemGroupItems (itemName)
tileWildcards (tileId, itemName, maxRedemptionsPerTeam, applicableNodeId NULL)
teamTaskProgress (teamId, taskId, status, pointsAwarded)   -- derived cache
```

## Semantics

- A **submission** is one screenshot. It is not bound to a task; each **claim** on it is
  bound to a requirement leaf (`nodeId`). One submission can therefore progress several
  tasks (e.g. Part A and Part B of a tile) at once. At launch every claim on a submission
  must target the same tile (`createSubmission` enforces this; it is a single check to
  remove when cross-tile sharing is wanted).
- A claim counts for exactly one leaf. Allocation happens when the player picks the leaf
  at submission time; there is no post-hoc reallocation.
- **Evaluation** (`requirementService.evaluateNode`) is a pure fold over the tree using
  approved claims only:
  - `ITEM`: claims on this node whose `itemName` is in the accepted set (inline names ∪
    group items, case-insensitive) or that carry a `wildcardId`. Sum `quantity`, or count
    distinct names when `distinctItems`. Satisfied when `>= quantity` (default 1).
  - `ALL` / `ANY` / `COUNT(minCount)`: every / at least one / at least `minCount` child.
  - `MANUAL`: the reviewing mod's `taskCompleted` decision.
- `teamTaskProgress` is recomputed per touched task on approve and reject
  (`refreshTaskProgressStatus`): pending submission touching the task ⇒ `pending_approval`;
  approved claims but not complete ⇒ `in_progress`; nothing ⇒ `not_started`; `completed`
  is never downgraded.
- `pointsRequirePrevious` withholds a task's points until the previous task on the tile
  completes; `submitRequiresPrevious` blocks submissions until then.
- **Wildcards** are ordinary claims with `wildcardId` set. The per-team cap is the count of
  approved claims for that wildcard. `applicableNodeId` restricts which leaf it can feed.
- **Item groups** are global (shared across bingos) named sets of item names; an `ITEM`
  leaf references a group or lists inline names, not both.

## Removed

`tileTaskItems`, `submissionItemClaims`, `teamWildcardUsage`, `submissions.taskId`,
`submissions.isWildcardRedemption/wildcardId`, and the task flags `requiresNoDuplicates`,
`allowsPreviouslyAcquired`, `minSubmissions`, `requiresCompleteSet`. Their behaviour is
expressed structurally: "no duplicates" ⇒ `distinctItems`; "fold previous task" ⇒ a shared
leaf or `submitRequiresPrevious`; "min submissions"/"complete set" ⇒ `COUNT`/`ALL` nodes.
