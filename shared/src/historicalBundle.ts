// The historical import bundle (CONTEXT.md "Historical Bingo", docs/historical-bingos-plan.md → Process): one JSON file
// the local script (server/scripts/historical/) writes and a Site Admin uploads through Site admin → Import historical
// Bingo, which creates the whole Historical Bingo in one transaction. Its own versioned format: not the Bingo export
// (bingoExport.ts), which only copies board templates between environments.
//
// validateHistoricalBundle is the one check both sides run: the script before it writes a bundle, the server before it
// imports one. It checks the document on its own terms; what only the server can know (a slug that's taken, images
// that don't decode) the server adds to the same list of problems.
//
// Version 2 adds the optional sections of a rich Bingo (docs/historical-bingos-plan.md → Tier 2): each Tile's Tasks
// with their requirement trees, Lines, Submissions with Claims (and Proof screenshots), Signups with their answers,
// and the Draft. A version 1 (sparse) bundle is still valid, and a version 2 bundle without them is a sparse one.
import type { ExportImage } from "./bingoExport.ts";
import { isValidTimeZone } from "./timezone.ts";

export const HISTORICAL_BUNDLE_FORMAT = "tectonic-bingo-historical";
export const HISTORICAL_BUNDLE_VERSION = 2;
/** Every version this site reads. */
export const HISTORICAL_BUNDLE_VERSIONS: readonly number[] = [1, 2];

export interface HistoricalBundle {
  format: typeof HISTORICAL_BUNDLE_FORMAT;
  version: 1 | 2;
  /** What the bundle was made from (the source folder's name, say), for the audit log. */
  source: string;
  bingo: HistoricalBundleBingo;
  /** One per cell of the board, by position. */
  tiles: HistoricalBundleTile[];
  /** Every Player on a Team, each with a real Discord id. Players without one are `unknownPlayers`. */
  players: HistoricalBundlePlayer[];
  teams: HistoricalBundleTeam[];
  /** RSNs of Players whose Discord id isn't known: left off the Teams, shown only in the Wise Old Man leaderboard. */
  unknownPlayers: string[];
  standings: HistoricalBundleStanding[];
  /** The Wise Old Man team competition, as the script fetched it; null when the Bingo had none. */
  wom: HistoricalBundleWom | null;
  /** The Tiles' pictures, by file name (a Tile's `image`), each the original file base64 encoded. */
  images: Record<string, ExportImage>;

  // Version 2, all optional: a rich Bingo.
  lines?: HistoricalBundleLine[];
  /** Drops with their Claims, and Proof screenshots. Their screenshots are uploaded afterwards, by `screenshot` key. */
  submissions?: HistoricalBundleSubmission[];
  signups?: HistoricalBundleSignups;
  draft?: HistoricalBundleDraft;
}

export interface HistoricalBundleBingo {
  name: string;
  /** Lowercase letters, numbers and hyphens: the Bingo's URL. Must not be taken. */
  slug: string;
  description: string | null;
  /** ISO 8601. */
  startsAt: string;
  endsAt: string;
  boardRows: number;
  boardCols: number;
  rulesMarkdown: string | null;
}

export interface HistoricalBundleTile {
  /** 0-based. */
  boardRow: number;
  boardCol: number;
  name: string;
  /** A key of the bundle's `images`. */
  image: string;
  /** The Tile's points, when the old site recorded them. With `tasks`, its bonus for completing every one. */
  points: number | null;
  rules: string | null;
  /** Version 2: the Tile's Tasks, in order. */
  tasks?: HistoricalBundleTask[];
  /** Version 2: the Tile's Freeze period, in minutes; null or absent for none. */
  freezeMinutes?: number | null;
  /** Version 2: a Proof screenshot required Tile-wide (then no Task has its own), and what it should show. */
  requiresProof?: boolean;
  proofNote?: string | null;
}

/**
 * A node of a Task's requirement tree (CONTEXT.md "Requirement Tree"): ITEM leaves under COUNT (at least `min`
 * different ones complete) or SUM (`quantity` in total, over ITEM leaves only), ALL and ANY; or a MANUAL leaf a
 * Moderator marks done. `key`: unique in the bundle, for the Claims (and Proof screenshots) that point at it.
 *
 * A leaf can count toward two Tasks (a drop the old site counted for both): it is written in full once, and anywhere
 * later as a stub with its `key` and `reuse: true`, which puts that same leaf there too, so one Claim on it counts
 * toward each. A Task itself is never a stub.
 *
 * An ITEM's `valuedAs` (CONTEXT.md "Valued as"): its Claims' Drop value is that item's price ÷ divisor instead of their
 * own, as the leaf is set up here, e.g. a DT2 boss's Gold ring as that boss's vestige ÷ 3. Its `countsAs` (CONTEXT.md
 "Counts as", a whole number from 1, absent = 1): inside a SUM, a Claim of quantity q on it adds q × countsAs to the
 SUM's total, e.g. a Pyromancer garb counting as 25 burnt pages.
 */
