// A sparse past Bingo's source folder (README.md): bingo.yaml plus tiles/r1c1.png and so on. Read and checked here,
// every problem with the file and line it's on, before anything is fetched.
import fs from "node:fs";
import path from "node:path";
import { LineCounter, isMap, isScalar, isSeq, parseDocument, type Node } from "yaml";

const IMAGE_TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const TILE_FILE = /^r(\d+)c(\d+)\.[a-z]+$/i;
const SLUG = /^[a-z0-9-]+$/;
const SNOWFLAKE = /^\d{15,21}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;

export interface SourcePlayer {
  rsn: string;
  /** null when it's `unknown`. */
  discordId: string | null;
}

export interface SourceTeam {
  name: string;
  color: string | null;
  captain: string;
  coCaptain: string | null;
  players: SourcePlayer[];
}

export interface SourceTile {
  /** 0-based. */
  row: number;
  col: number;
  /** null when bingo.yaml doesn't name it. */
  name: string | null;
  points: number | null;
  rules: string | null;
  image: { file: string; contentType: string; data: Buffer };
}

export interface Source {
  name: string;
  slug: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  rows: number;
  cols: number;
  rules: string | null;
  womCompetitionId: number | null;
  teams: SourceTeam[];
  standings: { team: string; place: number; points: number | null }[];
  tiles: SourceTile[];
}

export interface SourceCheck {
  source: Source | null;
  /** "bingo.yaml:12:7: ..." — each blocks the bundle. */
  errors: string[];
  /** Worth a look; don't block. */
  warnings: string[];
}

/** Position `r1c1` → 0-based row and column. */
export function parsePosition(key: string): { row: number; col: number } | null {
  const m = /^r(\d+)c(\d+)$/i.exec(key);
  return m ? { row: Number(m[1]) - 1, col: Number(m[2]) - 1 } : null;
}

