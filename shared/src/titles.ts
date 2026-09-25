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
}

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
  | "grinder"
  | "butterfingers"
  | "sniper"
  | "clue_goblin"
  | "skiller"
  | "collector"
  | "tourist"
  | "specialist"
  | "hoarder"
  | "postman";

export interface TitleDefinition {
  id: TitleId;
  name: string;
  flavour: string;
  /** Shown only once someone holds it: nobody knows it exists until then. */
  hidden: boolean;
  /** "wom" Titles come from Wise Old Man gains, and show how fresh those are. */
  source: "bingo" | "wom";
  /** Higher wins. Null when the Player isn't eligible at all (no Wise Old Man data, no Submissions). */
  measure: (facts: PlayerTitleFacts, ctx: TitleContext) => number | null;
  /** The minimum to qualify, on top of the measure. */
  qualifies: (value: number, facts: PlayerTitleFacts) => boolean;
  /** The bar to reach, shown on a visible Title nobody holds yet. */
  requirement: string;
  /** The number behind a holder's Title: "42% of the team's points". */
  format: (value: number, facts: PlayerTitleFacts, ctx: TitleContext) => string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const num = (n: number, digits = 1) => n.toLocaleString("en-US", { maximumFractionDigits: digits });
const plural = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;
const percent = (fraction: number) => `${Math.round(fraction * 100)}%`;

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

/** Every Title, in chip priority order: a Player holding several shows the first. Thresholds are starting values. */
export const TITLES: TitleDefinition[] = [
  {
    id: "on_fire",
    name: "On Fire",
    flavour: "Can't stop, won't stop.",
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
    qualifies: (v) => v >= 10,
    requirement: "10 points share in the last 24 hours, once the bingo has been live for a day",
    format: (v, _f, ctx) => `+${num(v, 2)} points ${ctx.endedAt ? "in the final 24 h" : "in the last 24 h"}`,
  },
  {
    id: "carry",
    name: "Carry",
    flavour: "Put the team on their back.",
    hidden: false,
    source: "bingo",
    measure: (f) => (f.teamAwardPoints > 0 ? f.pointsShare / f.teamAwardPoints : null),
    qualifies: (_v, f) => f.pointsShare >= 1,
    requirement: "At least 1 points share",
    format: (v) => `${percent(v)} of the team's points`,
  },
  {
    id: "closer",
    name: "Closer",
    flavour: "Always there for the last piece.",
    hidden: false,
    source: "bingo",
    measure: (f) => f.awards.filter((a) => a.kind === "task" && a.closed).length,
    qualifies: (v) => v >= 1,
    requirement: "Finish off at least 1 task",
    format: (v) => `Finished off ${plural(v, "task")}`,
  },
  {
    id: "grinder",
    name: "Grinder",
    flavour: "Lives at the boss.",
    hidden: false,
    source: "wom",
    measure: (f) => f.wom?.ehb ?? null,
    qualifies: (v) => v >= 10,
    requirement: "10 EHB gained",
    format: (v) => `${num(v)} EHB gained`,
  },
  {
    id: "butterfingers",
    name: "Butterfingers",
    flavour: "Maybe crop the screenshot next time.",
    hidden: true,
    source: "bingo",
    measure: (f) => f.rejectedSubmissions,
    qualifies: (v) => v >= 2,
    requirement: "2 rejected submissions",
    format: (v) => plural(v, "rejected submission"),
  },
  {
    id: "sniper",
    name: "Sniper",
    flavour: "Few shots, all of them count.",
    hidden: true,
    source: "bingo",
    measure: (f) => (f.approvedSubmissions > 0 ? f.pointsShare / f.approvedSubmissions : null),
    qualifies: (_v, f) => f.approvedSubmissions >= 3,
    requirement: "3 approved submissions",
    format: (v) => `${num(v, 2)} points per submission`,
  },
  {
    id: "clue_goblin",
    name: "Clue Goblin",
    flavour: "Just one more casket.",
    hidden: true,
    source: "wom",
    measure: (f) => f.wom?.clues ?? null,
    qualifies: (v) => v >= 5,
    requirement: "5 clues completed",
    format: (v) => `${plural(v, "clue")} completed`,
  },
  {
    id: "skiller",
    name: "Skiller",
    flavour: "Wrong event, friend.",
    hidden: true,
    source: "wom",
    measure: (f) => f.wom?.ehp ?? null,
    qualifies: (v) => v >= 5,
    requirement: "5 EHP gained",
    format: (v) => `${num(v)} EHP gained`,
  },
  {
    id: "collector",
    name: "Collector",
    flavour: "One of everything, please.",
    hidden: false,
    source: "bingo",
    measure: (f) => f.distinctItems,
    qualifies: (v) => v >= 3,
    requirement: "3 different items claimed",
    format: (v) => `${plural(v, "different item")}`,
  },
  {
    id: "tourist",
    name: "Tourist",
    flavour: "Been everywhere, done a bit of everything.",
    hidden: false,
    source: "bingo",
    measure: (f) => new Set(f.awards.filter((a) => a.kind !== "line" && a.tileNodeId).map((a) => a.tileNodeId)).size,
    qualifies: (v) => v >= 3,
    requirement: "Points share on 3 tiles",
    format: (v) => `Points share on ${plural(v, "tile")}`,
  },
  {
    id: "specialist",
    name: "Specialist",
    flavour: "Found a tile and moved in.",
    hidden: false,
    source: "bingo",
    measure: (f) => topTile(f)?.fraction ?? null,
    qualifies: (v, f) => f.pointsShare >= 3 && v >= 0.5,
    requirement: "Half of at least 3 points share from one tile",
    format: (v, f) => `${percent(v)} of their points from ${topTile(f)?.name ?? "one tile"}`,
  },
  {
    id: "hoarder",
    name: "Hoarder",
    flavour: "Needs a bigger bank.",
    hidden: true,
    source: "bingo",
    measure: (f) => f.totalQuantity,
    qualifies: (v) => v >= 10,
    requirement: "10 items claimed in total",
    format: (v) => `${plural(v, "item")} claimed`,
  },
  {
    id: "postman",
    name: "Postman",
    flavour: "Delivering drops for the whole team.",
    hidden: true,
    source: "bingo",
    measure: (f) => f.postedForTeammates,
    qualifies: (v) => v >= 2,
    requirement: "Post 2 submissions for teammates",
    format: (v) => `Posted ${plural(v, "submission")} for teammates`,
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
  /** Everyone tied at the best qualifying value; empty when nobody qualifies. */
  holders: TitleHolder[];
}

// Values that differ only by floating-point noise (fractions of Points share) are a tie.
const tied = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/**
 * Every Title's holders among `pool`, in priority order: the Players tied at the best qualifying value. A hidden
 * Title nobody holds is left out entirely, so nothing hints it exists.
 */
export function pickTitles(pool: PlayerTitleFacts[], ctx: TitleContext, titles: TitleDefinition[] = TITLES): PickedTitle[] {
  const out: PickedTitle[] = [];
  for (const title of titles) {
    const qualifying: { facts: PlayerTitleFacts; value: number }[] = [];
    for (const facts of pool) {
      const value = title.measure(facts, ctx);
      if (value !== null && Number.isFinite(value) && title.qualifies(value, facts)) qualifying.push({ facts, value });
    }
    const best = qualifying.reduce((max, q) => Math.max(max, q.value), -Infinity);
    const holders = qualifying
      .filter((q) => tied(q.value, best))
      .map((q) => ({
        userId: q.facts.userId,
        value: q.value,
        text: title.format(q.value, q.facts, ctx),
        asOf: title.source === "wom" ? (q.facts.wom?.asOf ?? null) : null,
      }));
    if (title.hidden && holders.length === 0) continue;
    out.push({ title, holders });
  }
  return out;
}

/** Every Title a Player holds, in priority order. */
export function titlesHeldBy(picked: PickedTitle[], userId: string): PickedTitle[] {
  return picked.filter((p) => p.holders.some((h) => h.userId === userId));
}

/** Each holder's highest-priority Title: the one their chip shows. */
export function chipTitles(picked: PickedTitle[]): Map<string, TitleDefinition> {
  const out = new Map<string, TitleDefinition>();
  for (const p of picked) for (const h of p.holders) if (!out.has(h.userId)) out.set(h.userId, p.title);
  return out;
}
