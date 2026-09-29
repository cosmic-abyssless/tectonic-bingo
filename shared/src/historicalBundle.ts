// The historical import bundle (CONTEXT.md "Historical Bingo", docs/historical-bingos-plan.md → Process): one JSON file
// the local script (server/scripts/historical/) writes and a Site Admin uploads through Site admin → Import historical
// Bingo, which creates the whole Historical Bingo in one transaction. Its own versioned format: not the Bingo export
// (bingoExport.ts), which only copies board templates between environments.
//
// validateHistoricalBundle is the one check both sides run: the script before it writes a bundle, the server before it
// imports one. It checks the document on its own terms; what only the server can know (a slug that's taken, images
// that don't decode) the server adds to the same list of problems.
import type { ExportImage } from "./bingoExport.ts";

export const HISTORICAL_BUNDLE_FORMAT = "tectonic-bingo-historical";
export const HISTORICAL_BUNDLE_VERSION = 1;

export interface HistoricalBundle {
  format: typeof HISTORICAL_BUNDLE_FORMAT;
  version: typeof HISTORICAL_BUNDLE_VERSION;
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
  /** The Tile's points, when the old site recorded them. */
  points: number | null;
  rules: string | null;
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
  if (input.version !== HISTORICAL_BUNDLE_VERSION) {
    return { ok: false, problems: [`Unknown bundle version ${JSON.stringify(input.version)}: this site reads version ${HISTORICAL_BUNDLE_VERSION}`] };
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
    });
  }
  const unknown = Array.isArray(input.unknownPlayers) ? input.unknownPlayers : null;
  if (!unknown) add("unknownPlayers: missing (an empty list when every Player is known)");
  else unknown.forEach((u: unknown, i) => !isText(u) && add(`unknownPlayers[${i}]: must be an RSN`));

  // Teams
  const teamNames = new Set<string>();
  const onTeam = new Map<string, string>(); // discordId → Team name
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

  return problems.length > 0 ? { ok: false, problems } : { ok: true, bundle: input as unknown as HistoricalBundle, problems: [] };
}