export type HistoricalBundleNode =
  | { kind: "ITEM" | "MANUAL"; key: string; reuse: true }
  | { kind: "ITEM"; key?: string; item: string; label?: string | null; points?: number; valuedAs?: { itemName: string; divisor: number; source?: string | null } | null; countsAs?: number }
  | { kind: "MANUAL"; key?: string; label?: string | null; points?: number }
  | { kind: "COUNT"; key?: string; min: number; label?: string | null; points?: number; children: HistoricalBundleNode[] }
  | { kind: "SUM"; key?: string; quantity: number; label?: string | null; points?: number; children: HistoricalBundleNode[] }
  | { kind: "ALL" | "ANY"; key?: string; label?: string | null; points?: number; children: HistoricalBundleNode[] };

/** A Task: the root of its requirement tree, with a Task's own settings. */
export type HistoricalBundleTask = HistoricalBundleNode & {
  label: string;
  description?: string | null;
  points: number;
  /** "Withhold points until previous": its points count only once the Task before it is complete. */
  withholdUntilPrevious?: boolean;
  requiresProof?: boolean;
  proofNote?: string | null;
  /** A MANUAL Task only: when each Team was given it. */
  completions?: { team: string; at: string }[];
};

export interface HistoricalBundleLine {
  type: "row" | "column" | "diagonal" | "custom";
  /** 0-based: the row or column; diagonal 0 runs from the top left, 1 from the top right. */
  index: number;
  points: number;
  /** A custom Line's Tiles, by position ({ boardRow, boardCol }); the others follow from type and index. */
  cells?: { boardRow: number; boardCol: number }[];
}

export interface HistoricalBundleSubmission {
  /** Unique in the bundle. */
  key: string;
  /** A drop (the default), with its Claims, or a Proof screenshot. */
  kind?: "drop" | "proof";
  /** A Team's `name`. */
  team: string;
  /** The credited Player's Discord id; on the Team. */
  player: string;
  submittedAt: string;
  reviewedAt: string;
  status: "approved" | "rejected";
  /** Its screenshot's key, uploaded afterwards (pending until then); null when there was none. Unique in the bundle. */
  screenshot: string | null;
  /**
   * A drop only: what it counts toward, each on an ITEM (with that leaf's item) or MANUAL (no item) leaf by `key`.
   * `value`: an ITEM Claim's Drop value in GP (CONTEXT.md) at the time, kept as it is; without one, it's priced at
   * today's prices like any Claim that has none.
   */
  claims?: { leaf: string; item: string | null; quantity: number; value?: number }[];
  /** A Proof screenshot only: the Tile, and the Task when the requirement is the Task's own. */
  proof?: { boardRow: number; boardCol: number; task: string | null };
}

export interface HistoricalBundleSignups {
  /** Every question as text, exactly as typed, seen by Captains and up. */
  questions: { key: string; prompt: string; type: "text" | "textarea" }[];
  /**
   * One per Player (by Discord id, under their `players` RSN), plus one per Cut signup: someone who signed up and wasn't
   * drafted, who isn't in `players` and so brings their own `rsn` and `clan` (as a Player's).
   */
  entries: {
    discordId: string;
    signedUpAt: string;
    /** An IANA zone ("Europe/London") where it could be worked out; null otherwise. */
    timezone: string | null;
    /** By question key. */
    answers: Record<string, string>;
    cut: boolean;
    rsn?: string;
    clan?: { name: string } | null;
  }[];
}

export interface HistoricalBundleDraft {
  /** When it happened. */
  at: string;
  /** Team names in first-round pick order; the rounds snake (1..n, then n..1). */
  order: string[];
  /** Every pick, from 1, excluding the Captains and co-captains (who lead their Teams before the Draft). */
  picks: { pick: number; team: string; player: string }[];
}

export interface HistoricalBundlePlayer {
  /** A Discord user id (a snowflake). Never made up. */
  discordId: string;
  /** The RSN they played this Bingo under: their Signup's RSN. */
  rsn: string;
  /**
   * Their name from the Tectonic API when the bundle was made, if they're in the clan (a new user is created with it);
   * null when they've left, and a new user is then named by `rsn` and locked out like any non-member.
   */
  clan: { name: string } | null;
  /**
   * The Wise Old Man player id of the account they played on, when `wom` has one: the leaderboard finds them by it, so
   * an account renamed since (its current name in the competition isn't `rsn`) is still theirs.
   */
  womId?: number | null;
}

export interface HistoricalBundleTeam {
  name: string;
  /** Hex, like "#e74c3c"; null picks the next Team colour. */
  color: string | null;
  /** Discord ids. The Captain and co-captain are among `players`. */
  captain: string;
  coCaptain: string | null;
  players: string[];
}

export interface HistoricalBundleStanding {
  /** A Team's `name`. */
  team: string;
  /** 1 is first. */
  place: number;
  points: number | null;
}

export interface HistoricalBundleWom {
  /** The competition's Wise Old Man id. */
  competitionId: number;
  /** The raw GET /competitions/{id} response: title, metric, dates and `participations`. */
  data: unknown;
}

