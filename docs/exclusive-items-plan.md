# Exclusive items: implementation plan

Status: **approved plan, ready to implement.** Written to be executed without
conversation context. Read `CONTEXT.md` (vocabulary: tile, part/task,
requirement, item, claim) and `docs/item-quantity-model.md` §5 and §10 (how
one item node can be shared by two parts, and why) before starting.

## The problem

Some items appear on more than one tile or part, and the rules say a team
may use such an item in **one place only**:

- A pet counts on the boss's own tile *or* on PETS, not both. But several of
  the same pet on one tile do all count (DT2 ISSUE 1 Page 1 is a `SUM` over
  drops; three Barons there are three drops).
- On SLAYER BOSSES, a unique used for Page 1 is spent: it can't be used for
  Page 2 ("5 more").

Today there is no way to express this. A claim points at exactly one node,
and the only link between nodes is *sharing* a node between two parents,
which means the opposite thing: one claim counts toward **every** parent
(the Barrows case, and PETS' "distinct across both pages"). Sharing must
not be used for exclusivity; each place keeps its own item node.

## The rule

An **exclusivity rule** on a bingo is a set of item names plus a scope:

```ts
export interface ExclusivityRule {
  id: string;          // uuid, minted when the rule is created
  label: string;       // e.g. "Pets"
  itemNames: string[]; // snapshot of the item group it was made from; matched case-insensitively
  scope: "part" | "tile";
}
```

For one team, every non-rejected claim on any item named in the rule must
sit under the **same scope ancestor** as the team's first such claim:

- `scope: "tile"`: all of the team's claims for that item name are on one
  tile (any part of it). Many Barons on DT2 ISSUE 1 are fine; a Baron on
  PETS afterwards is refused.
- `scope: "part"`: all of the team's claims for that item name are under
  one part. A Kraken tentacle on SLAYER BOSSES Page 1, then one on Page 2,
  is refused. (`part` implies `tile`.)

Per item name, not per rule: a Baron on DT2 doesn't touch a Snakeling.
Pending claims lock the item (two players can't race it onto two tiles); a
rejection frees it; an undone approval is pending again and still locks.
An item in two rules (Hellpuppy is a pet *and* a slayer unique) must
satisfy both.

The engine applies the same rule when it scores, so a rule added after
claims exist (the board can be edited while live) can't double count: for
each (rule, item name) the earliest approved claim fixes the scope key and
later claims under a different key are ignored.

## Decisions already made

- Rules live on the **bingo** (a JSON column), not on nodes. They are made
  from a site item group and store a **snapshot** of its names (same
  decision as item groups being authoring-time templates,
  `docs/item-quantity-model.md` §6).
- Matching is by item name, case-insensitive, trimmed.
- Client mirrors the check for UX (locked items are shown as "used on …");
  the server is the enforcement.
- Export/import carries the rules; no format version bump (additive, older
  files just have none).
- The SLAYER BOSSES board change (own nodes per page, 5 each) is done
  **through the admin UI**, then re-exported, in the last phase. Do not edit
  the export JSON by hand.
- Out of scope, separate follow-up: the submission list showing one part
  for a claim on a shared node (it is legitimately "both").

## Facts this plan relies on (verified 2026-09-20)

- `bingos` table and `UpdateBingoSettingsParams` (`server/src/services/bingoService.ts:283`);
  `updateBingoSettings` diffs `params` keys for the `settings.updated` audit
  (`:318`, `diffFields(existing, updated, { only, redact })`). Settings route:
  `PATCH /api/bingos/:slug/admin/settings` (`server/src/routes/admin.ts:44`),
  which copies known keys off the body one by one.
- `toPublicBingo` (`bingoService.ts:55`) is the one place a bingo row becomes
  a response; it only strips `womGroupVerificationCode`. The shared `Bingo`
  type is `shared/src/index.ts:93`.
- Migrations: `server/drizzle/0011_bug_report_palette.sql` is the latest;
  `npm run db:generate --workspace=server` makes the next one from
  `server/src/db/schema.ts`. The dev DB does **not** auto-migrate: run
  `npm run db:migrate --workspace=server` after.
- Submission validation: `createSubmission` (`server/src/services/submissionService.ts:37`),
  one tile per submission, gates checked via `submitGateBlock`
  (`graphService.ts`). `tileForLeaf(tx, leafId, tileByNodeId)` (`submissionService.ts:18`)
  gives a leaf's tile; `findAncestorIds` (`graphService.ts:125`) its ancestors.
  A part is a direct child of the tile's root node (`nodeEdges` with
  `parentId = tile.nodeId`).
- Scoring: `rebuildTeamState` (`scoringService.ts:36`) calls
  `getApprovedClaims(tx, teamId, bingoId)` (`graphService.ts:112`, returns
  `{ nodeId, itemName, quantity, reviewedAt }`) and `getFullGraph` (gives
  `engineNodes`, `childrenOf`, `nodesById`), then `evaluateGraph`.
- Client: the team's submissions with claims come from
  `useTeamSubmissions` (`SubmissionDetails { submission, claims: Claim[] }`,
  `shared/src/index.ts:266-281`); the bingo (with settings) from the shell.
  The board model is built in `client/src/headless/boardModel.ts`
  (`buildBoard`, `buildRequirementTree` at `:45`, leaves get `submitted`,
  `notNeeded`, `dim`); `RequirementNodeModel` is `client/src/headless/types.ts:55`.
  The submission flow is `client/src/headless/useSubmissionFlow.ts`: item
  options are `openLeaves` (leaves of the chosen task not yet complete,
  `:95`), exposed as `requirement.options` (`types.ts:348`); rendered by
  `client/src/themes/comic/submission/Pickers.tsx` (and the default theme's
  equivalent). Tile availability is `getAvailableTasks`
  (`client/src/headless/submissionFlowLogic.ts:9`).
- Settings form: `client/src/core/admin/BingoSettingsForm.tsx` (sections at
  `:133-269`, saves with `adminApi.updateBingoSettings(slug, payload)`,
  `client/src/api/adminApi.ts:54`). Item groups:
  `adminApi.getItemGroups()` → `{ itemGroups: ItemGroup[] }` (`ItemGroup { id, name, description, itemNames }`).
- Export: `BingoExportDocument.bingo` (`shared/src/bingoExport.ts:104`),
  written at `server/src/services/bingoExportService.ts:134`, read at `:259`.
  `BINGO_EXPORT_FORMAT_VERSION = 1`; additive fields don't bump it.
- The generator (`server/scripts/testdata/board.ts`) mirrors the server's
  submit rules in `claimable`; it must learn this rule too (Phase 6).
- The E2E suite is deferred: don't run or fix it.

---

## Phase 1 — the rule, in shared code and the schema

### `shared/src/exclusivity.ts` (new; export from `shared/src/index.ts`)

```ts
export type ExclusivityScope = "part" | "tile";
export interface ExclusivityRule { id: string; label: string; itemNames: string[]; scope: ExclusivityScope }

/** Where an item node sits, as the rule sees it. */
export interface PlacedLeaf {
  nodeId: string;
  itemName: string | null;
  tileId: string;
  tileName: string;
  /** The parts (direct children of the tile root) above this node; more than one for a shared node. */
  partIds: string[];
  partLabels: string[];
}

export const normalizeItemName = (name: string) => name.trim().toLowerCase();

/** The key two claims must agree on: the tile, or the tile plus the part(s). */
export function scopeKey(leaf: PlacedLeaf, scope: ExclusivityScope): string;
// tile -> leaf.tileId ; part -> `${leaf.tileId}|${[...leaf.partIds].sort().join(",")}`

/** Human wording for where a key points: "DT2 ISSUE 1" or "SLAYER BOSSES · Page 1". */
export function describeScope(leaf: PlacedLeaf, scope: ExclusivityScope): string;

export interface ExclusivityConflict { nodeId: string; itemName: string; rule: ExclusivityRule; usedOn: string }

/**
 * Which of `candidates` a team may not claim, given the claims it already has (pending or approved) and the
 * rules. `existing` and `candidates` are node ids; `leaves` places every item node of the board. A candidate
 * conflicts when some rule names its item and the team has a claim on a node with that name under a different
 * scope key. Candidates are also checked against each other (one submission may not put one name in two places).
 */
export function exclusivityConflicts(
  rules: ExclusivityRule[],
  leaves: ReadonlyMap<string, PlacedLeaf>,
  existing: Iterable<string>,
  candidates: string[],
): ExclusivityConflict[];

/** For scoring: drops claims that lose to an earlier claim on the same name under a different key. */
export function keepFirstScope<T extends { nodeId: string; at: Date }>(rules: ExclusivityRule[], leaves: ReadonlyMap<string, PlacedLeaf>, claims: T[]): T[];
```

Tests in `shared/src/exclusivity.test.ts` (there is no vitest config in
`shared`; put the test in `server/src/services/exclusivity.test.ts` importing
from `@bingo/shared`): tile scope allows several claims on one tile and
refuses another tile; part scope refuses the other part of the same tile;
names match case-insensitively and trimmed; an item in two rules must pass
both; unrelated names are untouched; two candidates with one name in two
places conflict with each other; `keepFirstScope` keeps the earliest and
drops later claims under another key, keeping later claims under the same
key; a shared node (two `partIds`) has a combined part key.

### Schema and settings

- `server/src/db/schema.ts`, `bingos`: `exclusivityRulesJson: text('exclusivity_rules_json').notNull().default('[]')`.
  Generate `server/drizzle/0012_exclusivity_rules.sql`, run it on the dev DB.
- `bingoService.ts`: `parseExclusivityRules(json: string): ExclusivityRule[]`
  (tolerant: bad JSON → `[]`), `UpdateBingoSettingsParams.exclusivityRules?: ExclusivityRule[]`
  (serialize into the column; validate: `label` non-empty, `scope` in the
  enum, `itemNames` non-empty after trimming and de-duplicating
  case-insensitively, `id` a non-empty string, mint one when missing).
  `toPublicBingo` returns `{ ...rest, exclusivityRules: parseExclusivityRules(bingo.exclusivityRulesJson) }`
  minus the json field. Shared `Bingo` gets `exclusivityRules: ExclusivityRule[]`.
- `settings.updated` audit: add `exclusivityRulesJson: string` to the
  `FieldChanges` in `shared/src/audit.ts` `"settings.updated"` (the diff is on
  the row column). The label stays as it is.
- Route `PATCH .../admin/settings`: accept `exclusivityRules` (array) and
  pass it through; a malformed array is a 400 from the service.
- Export: `BingoExportDocument.bingo.exclusivityRules?: ExclusivityRule[]`;
  write them on export, apply them on import (`updateBingoSettings`).
  Round-trip test in `bingoExportService.test.ts`.

Commit: `Exclusive items: the rule, and where a bingo keeps its rules`.

---

## Phase 2 — server enforcement

### Placing leaves (server side)

`server/src/services/exclusivityService.ts`:

```ts
/** Every item node of the bingo, placed: which tile, and which part(s) above it. */
export function placeLeaves(db: Queryable, bingoId: string): Map<string, PlacedLeaf>;
```

Build it from `getFullGraph(db, bingoId)` (`childrenOf`, `nodesById`) and the
`tiles` rows: walk each tile's root; its direct children are the parts; every
ITEM node reached under a part gets that tile and part added (a node reached
under two parts collects both). Cache nothing across requests (the board can
change while live). One query set per call, not per leaf.

### `createSubmission`

After the gate check (`submissionService.ts`, the loop calling
`submitGateBlock`), when `bingo.exclusivityRules` (parse the row's JSON
column; the `Bingo` row is passed in) is non-empty:

1. `leaves = placeLeaves(tx, bingo.id)`.
2. `existing` = node ids of the team's claims whose submission is `pending`
   or `approved` (join `claims` → `submissions`, `teamId`, status in the two).
3. `conflicts = exclusivityConflicts(rules, leaves, existing, claimedNodeIds)`;
   if any: `throw new ServiceError(400, \`${c.itemName} is already used on ${c.usedOn}: ${c.rule.label} count on one ${c.rule.scope} only\`)`
   for the first conflict, e.g. *"Baron is already used on DT2 ISSUE 1: Pets count on one tile only"*.

### Scoring

In `rebuildTeamState` (`scoringService.ts:36`), after `getApprovedClaims`:
`approvedClaims = keepFirstScope(rules, placeLeaves(tx, bingoId), claims mapped with at = reviewedAt)`
when the bingo has rules. Fetch the bingo row once at the top of
`rebuildTeamState` (it already looks up the team's `bingoId`).

### Tests

`submissionService.test.ts`, a `describe("exclusive items")` building a
3-tile board (a "boss" tile with a `SUM` over `Baron`, a "PETS" tile with
`COUNT` over `Baron`/`Nid`, a "SLAYER" tile with two parts each holding their
own `Kraken tentacle` node) and rules `{Pets, tile}` and `{Slayer, part}`:

1. Two Barons on the boss tile are accepted; a Baron on PETS is then refused
   with the message above; a Nid on PETS is fine.
2. Once the boss-tile submission is **rejected**, the Baron on PETS is accepted.
3. A pending (unreviewed) claim locks just like an approved one.
4. Tentacle on SLAYER Page 1, then Page 2: refused; a second tentacle on
   Page 1: accepted.
5. One submission claiming the same name under two parts is refused (needs
   a tile where one submission can reach two parts: two leaves with the same
   item name under different parts of one tile).
6. No rules: nothing changes (an existing test still passes).

`scoringService.test.ts`: with rules added **after** two Baron approvals on
different tiles, `rebuildTeamState` scores only the earlier one (the later
tile's part stays incomplete), and a later Baron on the *same* tile still
counts.

Commit: `Exclusive items: refuse a claim on an item already used elsewhere`.

---

## Phase 3 — the client: locked items in the board and the submission flow

### Placing leaves (client side)

`client/src/core/board/exclusivity.ts`: `placeLeaves(tiles: Tile[]): Map<string, PlacedLeaf>`
from the tile trees (`tile.node.children` are the parts). Then
`lockedLeaves(rules, leaves, teamSubmissions): Map<nodeId, ExclusivityConflict>`
= `exclusivityConflicts(rules, leaves, existing, allLeafIds)` where
`existing` = claims of pending/approved submissions. Memoize per
(tiles, rules, teamSubmissions) in `BoardProvider` (add `exclusivityRules`
to its props from `bingo.exclusivityRules` in `BingoPageProvider`).

### Board model

`RequirementNodeModel` gains `lockedBy: string | null` (e.g. `"Used on DT2 ISSUE 1"`).
`buildRequirementTree` sets it from the locks map (a locked leaf is also
`dim`). Both themes' requirement trees show it: the default theme as a small
muted suffix after the item name, the comic theme as an `InkTag` next to
the name (`client/src/themes/comic/board/RequirementTree.tsx`; a locked leaf
renders with the same dimming `dim` already gives it).

### Submission flow

`useSubmissionFlow.ts`: exclude locked leaves from `openLeaves`, and add
`requirement.locked: { label: string; reason: string }[]` to
`SubmissionFlowModel` (`types.ts` `requirement`) listing the task's locked
items. `Pickers.tsx` (comic) and the default theme's picker render it under
the requirement select as a hint: *"Baron: used on DT2 ISSUE 1 (pets count on
one tile only)"*. If every leaf of a task is locked, the task is not
available (`getAvailableTasks` takes the locks map, or the flow filters
tasks whose `openLeaves` would be empty; pick the simpler and keep the tile
dropdown consistent). A server 400 still lands in `submit.error` as today.

### Tests

`client/src/core/board/exclusivity.test.ts`: `placeLeaves` on a small tile
tree (including a shared node under two parts); `lockedLeaves` locks the
right nodes and ignores rejected submissions. Extend
`client/src/headless/requirementTree.test.ts` (or the nearest board-model
test) for `lockedBy`.

Commit: `Exclusive items: show what a team has already used elsewhere`.

---

## Phase 4 — admin settings UI

`BingoSettingsForm.tsx`, a new `Section title="Exclusive items"` after
"Rules":

- A list of the bingo's rules: label, a `Select` for scope (`part` /
  `tile`, with one line of help each: "one part only" / "one tile only,
  any of its parts"), "N items" with a `Disclosure` listing the names, and a
  Remove button.
- "Add from item group": a `Select` of site item groups
  (`adminApi.getItemGroups()`, load lazily when the section opens) plus a
  scope, and an Add button that appends `{ id: crypto.randomUUID(), label: group.name, itemNames: group.itemNames, scope }`.
- Saved with the rest of the form (`exclusivityRules` in the payload). A
  short note under the list: "Matched by item name. Changing the item group
  later doesn't change this rule; remove and add it again."

Commit: `Exclusive items: settings UI`.

---

## Phase 5 — docs

- `CONTEXT.md`: a glossary entry for *exclusivity rule* and the distinction
  from a *shared node* (one counts everywhere; the other is one-place-only).
- `docs/item-quantity-model.md`: a short "§ Exclusive items" pointing here.
- `docs/audit-log.md`: nothing new (settings.updated covers it).

Commit: `Document exclusive items`.

---

## Phase 6 — the test data generator

`server/scripts/testdata/board.ts` `buildBoard` takes the rules (from the
shell's `bingo.exclusivityRules`, fetched in `generate.ts`) and places
leaves; `simulate.ts` keeps, per team, the node ids of its non-rejected
submissions and passes them as `existing` when scoring parts: a part whose
next submission has a conflict is skipped for that team (it is "used
elsewhere" for them). Add a test in `generator.test.ts` on a small board.
Run a full `--stage complete` against a private server (see
`docs/test-data-generator.md`) and check the summary lists no refused
submissions.

Commit: `Test data generator: respect exclusive items`.

---

## Phase 7 — the real board (data, through the UI)

On the live dev bingo, as an admin:

1. Settings → Exclusive items: add **All Pets** with scope **tile**, and
   the **Slayer** group with scope **part** (it holds 95 names, a superset of
   the 40 on SLAYER BOSSES; names that appear on no tile simply never match).
2. SLAYER BOSSES → Page 2: remove every shared item (they show the shared
   mark), add the slayer group again so it expands into fresh nodes, set the
   quantity to **5**, keep "requires previous". Change its description to
   say 5 more uniques not used on Page 1.
3. Export the bingo and replace `tectonic-comics-bingo-export.json` at the
   repo root; commit it as `Board: exclusive pets and slayer uniques, 5 per slayer page`.

## Must not change

- Sharing a node between parents keeps meaning "counts toward each"; no
  existing tile's behaviour changes until a rule is added.
- A bingo with no rules behaves exactly as today (every existing test
  passes unchanged).
- Claims stay `{ submissionId, nodeId, itemName, quantity }`.
- Don't bump the export format version.
- Don't touch the E2E suite.

## Verification

```
cd server && ../node_modules/.bin/tsc --noEmit && ../node_modules/.bin/vitest run && ../node_modules/.bin/tsc --noEmit -p scripts/tsconfig.json
cd ../client && ../node_modules/.bin/tsc --noEmit && ../node_modules/.bin/vitest run && ../node_modules/.bin/vite build
```

By hand, on the dev server after Phase 7: as a player, submit a Baron for
DT2 ISSUE 1; open PETS and see Baron marked "used on DT2 ISSUE 1" and
missing from the submission picker; try it through the API anyway and get
the 400; as a mod reject the DT2 submission and see PETS' Baron unlock.

## Acceptance

- A rule made from an item group refuses, at submission, any claim that
  would put an item name in a second place, with a message naming where it
  is already used; rejection frees it.
- Scoring never counts one name in two places even if rules change after
  claims exist.
- Players see locked items before they try; admins manage rules in
  settings; export/import keeps them; the generator plays within them.
