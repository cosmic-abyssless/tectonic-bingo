// Source folder → historical bundle (shared/src/historicalBundle.ts) and the report: reads the folder (source.ts),
// fetches the Wise Old Man competition and checks it against the Teams, asks the Tectonic API who's still in the clan,
// then runs the bundle's own validator. Reads and fetches only; never touches a database.
import { HISTORICAL_BUNDLE_FORMAT, HISTORICAL_BUNDLE_VERSION, validateHistoricalBundle, type HistoricalBundle, type HistoricalBundlePlayer } from "@bingo/shared";
import type { TectonicDetailedUser } from "../../src/services/tectonicService";
import { readSource, type Source } from "./source";

/** The outside services, so tests can stand in for them. */
export interface BundleSources {
  getCompetition(competitionId: number): Promise<unknown>;
  /** Clan members among these Discord ids; ids not in the clan are left out. */
  getClanMembers(discordIds: string[]): Promise<TectonicDetailedUser[]>;
}

export interface BundleReport {
  /** Players with a Discord id: in the clan (and their name there) or not. */
  mapped: { rsn: string; team: string; discordId: string; clanName: string | null }[];
  unknown: { rsn: string; team: string }[];
  womMismatches: string[];
  unnamedTiles: string[];
  warnings: string[];
  errors: string[];
}

export interface BuildResult {
  bundle: HistoricalBundle | null;
  report: BundleReport;
}

// Wise Old Man's own username form: lowercase, runs of spaces and underscores as one underscore.
function normalizeRsn(rsn: string): string {
  return rsn.trim().toLowerCase().replace(/[\s_]+/g, "_");
}

interface RawParticipation {
  player?: { id?: unknown; username?: unknown; displayName?: unknown };
  teamName?: unknown;
}

/** What doesn't line up between bingo.yaml's Teams and the WOM competition: missing and extra Players, and Teams. */
export function compareWithWom(source: Source, competition: unknown): string[] {
  const out: string[] = [];
  const participations = ((competition as { participations?: unknown } | null)?.participations ?? []) as RawParticipation[];
  const wom = new Map<string, { name: string; team: string | null }>();
  for (const p of participations) {
    const username = typeof p.player?.username === "string" ? p.player.username : null;
    if (!username) continue;
    const name = typeof p.player?.displayName === "string" ? p.player.displayName : username;
    wom.set(normalizeRsn(username), { name, team: typeof p.teamName === "string" ? p.teamName : null });
  }
  const womTeams = new Set([...wom.values()].map((p) => p.team).filter((t): t is string => !!t));
  const ourTeams = new Set(source.teams.map((t) => t.name.toLowerCase()));
  for (const t of womTeams) if (!ourTeams.has(t.toLowerCase())) out.push(`Wise Old Man has a Team "${t}" that bingo.yaml doesn't`);
  for (const t of source.teams) if (womTeams.size > 0 && ![...womTeams].some((w) => w.toLowerCase() === t.name.toLowerCase())) out.push(`Team "${t.name}" isn't a Team in the Wise Old Man competition`);

  const ours = new Set<string>();
  for (const team of source.teams) {
    for (const p of team.players) {
      const key = normalizeRsn(p.rsn);
      ours.add(key);
      const there = wom.get(key);
      if (!there) out.push(`${p.rsn} (${team.name}) isn't in the Wise Old Man competition`);
      else if (there.team && there.team.toLowerCase() !== team.name.toLowerCase()) out.push(`${p.rsn} is on "${team.name}" in bingo.yaml but on "${there.team}" in Wise Old Man`);
    }
  }
  for (const [key, p] of wom) if (!ours.has(key)) out.push(`${p.name}${p.team ? ` (${p.team})` : ""} is in the Wise Old Man competition but not in bingo.yaml`);
  return out;
}

/** The name a clan member's new user starts with: the RSN they played under if it's still theirs, else their first one. */
function clanName(member: TectonicDetailedUser, rsn: string): string {
  const same = member.rsns.find((r) => normalizeRsn(r.rsn) === normalizeRsn(rsn));
  return same?.rsn ?? member.rsns[0]?.rsn ?? rsn;
}

