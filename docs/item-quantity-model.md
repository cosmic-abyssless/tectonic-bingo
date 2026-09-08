# Tectonic Bingo — Item/quantity model refinement

> Status: **implemented (2026-09-08)**, on branch `item-quantity-model`, not yet merged to
> `main`. Written the same day for review before building; revised after a code-level review
> against the engine, submission path and client (§§7–8 and the amendments in §2 came out of
> that review), then built in full (Q1–Q8: schema, engine, graphService, submission/scoring
> services, OCR/text-match, admin `RequirementTreeEditor`/`TaskEditor`, `SubmissionModal`,
> every read-side board/mod component, and the full server test suite). §13's file list is
> the authoritative account of what changed. Builds on `docs/node-graph-model.md`
> (implemented, on `main`) — this doc revises how `ITEM` leaves, quantities, item groups,
> "distinct" requirements and wildcards work; everything else in that doc (tiles/lines as
> presentation, `teamNodeState`, gates, the DAG, `ALL`/`ANY`/`COUNT`) is unchanged.
>
> **§9 was rebuilt leaner than originally written.** The first attempt added a
> `tiles.sharedItemPool` column and a bespoke `SharedPoolInput` write path (COUNT/SUM/
> FULL_SET) — on review this turned out to duplicate `ALL`/`ANY`/`COUNT`/`SUM`, which already
> express every shape in §10's worked examples via ordinary multi-parent edges. That attempt
> was reverted. What shipped instead, frontend-only, no new schema or endpoint: a
> "+ existing item" picker in `RequirementTreeEditor` that lists ITEM leaves already present
> on the tile's other tasks and adds one as a plain `{id, kind: 'ITEM', itemName}` child —
> the existing `updateTask`/`replaceSubtree` path already updates a reused id in place, so
> nothing server-side needed to change. §9 below is updated to describe this. Not enforced:
> doc §8's rule that a task sharing leaves with a sibling should gate points, not submission
> (left to admin judgment for now).
>
> E2E (`special-tile-rules.spec.ts`, `full-flow.spec.ts`) is untouched per this branch's
> established policy: fixed only in a final pass right before merging to `main`.

## 1. Motivation

Two tile designs from a past bingo exposed real gaps in today's `ITEM` leaf
(`itemNames: string[]`, `quantity`, `distinctItems`, item-group reference, all on one node):

**a) Shared-boss-pool tile.** Part A = "unique drops from at least 2 different slayer
bosses"; Part B = "at least 2 *more*, from bosses not already used in Part A." Part A and
Part B are separate top-level task nodes today, each with an independent set of leaves —
there is no way for Part B's evaluation to know which specific bosses Part A's approved
claims already used, short of new exclusion logic that reads across sibling subtrees.

**b) Barrows tile.** Part A = "submit any 12 Barrows items, duplicates count." Part B =
"submit a full set" (all 4 pieces of one of the six sets). Critically, *the same submitted
items count toward both* — an Ahrim's hood submitted for Part A should also count toward
Part B's Ahrim's set, not need to be claimed twice. This is stronger than (a): it is not
just "don't double-count," it's "the same claim must be legible to two different
aggregation rules" — a total-quantity threshold (Part A) and a per-set completeness check
(Part B). A `claims` row targets exactly one `nodeId`; the only way one claim can feed two
different views is for those two views to evaluate the *same* node.

Chasing (b) surfaced the actual defect: `distinctItems` is a hidden boolean that changes
what `quantity` *means* on the same field (a sum vs. a count of distinct names) — the same
kind of footgun as the item/group union bug fixed earlier this session (a group reference
and inline names silently coexisting on one leaf). And "sum totals across several leaves"
has no representation at all today: `ITEM`'s tally only ever reads claims against *its own*
node id, and `COUNT` counts how many children are individually complete (a boolean), never
a sum of raw claimed quantities across siblings.

## 2. Decision