/** A rich import's scoring as the engine recomputed it: each Team's total, and its points by day (UTC dates). */
export interface HistoricalImportScoring {
  teams: { team: string; total: number; perDay: { date: string; points: number }[] }[];
}

export type HistoricalBundleCheck = { ok: true; bundle: HistoricalBundle; problems: [] } | { ok: false; problems: string[] };

const SLUG = /^[a-z0-9-]+$/;
const SNOWFLAKE = /^\d{15,21}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const MAX_BOARD = 12;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isText(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}
function isDate(v: unknown): v is string {
  return typeof v === "string" && !Number.isNaN(new Date(v).getTime());
}
/** A Valued as source's longest, as the board editor takes it (graphService). */
const VALUED_AS_SOURCE_MAX = 40;

function isWhole(v: unknown, min: number, max = Number.MAX_SAFE_INTEGER): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}
function optionalText(v: unknown): boolean {
  return v === null || v === undefined || typeof v === "string";
}

/**
 * Every problem with a bundle, all at once, or the bundle. `devDiscordIds` also accepts made-up ids, like the test
 * data generator's `testdata-` ones and dev-login accounts' (the server allows them in dev mode only).
 */
export function validateHistoricalBundle(input: unknown, opts: { devDiscordIds?: boolean } = {}): HistoricalBundleCheck {
  const problems: string[] = [];
  const add = (p: string) => problems.push(p);
  if (!isRecord(input)) return { ok: false, problems: ["The bundle isn't a JSON object"] };
  if (input.format !== HISTORICAL_BUNDLE_FORMAT) return { ok: false, problems: [`This isn't a historical Bingo bundle (its format isn't "${HISTORICAL_BUNDLE_FORMAT}")`] };
  if (typeof input.version !== "number" || !HISTORICAL_BUNDLE_VERSIONS.includes(input.version)) {
    return { ok: false, problems: [`Unknown bundle version ${JSON.stringify(input.version)}: this site reads versions ${HISTORICAL_BUNDLE_VERSIONS.join(" and ")}`] };
  }
  const isDiscordId = (v: unknown): v is string => typeof v === "string" && (SNOWFLAKE.test(v) || (opts.devDiscordIds === true && /^[A-Za-z0-9_-]+$/.test(v) && v !== "unknown"));

  if (!isText(input.source)) add("source: missing");

  // The Bingo
  const bingo = isRecord(input.bingo) ? input.bingo : null;
  let rows = 0;
  let cols = 0;
  if (!bingo) add("bingo: missing");
  else {
    if (!isText(bingo.name)) add("bingo.name: missing");
    if (typeof bingo.slug !== "string" || !SLUG.test(bingo.slug)) add("bingo.slug: must be lowercase letters, numbers and hyphens");
    if (!optionalText(bingo.description)) add("bingo.description: must be text or null");
    if (!optionalText(bingo.rulesMarkdown)) add("bingo.rulesMarkdown: must be text or null");
    if (!isDate(bingo.startsAt)) add("bingo.startsAt: must be a date");
    if (!isDate(bingo.endsAt)) add("bingo.endsAt: must be a date");
    if (isDate(bingo.startsAt) && isDate(bingo.endsAt) && new Date(bingo.endsAt) <= new Date(bingo.startsAt)) add("bingo.endsAt: must be after startsAt");
    if (!isWhole(bingo.boardRows, 1, MAX_BOARD)) add(`bingo.boardRows: must be a whole number from 1 to ${MAX_BOARD}`);
    else rows = bingo.boardRows;
    if (!isWhole(bingo.boardCols, 1, MAX_BOARD)) add(`bingo.boardCols: must be a whole number from 1 to ${MAX_BOARD}`);
    else cols = bingo.boardCols;
  }

  // Images and Tiles
  const images = isRecord(input.images) ? input.images : null;
  if (!images) add("images: missing");
  else {
    for (const [name, image] of Object.entries(images)) {
      if (!isRecord(image) || typeof image.data !== "string" || typeof image.contentType !== "string") add(`images["${name}"]: must be { contentType, data }`);
    }
  }
  if (!Array.isArray(input.tiles)) add("tiles: missing");
  else {
    const cells = new Set<string>();
    input.tiles.forEach((t: unknown, i) => {
      const at = `tiles[${i}]`;
      if (!isRecord(t)) return add(`${at}: must be an object`);
      const label = isText(t.name) ? `${at} "${t.name}"` : at;
      if (!isText(t.name)) add(`${at}: name missing`);
      if (!isWhole(t.boardRow, 0) || !isWhole(t.boardCol, 0)) add(`${label}: boardRow and boardCol must be whole numbers from 0`);
      else if (rows && cols && (t.boardRow >= rows || t.boardCol >= cols)) add(`${label}: row ${t.boardRow + 1}, column ${t.boardCol + 1} is off the ${rows}x${cols} board`);
      else {
        const cell = `${t.boardRow},${t.boardCol}`;
        if (cells.has(cell)) add(`${label}: a second Tile at row ${t.boardRow + 1}, column ${t.boardCol + 1}`);
        cells.add(cell);
      }
      if (!isText(t.image)) add(`${label}: image missing`);
      else if (images && !(t.image in images)) add(`${label}: its image "${t.image}" isn't in the bundle`);
      if (t.points !== null && t.points !== undefined && !isWhole(t.points, 0)) add(`${label}: points must be a whole number or null`);
      if (!optionalText(t.rules)) add(`${label}: rules must be text or null`);
    });
    if (rows && cols && cells.size < rows * cols) add(`tiles: ${rows * cols - cells.size} of the ${rows * cols} board cells have no Tile`);
  }

  // Players
  const players = new Map<string, string>(); // discordId → rsn
  const womIds = new Map<number, string>(); // Wise Old Man player id → rsn
  if (!Array.isArray(input.players)) add("players: missing");
  else {
    input.players.forEach((p: unknown, i) => {
      const at = `players[${i}]`;
      if (!isRecord(p)) return add(`${at}: must be an object`);
      const label = isText(p.rsn) ? `${at} "${p.rsn}"` : at;
      if (!isText(p.rsn)) add(`${at}: rsn missing`);
      if (p.discordId === "unknown") add(`${label}: a Player without a Discord id goes in unknownPlayers`);
      else if (!isDiscordId(p.discordId)) add(`${label}: discordId must be a Discord user id`);
      else if (players.has(p.discordId)) add(`${label}: Discord id ${p.discordId} is listed twice`);
      else players.set(p.discordId, isText(p.rsn) ? p.rsn : "");
      if (p.clan !== null && !(isRecord(p.clan) && isText(p.clan.name))) add(`${label}: clan must be { name } or null`);
      if (p.womId !== undefined && p.womId !== null) {
        if (!Number.isInteger(p.womId) || (p.womId as number) <= 0) add(`${label}: womId must be a Wise Old Man player id`);
        else if (womIds.has(p.womId as number)) add(`${label}: Wise Old Man player ${p.womId} is ${womIds.get(p.womId as number)}'s already`);
        else womIds.set(p.womId as number, isText(p.rsn) ? p.rsn : String(p.womId));
      }
    });
  }
  const unknown = Array.isArray(input.unknownPlayers) ? input.unknownPlayers : null;
  if (!unknown) add("unknownPlayers: missing (an empty list when every Player is known)");
  else unknown.forEach((u: unknown, i) => !isText(u) && add(`unknownPlayers[${i}]: must be an RSN`));

  // Teams
  const teamNames = new Set<string>();
  const onTeam = new Map<string, string>(); // discordId → Team name
  const leads = new Set<string>(); // Captains and co-captains
  if (!Array.isArray(input.teams) || input.teams.length === 0) add("teams: missing");
  else {
    input.teams.forEach((t: unknown, i) => {
      const at = `teams[${i}]`;
      if (!isRecord(t)) return add(`${at}: must be an object`);
      const name = isText(t.name) ? t.name.trim() : null;
      const label = name ? `Team "${name}"` : at;
      if (!name) add(`${at}: name missing`);
      else if (teamNames.has(name.toLowerCase())) add(`${label}: two Teams have this name`);
      else teamNames.add(name.toLowerCase());
      if (t.color !== null && t.color !== undefined && !(typeof t.color === "string" && HEX.test(t.color))) add(`${label}: color must be a hex colour like #e74c3c, or null`);
      const members = Array.isArray(t.players) ? t.players : null;
      if (!members) add(`${label}: players missing`);
      else {
        for (const id of members) {
          if (!players.has(id as string)) add(`${label}: player ${JSON.stringify(id)} isn't in players`);
          else if (onTeam.has(id as string)) add(`${label}: ${players.get(id as string)} is also on Team "${onTeam.get(id as string)}"`);
          else onTeam.set(id as string, name ?? at);
        }
      }
      if (typeof t.captain === "string") leads.add(t.captain);
      if (typeof t.coCaptain === "string") leads.add(t.coCaptain);
      if (t.captain === undefined || t.captain === null || t.captain === "") add(`${label}: no Captain`);
      else if (members && !members.includes(t.captain)) add(`${label}: its Captain ${JSON.stringify(t.captain)} isn't one of its players`);
      if (t.coCaptain !== null && t.coCaptain !== undefined) {
        if (members && !members.includes(t.coCaptain)) add(`${label}: its co-captain ${JSON.stringify(t.coCaptain)} isn't one of its players`);
        else if (t.coCaptain === t.captain) add(`${label}: its co-captain is its Captain`);
      }
    });
  }
  for (const [id, rsn] of players) if (!onTeam.has(id)) add(`players: ${rsn || id} isn't on a Team`);

  // Standings
  if (!Array.isArray(input.standings)) add("standings: missing (an empty list when they aren't known)");
  else {
    const placed = new Set<string>();
    input.standings.forEach((s: unknown, i) => {
      const at = `standings[${i}]`;
      if (!isRecord(s)) return add(`${at}: must be an object`);
      if (!isText(s.team) || !teamNames.has(s.team.trim().toLowerCase())) add(`${at}: ${JSON.stringify(s.team)} isn't one of the Teams`);
      else if (placed.has(s.team.trim().toLowerCase())) add(`${at}: Team "${s.team}" is placed twice`);
      else placed.add(s.team.trim().toLowerCase());
      if (!isWhole(s.place, 1)) add(`${at}: place must be a whole number from 1`);
      if (s.points !== null && s.points !== undefined && typeof s.points !== "number") add(`${at}: points must be a number or null`);
    });
  }

  // Wise Old Man
  if (input.wom === undefined) add("wom: missing (null when the Bingo had no competition)");
  else if (input.wom !== null) {
    if (!isRecord(input.wom)) add("wom: must be { competitionId, data } or null");
    else {
      if (!isWhole(input.wom.competitionId, 1)) add("wom.competitionId: must be a Wise Old Man competition id");
      if (!isRecord(input.wom.data) || !Array.isArray(input.wom.data.participations)) add("wom.data: must be the competition as Wise Old Man returns it, with its participations");
    }
  }

  const rich = ["lines", "submissions", "signups", "draft"].filter((k) => input[k] !== undefined);
  const richTiles = Array.isArray(input.tiles) && input.tiles.some((t: unknown) => isRecord(t) && ["tasks", "freezeMinutes", "requiresProof", "proofNote"].some((k) => t[k] !== undefined));
  if (input.version === 1 && (rich.length > 0 || richTiles)) add(`version: a version 1 bundle has no ${[...rich, ...(richTiles ? ["Tile tasks"] : [])].join(", ")}; those need version 2`);
  else checkRich(input, add, { rows, cols, teamNames, onTeam, leads, players, isDiscordId });

  return problems.length > 0 ? { ok: false, problems } : { ok: true, bundle: input as unknown as HistoricalBundle, problems: [] };
}

