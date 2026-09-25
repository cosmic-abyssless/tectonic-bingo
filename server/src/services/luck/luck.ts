// The luck behind the Spoon, Dry and Clutch Titles (#195), per Player, from real
// drop rates and the kills each Player gained during the Bingo. Pure: the caller
// brings the Team's approved Claims, each Player's WOM timeline and the open
// Items of the Team's Tasks.
//
// Drops are a Poisson process: one kill of a boss gives an Item `rate` times on
// average, so over n kills λ = Σ n × rate across the Item's bosses. A drop's
// luck is −log₁₀ P(at least one drop in those kills); "1 in N" is N = 10^luck.
// Each drop is judged over the kills since the Player's previous one (or the
// Bingo's start), so an early drop stays lucky however long they grind after.
import type { WomSnapshot } from "../womService";
import type { BossMetric } from "./bossSources";
import type { DropRateTable } from "./dropRates";
import { killsAtLeast, killsAtMost, killsUpToDrop } from "./kc";

/** The luck Titles' tunable numbers. Starting values are in DEFAULT_LUCK_WEIGHTS. */
export interface LuckWeights {
  /** Spoon: the luckiest drop counts in full, the next at this much, the one after at this squared, and so on. */
  spoonDecay: number;
  /** Spoon: the combined luck a Player needs (1 = 1 in 10). */
  spoonMinLuck: number;
  /** Dry: a streak counts from this luck. */
  dryMinLuck: number;
  /** Clutch: a drop's own luck must reach this, before its GP weight. */
  clutchMinLuck: number;
}

export const DEFAULT_LUCK_WEIGHTS: LuckWeights = { spoonDecay: 0.5, spoonMinLuck: 1, dryMinLuck: 1, clutchMinLuck: 1 };

export interface LuckClaim {
  claimId: string;
  userId: string;
  itemName: string;
  /** When the Submission was made: the drop's moment. */
  at: Date;
  /** The Task this Claim earned Points share on, or null when it advanced nothing. */
  taskNodeId: string | null;
  gpValue: number | null;
}

export interface LuckInput {
  rates: DropRateTable;
  bingoStart: Date;
  /** Set once the Bingo is Finished: Dry stops counting there. */
  bingoEnd: Date | null;
  now: Date;
  /** The Team's approved Claims. */
  claims: LuckClaim[];
  /** Each Player's WOM snapshots, oldest first, from one before the Bingo's start: without it their drops can't be judged. */
  timelines: Map<string, WomSnapshot[]>;
  /** Every Item name on the Board. */
  boardItems: string[];
  /** The Items still open on a Task, given the Team's Claims approved by `at` (see openItems). */
  openItemsAt(taskNodeId: string, at: Date): Set<string>;
  weights?: LuckWeights;
}

export interface DropLuck {
  claimId: string;
  itemName: string;
  luck: number;
  oneIn: number;
  kills: number;
}

export interface PlayerLuck {
  /** Best drop at full weight, each further drop at a decaying weight (LuckWeights.spoonDecay). */
  spoon: { value: number; best: DropLuck } | null;
  /** The most unlikely current dry streak, over every Board Item the boss drops. */
  dry: { value: number; oneIn: number; metric: BossMetric; kills: number } | null;
  /** The luckiest useful drop, weighted by its GP value. */
  clutch: { value: number; drop: DropLuck; gpValue: number | null } | null;
}

/** −log₁₀ P(at least one drop), for λ expected drops. */
export function luckOf(lambda: number): number {
  return lambda > 0 ? -Math.log10(-Math.expm1(-lambda)) : 0;
}

/** Clutch's GP weight: ×1 up to 1m, then one more per tenfold (×2 at 10m, ×3 at 100m), up to ×4 at 1b. */
export function gpWeight(gpValue: number | null): number {
  if (!gpValue || gpValue <= 1_000_000) return 1;
  return Math.min(4, 1 + Math.log10(gpValue / 1_000_000));
}

const later = (a: Date, b: Date) => (a > b ? a : b);

/** Expected drops over the Player's kills from `from` to `to`, given each boss's rate; null while KC is unknown. */
function expectedDrops(timeline: WomSnapshot[], rateByMetric: Map<BossMetric, number>, from: Date, to: Date): { lambda: number; kills: number } | null {
  let lambda = 0;
  let kills = 0;
  for (const [metric, rate] of rateByMetric) {
    const n = killsUpToDrop(timeline, metric, from, to);
    if (n === null) return null;
    lambda += n * rate;
    kills += n;
  }
  // They got the drop, so they killed at least once.
  if (kills === 0) return { lambda: Math.max(...rateByMetric.values()), kills: 1 };
  return { lambda, kills };
}

function dropLuck(claim: LuckClaim, expected: { lambda: number; kills: number }): DropLuck {
  const luck = luckOf(expected.lambda);
  return { claimId: claim.claimId, itemName: claim.itemName, luck, oneIn: 10 ** luck, kills: expected.kills };
}