- **`ITEM` becomes the smallest possible atom**: one name (`itemName: string`, not
  `itemNames: string[]`), no `quantity`, no `distinctItems`. It is complete as soon as one
  approved claim targets it. Nothing about "how many" or "how many distinct" lives on a
  leaf anymore — only presence.
- **New `SUM` composite kind.** Has its own `quantity` (the target total). Complete when
  the sum of approved-claim quantities across all of its children reaches that target.
  `SUM`'s children are always `ITEM` leaves — flat, not recursive — so summing never needs
  to reach through nested composites. (If a real need for `SUM`-of-`SUM` shows up later,
  it's a small, isolated extension; not worth the complexity up front.)
- **`COUNT` absorbs what `distinctItems` used to do.** "K'ril: 2 distinct uniques" is
  `COUNT(2)` over 3 single-name `ITEM` leaves — one leaf per known unique — instead of one
  leaf with `quantity: 2, distinctItems: true`. No flag needed; it falls out of node kind +
  shape. (The existing engine test for `distinctItems`, `engine.test.ts:30-38`, maps onto
  this exactly.)
- **Quantity always lives on the aggregating parent, never the leaf** — even the trivial
  "need 3 of this one exact item" case is `SUM(3)` wrapping a single `ITEM` leaf. This was
  a deliberate simplicity call: if leaves *and* `SUM` could both carry a threshold,
  `SUM(1000)` over a leaf that also has `quantity: 5` is a contradiction with no obvious
  resolution. One rule — leaves are pure presence, parents own every number — removes that
  question by construction.
- **An admin "item row" is *always* a `SUM`.** Not "only when quantity > 1": one write-path
  shape, no bare-leaf-sometimes / wrapped-sometimes special case. The cost is one extra node
  per row (a Wintertodt-style `COUNT(2)` over three rows becomes `COUNT` over three
  `SUM(1)`s — `COUNT` accepts composite children, so it works unchanged).
- **Item groups move off `ITEM` entirely.** A group can no longer attach directly to a
  leaf (that was the confusing union UX from earlier this session, and it doesn't compose:
  a group-on-one-leaf can't be shared piecemeal between two different aggregations).
  Picking a group expands it into separate leaves at write time — a template, not a
  reference (§6).
- **Wildcards are removed as a concept.** Every real wildcard is expressible as an
  ordinary leaf in the graph; the subsystem (table, claim column, engine bypass, cap check,
  OCR branch, two UI panels) goes away. See §7.
- **The admin UI hides essentially all of this for the common case.** An "item row" still
  looks like today's chip list + search box + one quantity field; picking a group or typing
  names still works the same way. Under the hood the editor builds a `SUM(quantity) →
  [ITEM leaves]` subtree instead of setting fields on one `ITEM` node. See §9.

## 3. Shape (delta from `node-graph-model.md` §2)

```
nodes (…unchanged columns…, kind: ALL|ANY|COUNT|SUM|ITEM|MANUAL,
       minCount?,            -- COUNT only, unchanged
       quantity?,            -- SUM only now (was ITEM's)
       itemName?)            -- ITEM only now (was the nodeItems join table)

claims (submissionId, nodeId → ITEM/MANUAL leaf, itemName, quantity)   -- wildcardId dropped

-- removed: nodeItems        (ITEM is single-name now → plain column on nodes)
-- removed: nodeItemGroups   (added on the ui-iteration branch, uncommitted; see §6 — groups no
--                            longer attach to any node by reference)
-- removed: nodes.distinctItems, and the group reference on nodes (itemGroupId on main,
--          itemGroupIds/nodeItemGroups on the branch)
-- removed: tileWildcards, claims.wildcardId                             (§7)
```

`ITEM.itemName` replaces the `nodeItems` join table outright: since a leaf now holds
exactly one name, a 1:many join table is unwarranted — it's a plain nullable column, same
as `minCount`/`quantity`. `claims.itemName` stays (provenance: what the player said they
were submitting, shown in review) but is now validated against the target leaf — see §8.

## 4. Invariants (delta from `node-graph-model.md` §3)

- `SUM`'s children must all be `ITEM` kind. (New — enforced in the service layer next to
  the existing "`ITEM`/`MANUAL` have no children" and "edges join same-`bingoId` nodes"
  checks.)
- A childless `SUM` is not complete, same reasoning as childless `ALL`/`ANY`/`COUNT`: it's
  an unconfigured node, not a vacuously-reached-zero target.
- Claims still target leaves only (`ITEM`/`MANUAL`) — a `SUM` is never a claim's direct
  target, only an ancestor.
- A claim on an `ITEM` leaf must carry `itemName` equal (case-insensitive) to the leaf's
  `itemName`. Enforced at submission time (§8); the engine does not re-check it.
- One submission may not contain two claims on the same `nodeId` (§8).

## 5. Engine (delta from `node-graph-model.md` §4)

`NodeResult` gains an optional numeric `value`, populated only for kinds a `SUM` parent
can consume:

```ts
type NodeResult = { complete: boolean; completedAt: Date | null; value?: number };

case "ITEM": {
  // value = Σ quantity over approved claims whose nodeId is this node. No name check —
  // nodeId is the identity now, and §8 guarantees itemName matched at submission time.
  // complete = value >= 1; completedAt = earliest reviewedAt.
}
case "SUM": {
  // children are ITEM leaves. Merge every child's claims into one list sorted by
  // reviewedAt; complete when the running total first reaches node.quantity.
  // completedAt = reviewedAt of the claim that tipped it over (mirrors today's ITEM logic,
  // just gathering claims from several leaves instead of one).
  // value = Σ children's value (so a SUM could itself be a SUM's child, if ever needed).
}
// COUNT/ALL/ANY/MANUAL: unchanged from node-graph-model.md §4.
```

Nothing else about the engine changes: memoization, the empty-composite rule, gates,
`awarded()`/`total()` are all untouched. The wildcard bypass in today's `ITEM` case
(`engine.ts:66`) is deleted along with wildcards.

Properties the shared-leaf examples in §10 rely on, verified against the current code:
a node reachable from two parents is evaluated once (memo) and counts for both; status
derivation works on leaf *sets* (`boardService.getTeamNodeStatuses`, client
`tileProgress.deriveNodeStatuses`) so a shared leaf doesn't double-count status; the tile
points badge sums task nodes only (`tileProgress.summarizeTileProgress`) so sharing can't
double-count points; `graphService.deleteNodeIfOrphaned` checks edges globally, so one
parent's edit can't garbage-collect a leaf the other parent still references; and
`getNodeTrees` already nests a shared node under every root that reaches it.

## 6. Item groups are an authoring-time template, not a reference

Claims need a real, stable `nodeId` to target (for both player submission and OCR
name-matching, which builds `{nodeId, itemName}` pairs to search a screenshot against). A
group reference can no longer live on a single `ITEM` leaf, so reusing a group ("Cerberus
uniques") across tiles means it has to expand into several real per-name `ITEM` leaves.

**Decision: materialize real leaves at write time.** Picking a group in the admin UI
inserts one real `ITEM` node per current member name into the row's `SUM` (or wherever
the context calls for), exactly as if the admin had typed the names in by hand. It's
exactly what `graphService.insertSubtree`/`reconcileSubtree` already do for any set of
children — no new mechanism — and every leaf stays a single, ordinary, always-real node.

This is a **snapshot, not a live link**: editing the group later does not retroactively
update tiles that already expanded it. That is a deliberate behavior change from today
(where `acceptedItemNames` re-resolves from `itemGroupItems` on every read), accepted
because groups are a reuse-at-authoring-time convenience in practice, not something the
event leans on being live. Nothing here forecloses a live variant later if that changes.

(Considered and rejected: a live `itemGroupIds` reference on the composite, expanded into
virtual children at read time — virtual children have no row for a claim to target, so it
needs synthetic ids or a parallel "virtual leaf" concept the engine and submission path
would both have to understand, plus a second source of truth for what a node's children
are.)

Consequences:
- **The UI must make the snapshot obvious.** Selecting a group does *not* produce a group
  chip — it immediately applies every member as its own separate item chip, identical to
  hand-typed ones, and the group is not shown or tracked afterward. The nested group chip
  built earlier this session (group name with member pills inside) is therefore removed:
  it would imply a live link that doesn't exist. The item-or-group *search* carries over
  unchanged; only what happens on pick changes.
- `itemGroupService.deleteItemGroup`'s "referenced by a tile requirement" guard becomes
  dead code — with no references, every group is always deletable.

## 7. Wildcards are removed

Today: `tileWildcards(tileId, itemName, maxRedemptionsPerTeam, description,
applicableNodeId?)`; a claim carrying `wildcardId` bypasses the target leaf's name check
and counts as that item; `applicableNodeId` restricts which single leaf it may substitute
for (null = any leaf on the tile); approval enforces the per-team cap.

Every wildcard in the actual rules ("jar counts as a unique", "Scythe counts for TOB1",
"soulreaper piece counts for Duke") is one of two shapes this model already has:

- **Pool member** — "Cerberus jar counts as a Cerberus unique": a `Jar of souls` leaf as
  one more child of the same `SUM`/`COUNT` as the other uniques. (The seed's "Cerberus
  uniques" group already contains it.)
- **Alternative branch** — "a mega-rare completes Part A": `ANY(<normal requirement>,
  ITEM Scythe)`.

The "applies to any requirement on the tile" case becomes an explicit authoring choice via
multi-parent: put the leaf under *both* parts' aggregators and one drop completes both
(right for a mega-rare that clears the tile), or put separate leaves under each and the
player's claim picks which one it counts toward.

**What is lost: `maxRedemptionsPerTeam`.** It is implicit for `COUNT`/`ANY` (a leaf
completes once; a second jar adds nothing) and only matters in a duplicates-count `SUM`
pool where one would want "jars count, but at most one" — that is a maximum on a leaf,
i.e. a number on the leaf, which §2 deliberately rules out. Known limitation, not worth a
subsystem; a mod sees two jar claims in review regardless.

**What is deleted:** the `tileWildcards` table and `claims.wildcardId`; the engine's
name-check bypass; the submission-time wildcard checks (`submissionService.ts:89-95`);
the cap check on approve; OCR's separate `detectedWildcard`/wildcard parameter in
`findBestMatch` (a wildcard leaf is just a matchable item now); the submission modal's
wildcard mode; the admin tile-editor wildcards panel; TileModal's wildcards list;
ReviewQueue's "(wildcard)" labels; the `TileWildcard` shared type and its API routes.

Removing wildcards is also what makes §4's "engine trusts `nodeId`" invariant possible —
without a bypass there is no reason for the engine to look at `claim.itemName` at all.

## 8. Submission path (from the review — the largest under-scoped area)

**Gates vs. shared leaves.** `createSubmission` rejects a claim if *any* ancestor of the
leaf — `findAncestorIds` follows every parent edge — has an unmet `submitGateNodeId`
(`submissionService.ts:76-84`). A leaf shared by Part A (no gate) and Part B (gated on A)
is therefore unsubmittable until A completes, which can never happen. Rule: **a task whose
leaves are shared with a sibling may use `pointsGateNodeId` (evaluation-only, harmless) but
not `submitGateNodeId`.** With one shared pool there is no such thing as "submitting *for*
Part B" anyway. The tile-level shared-pool mode (§9) disables the "Requires previous task"
checkbox; the ancestor-walk rule itself stays as is for ordinary tiles.

**Duplicate claims on one leaf in one submission.** The server dedupes `nodeIds` only for
validation and inserts every claim; the modal keeps staged claims across task switches.
With a shared leaf a player can stage "Ahrim's hood" under Part A, switch to B, stage it
again → `SUM` gets +2 from one screenshot. Today over-staging is capped by `leaf.quantity`;
that cap disappears. Rule: **a submission may not contain two claims with the same
`nodeId`** — reject with "combine into one claim with a quantity". The modal enforces the
same (a leaf already staged can't be staged again; edit its quantity instead).

**`itemName` validation.** `createSubmission` checks `claim.itemName` equals the leaf's
`itemName` (case-insensitive) for `ITEM` leaves. Without this, a stale or mistyped name
would produce an approved-but-worthless claim under today's engine; with §5's engine it
would silently count — either way it belongs at the boundary, not in the engine.

**Player modal (`SubmissionModal.tsx`)** — needs redesign, not relabeling:
- "Open" leaves (`:73-75`, currently `leafProgress < leaf.quantity`) become "some ancestor
  `SUM`/`COUNT` of this leaf is still incomplete". A Barrows leaf stays claimable after its
  first claim because `SUM(12)` wants duplicates; a `COUNT` child stops being open once
  complete.
- The leaf picker *is* the item picker now (one name per leaf) — the separate "What are you
  submitting?" step (`:489`, driven by `acceptedItemNames`) goes away. Barrows lists 28
  entries; fine with `SearchableSelect`, but it's a visible change.
- The quantity prompt (`:503`, gated on `selectedLeaf.quantity`) reads the enclosing `SUM`'s
  remaining target instead. A leaf with no `SUM` ancestor never prompts.
- `getAvailableTasks` (task complete ⇒ hidden; submit-gate unmet ⇒ hidden) is unchanged and
  still correct: once Part A of a shared pool completes it drops out of the picker and Part
  B becomes the route to the same leaves.
- Wildcard mode (`:49-50`, `:76-82`, `:432-465`) is deleted per §7.

**Progress display.** `taskClaims.leafProgress(nodeId, distinctItems, …)` and TaskPanel's
per-leaf `progress/target` row move to the `SUM` level (sum of its children's approved
quantities vs. `quantity`); a `COUNT` row shows complete-children / `minCount`; an `ITEM`
row is just done/not. The client mirror of the engine (`taskClaims.ts` header comment)
must be updated to match §5.

**OCR.** `analyzeSubmissionScreenshot` already iterates every `ITEM` leaf under each tile
via `leafDescendants` and one `MatchableItem` per accepted name — with single-name leaves
that loop simplifies to one entry per leaf, and the wildcard list argument to
`findBestMatch` goes away.

## 9. Admin UI impact

- **The common "item row" barely changes.** What's currently one `ITEM` leaf with chips +
  search + a quantity field becomes, under the hood, `SUM(quantity) → [chips as ITEM
  leaves]`; the UI keeps showing one row. Groups still add via the same merged
  item-or-group search built earlier this session — but picking one now drops N separate
  item chips into the row, indistinguishable from typed ones, with no group chip and no
  reference kept (§6). `SUM` joins
  ALL/ANY/COUNT in the group-kind dropdown for the rarer cases where an admin wants it
  explicitly.
- **The "distinct" checkbox is removed, with a real UX cost.** "K'ril: 2 distinct uniques"
  now has to be authored as an explicit `COUNT(2)` group containing separate single-item
  rows, not a single row with a checkbox. This is a regression in authoring convenience
  for that one pattern, traded for removing the flag entirely.
- **The wildcards panel is removed** (§7). "Jar counts as a unique" is authored by adding
  the jar to the row; "mega-rare completes the part" by wrapping the row in `ANY` with a
  second row.
- **New capability: sharing a leaf across two tasks (the boss-pool / Barrows / Cerberus
  cases) — a "+ existing item" picker, no new write path.** The node graph already lets a
  leaf have several parents; the only real gap was that `RequirementTreeEditor` could only
  ever create *new* leaves. `TileEditorPanel` already loads every task's full tree at once
  (`tile.node.children`), so it can compute, per task, every `ITEM` leaf already present on
  the tile's *other* tasks (label included, for display) and pass that list down.
  `RequirementTreeEditor` gains a "+ existing item" button next to "+ item"/"+ group" on
  any group node — a `SearchableSelect` over that list — which adds the picked leaf as a
  plain `{id: existingLeafId, kind: 'ITEM', itemName}` child. Saving goes through the
  *existing* `updateTask` → `replaceSubtree` path unchanged: "a child whose `id` names an
  existing node is updated in place" was already the reconciliation rule for every other
  leaf, and an `ITEM` leaf's only fields (`itemName`) can't meaningfully drift between two
  tasks that both intend to reference the same name, so the clobber risk a dedicated write
  path would have avoided is the same small last-write-wins class every other field in this
  admin UI already has (e.g. two tabs editing the tile name at once) — not worth a second
  write path to close. Building the boss-pool/Cerberus/Barrows shapes with this picker means
  manually choosing `COUNT`/`SUM`/`ANY`-of-`ALL` per task exactly as in §10's worked
  examples — no streamlined pool/aggregation UI, no tile-level mode toggle. Not enforced:
  §8's rule that a task sharing leaves with a sibling should use `pointsGateNodeId`, not
  `submitGateNodeId` — the "Requires previous task" checkbox isn't disabled or warned
  against in this mode, left to admin judgment.

## 10. Worked examples

1. **10k Splinters/Demon tears** — `SUM(10000)` → `[ITEM "Splinters", ITEM "Demon tears"]`.
   Any combination of claims across the two names counts toward the one total.
2. **Cerberus "any one unique"** — `SUM(1)` → one `ITEM` leaf per uniquely-named drop
   (expanded from the "Cerberus uniques" group at authoring time, §6; the jar is just one
   of them, no wildcard). Equivalent to today's one-leaf-with-a-group-and-quantity-1.
3. **K'ril "2 distinct uniques"** — `COUNT(2)` → 3 single-name `ITEM` leaves.
4. **Shared boss-pool tile** — one leaf per boss (a `SUM(1)` over that boss's uniques when
   it has several); Part A = `COUNT(2)` over those, Part B = `COUNT(4)` over the *same*
   nodes (shared via multi-parent edges). Reaching 4 distinct necessarily means 2 *beyond*
   whatever satisfied Part A — no exclusion logic. Part B: `pointsGateNodeId = A`, no
   submit gate (§8).
5. **Barrows** — 28 single-piece `ITEM` leaves (4 pieces × 7 sets). Part A = `SUM(12)`
   over all 28. Part B = `ANY` → seven `ALL`(4 leaves), one per set. Both parents share the
   same 28 leaves via multi-parent edges, so one claim against "Ahrim's hood" is visible to
   both Part A's running total and Part B's Ahrim's-set check, automatically.
6. **Cerberus as a shared pool (the seed's own shape: "first unique" / "another unique",
   `submitRequiresPrevious`)** — the shared-pool version forces the `SUM`-vs-`COUNT` choice
   §9 exposes: Part A = `SUM(1)`, Part B = `SUM(2)` over the same 6 leaves if a *duplicate*
   unique should count for B (today's behavior — B is a separate leaf, a second Primordial
   crystal satisfies it); `COUNT(1)`/`COUNT(2)` if B must be a *different* unique. Either
   way the submit gate goes (§8) and `pointsGateNodeId = A` keeps the points ordering.

## 11. Mapping from the current model

| Today | New model |
|---|---|
| `ITEM.itemNames: string[]` + `quantity` (pooled, no `distinctItems`) | `SUM(quantity)` over one `ITEM` leaf per name |
| `ITEM.quantity` + `distinctItems: true` | `COUNT(quantity)` over one `ITEM` leaf per name |
| group reference on an `ITEM` (`itemGroupId` on main, `itemGroupIds` on the branch) | group expanded into real per-name `ITEM` leaves at write time (§6), inside the row's `SUM` — separate chips, no group chip |
| `nodeItems` (join table) | `nodes.itemName` (plain column, ITEM only) |
| wildcard with `applicableNodeId = <leaf>` | that name as one more leaf in the same `SUM`/`COUNT`, or `ANY(<requirement>, ITEM name)` |
| wildcard with `applicableNodeId = null` ("any requirement on the tile") | the leaf placed under each part's aggregator (multi-parent) — or under one, by choice |
| `maxRedemptionsPerTeam` | dropped (implicit for `COUNT`/`ANY`; not expressible for `SUM` — §7) |
| `claims.wildcardId` / engine name-check bypass | dropped; `claims.itemName` validated at submission (§8) |
| "5 of any Cerberus drop" (today's stated reason `ITEM` couldn't be split into per-name nodes) | `SUM(5)` over per-name leaves — this is exactly what motivated `SUM` |
| Nothing (couldn't be expressed) | Barrows-style "same claims count toward two views" (§10.5) |

## 12. What doesn't change

Tiles/lines as presentation wrappers, `teamNodeState`, `pointsGateNodeId`/
`submitGateNodeId` (semantics unchanged; §8 only restricts where the submit gate may be
*set*), the DAG/multi-parent mechanics, `MANUAL`, and the "childless composite is
incomplete, not vacuously true" rule are all exactly as documented in
`node-graph-model.md`. This proposal reshapes how *quantity and item identity* are
expressed, and removes wildcards.

## 13. Implementation impact (rough, for the follow-up plan — not decided here)

**First: commit the `ui-iteration` branch as a checkpoint.** Everything on it is
uncommitted (13 files including a regenerated migration). The item-or-group search UI
survives this proposal; the `nodeItemGroups` schema work does not — keeping them in one
uncommitted blob makes the rework harder to review.

Then, fresh migration again (established convention — delete `server/drizzle/*`, rewrite
`schema.ts`, regenerate). Touches:

- `schema.ts` — `SUM` kind, `nodes.itemName`, drop `nodeItems`/`nodeItemGroups`/
  `distinctItems`/group reference/`tileWildcards`/`claims.wildcardId`.
- `engine.ts` — `SUM` case, `value`, drop the name check; new tests, port the
  `distinctItems` tests to `COUNT` shapes.
- `graphService.ts` — single-name `ITEM` reads, drop group resolution, `SUM`
  children-must-be-`ITEM` invariant. (§9's "+ existing item" ended up needing no server
  changes at all — see its final write-up.)
- `submissionService.ts` — `itemName` validation, duplicate-`nodeId` rejection, drop
  wildcard checks; `scoringService.ts` — drop the cap check.
- `ocr.ts` / `textMatchService.ts` — one `MatchableItem` per leaf, drop the wildcard path.
- `itemGroupService.ts` — CRUD unaffected; delete the now-dead reference guard.
- `boardService.ts` — no logic change (leaf-set derivation already handles sharing); no
  new endpoint needed (§9).
- Client: `RequirementTreeEditor.tsx` (row = `SUM` wrapper, drop distinct checkbox, the
  "+ existing item" picker per §9), `TaskEditor.tsx` (`toInput` shape, threads
  `existingLeaves` through), `TileEditorPanel.tsx` (drop the wildcards panel, compute
  `existingLeaves` per task from the tile's already-loaded tree), `SubmissionModal.tsx`
  (§8), `taskClaims.ts` + `TaskPanel.tsx` (progress at `SUM` level), `TileModal.tsx` +
  `ReviewQueue.tsx` (drop wildcard display), `requirementTree.ts` (`collectItemNames` reads
  `itemName`), `adminApi.ts`/`queries.ts` (drop wildcard routes).
- `shared/src/index.ts` — `GraphNode`/`GraphNodeInput` (`itemName`, `SUM`), drop
  `TileWildcard`, `ClaimInput.wildcardId`, `ScreenshotAnalysis.detectedWildcard`.
- `seed-dev.ts` and every test fixture that constructs an `ITEM` with `itemNames`/
  `distinctItems`/a group reference, plus the seeded wildcard.
- E2E: `special-tile-rules.spec.ts` exercises wildcards and gates and will need its
  wildcard scenarios rewritten as pool-member/`ANY` shapes (deferred to the pre-merge pass
  per the branch's convention).
- `node-graph-model.md` gets a pointer to this doc once (if) it's adopted.
