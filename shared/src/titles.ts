// Titles (CONTEXT.md): tongue-in-cheek labels given to Players from their stats (#182). Every Title's rules are
// here, in one list, and picking holders is pure: the server sends each Player's facts (statsService), and the
// client picks from whichever Players the team filter shows. Adding a Title is one entry in TITLES.

/** One award a Player has a Points share of, as far as Titles care. */
export interface TitleAwardFact {
  kind: "task" | "tile" | "line";
  /** The Tile it counts towards: a Task or Part's own Tile, or a tile bonus's Tile. Null for a line bonus. */
  tileNodeId: string | null;
  tileName: string | null;
  /** This Player's part of the award. */
  points: number;
  completedAt: string;
  /** Task and Part awards only: this Player's Claim was the last one approved on the path that decided it. */
  closed: boolean;
}

/** What a Player gained during the Bingo, by Wise Old Man's snapshots. */
export interface WomGains {
  ehb: number;
  ehp: number;
  /** Clues completed, every tier. */
  clues: number;
  /** The snapshot the gains run up to: how fresh they are. */
  asOf: string;
}

/**
 * A Player's Luck (CONTEXT.md) from their drops and kills during the Bingo (#195). `value` is −log₁₀ of how unlikely,
 * so "1 in N" is N = 10^value. Each part is null when the Player doesn't reach its floor.
 */
export interface LuckFacts {
  /** Their drops' luck, the luckiest in full and further ones decaying. `itemName` and `kills` are the luckiest drop's. */
  spoon: { value: number; itemName: string; kills: number } | null;
  /** Their most unlikely current dry streak: `kills` at `boss` without a Board drop from it. */
  dry: { value: number; boss: string; kills: number } | null;
  /** Their luckiest Useful drop. `value` is weighted by GP value; `luck` is the drop's own. */
  clutch: { value: number; luck: number; itemName: string; gpValue: number | null } | null;
}

export interface PlayerTitleFacts {
  userId: string;
  teamId: string;
  /** Points share (CONTEXT.md), unrounded. */
  pointsShare: number;
  /** Every point the Player's Team was awarded, Point Adjustments left out. */
  teamAwardPoints: number;
  awards: TitleAwardFact[];
  approvedSubmissions: number;
  /** Rejected Submissions they uploaded: as the poster, or as the Player when nobody posted for them. */
  rejectedSubmissions: number;
  /** Approved Submissions they posted for a teammate. */
  postedForTeammates: number;
  /** Distinct items across their approved Claims. */
  distinctItems: number;
  /** Total quantity across their approved item Claims. */
  totalQuantity: number;
  /** Null until Wise Old Man has been read for them, or when it has nothing for them. */
  wom: WomGains | null;
  /** Null without a Wise Old Man snapshot from before the Bingo: their drops can't be judged. */
  luck: LuckFacts | null;
  /**
   * The Achievements (CONTEXT.md) they've earned that are switched on in this Bingo, and when they earned the latest of
   * them (reaching that count). Null when the Bingo has Achievements switched off.
   */
  achievements: { earned: number; lastEarnedAt: string | null } | null;
  /**
   * When each Submission count last went up (the Submission's time), for ties: approved and rejected Submissions,
   * ones posted for a teammate, a new distinct item, and any item Claim. Null while it's 0.
   */
  lastAt: { approved: string | null; rejected: string | null; posted: string | null; newItem: string | null; item: string | null };
}

/** The luck Titles' tunable numbers (luck.ts on the server applies them). */
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

/** What a Site admin has tuned: each Title's minimum, the Titles turned off, and the luck weights. */
export interface TitleSettings {
  /** By Title id; a Title left out uses its default. */
  minimums: Partial<Record<TitleId, number>>;
  disabled: TitleId[];
  luck: LuckWeights;
}

export const DEFAULT_TITLE_SETTINGS: TitleSettings = { minimums: {}, disabled: [], luck: DEFAULT_LUCK_WEIGHTS };

export interface TitleContext {
  now: Date;
  /** When the Bingo started. Null if it hasn't. */
  liveAt: Date | null;
  /** When the Bingo moved to Finished. Null while it's Live. */
  endedAt: Date | null;
}