export async function buildBundle(folder: string, sources: BundleSources, sourceName: string): Promise<BuildResult> {
  const read = readSource(folder);
  const report: BundleReport = { mapped: [], unknown: [], womMismatches: [], unnamedTiles: [], warnings: [...read.warnings], errors: [...read.errors] };
  const source = read.source;
  if (!source) return { bundle: null, report };

  let competition: unknown = null;
  if (source.womCompetitionId !== null) {
    try {
      competition = await sources.getCompetition(source.womCompetitionId);
      report.womMismatches = compareWithWom(source, competition);
    } catch (err) {
      report.errors.push(`Wise Old Man competition ${source.womCompetitionId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const known = source.teams.flatMap((t) => t.players.filter((p) => p.discordId !== null).map((p) => ({ ...p, discordId: p.discordId!, team: t.name })));
  const members = new Map<string, TectonicDetailedUser>();
  try {
    for (let i = 0; i < known.length; i += 50) {
      for (const m of await sources.getClanMembers(known.slice(i, i + 50).map((p) => p.discordId))) members.set(m.user_id, m);
    }
  } catch (err) {
    report.errors.push(`Tectonic API: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Each Player's Wise Old Man account, so the leaderboard still finds them if it's renamed later.
  const womIdByRsn = new Map<string, number>();
  for (const p of ((competition as { participations?: unknown } | null)?.participations ?? []) as RawParticipation[]) {
    if (typeof p.player?.id !== "number") continue;
    for (const n of [p.player.username, p.player.displayName]) if (typeof n === "string") womIdByRsn.set(normalizeRsn(n), p.player.id);
  }
  const players: HistoricalBundlePlayer[] = known.map((p) => {
    const member = members.get(p.discordId);
    const name = member ? clanName(member, p.rsn) : null;
    report.mapped.push({ rsn: p.rsn, team: p.team, discordId: p.discordId, clanName: name });
    return { discordId: p.discordId, rsn: p.rsn, clan: name ? { name } : null, womId: womIdByRsn.get(normalizeRsn(p.rsn)) ?? null };
  });
  for (const t of source.teams) for (const p of t.players) if (p.discordId === null) report.unknown.push({ rsn: p.rsn, team: t.name });

  const idOf = (team: Source["teams"][number], rsn: string) => team.players.find((p) => p.rsn.toLowerCase() === rsn.toLowerCase())!.discordId!;
  const images: HistoricalBundle["images"] = {};
  const tiles = source.tiles.map((t) => {
    const position = `r${t.row + 1}c${t.col + 1}`;
    if (!t.name) report.unnamedTiles.push(position);
    images[t.image.file] = { contentType: t.image.contentType, data: t.image.data.toString("base64") };
    return { boardRow: t.row, boardCol: t.col, name: t.name ?? `Tile ${position}`, image: t.image.file, points: t.points, rules: t.rules };
  });

  const bundle: HistoricalBundle = {
    format: HISTORICAL_BUNDLE_FORMAT,
    version: HISTORICAL_BUNDLE_VERSION,
    source: sourceName,
    bingo: { name: source.name, slug: source.slug, description: source.description, startsAt: source.startsAt, endsAt: source.endsAt, boardRows: source.rows, boardCols: source.cols, rulesMarkdown: source.rules },
    tiles,
    players,
    teams: source.teams.map((t) => ({
      name: t.name,
      color: t.color,
      captain: idOf(t, t.captain),
      coCaptain: t.coCaptain ? idOf(t, t.coCaptain) : null,
      players: t.players.filter((p) => p.discordId !== null).map((p) => p.discordId!),
    })),
    unknownPlayers: report.unknown.map((u) => u.rsn),
    standings: source.standings.map((s) => ({ team: source.teams.find((t) => t.name.toLowerCase() === s.team.toLowerCase())!.name, place: s.place, points: s.points })),
    wom: source.womCompetitionId !== null && competition !== null ? { competitionId: source.womCompetitionId, data: competition } : null,
    images,
  };

  // The server runs the same check on upload; anything bingo.yaml's own checks let through shows here.
  const check = validateHistoricalBundle(bundle);
  for (const p of check.problems) report.errors.push(`bundle: ${p}`);
  return { bundle: report.errors.length === 0 ? bundle : null, report };
}

/** The report as text, for the terminal. */
export function formatReport(report: BundleReport): string {
  const lines: string[] = [];
  const section = (title: string, items: string[]) => {
    if (items.length === 0) return;
    lines.push("", `${title} (${items.length})`, ...items.map((i) => `  ${i}`));
  };
  const inClan = report.mapped.filter((m) => m.clanName);
  const left = report.mapped.filter((m) => !m.clanName);
  section("In the clan", inClan.map((m) => `${m.rsn} (${m.team}) → ${m.clanName}`));
  section("Not in the clan (named by their RSN, locked out)", left.map((m) => `${m.rsn} (${m.team})`));
  section("Unknown (Wise Old Man leaderboard only)", report.unknown.map((u) => `${u.rsn} (${u.team})`));
  section("Wise Old Man mismatches", report.womMismatches);
  section("Tiles without names", report.unnamedTiles);
  section("Warnings", report.warnings);
  section("Errors", report.errors);
  return lines.join("\n").trimStart();
}