function ratesOf(rates: DropRateTable, items: Iterable<string>): Map<BossMetric, number> {
  const out = new Map<BossMetric, number>();
  for (const item of items) for (const { metric, rate } of rates.sourcesOf(item)) out.set(metric, (out.get(metric) ?? 0) + rate);
  return out;
}

export function playerLuck(input: LuckInput): Map<string, PlayerLuck> {
  const out = new Map<string, PlayerLuck>();
  const byTime = [...input.claims].sort((a, b) => a.at.getTime() - b.at.getTime());

  for (const [userId, timeline] of input.timelines) {
    if (timeline.length === 0) continue;
    const mine = byTime.filter((c) => c.userId === userId);
    out.set(userId, {
      spoon: spoon(input, timeline, mine),
      dry: dry(input, timeline, mine),
      clutch: clutch(input, timeline, mine),
    });
  }
  return out;
}

function spoon(input: LuckInput, timeline: WomSnapshot[], mine: LuckClaim[]): PlayerLuck["spoon"] {
  const drops: DropLuck[] = [];
  const lastOfItem = new Map<string, Date>();
  for (const claim of mine) {
    const key = claim.itemName.toLowerCase();
    const from = later(input.bingoStart, lastOfItem.get(key) ?? input.bingoStart);
    lastOfItem.set(key, claim.at);
    const rateByMetric = ratesOf(input.rates, [claim.itemName]);
    if (rateByMetric.size === 0) continue;
    const expected = expectedDrops(timeline, rateByMetric, from, claim.at);
    if (expected) drops.push(dropLuck(claim, expected));
  }
  if (drops.length === 0) return null;
  drops.sort((a, b) => b.luck - a.luck);
  // Decaying, so repeat luck adds up to at most 1 / (1 − decay) times the best drop: frequency never beats rarity.
  const { spoonDecay, spoonMinLuck } = input.weights ?? DEFAULT_LUCK_WEIGHTS;
  const value = drops.reduce((sum, d, i) => sum + d.luck * spoonDecay ** i, 0);
  return value >= spoonMinLuck ? { value, best: drops[0]! } : null;
}

function dry(input: LuckInput, timeline: WomSnapshot[], mine: LuckClaim[]): PlayerLuck["dry"] {
  const end = input.bingoEnd ?? input.now;
  const boardRates = new Map<BossMetric, Map<string, number>>();
  for (const item of new Set(input.boardItems.map((i) => i.toLowerCase()))) {
    for (const { metric, rate } of input.rates.sourcesOf(item)) {
      const items = boardRates.get(metric) ?? new Map<string, number>();
      items.set(item, rate);
      boardRates.set(metric, items);
    }
  }

  let worst: PlayerLuck["dry"] = null;
  for (const [metric, items] of boardRates) {
    const p = [...items.values()].reduce((a, b) => a + b, 0);
    // A Board Item this boss always drops: nobody can be dry on it.
    if (p >= 1) continue;
    const drops = mine.filter((c) => c.at <= end && items.has(c.itemName.toLowerCase()));
    const lastDrop = drops[drops.length - 1];
    // From the Board drop's KC at the most (or the Bingo's start), to the latest KC by the end at the least.
    const from = lastDrop ? killsAtMost(timeline, metric, lastDrop.at) : killsAtLeast(timeline, metric, input.bingoStart);
    const to = killsAtLeast(timeline, metric, end);
    if (from === null || to === null) continue;
    const kills = Math.max(0, to - from);
    const value = -kills * Math.log10(1 - p);
    if (!worst || value > worst.value) worst = { value, oneIn: 10 ** value, metric, kills };
  }
  return worst && worst.value >= (input.weights ?? DEFAULT_LUCK_WEIGHTS).dryMinLuck ? worst : null;
}

function clutch(input: LuckInput, timeline: WomSnapshot[], mine: LuckClaim[]): PlayerLuck["clutch"] {
  const { clutchMinLuck } = input.weights ?? DEFAULT_LUCK_WEIGHTS;
  let best: PlayerLuck["clutch"] = null;
  const lastOnTask = new Map<string, Date>();
  for (const claim of mine) {
    if (!claim.taskNodeId) continue;
    const from = later(input.bingoStart, lastOnTask.get(claim.taskNodeId) ?? input.bingoStart);
    lastOnTask.set(claim.taskNodeId, claim.at);
    if (input.rates.sourcesOf(claim.itemName).length === 0) continue;
    // The Items still open when this stretch began: the most there were, so the rate is never understated.
    const useful = ratesOf(input.rates, input.openItemsAt(claim.taskNodeId, from));
    if (useful.size === 0) continue;
    const expected = expectedDrops(timeline, useful, from, claim.at);
    if (!expected) continue;
    const drop = dropLuck(claim, expected);
    // An easy drop stays easy however much it's worth.
    if (drop.luck < clutchMinLuck) continue;
    const value = drop.luck * gpWeight(claim.gpValue);
    if (!best || value > best.value) best = { value, drop, gpValue: claim.gpValue };
  }
  return best;
}