export type TitleId =
  | "on_fire"
  | "carry"
  | "closer"
  | "clutch"
  | "grinder"
  | "spoon"
  | "butterfingers"
  | "dry"
  | "sniper"
  | "collector"
  | "tourist"
  | "specialist"
  | "hoarder"
  | "postman"
  | "overachiever";

/** What a Title is about, for grouping and colour: scoring, luck, grinding, or a mishap. */
export type TitleGroup = "points" | "luck" | "grind" | "mishaps";

/** The groups in the order they're shown. */
export const TITLE_GROUPS: TitleGroup[] = ["points", "luck", "grind", "mishaps"];

export interface TitleDefinition {
  id: TitleId;
  name: string;
  flavour: string;
  /** How it's judged, in a sentence or so. Shown on the stats page. */
  explanation: string;
  group: TitleGroup;
  /** Shown only once someone holds it: nobody knows it exists until then. */
  hidden: boolean;
  /** "wom" Titles come from Wise Old Man gains, and show how fresh those are. */
  source: "bingo" | "wom";
  /** Higher wins. Null when the Player isn't eligible at all (no Wise Old Man data, no Submissions). */
  measure: (facts: PlayerTitleFacts, ctx: TitleContext) => number | null;
  /**
   * The one number a Site admin can tune (Title settings): the minimum `qualifies` holds a Player to. Null for the
   * luck Titles, whose floors are in the luck weights, because the calculator applies them.
   */
  minimum: { default: number; label: string; whole: boolean } | null;
  /** Whether a Player qualifies, given the measure and the minimum in force (the default when there's none). */
  qualifies: (value: number, facts: PlayerTitleFacts, min: number) => boolean;
  /** The bar to reach, shown on a visible Title nobody holds yet. */
  requirement: (min: number, luck: LuckWeights) => string;
  /** The number behind a holder's Title: "42% of the team's points". */
  format: (value: number, facts: PlayerTitleFacts, ctx: TitleContext) => string;
  /**
   * When the Player reached their value (ms), for ties: of the Players tied at the best, the one holding the fewest
   * Titles gets it, then whoever got there first. Null when it can't be told (then the pool's order decides).
   */
  reachedAt: (facts: PlayerTitleFacts, ctx: TitleContext) => number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const num = (n: number, digits = 1) => n.toLocaleString("en-US", { maximumFractionDigits: digits });
const plural = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;
const percent = (fraction: number) => `${Math.round(fraction * 100)}%`;

/** The latest of some ISO times, in ms; null with none. */
function latest(...times: (string | null | undefined)[]): number | null {
  const ms = times.filter((t): t is string => !!t).map(Date.parse);
  return ms.length ? Math.max(...ms) : null;
}

/** When the count of distinct keys among `awards` last went up: the award that brought the last new one. */
function lastNewKey(awards: TitleAwardFact[], key: (a: TitleAwardFact) => string | null): number | null {
  const seen = new Set<string>();
  let at: number | null = null;
  for (const a of [...awards].sort((x, y) => Date.parse(x.completedAt) - Date.parse(y.completedAt))) {
    const k = key(a);
    if (k === null || seen.has(k)) continue;
    seen.add(k);
    at = Date.parse(a.completedAt);
  }
  return at;
}

const SUPERSCRIPT = "⁰¹²³⁴⁵⁶⁷⁸⁹";

/** "1 in N" from a luck value: 1 in 340, 1 in 12,500, 1 in 2.3m, and past a trillion 1 in 1.7 × 10¹⁶. */
export function oneIn(luck: number): string {
  const n = 10 ** luck;
  if (n >= 1e12) {
    const exp = Math.floor(luck);
    return `1 in ${num(10 ** (luck - exp))} × 10${[...String(exp)].map((d) => SUPERSCRIPT[Number(d)]).join("")}`;
  }
  if (n >= 1_000_000_000) return `1 in ${num(n / 1_000_000_000)}b`;
  if (n >= 1_000_000) return `1 in ${num(n / 1_000_000)}m`;
  return `1 in ${num(n, n < 10 ? 1 : 0)}`;
}

/** A GP amount the way players shorten it (like the client's formatGp): 1.5b, 12.3m, 450k. */
export function shortGp(gp: number): string {
  const short = (n: number, unit: string) => `${num(n, n < 10 ? 2 : n < 100 ? 1 : 0)}${unit}`;
  if (gp >= 1_000_000_000) return short(gp / 1_000_000_000, "b");
  if (gp >= 1_000_000) return short(gp / 1_000_000, "m");
  if (gp >= 1_000) return short(gp / 1_000, "k");
  return num(gp, 0);
}

/** On Fire's window: the last 24 h, or the Bingo's final 24 h once it's Finished. Null until it has been Live that long. */
export function onFireWindow(ctx: TitleContext): { from: Date; to: Date } | null {
  const to = ctx.endedAt ?? ctx.now;
  if (!ctx.liveAt || to.getTime() - ctx.liveAt.getTime() < DAY_MS) return null;
  return { from: new Date(to.getTime() - DAY_MS), to };
}

// Points share per Tile, from the awards that count towards one.
function pointsByTile(facts: PlayerTitleFacts): Map<string, { name: string; points: number }> {
  const out = new Map<string, { name: string; points: number }>();
  for (const a of facts.awards) {
    if (!a.tileNodeId) continue;
    const entry = out.get(a.tileNodeId) ?? { name: a.tileName ?? "a tile", points: 0 };
    entry.points += a.points;
    out.set(a.tileNodeId, entry);
  }
  return out;
}

function topTile(facts: PlayerTitleFacts): { name: string; fraction: number } | null {
  if (facts.pointsShare <= 0) return null;
  let best: { name: string; points: number } | null = null;
  for (const t of pointsByTile(facts).values()) if (!best || t.points > best.points) best = t;
  return best && { name: best.name, fraction: best.points / facts.pointsShare };
}

/** Every Title, in priority order: a Player's chips list theirs in this order. Minimums are starting values. */
export const TITLES: TitleDefinition[] = [
  {
    id: "on_fire",
    name: "On Fire",
    flavour: "Can't stop, won't stop.",
    explanation: "The most points share earned in the last 24 hours. Once the bingo has finished, in its final 24 hours.",
    group: "points",
    hidden: false,
    source: "bingo",
    measure: (f, ctx) => {
      const window = onFireWindow(ctx);
      if (!window) return null;
      return f.awards.filter((a) => {
        const at = new Date(a.completedAt).getTime();
        return at > window.from.getTime() && at <= window.to.getTime();
      }).reduce((sum, a) => sum + a.points, 0);
    },
    minimum: { default: 10, label: "Points share in 24 h", whole: false },
    qualifies: (v, _f, min) => v >= min,
    requirement: (min) => `${num(min, 2)} points share in the last 24 hours, once the bingo has been live for a day`,
    format: (v, _f, ctx) => `+${num(v, 2)} points ${ctx.endedAt ? "in the final 24 h" : "in the last 24 h"}`,
    reachedAt: (f, ctx) => {
      const window = onFireWindow(ctx);
      return window ? latest(...f.awards.filter((a) => Date.parse(a.completedAt) > window.from.getTime() && Date.parse(a.completedAt) <= window.to.getTime()).map((a) => a.completedAt)) : null;
    },
  },
  {
    id: "carry",
    name: "Carry",
    flavour: "Put the team on their back.",
    explanation: "The biggest part of their team's points: their points share out of every point the team was awarded, point adjustments left out.",
    group: "points",
    hidden: false,
    source: "bingo",
    measure: (f) => (f.teamAwardPoints > 0 ? f.pointsShare / f.teamAwardPoints : null),
    minimum: { default: 1, label: "Points share", whole: false },
    qualifies: (_v, f, min) => f.pointsShare >= min,
    requirement: (min) => `At least ${num(min, 2)} points share`,
    format: (v) => `${percent(v)} of the team's points`,
    reachedAt: (f) => latest(...f.awards.map((a) => a.completedAt)),
  },
  {
    id: "closer",
    name: "Closer",
    flavour: "Always there for the last piece.",
    explanation: "The most tasks finished off: their submission was the last one approved on the path that completed the task.",
    group: "points",
    hidden: false,
    source: "bingo",
    measure: (f) => f.awards.filter((a) => a.kind === "task" && a.closed).length,
    minimum: { default: 1, label: "Tasks finished off", whole: true },
    qualifies: (v, _f, min) => v >= min,
    requirement: (min) => `Finish off at least ${plural(min, "task")}`,
    format: (v) => `Finished off ${plural(v, "task")}`,
    reachedAt: (f) => latest(...f.awards.filter((a) => a.kind === "task" && a.closed).map((a) => a.completedAt)),
  },
  {
    id: "clutch",
    name: "Clutch",
    flavour: "The drop the team was waiting for.",
    explanation: "The luckiest drop a task still needed. Pricier drops count for more.",
    group: "luck",
    hidden: false,
    source: "wom",
    // The calculator only keeps drops that were at least 1 in 10 (luck.ts).
    measure: (f) => f.luck?.clutch?.value ?? null,
    minimum: null,
    qualifies: (v) => v > 0,
    requirement: (_min, luck) => `A drop the team still needed, at ${oneIn(luck.clutchMinLuck)} luck or better`,
    format: (_v, f) => {
      const c = f.luck!.clutch!;
      return `Clutched ${c.itemName} (${oneIn(c.luck)})${c.gpValue ? `, ${shortGp(c.gpValue)}` : ""}`;
    },
    reachedAt: () => null,
  },
  {
    id: "grinder",
    name: "Grinder",
    flavour: "Lives at the boss.",
    explanation: "The most efficient hours bossed (EHB) gained during the bingo, by Wise Old Man.",
    group: "grind",
    hidden: false,
    source: "wom",
    measure: (f) => f.wom?.ehb ?? null,
    minimum: { default: 10, label: "EHB gained", whole: false },
    qualifies: (v, _f, min) => v >= min,
    requirement: (min) => `${num(min)} EHB gained`,
    format: (v) => `${num(v)} EHB gained`,
    reachedAt: (f) => latest(f.wom?.asOf),
  },
  {
    id: "spoon",
    name: "Spoon",
    flavour: "Born with it.",
    explanation: "The luckiest drops during the bingo. One rare drop beats a pile of common ones.",
    group: "luck",
    hidden: false,
    source: "wom",
    // The calculator only keeps a total of at least 1 in 10 (luck.ts).
    measure: (f) => f.luck?.spoon?.value ?? null,
    minimum: null,
    qualifies: (v) => v > 0,
    requirement: (_min, luck) => `Drops adding up to ${oneIn(luck.spoonMinLuck)} luck`,
    format: (v, f) => {
      const best = f.luck!.spoon!;
      return `${oneIn(v)} luck (${best.itemName} at ${plural(best.kills, "kill")})`;
    },
    reachedAt: () => null,
  },
  {
    id: "butterfingers",
    name: "Butterfingers",
    flavour: "Maybe crop the screenshot next time.",
    explanation: "The most of their submissions the mods rejected, whether they posted them or someone posted for them.",
    group: "mishaps",
    hidden: true,
    source: "bingo",
    measure: (f) => f.rejectedSubmissions,
    minimum: { default: 2, label: "Rejected submissions", whole: true },
    qualifies: (v, _f, min) => v >= min,
    requirement: (min) => plural(min, "rejected submission"),
    format: (v) => plural(v, "rejected submission"),
    reachedAt: (f) => latest(f.lastAt.rejected),
  },
  {
    id: "dry",
    name: "Dry",
    flavour: "It's coming. Any kill now.",
    explanation: "The driest streak at a boss that drops something on the board, since their last board drop from it.",
    group: "luck",
    hidden: true,
    source: "wom",
    // The calculator only keeps a streak of at least 1 in 10 (luck.ts).
    measure: (f) => f.luck?.dry?.value ?? null,
    minimum: null,
    qualifies: (v) => v > 0,
    requirement: (_min, luck) => `A dry streak of ${oneIn(luck.dryMinLuck)} at a boss on the board`,
    format: (v, f) => {
      const dry = f.luck!.dry!;
      return `${num(dry.kills, 0)} KC dry at ${dry.boss} (${oneIn(v)})`;
    },
    reachedAt: () => null,
  },
  {
    id: "sniper",
    name: "Sniper",
    flavour: "Few shots, all of them count.",
    explanation: "The most points share per approved submission they posted.",
    group: "points",
    hidden: true,
    source: "bingo",
    measure: (f) => (f.approvedSubmissions > 0 ? f.pointsShare / f.approvedSubmissions : null),
    minimum: { default: 3, label: "Approved submissions", whole: true },
    qualifies: (_v, f, min) => f.approvedSubmissions >= min,
    requirement: (min) => plural(min, "approved submission"),
    format: (v) => `${num(v, 2)} points per submission`,
    reachedAt: (f) => latest(f.lastAt.approved, ...f.awards.map((a) => a.completedAt)),
  },
  {
    id: "collector",
    name: "Collector",
    flavour: "One of everything, please.",
    explanation: "The most different items across their approved submissions.",
    group: "grind",
    hidden: false,
    source: "bingo",
    measure: (f) => f.distinctItems,
    minimum: { default: 3, label: "Different items", whole: true },
    qualifies: (v, _f, min) => v >= min,
    requirement: (min) => `${plural(min, "different item")} claimed`,
    format: (v) => `${plural(v, "different item")}`,
    reachedAt: (f) => latest(f.lastAt.newItem),
  },
  {
    id: "tourist",
    name: "Tourist",
    flavour: "Been everywhere, done a bit of everything.",
    explanation: "Points share on the most different tiles.",
    group: "points",
    hidden: false,
    source: "bingo",
    measure: (f) => new Set(f.awards.filter((a) => a.kind !== "line" && a.tileNodeId).map((a) => a.tileNodeId)).size,
    minimum: { default: 3, label: "Tiles", whole: true },
    qualifies: (v, _f, min) => v >= min,
    requirement: (min) => `Points share on ${plural(min, "tile")}`,
    format: (v) => `Points share on ${plural(v, "tile")}`,
    reachedAt: (f) => lastNewKey(f.awards, (a) => (a.kind !== "line" ? a.tileNodeId : null)),
  },
  {
    id: "specialist",
    name: "Specialist",
    flavour: "Found a tile and moved in.",
    explanation: "The most of their points from a single tile, and at least half of them.",
    group: "points",
    hidden: false,
    source: "bingo",
    measure: (f) => topTile(f)?.fraction ?? null,
    minimum: { default: 3, label: "Points share", whole: false },
    qualifies: (v, f, min) => f.pointsShare >= min && v >= 0.5,
    requirement: (min) => `Half of at least ${num(min, 2)} points share from one tile`,
    format: (v, f) => `${percent(v)} of their points from ${topTile(f)?.name ?? "one tile"}`,
    reachedAt: (f) => latest(...f.awards.map((a) => a.completedAt)),
  },
  {
    id: "hoarder",
    name: "Hoarder",
    flavour: "Needs a bigger bank.",
    explanation: "The most items claimed in total across their approved submissions, counting every one of a stack.",
    group: "grind",
    hidden: true,
    source: "bingo",
    measure: (f) => f.totalQuantity,
    minimum: { default: 10, label: "Items claimed", whole: true },
    qualifies: (v, _f, min) => v >= min,
    requirement: (min) => `${plural(min, "item")} claimed in total`,
    format: (v) => `${plural(v, "item")} claimed`,
    reachedAt: (f) => latest(f.lastAt.item),
  },
  {
    id: "postman",
    name: "Postman",
    flavour: "Delivering drops for the whole team.",
    explanation: "The most approved submissions they posted for a teammate.",
    group: "grind",
    hidden: true,
    source: "bingo",
    measure: (f) => f.postedForTeammates,
    minimum: { default: 2, label: "Submissions for teammates", whole: true },
    qualifies: (v, _f, min) => v >= min,
    requirement: (min) => `Post ${plural(min, "submission")} for teammates`,
    format: (v) => `Posted ${plural(v, "submission")} for teammates`,
    reachedAt: (f) => latest(f.lastAt.posted),
  },
  {
    id: "overachiever",
    name: "Overachiever",
    flavour: "Collected them all. Well, most of them.",
    explanation: "The most achievements earned during the bingo. A tie goes to whoever got there first.",
    group: "grind",
    hidden: false,
    source: "bingo",
    measure: (f) => f.achievements?.earned ?? null,
    minimum: { default: 5, label: "Achievements earned", whole: true },
    qualifies: (v, _f, min) => v >= min,
    requirement: (min) => `Earn at least ${plural(min, "achievement")}`,
    format: (v) => `Earned ${plural(v, "achievement")}`,
    reachedAt: (f) => latest(f.achievements?.lastEarnedAt),
  },
];

export interface TitleHolder {
  userId: string;
  value: number;
  /** The number behind it, formatted: "42% of the team's points". */
  text: string;
  /** Wise Old Man Titles: the snapshot their gains run up to. */
  asOf: string | null;
}

export interface PickedTitle {
  title: TitleDefinition;
  /** The bar to reach, with the minimums in force. */
  requirement: string;
  /** Who holds it (one Player; see pickTitles for ties); empty when nobody qualifies. */
  holders: TitleHolder[];
}

// Values that differ only by floating-point noise (fractions of Points share) are a tie.
const tied = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/** The minimum in force for a Title: the Site admin's, else its default. 0 for the luck Titles, which have none. */
export function titleMinimum(title: TitleDefinition, settings: TitleSettings): number {
  return settings.minimums[title.id] ?? title.minimum?.default ?? 0;
}

/**
 * Every Title's holder among `pool`, in priority order: the Player with the best qualifying value. A Title is never
 * shared: a tie goes to the tied Player holding the fewest Titles, then to whoever reached the value first
 * (TitleDefinition.reachedAt), then to the one earlier in `pool`. A hidden Title nobody holds is left out entirely, so
 * nothing hints it exists.
 */
export function pickTitles(pool: PlayerTitleFacts[], ctx: TitleContext, settings: TitleSettings = DEFAULT_TITLE_SETTINGS, titles: TitleDefinition[] = TITLES): PickedTitle[] {
  type Candidate = { facts: PlayerTitleFacts; value: number };
  const contested: { title: TitleDefinition; min: number; top: Candidate[] }[] = [];
  for (const title of titles) {
    if (settings.disabled.includes(title.id)) continue;
    const min = titleMinimum(title, settings);
    const qualifying: Candidate[] = [];
    for (const facts of pool) {
      const value = title.measure(facts, ctx);
      if (value !== null && Number.isFinite(value) && title.qualifies(value, facts, min)) qualifying.push({ facts, value });
    }
    const best = qualifying.reduce((max, q) => Math.max(max, q.value), -Infinity);
    contested.push({ title, min, top: qualifying.filter((q) => tied(q.value, best)) });
  }

  // Titles won outright count first; then each tie, in priority order, goes to the tied Player holding the fewest so
  // far, then to whoever got there first.
  const held = new Map<string, number>();
  const heldBy = (q: Candidate) => held.get(q.facts.userId) ?? 0;
  const give = (q: Candidate) => held.set(q.facts.userId, heldBy(q) + 1);
  for (const c of contested) if (c.top.length === 1) give(c.top[0]!);
  const out: PickedTitle[] = [];
  for (const { title, min, top } of contested) {
    let holder = top[0];
    if (top.length > 1) {
      const reached = (q: Candidate) => title.reachedAt(q.facts, ctx) ?? Infinity;
      // Not a subtraction: two Players it can't tell for are both Infinity.
      const earlier = (a: number, b: number) => (a < b ? -1 : a > b ? 1 : 0);
      holder = [...top].sort((a, b) => heldBy(a) - heldBy(b) || earlier(reached(a), reached(b)))[0]!;
      give(holder);
    }
    if (title.hidden && !holder) continue;
    const holders = holder
      ? [{ userId: holder.facts.userId, value: holder.value, text: title.format(holder.value, holder.facts, ctx), asOf: title.source === "wom" ? (holder.facts.wom?.asOf ?? null) : null }]
      : [];
    out.push({ title, requirement: title.requirement(min, settings.luck), holders });
  }
  return out;
}

/** Every Title a Player holds, in priority order. */
export function titlesHeldBy(picked: PickedTitle[], userId: string): PickedTitle[] {
  return picked.filter((p) => p.holders.some((h) => h.userId === userId));
}

/** Every Title each holder holds, in priority order: their chips in the contributors table. */
export function titlesByHolder(picked: PickedTitle[]): Map<string, TitleDefinition[]> {
  const out = new Map<string, TitleDefinition[]>();
  for (const p of picked) for (const h of p.holders) out.set(h.userId, [...(out.get(h.userId) ?? []), p.title]);
  return out;
}