export function readSource(folder: string): SourceCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const yamlPath = path.join(folder, "bingo.yaml");
  if (!fs.existsSync(yamlPath)) return { source: null, errors: [`${yamlPath}: not found`], warnings };
  const text = fs.readFileSync(yamlPath, "utf8");
  const lines = new LineCounter();
  const doc = parseDocument(text, { lineCounter: lines, prettyErrors: false });

  const at = (node: Node | null | undefined): string => {
    if (!node?.range) return "bingo.yaml";
    const { line, col } = lines.linePos(node.range[0]);
    return `bingo.yaml:${line}:${col}`;
  };
  const err = (node: Node | null | undefined, where: string, message: string) => errors.push(`${at(node)}: ${where}: ${message}`);

  for (const e of doc.errors) {
    const { line, col } = lines.linePos(e.pos[0]);
    errors.push(`bingo.yaml:${line}:${col}: ${e.message.split("\n")[0]}`);
  }
  if (errors.length > 0) return { source: null, errors, warnings };
  const root = doc.contents;
  if (!isMap(root)) return { source: null, errors: ["bingo.yaml: must be a mapping of settings (name:, slug:, teams: ...)"], warnings };

  const node = (p: (string | number)[]) => doc.getIn(p, true) as Node | undefined;
  const value = (p: (string | number)[]) => doc.getIn(p) as unknown;
  const str = (p: (string | number)[], required: boolean): string | null => {
    const v = value(p);
    if (v === undefined || v === null || v === "") {
      if (required) err(node(p.slice(0, -1)) ?? root, p.join("."), "missing");
      return null;
    }
    if (typeof v !== "string" && typeof v !== "number") {
      err(node(p), p.join("."), "must be text");
      return null;
    }
    return String(v).trim();
  };
  const whole = (p: (string | number)[], min: number, required: boolean): number | null => {
    const v = value(p);
    if (v === undefined || v === null) {
      if (required) err(node(p.slice(0, -1)) ?? root, p.join("."), "missing");
      return null;
    }
    if (typeof v !== "number" || !Number.isInteger(v) || v < min) {
      err(node(p), p.join("."), `must be a whole number from ${min}`);
      return null;
    }
    return v;
  };
  const date = (key: string): string | null => {
    const v = value([key]);
    // YAML reads an unquoted timestamp as a string here (the core schema), and a bare date too.
    const s = v instanceof Date ? v.toISOString() : typeof v === "string" ? v : null;
    if (s === null || Number.isNaN(new Date(s).getTime())) {
      err(node([key]) ?? root, key, v === undefined ? "missing" : "must be a date, like 2024-03-01T18:00:00Z");
      return null;
    }
    return new Date(s).toISOString();
  };
  /** A Discord id exactly as written: YAML reads a long unquoted number as a float and loses digits, so take the source text. */
  const discordId = (p: (string | number)[]): string | null | undefined => {
    const n = node(p);
    if (!n || !isScalar(n)) return undefined;
    if (n.value === "unknown") return null;
    const raw = typeof n.value === "number" && n.range ? text.slice(n.range[0], n.range[1]).trim() : typeof n.value === "string" ? n.value.trim() : "";
    return raw;
  };

  const name = str(["name"], true);
  const slug = str(["slug"], true);
  if (slug && !SLUG.test(slug)) err(node(["slug"]), "slug", "must be lowercase letters, numbers and hyphens");
  const startsAt = date("start");
  const endsAt = date("end");
  if (startsAt && endsAt && endsAt <= startsAt) err(node(["end"]), "end", "must be after start");
  const rows = whole(["rows"], 1, true);
  const cols = whole(["cols"], 1, true);
  const womCompetitionId = whole(["womCompetitionId"], 1, false);
  if (value(["womCompetitionId"]) === undefined) warnings.push("bingo.yaml: no womCompetitionId, so there's no Wise Old Man leaderboard");

  // Teams
  const teams: SourceTeam[] = [];
  const seenIds = new Map<string, string>();
  const teamsNode = node(["teams"]);
  if (!isSeq(teamsNode) || teamsNode.items.length === 0) err(teamsNode ?? root, "teams", "must be a list of Teams");
  else {
    teamsNode.items.forEach((_, ti) => {
      const where = `teams[${ti}]`;
      const teamName = str(["teams", ti, "name"], true);
      const label = teamName ? `Team "${teamName}"` : where;
      const color = str(["teams", ti, "color"], false);
      if (color && !HEX.test(color)) err(node(["teams", ti, "color"]), `${label} color`, "must be a hex colour like \"#e74c3c\" (quoted)");
      const players: SourcePlayer[] = [];
      const playersNode = node(["teams", ti, "players"]);
      if (!isSeq(playersNode) || playersNode.items.length === 0) err(playersNode ?? node(["teams", ti]), `${label} players`, "must be a list of { rsn, discordId }");
      else {
        playersNode.items.forEach((_, pi) => {
          const pWhere = `${label} players[${pi}]`;
          const rsn = str(["teams", ti, "players", pi, "rsn"], true);
          const id = discordId(["teams", ti, "players", pi, "discordId"]);
          if (id === undefined) err(node(["teams", ti, "players", pi]), `${pWhere}${rsn ? ` (${rsn})` : ""}`, "discordId missing: a Discord user id, or unknown");
          else if (id !== null && !SNOWFLAKE.test(id)) err(node(["teams", ti, "players", pi, "discordId"]), `${pWhere}${rsn ? ` (${rsn})` : ""}`, `discordId "${id}" isn't a Discord user id (or unknown)`);
          else if (id !== null && seenIds.has(id)) err(node(["teams", ti, "players", pi, "discordId"]), `${pWhere}${rsn ? ` (${rsn})` : ""}`, `Discord id ${id} is also ${seenIds.get(id)}`);
          else if (id !== null && rsn) seenIds.set(id, rsn);
          if (rsn) players.push({ rsn, discordId: id ?? null });
        });
      }
      const find = (rsn: string | null) => (rsn ? players.find((p) => p.rsn.toLowerCase() === rsn.toLowerCase()) : undefined);
      const captain = str(["teams", ti, "captain"], true);
      if (captain && !find(captain)) err(node(["teams", ti, "captain"]), `${label} captain`, `"${captain}" isn't one of the Team's players`);
      else if (captain && find(captain)!.discordId === null) err(node(["teams", ti, "captain"]), `${label} captain`, `"${captain}" needs a Discord id: a Captain can't be unknown`);
      const coCaptain = str(["teams", ti, "coCaptain"], false);
      if (coCaptain && !find(coCaptain)) err(node(["teams", ti, "coCaptain"]), `${label} coCaptain`, `"${coCaptain}" isn't one of the Team's players`);
      else if (coCaptain && find(coCaptain)!.discordId === null) err(node(["teams", ti, "coCaptain"]), `${label} coCaptain`, `"${coCaptain}" needs a Discord id: a co-captain can't be unknown`);
      // Kept even without a Captain (an error already), so the standings can still name it.
      if (teamName) teams.push({ name: teamName, color, captain: captain ? (find(captain)?.rsn ?? captain) : "", coCaptain: coCaptain ? (find(coCaptain)?.rsn ?? coCaptain) : null, players });
    });
  }

  // Standings
  const standings: Source["standings"] = [];
  const standingsNode = node(["standings"]);
  if (standingsNode === undefined) warnings.push("bingo.yaml: no standings");
  else if (!isSeq(standingsNode)) err(standingsNode, "standings", "must be a list of { team, place, points }");
  else {
    standingsNode.items.forEach((_, i) => {
      const team = str(["standings", i, "team"], true);
      const place = whole(["standings", i, "place"], 1, true);
      const pts = value(["standings", i, "points"]);
      if (pts !== undefined && pts !== null && typeof pts !== "number") err(node(["standings", i, "points"]), `standings[${i}] points`, "must be a number");
      if (team && !teams.some((t) => t.name.toLowerCase() === team.toLowerCase())) err(node(["standings", i, "team"]), `standings[${i}]`, `"${team}" isn't one of the Teams`);
      if (team && place) standings.push({ team, place, points: typeof pts === "number" ? pts : null });
    });
  }

  // Tiles: the pictures in tiles/, and what bingo.yaml says about each.
  const tiles: SourceTile[] = [];
  const tilesDir = path.join(folder, "tiles");
  const files = fs.existsSync(tilesDir) ? fs.readdirSync(tilesDir).filter((f) => !f.startsWith(".")) : [];
  const fileAt = new Map<string, string>();
  for (const f of files) {
    const m = TILE_FILE.exec(f);
    const pos = m ? { row: Number(m[1]) - 1, col: Number(m[2]) - 1 } : null;
    if (!m || !IMAGE_TYPES[path.extname(f).toLowerCase()]) warnings.push(`tiles/${f}: skipped (not a png, jpg or webp named like r1c1.png)`);
    else if (rows && cols && (pos!.row >= rows || pos!.col >= cols || pos!.row < 0 || pos!.col < 0)) warnings.push(`tiles/${f}: skipped (off the ${rows}x${cols} board)`);
    else if (fileAt.has(`${pos!.row},${pos!.col}`)) errors.push(`tiles/${f}: a second picture for r${pos!.row + 1}c${pos!.col + 1} (also tiles/${fileAt.get(`${pos!.row},${pos!.col}`)})`);
    else fileAt.set(`${pos!.row},${pos!.col}`, f);
  }
  const tileInfo = node(["tiles"]);
  if (tileInfo !== undefined && !isMap(tileInfo)) err(tileInfo, "tiles", "must map positions (r1c1) to { name, points, rules }");
  if (isMap(tileInfo)) {
    for (const pair of tileInfo.items) {
      const key = isScalar(pair.key) ? String(pair.key.value) : "";
      const pos = parsePosition(key);
      if (!pos || (rows && cols && (pos.row >= rows || pos.col >= cols))) err(pair.key as Node, `tiles.${key}`, rows && cols ? `isn't a position on the ${rows}x${cols} board (r1c1 to r${rows}c${cols})` : "isn't a position like r1c1");
    }
  }
  if (rows && cols) {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const key = `r${row + 1}c${col + 1}`;
        const file = fileAt.get(`${row},${col}`);
        if (!file) {
          errors.push(`tiles/${key}.png: missing (every Tile needs a picture)`);
          continue;
        }
        const data = fs.readFileSync(path.join(tilesDir, file));
        if (data.length > MAX_IMAGE_BYTES) errors.push(`tiles/${file}: over 5 MB`);
        const p = ["tiles", key];
        const tileName = str([...p, "name"], false);
        const pts = value([...p, "points"]);
        if (pts !== undefined && pts !== null && (typeof pts !== "number" || !Number.isInteger(pts) || pts < 0)) err(node([...p, "points"]), `tiles.${key}.points`, "must be a whole number");
        const rules = str([...p, "rules"], false);
        tiles.push({ row, col, name: tileName, points: typeof pts === "number" && Number.isInteger(pts) && pts >= 0 ? pts : null, rules, image: { file, contentType: IMAGE_TYPES[path.extname(file).toLowerCase()]!, data } });
      }
    }
  }

  const description = str(["description"], false);
  const rules = str(["rules"], false);
  if (errors.length > 0 || !name || !slug || !startsAt || !endsAt || !rows || !cols) return { source: null, errors, warnings };
  return { source: { name, slug, description, startsAt, endsAt, rows, cols, rules, womCompetitionId, teams, standings, tiles }, errors, warnings };
}