interface RichContext {
  rows: number;
  cols: number;
  teamNames: Set<string>; // lowercase
  onTeam: Map<string, string>; // discordId → Team name
  leads: Set<string>;
  players: Map<string, string>; // discordId → rsn
  isDiscordId(v: unknown): v is string;
}

interface LeafInfo {
  kind: "ITEM" | "MANUAL";
  item: string | null;
}

/** Version 2's sections: Tasks, Lines, Submissions, Signups and the Draft. */
function checkRich(input: Record<string, unknown>, add: (p: string) => void, ctx: RichContext): void {
  const keys = new Set<string>();
  const leaves = new Map<string, LeafInfo>();
  const tasksByKey = new Map<string, { tile: string; requiresProof: boolean }>();
  const tileAt = new Map<string, { requiresProof: boolean; taskProof: boolean }>(); // "row,col"
  const teamOf = (name: unknown) => (isText(name) && ctx.teamNames.has(name.trim().toLowerCase()) ? name.trim().toLowerCase() : null);
  const memberTeam = (id: string) => ctx.onTeam.get(id)?.toLowerCase() ?? null;

  const claimKey = (key: unknown, where: string) => {
    if (key === undefined) return;
    if (!isText(key)) add(`${where}: key must be text`);
    else if (keys.has(key)) add(`${where}: key "${key}" is used twice`);
    else keys.add(key);
  };

  function checkNode(n: unknown, where: string, depth: number): void {
    if (!isRecord(n)) return add(`${where}: must be an object`);
    if (depth > 8) return add(`${where}: nested too deep`);
    if (n.reuse !== undefined) {
      // A stub: a leaf written in full earlier, put here too.
      if (n.reuse !== true) return add(`${where}: reuse must be true`);
      if (depth === 0) return add(`${where}: a Task can't be a reused leaf`);
      if (!isText(n.key)) return add(`${where}: a reused leaf needs the key it was written under`);
      const leaf = leaves.get(n.key);
      if (!leaf) return add(`${where}: "${n.key}" isn't a leaf written earlier in the bundle`);
      if (n.kind !== leaf.kind) add(`${where}: "${n.key}" is ${leaf.kind === "ITEM" ? "an ITEM" : "a MANUAL"}, not ${JSON.stringify(n.kind)}`);
      return;
    }
    claimKey(n.key, where);
    if (n.points !== undefined && !isWhole(n.points, 0)) add(`${where}: points must be a whole number`);
    if (!optionalText(n.label)) add(`${where}: label must be text`);
    const children = Array.isArray(n.children) ? n.children : null;
    switch (n.kind) {
      case "ITEM":
        if (n.valuedAs !== undefined && n.valuedAs !== null) {
          const v = n.valuedAs;
          if (!isRecord(v) || !isText(v.itemName) || !isWhole(v.divisor, 1)) add(`${where}: valuedAs must be { itemName, divisor } with a divisor from 1`);
          else if (!optionalText(v.source) || (isText(v.source) && v.source.trim().length > VALUED_AS_SOURCE_MAX)) add(`${where}: valuedAs.source must be text of at most ${VALUED_AS_SOURCE_MAX} characters`);
        }
        if (n.countsAs !== undefined && !isWhole(n.countsAs, 1)) add(`${where}: countsAs must be a whole number from 1`);
        if (!isText(n.item)) add(`${where}: an ITEM needs its item`);
        else if (isText(n.key)) leaves.set(n.key, { kind: "ITEM", item: n.item.trim() });
        return;
      case "MANUAL":
        if (isText(n.key)) leaves.set(n.key, { kind: "MANUAL", item: null });
        return;
      case "COUNT":
        if (!isWhole(n.min, 1)) add(`${where}: a COUNT needs min, a whole number from 1`);
        else if (children && n.min > children.length) add(`${where}: min ${n.min} is more than its ${children.length} children`);
        break;
      case "SUM":
        if (!isWhole(n.quantity, 1)) add(`${where}: a SUM needs quantity, a whole number from 1`);
        if (children && children.some((c: unknown) => !isRecord(c) || c.kind !== "ITEM")) add(`${where}: a SUM's children must all be ITEMs`);
        break;
      case "ALL":
      case "ANY":
        break;
      default:
        return add(`${where}: kind must be ITEM, MANUAL, COUNT, SUM, ALL or ANY`);
    }
    if (!children || children.length === 0) return add(`${where}: a ${String(n.kind)} needs children`);
    const childKeys = new Set<string>();
    children.forEach((c: unknown, i) => {
      checkNode(c, `${where}.children[${i}]`, depth + 1);
      if (!isRecord(c) || !isText(c.key)) return;
      if (childKeys.has(c.key)) add(`${where}.children[${i}]: "${c.key}" is already one of its children`);
      childKeys.add(c.key);
    });
  }

  // Tiles: Tasks, Freeze and Proof screenshots.
  const tiles = Array.isArray(input.tiles) ? input.tiles : [];
  tiles.forEach((t: unknown, ti) => {
    if (!isRecord(t)) return;
    const label = isText(t.name) ? `tiles[${ti}] "${t.name}"` : `tiles[${ti}]`;
    if (t.freezeMinutes !== undefined && t.freezeMinutes !== null && !isWhole(t.freezeMinutes, 1)) add(`${label}: freezeMinutes must be a whole number of minutes, or null`);
    if (t.requiresProof !== undefined && typeof t.requiresProof !== "boolean") add(`${label}: requiresProof must be true or false`);
    if (!optionalText(t.proofNote)) add(`${label}: proofNote must be text`);
    let taskProof = false;
    if (t.tasks !== undefined) {
      if (!Array.isArray(t.tasks)) add(`${label}: tasks must be a list`);
      else {
        t.tasks.forEach((task: unknown, i) => {
          const where = `${label} tasks[${i}]`;
          checkNode(task, where, 0);
          if (!isRecord(task)) return;
          if (!isText(task.label)) add(`${where}: label missing`);
          if (!isWhole(task.points, 0)) add(`${where}: points must be a whole number`);
          if (!optionalText(task.description)) add(`${where}: description must be text`);
          if (task.withholdUntilPrevious === true && i === 0) add(`${where}: the first Task can't withhold its points until the one before it`);
          if (task.requiresProof === true) {
            taskProof = true;
            if (t.requiresProof === true) add(`${where}: the Tile already requires a Proof screenshot Tile-wide, so its Tasks can't have their own`);
          }
          if (isText(task.key)) tasksByKey.set(task.key, { tile: label, requiresProof: task.requiresProof === true });
          if (task.completions !== undefined) {
            if (task.kind !== "MANUAL") add(`${where}: only a MANUAL Task has completions`);
            else if (!Array.isArray(task.completions)) add(`${where}: completions must be a list of { team, at }`);
            else {
              const done = new Set<string>();
              task.completions.forEach((c: unknown, ci) => {
                const cw = `${where} completions[${ci}]`;
                if (!isRecord(c)) return add(`${cw}: must be { team, at }`);
                const team = teamOf(c.team);
                if (!team) add(`${cw}: ${JSON.stringify(c.team)} isn't one of the Teams`);
                else if (done.has(team)) add(`${cw}: Team "${c.team}" completes it twice`);
                else done.add(team);
                if (!isDate(c.at)) add(`${cw}: at must be a date`);
              });
            }
          }
        });
      }
    }
    if (isWhole(t.boardRow, 0) && isWhole(t.boardCol, 0)) tileAt.set(`${t.boardRow},${t.boardCol}`, { requiresProof: t.requiresProof === true, taskProof });
  });

  // Lines
  if (input.lines !== undefined) {
    if (!Array.isArray(input.lines)) add("lines: must be a list");
    else {
      const seen = new Set<string>();
      input.lines.forEach((l: unknown, i) => {
        const where = `lines[${i}]`;
        if (!isRecord(l)) return add(`${where}: must be an object`);
        if (!["row", "column", "diagonal", "custom"].includes(l.type as string)) return add(`${where}: type must be row, column, diagonal or custom`);
        if (!isWhole(l.points, 0)) add(`${where}: points must be a whole number`);
        if (!isWhole(l.index, 0)) return add(`${where}: index must be a whole number from 0`);
        const id = `${l.type as string} ${l.index}`;
        if (seen.has(id)) add(`${where}: ${id} is listed twice`);
        seen.add(id);
        if (l.type === "row" && ctx.rows && l.index >= ctx.rows) add(`${where}: there's no row ${l.index + 1}`);
        if (l.type === "column" && ctx.cols && l.index >= ctx.cols) add(`${where}: there's no column ${l.index + 1}`);
        if (l.type === "diagonal" && (l.index > 1 || ctx.rows !== ctx.cols)) add(`${where}: a diagonal is index 0 or 1, on a square board`);
        if (l.type === "custom") {
          if (!Array.isArray(l.cells) || l.cells.length === 0) add(`${where}: a custom Line needs its cells`);
          else l.cells.forEach((c: unknown, ci) => (!isRecord(c) || !tileAt.has(`${String(c.boardRow)},${String(c.boardCol)}`)) && add(`${where}.cells[${ci}]: isn't a Tile's position`));
        }
      });
    }
  }

  // Submissions
  if (input.submissions !== undefined) {
    if (!Array.isArray(input.submissions)) add("submissions: must be a list");
    else {
      const screenshots = new Set<string>();
      input.submissions.forEach((s: unknown, i) => {
        const where = `submissions[${i}]`;
        if (!isRecord(s)) return add(`${where}: must be an object`);
        const label = isText(s.key) ? `Submission "${s.key}"` : where;
        if (!isText(s.key)) add(`${where}: key missing`);
        else claimKey(s.key, label);
        const team = teamOf(s.team);
        if (!team) add(`${label}: ${JSON.stringify(s.team)} isn't one of the Teams`);
        if (!ctx.isDiscordId(s.player) || !ctx.players.has(s.player)) add(`${label}: player ${JSON.stringify(s.player)} isn't in players`);
        else if (team && memberTeam(s.player) !== team) add(`${label}: ${ctx.players.get(s.player)} isn't on Team "${String(s.team)}"`);
        if (!isDate(s.submittedAt)) add(`${label}: submittedAt must be a date`);
        if (!isDate(s.reviewedAt)) add(`${label}: reviewedAt must be a date`);
        else if (isDate(s.submittedAt) && new Date(s.reviewedAt) < new Date(s.submittedAt)) add(`${label}: reviewed before it was submitted`);
        if (s.status !== "approved" && s.status !== "rejected") add(`${label}: status must be approved or rejected`);
        if (s.screenshot !== null) {
          if (!isText(s.screenshot)) add(`${label}: screenshot must be a key, or null`);
          else if (screenshots.has(s.screenshot)) add(`${label}: screenshot "${s.screenshot}" is used twice`);
          else screenshots.add(s.screenshot);
        }
        const kind = s.kind ?? "drop";
        if (kind === "proof") {
          if (s.claims !== undefined && !(Array.isArray(s.claims) && s.claims.length === 0)) add(`${label}: a Proof screenshot has no Claims`);
          const proof = isRecord(s.proof) ? s.proof : null;
          const tile = proof ? tileAt.get(`${String(proof.boardRow)},${String(proof.boardCol)}`) : undefined;
          if (!proof || !tile) add(`${label}: proof must name its Tile's boardRow and boardCol`);
          else if (proof.task === null || proof.task === undefined) {
            if (!tile.requiresProof) add(`${label}: its Tile doesn't require a Proof screenshot Tile-wide`);
          } else if (!isText(proof.task) || !tasksByKey.get(proof.task)?.requiresProof) add(`${label}: proof.task ${JSON.stringify(proof.task)} isn't a Task that requires a Proof screenshot`);
        } else if (kind === "drop") {
          if (s.proof !== undefined) add(`${label}: only a Proof screenshot has proof`);
          if (!Array.isArray(s.claims) || s.claims.length === 0) add(`${label}: a drop needs its Claims`);
          else {
            s.claims.forEach((c: unknown, ci) => {
              const cw = `${label} claims[${ci}]`;
              if (!isRecord(c)) return add(`${cw}: must be { leaf, item, quantity }`);
              if (!isWhole(c.quantity, 1)) add(`${cw}: quantity must be a whole number from 1`);
              const leaf = isText(c.leaf) ? leaves.get(c.leaf) : undefined;
              if (!leaf) return add(`${cw}: ${JSON.stringify(c.leaf)} isn't the key of an ITEM or MANUAL leaf`);
              if (leaf.kind === "MANUAL" && c.item !== null && c.item !== undefined) add(`${cw}: a MANUAL leaf takes no item`);
              if (c.value !== undefined) {
                if (leaf.kind === "MANUAL") add(`${cw}: a MANUAL leaf has no Drop value`);
                else if (!isWhole(c.value, 0)) add(`${cw}: value must be a whole number of GP`);
              }
              if (leaf.kind === "ITEM" && (!isText(c.item) || c.item.trim().toLowerCase() !== leaf.item!.toLowerCase())) {
                add(`${cw}: its leaf "${String(c.leaf)}" accepts ${leaf.item}, not ${JSON.stringify(c.item)}`);
              }
            });
          }
        } else add(`${label}: kind must be drop or proof`);
      });
    }
  }

  // Signups
  if (input.signups !== undefined) {
    const signups = isRecord(input.signups) ? input.signups : null;
    if (!signups || !Array.isArray(signups.questions) || !Array.isArray(signups.entries)) add("signups: must be { questions, entries }");
    else {
      const questionKeys = new Set<string>();
      signups.questions.forEach((q: unknown, i) => {
        const where = `signups.questions[${i}]`;
        if (!isRecord(q)) return add(`${where}: must be { key, prompt, type }`);
        if (!isText(q.key)) add(`${where}: key missing`);
        else if (questionKeys.has(q.key)) add(`${where}: key "${q.key}" is used twice`);
        else questionKeys.add(q.key);
        if (!isText(q.prompt)) add(`${where}: prompt missing`);
        if (q.type !== "text" && q.type !== "textarea") add(`${where}: type must be text or textarea`);
      });
      const signedUp = new Set<string>();
      signups.entries.forEach((e: unknown, i) => {
        const where = `signups.entries[${i}]`;
        if (!isRecord(e)) return add(`${where}: must be an object`);
        const id = ctx.isDiscordId(e.discordId) ? e.discordId : null;
        const label = id ? `${where} (${ctx.players.get(id) || (isText(e.rsn) ? e.rsn : id)})` : where;
        if (!id) add(`${where}: discordId must be a Discord user id`);
        else if (signedUp.has(id)) add(`${label}: signed up twice`);
        else signedUp.add(id);
        if (!isDate(e.signedUpAt)) add(`${label}: signedUpAt must be a date`);
        if (e.timezone !== null && !(typeof e.timezone === "string" && isValidTimeZone(e.timezone))) add(`${label}: timezone must be an IANA zone like "Europe/London", or null`);
        if (!isRecord(e.answers)) add(`${label}: answers must map question keys to text`);
        else for (const [k, v] of Object.entries(e.answers)) {
          if (!questionKeys.has(k)) add(`${label}: an answer to "${k}", which isn't a question`);
          else if (typeof v !== "string") add(`${label}: the answer to "${k}" must be text`);
        }
        if (typeof e.cut !== "boolean") add(`${label}: cut must be true or false`);
        else if (e.cut) {
          if (id && ctx.players.has(id)) add(`${label}: a Cut signup isn't one of the players (they were drafted onto a Team)`);
          if (!isText(e.rsn)) add(`${label}: a Cut signup needs its rsn`);
          if (e.clan !== null && e.clan !== undefined && !(isRecord(e.clan) && isText(e.clan.name))) add(`${label}: a Cut signup's clan must be { name } or null`);
        } else if (id && !ctx.players.has(id)) add(`${label}: isn't one of the players (a signup that wasn't drafted is cut)`);
      });
      for (const [id, rsn] of ctx.players) if (!signedUp.has(id)) add(`signups: ${rsn || id} has no signup`);
    }
  }

  // The Draft
  if (input.draft !== undefined) {
    const draft = isRecord(input.draft) ? input.draft : null;
    if (!draft || !Array.isArray(draft.order) || !Array.isArray(draft.picks)) add("draft: must be { at, order, picks }");
    else {
      if (!isDate(draft.at)) add("draft.at: must be a date");
      const orderNames = draft.order as unknown[];
      const order = orderNames.map((n) => teamOf(n));
      if (order.some((t) => !t) || new Set(order).size !== ctx.teamNames.size || order.length !== ctx.teamNames.size) add("draft.order: must list every Team once");
      const picked = new Set<string>();
      const sorted = [...draft.picks].sort((a, b) => (isRecord(a) && isRecord(b) ? Number(a.pick) - Number(b.pick) : 0));
      sorted.forEach((p: unknown, i) => {
        const where = `draft pick ${i + 1}`;
        if (!isRecord(p)) return add(`${where}: must be { pick, team, player }`);
        if (p.pick !== i + 1) return add(`draft.picks: pick ${i + 1} is ${p.pick === undefined ? "missing" : `numbered ${JSON.stringify(p.pick)}`}; picks run 1, 2, 3...`);
        const team = teamOf(p.team);
        if (!team) return add(`${where}: ${JSON.stringify(p.team)} isn't one of the Teams`);
        const n = order.length;
        if (n > 0 && order.every(Boolean)) {
          const round = Math.floor(i / n);
          const slot = i % n;
          const expected = order[round % 2 === 0 ? slot : n - 1 - slot];
          if (expected !== team) add(`${where}: is Team "${String(p.team)}"'s, but in snake order it's ${String(orderNames[order.indexOf(expected)]).trim()}'s`);
        }
        if (!ctx.isDiscordId(p.player) || !ctx.players.has(p.player)) return add(`${where}: player ${JSON.stringify(p.player)} isn't in players`);
        if (memberTeam(p.player) !== team) add(`${where}: ${ctx.players.get(p.player)} isn't on Team "${String(p.team)}"`);
        if (ctx.leads.has(p.player)) add(`${where}: ${ctx.players.get(p.player)} leads their Team, so isn't drafted`);
        if (picked.has(p.player)) add(`${where}: ${ctx.players.get(p.player)} is picked twice`);
        picked.add(p.player);
      });
    }
  }
}
