# Effort: hours a Player put into the Board's bosses (plan)

Status: **design settled with the user, not built**. Implement phase by phase from this doc; commit after each phase.

## Why

Points share (CONTEXT.md) credits only the Claims that completed something. A Player who spends 10 hours at a boss
going for one Item and never gets it earns nothing there, though their Team needed someone doing exactly that. Effort
recognises them: the Wise Old Man EHB a Player spent at the bosses of a Tile's Parts while that Part was still
incomplete for their Team, and their share of their Team's Effort.

## Decisions (settled with the user; don't reopen)

| Question | Decision |
|---|---|
| What it is | **Effort** (hours, EHB) and **Effort share** (their % of their Team's Effort). Recognition only: never points, never part of Points share or the scoreboard. |
| Which time counts | Only while the Part was **still incomplete for the Player's Team**. Time at a boss after the Team completed that Part doesn't count. |
| A boss on several open Parts | An hour is **split evenly** between the Parts tagged with that boss that are open at that moment, so a Player's Effort never exceeds the time they played. |
| How Parts get bosses | **Derived from the Part's Items** through Luck's drop-rate table (an Item's bosses), and an Admin can **add or remove** bosses per Tile or Part in the board editor. |
| Where it shows | **Stats page** (contributors table column; each Tile's Effort by Player), **player card**, **Wrapped** (Player section and Player share card), and **a new Title**. |
| Name | **Effort** / **Effort share**. |
| Bingos already Finished | **Backfilled**: per-boss EHB is read again from Wise Old Man's snapshot history. Historical Bingos have no snapshots: not recorded. |

Two calls made here, not by the user (flag in the PR if changed):

- **When a Part completed** is when the tipping Claim's Submission was **made** (Rewind's replay, `submittedAt`), not
  when it was approved (`team_node_state.completedAt` is the approval time). Waiting for a Moderator isn't grinding.
- **Snapshots are sparse** (a Player's snapshot exists only when they or the competition updated them). EHB gained
  between two snapshots is assumed to be earned at a steady rate across that gap, so if a Part completed inside a gap,
  the gap's hours are split by how much of it the Part was open. The baseline is chosen exactly as `gainsOf` chooses it
  (the last snapshot at or before the start, else the first), so Effort and the EHB Titles agree on where play begins.

## Glossary entry (add to CONTEXT.md in Phase 0, after "Points share")

```markdown
### Effort
The hours a Player spent at the bosses of the Board's Parts while their Team still needed them, as Wise Old Man
measures EHB, whether or not they got anything. **Effort share** is their part of their Team's Effort.
- **Rules:** Each Part has its bosses: those that drop its Items (as Luck knows them), plus any an Admin adds, less any
  an Admin removes, set on the Part or on its whole Tile. An hour at a boss counts toward the Parts with that boss that
  were still incomplete for the Player's Team at that moment (completed when the deciding Submission was made), split
  evenly between them; time at a boss no open Part needs isn't Effort. Hours between two Wise Old Man snapshots are
  taken as earned evenly across the gap. Only bosses Wise Old Man measures count (not Slayer monsters, minigames or
  skilling). Shown to one decimal place; Effort share as a percentage. Follows the Stats visibility rules.
- **Not:** Points, nor part of Points share. A Player can have a large Effort and no points.
- **Historical Bingos:** not recorded.
```

## Terms in code

- `EffortBoss` rows: per Tile or Part, a Wise Old Man boss metric with `mode: "add" | "remove"`.
- A Part's **effective bosses** = derived(Part's Items) ∪ added(Tile) ∪ added(Part) − removed(Tile) − removed(Part).
  The unit Effort is counted on is always a **Part** (a Tile's direct child, `tile.node.children`); a Tile's Effort is
  the sum of its Parts'. A Tile-level add/remove is shorthand for "on every Part of this Tile".
- `metric`: a `BossMetric` from `server/src/services/luck/bossSources.ts` (Wise Old Man's boss metric names, also
  `WomBossMetric` in `shared/src/womBosses.ts`).

## Phase 0: glossary and shared types

1. Add the glossary entry above to `CONTEXT.md`, after `### Points share` (around line 332).
2. `shared/src/index.ts`, next to `ContributionCount` (around line 1520), add:

```ts
/** A Player's Effort in one Bingo (CONTEXT.md "Effort"). Null on a ContributionCount when not recorded. */
export interface PlayerEffort {
  /** EHB at open Parts' bosses, all Tiles. */
  hours: number;
  /** hours / their Team's total Effort, 0-100. Null when the Team's total is 0. */
  share: number | null;
  /** Hours on Parts their Team never completed (the Title's measure). */
  uncompletedHours: number;
  /** Per Tile, largest first; only Tiles with hours > 0. */
  byTile: { tileId: string; hours: number }[];
  /** The latest snapshot the hours run up to (ISO). */
  asOf: string;
}
```

   Add `effort: PlayerEffort | null` to `ContributionCount`, and to `StatsResponse` (around 1567) a
   `tileEffort: { tileId: string; teamId: string; userId: string; hours: number }[]` (for the Tile completion view).
3. `shared/src/tags.ts` (or a new `shared/src/effortBosses.ts`): `EffortBoss { id; tileId: string | null; partId: string | null; metric: string; mode: "add" | "remove" }`,
   `BoardEffortBossesResponse { bosses: EffortBoss[]; derived: { partId: string; metrics: string[] }[] }`.

Verify: `node ../node_modules/typescript/bin/tsc --noEmit -p .` in `shared/` consumers (`client/`, `server/`).

## Phase 1: per-boss EHB from Wise Old Man, and re-reading

Today `server/src/services/womService.ts` `parseSnapshots` (206-223) keeps only each boss's kills
(`bossKills[metric] = ranked(boss?.kills)`, line 213) and the total `computed.ehb.value` (217). Wise Old Man's snapshot
also has `ehb` per boss (`data.bosses[metric] = { metric, kills, rank, ehb }`; checked against the live API), already
at the account type's rates (ironmen differ).

1. `RawSnapshot` (194-201): bosses become `{ kills?: unknown; ehb?: unknown }`. `WomSnapshot` (184-192): add
   `bossEhb: Record<string, number>` (only metrics with `ehb > 0`; a missing or non-number `ehb` is left out).
2. Migration (next number after the latest in `server/drizzle/`; check `meta/_journal.json`, keep file number = tag
   number, and the snapshot file named the same): `wom_snapshots.boss_ehb_json text` (nullable). Null means "read
   before per-boss EHB was kept". `schema.ts` `womSnapshots` (584-597): `bossEhbJson: text('boss_ehb_json')`.
   Add it to `server/src/mcp/sql/classification.ts` (`wom_snapshots` columns), or its test fails.
3. `server/src/services/womReadService.ts` `readPlayer` (57-108): store `bossEhbJson: JSON.stringify(s.bossEhb)`.
   Make the insert an upsert that **fills `boss_ehb_json` on an existing row where it is null**
   (`onConflictDoUpdate` on (bingoId, userId, takenAt) setting `bossEhbJson` only when the stored one is null), so a
   re-read completes old rows without changing anything else. `loadTimelines` (126-135): parse it into
   `bossEhb` (`{}` when null) and add `hasBossEhb: boolean` to the loaded snapshot.
4. **Re-read for a Finished Bingo** (the backfill): `rereadBingo(db, bingoId)` in womReadService that, for every Player
   with a `wom_reads` row, queues a read of `[start − BASELINE_LOOKBACK_MS, end]` that ignores `readThrough` and the
   7-day `FINAL_READ_GRACE_MS` (289), through the existing `WomReadQueue` (178-243) so Wise Old Man's rate limit is
   respected. Expose it as `POST /api/admin/bingos/:slug/wom-reread` in `server/src/routes/siteAdmin.ts` (Admin only,
   audited: add an action `bingo.wom_reread` to `shared/src/audit.ts` and the route to
   `server/src/audit/routePolicy.ts`), and a **Re-read Wise Old Man** button per Finished Bingo on
   Site admin > Bingos (`client/src/pages/SiteAdminPage.tsx` `BingosList`, around line 199), with copy saying a
   published Wrapped only shows the new numbers once it's published again.
5. testdata Bingos are skipped by the reader (`readPlayer`); that stays.

Tests (`server/src/services/womReadService.test.ts` and `womService.test.ts`): parsing keeps per-boss EHB and drops
-1/0/missing; a re-read fills null `boss_ehb_json` and leaves filled rows alone; the re-read ignores the grace period.

## Phase 2: a Part's bosses (derived, added, removed)

Model it on Tags (CONTEXT.md "Tag"), which already live per Tile or Part, outside the tables Players are served, and
travel through the Draft board, Publish, export and import. Don't reuse the `tags` table: search Tags and Effort
bosses mean different things.

1. **Schema** (`server/src/db/schema.ts`, beside `tagColumns` 796-816): `effortBossColumns(tileTable, nodeTable)` with
   `id, bingoId, tileId | nodeId (exactly one), metric text, mode text enum('add','remove')`, unique on
   (bingoId, tileId, nodeId, metric); tables `effort_bosses` and `draft_effort_bosses`. Same migration as Phase 1 or
   the next one. Classify both in `classification.ts`.
2. `server/src/services/boardTables.ts`: add `effortBosses` to `BoardTables`, `PUBLISHED_BOARD`, `DRAFT_BOARD`.
3. **Derivation** `server/src/services/effortBossService.ts`:
   - `derivedBosses(itemNames: string[]): BossMetric[]` = the union of `getDropRates().sourcesOf(item)` metrics
     (`server/src/services/luck/dropRates.ts` 16-44). `bossArtService.boardBosses` (71-84) does the same for the whole
     Board; reuse its approach.
   - `effectiveBosses(db, bingoId, t: BoardTables): Map<partId, BossMetric[]>` applying the rule in "Terms in code".
     Items under a Part: walk its subtree with `graphService` (ITEM nodes' item names).
   - CRUD: `addEffortBoss(db, t, owner: {tileId}|{partId}, metric)`, `removeEffortBoss(...)` (writes a `remove` row, or
     deletes an `add` row), `resetEffortBoss(...)` (deletes the row: back to derived). Validate `metric` with
     `isWomBossMetric` and that it's in `BOSS_METRICS`.
   - Cleanup on delete, as Tags do: `boardService.ts:397` (Tile), `graphService.ts:378` (node), `bingoService.ts:518`
     (Bingo).
4. **Draft → Publish** (`server/src/services/boardDraftService.ts`): copy in `loadRows` (81), `ensureDraft` (152),
   `dropDraft` (162); compare in `sameBoard` (245) with an `EFFORT_FIELDS` like `TAG_FIELDS` (222); list it on the
   Publish screen's diff ("Effort bosses", next to "Tags" at 374/415/424); apply in `applyDraft` (678-701).
5. **Routes** (`server/src/routes/admin.ts`, next to the tag routes 606-662, through `editDraft` and
   `assertBoardEditable` the same way): `GET /effort-bosses` (rows + derived per Part),
   `POST /tiles/:tileId/effort-bosses`, `POST /parts/:partId/effort-bosses` (`{ metric, mode }`),
   `DELETE /effort-bosses/:id`. Add each to `routePolicy.ts` with audit actions (`board.effort_boss_changed`).
6. **Export/import** (`shared/src/bingoExport.ts` `ExportNode`/`ExportTile`, optional `effortBosses`, absent in older
   files; `server/src/services/bingoExportService.ts` export 75-77/139-145, validate 274-275, import 478/485). Copying a
   board to a new Bingo is export → import, so this covers it.
7. **Editor UI** (`client/src/core/admin/`): an `EffortBossesField` next to `TagsField` in `TileEditorPanel.tsx:210`
   and `TaskEditor.tsx:142` (Parts only: a TaskEditor for a Tile's direct child). Shows the effective bosses as chips:
   derived ones marked "from items" with ✕ (writes a remove), added ones with ✕ (deletes the add), removed derived ones
   struck through with "restore". An add picker over `WOM_BOSS_NAMES` (searchable). Copy: "Effort counts time at these
   bosses while this Part is open." On the Tile panel, the field edits Tile-level rows and lists what each Part ends up
   with.

Tests: derivation (an item with two bosses, an item with none, a raid item), effective rule with Tile + Part
add/remove, draft → publish round trip, export → import round trip, routes refuse non-Admins and a locked board.

## Phase 3: computing Effort

`server/src/services/effortService.ts`:

```ts
export interface EffortResult {
  /** userId → PlayerEffort (byTile with tileIds). Players with no usable snapshots are absent (shown as null). */
  players: Map<string, PlayerEffort>;
  /** For StatsResponse.tileEffort. */
  tileEffort: { tileId: string; teamId: string; userId: string; hours: number }[];
}
export function computeEffort(db: Db, bingo: Bingo): EffortResult | null; // null: not recorded
```

Algorithm, per Team:

1. **Open windows.** Replay the Team with `rewindService.replayTeam` (`server/src/services/rewindService.ts` 77-100),
   which gives each node's completion by the deciding Submission's `submittedAt` (`ReplayedNode.completedAt`). Each Part
   is open over `[start, completedAt)`, or `[start, end]` if never completed. (Nothing reopens in a Finished Bingo's
   replay; for a Live one, use the replay as of now.)
2. **Bosses.** `effectiveBosses(db, bingo.id, PUBLISHED_BOARD)`; invert to `metric → partIds`.
3. **Per Player on the Team** (Team members, removed Players included, like Points share), from `loadTimelines`
   (womReadService 126-135): keep snapshots with `hasBossEhb`; choose the baseline as `gainsOf` does (last snapshot at
   or before `start`, else the first); take snapshots up to the last at or before `end`. If fewer than 2 usable
   snapshots, the Player has no Effort (absent).
4. For each consecutive pair `(a, b)` and each metric `m` with `Δ = max(0, b.bossEhb[m] − a.bossEhb[m]) > 0`:
   - The gap is `[max(a.at, start), b.at]` (the first gap starts at the Bingo's start, matching `gainsOf`'s baseline).
   - Cut the gap at every completion time of a Part in `metric → partIds[m]` that falls inside it. For each piece of
     length `L` with open set `O` (Parts of `m` open over that piece): if `O` is empty the piece's hours are dropped;
     else each Part in `O` gets `Δ × (L / gapLength) / |O|`.
5. Sum per Part → per Tile (`byTile`), per Player (`hours`), `uncompletedHours` = hours on Parts never completed.
   Team total = sum of its Players' hours; `share = hours / teamTotal × 100` (null when the total is 0).
6. Round only for display (hours to 1 decimal, share to 1 decimal), never inside the sums.

Not recorded (return null): a Historical Bingo (`historicalService.getRecorded` lacks `submissions` or
`womSnapshots`), a Bingo that hasn't started, or one whose snapshots all lack `boss_ehb_json`.

Tests (`effortService.test.ts`, seeding through the real services as `server/src/mcp/tools/bingoTools.test.ts` does):
- all time at an open Part counts; time after the Part's completion doesn't;
- a completion inside a gap splits the gap proportionally;
- a boss on two open Parts splits evenly; once one closes, the other gets it all;
- a boss no Part has adds nothing; a removed derived boss stops counting; an added boss starts;
- shares sum to 100 per Team; a Player with one snapshot is absent;
- completion uses `submittedAt`, not `reviewedAt` (seed a Submission approved hours after it was made);
- rows without `boss_ehb_json` are ignored; all-null → not recorded.

## Phase 4: Stats page and player card

1. `server/src/services/statsService.ts`: in `getStats` (666-684), compute `computeEffort` once and set
   `effort` on each `ContributionCount` (281-361) and `tileEffort` on `Stats`. `filterStatsForTeam` (689-703) **must**
   filter `tileEffort` by `teamId`, or other Teams' data leaks while Live. Stats are cached 30s (`statsCache.ts`); that's
   fine.
2. `client/src/core/stats/ContributorsTable.tsx` (AG Grid columns 87-131): an **Effort** column showing hours
   (`14.2 h`) with the share beneath or in the tooltip (`23% of the Team's Effort`); sortable by hours; "—" when null.
3. `client/src/core/stats/TileCompletion.tsx`: in each Tile's detail, the Effort by Player for the Teams shown,
   largest first (`tileEffort`).
4. Player card: `client/src/core/stats/usePlayerContribution.ts` already reads the stats response; add effort to it
   and show in `client/src/core/stats/PointsShareBreakdown.tsx` (61): hours, share, and the top 3 Tiles by hours.
5. Both themes: these components are core; check the comic theme renders them (it uses core Stats).

## Phase 5: the Title

`shared/src/titles.ts`: a new `TitleId` and `TITLES` entry modelled on Grinder (357-370):
- Name: **Unsung hero** (confirm with the user before shipping; any name that isn't an existing Title's).
- Measure: `f.effort?.uncompletedHours` (add `effort: { uncompletedHours: number; asOf: string } | null` to
  `PlayerTitleFacts`, 41-78, filled in `statsService.getTitleFacts` 521-640 from `computeEffort`).
- `source: "wom"`, `minimum: { default: 3 }` hours, `reachedAt: latest(f.effort?.asOf)`.
- Description: "Most hours spent at the bosses of Tiles their Team never completed."
A Finished Bingo's frozen Title set (`titleSettingsService.ts` 71-104) leaves the new Title out of older Bingos
automatically; that's intended.

## Phase 6: Wrapped

1. `shared/src/wrapped.ts` `WrappedYou` (37-77): optional `effort?: { hours: number; share: number | null; topTile: { name: string; hours: number } | null } | null`
   (optional: published payloads from before don't have it).
2. `server/src/services/wrappedService.ts` `computeWrapped` (288-528): fill it beside `wom` (516-519).
3. `client/src/headless/wrappedModel.ts`: labels on the you-model (250-292), e.g. `effortLabel: "14.2 hours"`,
   `effortShareLabel: "23% of your Team's Effort"`, `effortTileLabel: "Most at Vorkath (6.1 h)"`; and on the Player share
   card (`WrappedPlayerCardModel`, 575-602) an optional Effort field.
4. Themes: `client/src/themes/default/wrapped/WrappedYou.tsx` (near the WOM block 151-168) and
   `client/src/themes/comic/wrapped/sections/WrappedYou.tsx` (290-316); share cards
   `themes/default/wrapped/WrappedShareCard.tsx` and `themes/comic/wrapped/WrappedShareCard.tsx`, adding Effort to each
   card's `LEAVE_OUT` list so it drops first when the card is full. Hidden when null.

## Phase 7: MCP

`server/src/mcp/tools/playerContributions.ts` (per-player object 32-40): add `effort` (hours, share, uncompletedHours,
top Tiles by name) and say what it is in the description. If PR #552 (MCP access, more tools) is merged first, also add
Effort per Part to `team_progress` and per Bingo to `player_history`.

## Phase 8: test-data generator (CLAUDE.md: a feature ships with generator support)

1. `server/src/devTools/generateBingo/womSnapshots.ts` `fakeTimeline` (55-145) builds kills per boss; give each
   snapshot `bossEhb` too: kills ÷ a kills-per-hour figure per metric (a small table in that file for the bosses the
   generator uses, roughly Wise Old Man's main-account rates; seeded `Rng` for any jitter). Keep the total `ehb` as the
   sum of `bossEhb` plus the existing non-boss filler, so totals and per-boss agree.
2. Admins edit Effort bosses in a generated Bingo through the real endpoints: in `run.ts`, after the board import,
   add one boss to a Part with no derived boss and remove one derived boss elsewhere (`POST`/`DELETE`
   `/admin/.../effort-bosses`), seeded.
3. A generated Finished Bingo then shows Effort on Stats, the player card, Wrapped and the Title.

## Must not change

- Points share, its calculation, and everything built on it (Titles that use it, Wrapped's MVP, share card fields).
- The scoreboard and points. Effort never becomes points.
- Search Tags and Boss tags.
- Existing Titles' measures and minimums.
- Published Wrapped payloads: new fields are optional.
- The Wise Old Man competition, and `gainsOf`/`bossGainsOf` results.
- Don't touch the e2e suite.

## Verification

- Server: `node ../node_modules/typescript/bin/tsc --noEmit -p .` and `npx vitest run` from `server/`.
- Client: `node ../node_modules/typescript/bin/tsc --noEmit -p .` from `client/`; client tests from `client/`
  (`npx vitest run src/...`).
- Formatting: `npx prettier --print-width 160 --write <new files>` (no repo config; don't reformat existing files).
- Dev DB: migrations don't run on start. Back it up (`better-sqlite3` `db.backup()`) and `npm run db:migrate` in
  `server/`, after asking the user.
- Generate a Finished Bingo (`npm run generate-bingo -- --stage complete`, after asking) and check, in both themes and
  palettes: the Stats Effort column and Tile detail, the player card, Wrapped's Player section and share card, the
  Title, and the board editor's Effort bosses on a Tile and a Part (add, remove derived, restore).
- On a Live generated Bingo, a Player sees only their own Team's Effort.

## Acceptance

- A Player who spent hours at a boss for an Item they never got shows those hours as Effort, on an unfinished Part.
- Time at a boss after their Team completed its Part isn't counted; an hour at a boss on two open Parts is split.
- Effort shares on a Team add up to 100%.
- An Admin can add and remove a Part's bosses, and that changes Effort after Publish.
- A Finished Bingo re-read from Wise Old Man shows Effort; a Historical Bingo says not recorded.
- Nothing listed under "Must not change" changed.
