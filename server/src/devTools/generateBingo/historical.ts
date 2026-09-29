// `--stage historical`: a Historical Bingo (CONTEXT.md) instead of one played here. The run makes a historical bundle
// (shared/src/historicalBundle.ts) the way the local script would from an old site's records, and imports it through
// the real Site admin → Import historical Bingo endpoint, as a Site Admin would. The board's Tiles become its Tiles
// (their pictures, points and Task names as rules); the people are made up like any run's, a few of them "left the
// clan", with Captains, standings, a Wise Old Man competition and an unknown Player or two.
import sharp from "sharp";
import { HISTORICAL_BUNDLE_FORMAT, HISTORICAL_BUNDLE_VERSION, type BingoExportDocument, type ExportImage, type ExportNode, type HistoricalBundle, type HistoricalImportScoring } from "@bingo/shared";
import type { Api } from "./client";
import type { GenerateOptions } from "./options";
import { addRichSections } from "./historicalRich";
import { makePlayers, type Player } from "./people";
import type { Rng } from "./rng";
import { DAY, fmt } from "./timeline";

const TEAM_NAMES = ["Lava Dragons", "Sea Snakes", "Rock Crabs", "Moss Giants", "Ice Trolls", "Cave Krakens", "Dust Devils", "Fire Giants", "Hill Giants", "Sand Crabs", "Ogresses", "Wyrms"];
const TILE_COLORS = ["#8e44ad", "#16a085", "#7f8c8d", "#c0392b", "#2980b9", "#d35400", "#27ae60", "#2c3e50", "#b7950b"];

export interface HistoricalRunInput {
  api: Api;
  adminDiscordId: string;
  options: GenerateOptions;
  document: BingoExportDocument;
  rng: Rng;
  /** The dev account given with --me, put on the first Team. */
  me: Player | null;
  now: Date;
  log(message: string): void;
}

/** A Tile's rules, as an old site would have written them: its Tasks, one a line. */
function rulesOf(tasks: ExportNode[]): string | null {
  const lines = tasks.map((t) => t.label ?? t.itemName).filter((l): l is string => !!l);
  return lines.length > 0 ? lines.map((l) => `- ${l}`).join("\n") : null;
}

function taskPoints(nodes: ExportNode[]): number {
  return nodes.reduce((sum, n) => sum + (n.reuse ? 0 : n.points + taskPoints(n.children)), 0);
}

/** A plain picture for a Tile the board has none for. */
async function placeholderImage(color: string): Promise<ExportImage> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="12" fill="${color}"/><circle cx="48" cy="48" r="24" fill="#fff" fill-opacity="0.8"/></svg>`;
  return { contentType: "image/png", data: (await sharp(Buffer.from(svg)).png().toBuffer()).toString("base64") };
}

export async function buildHistoricalBundle(input: Omit<HistoricalRunInput, "api" | "adminDiscordId" | "log">): Promise<HistoricalBundle> {
  const { options, document, rng, me, now } = input;
  // Ended a while ago: some weeks before today, for `days` days.
  const endsAt = new Date(now.getTime() - rng.int(30, 400) * DAY);
  endsAt.setUTCHours(18, 0, 0, 0);
  const startsAt = new Date(endsAt.getTime() - options.days * DAY);

  const count = options.teams * options.teamSize - (me ? 1 : 0);
  const rich = options.stage === "historical-rich";
  // A rich Bingo also had signups that weren't drafted: made after everyone else, so the rest are the same either way.
  const made = makePlayers(rng.fork("people"), count + (rich ? Math.max(1, Math.round(count / 10)) : 0), options.slug);
  const cut = made.slice(count);
  const people = [...made.slice(0, count), ...(me ? [me] : [])];
  // A few made-up Players have left the clan since; the dev account is always in it.
  const leftRng = rng.fork("left");
  const players = people.map((p) => ({ discordId: p.discordId, rsn: p.name, clan: p.isMe || !leftRng.chance(0.1) ? { name: p.discordName } : null }));

  const order = rng.fork("teams").shuffle(people.filter((p) => !p.isMe));
  if (me) order.unshift(me);
  const teamNames = rng.fork("team-names").shuffle(TEAM_NAMES).slice(0, options.teams);
  const teams = teamNames.map((name, t) => {
    const members = order.filter((_, i) => i % options.teams === t).map((p) => p.discordId);
    return { name, color: null, captain: members[0]!, coCaptain: members.length > 3 && rng.chance(0.3) ? members[1]! : null, players: members };
  });

  const images: Record<string, ExportImage> = {};
  const tiles: HistoricalBundle["tiles"] = [];
  for (const [i, t] of document.tiles.entries()) {
    const file = `r${t.boardRow + 1}c${t.boardCol + 1}.png`;
    images[file] = t.image ?? (await placeholderImage(TILE_COLORS[i % TILE_COLORS.length]!));
    const points = (t.bonusPoints ?? 0) + taskPoints(t.tasks);
    tiles.push({ boardRow: t.boardRow, boardCol: t.boardCol, name: t.name, image: file, points: points > 0 ? points : null, rules: rulesOf(t.tasks) });
  }
  // A cell the board left empty still needs a Tile on a historical board.
  for (let row = 0; row < document.bingo.boardRows; row++) {
    for (let col = 0; col < document.bingo.boardCols; col++) {
      if (tiles.some((t) => t.boardRow === row && t.boardCol === col)) continue;
      const file = `r${row + 1}c${col + 1}.png`;
      images[file] = await placeholderImage(TILE_COLORS[(row * 7 + col) % TILE_COLORS.length]!);
      tiles.push({ boardRow: row, boardCol: col, name: `Tile r${row + 1}c${col + 1}`, image: file, points: null, rules: null });
    }
  }

  const standingRng = rng.fork("standings");
  const knowsPoints = standingRng.chance(0.7);
  let points = standingRng.int(180, 320);
  const standings = standingRng.shuffle(teamNames).map((team, i) => {
    points -= standingRng.int(5, 40);
    return { team, place: i + 1, points: knowsPoints ? points : null };
  });

  const unknownPlayers = Array.from({ length: rng.int(1, 3) }, (_, i) => `Unknown ${["Ghost", "Stranger", "Drifter"][i]}`);
  const gainRng = rng.fork("wom");
  const participations = [
    ...teams.flatMap((t) => t.players.map((id) => ({ rsn: players.find((p) => p.discordId === id)!.rsn, team: t.name }))),
    ...unknownPlayers.map((rsn) => ({ rsn, team: gainRng.pick(teamNames) })),
  ].map(({ rsn, team }) => {
    const gained = Math.round(gainRng.between(2, 180) * 100) / 100;
    return { player: { username: rsn.toLowerCase().replace(/\s+/g, "_"), displayName: rsn }, teamName: team, progress: { start: 0, end: gained, gained } };
  });
  const name = `Historical ${options.slug.slice("testdata-".length)}`;
  const competitionId = 2_000_000_000 + (options.seed % 100_000_000);

  const bundle: HistoricalBundle = {
    format: HISTORICAL_BUNDLE_FORMAT,
    version: HISTORICAL_BUNDLE_VERSION,
    source: `the test data generator (seed ${options.seed})`,
    bingo: {
      name,
      slug: options.slug,
      description: "Made up by the test data generator",
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      boardRows: document.bingo.boardRows,
      boardCols: document.bingo.boardCols,
      rulesMarkdown: document.bingo.rulesMarkdown,
    },
    tiles,
    players,
    teams,
    unknownPlayers,
    standings,
    wom: { competitionId, data: { id: competitionId, title: name, metric: "ehb", type: "team", startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), participations } },
    images,
  };
  if (rich) addRichSections(bundle, { document, rng: rng.fork("rich"), startsAt, endsAt, cut });
  return bundle;
}

/** Makes the bundle and imports it through the real endpoint. */
export async function runHistorical(input: HistoricalRunInput): Promise<void> {
  const bundle = await buildHistoricalBundle(input);
  input.log(`a Historical Bingo, ${fmt(new Date(bundle.bingo.startsAt))} to ${fmt(new Date(bundle.bingo.endsAt))}: ${bundle.teams.length} Teams, ${bundle.players.length} Players (${bundle.players.filter((p) => !p.clan).length} left the clan), ${bundle.unknownPlayers.length} unknown`);
  if (bundle.submissions) {
    const tasks = bundle.tiles.reduce((n, t) => n + (t.tasks?.length ?? 0), 0);
    input.log(`rich: ${tasks} Tasks, ${bundle.lines?.length ?? 0} Lines, ${bundle.submissions.length} Submissions, ${bundle.signups!.entries.filter((e) => e.cut).length} Cut signups, ${bundle.draft!.picks.length} draft picks`);
  }
  const { usersCreated, scoring } = await input.api
    .as(input.adminDiscordId)
    .post<{ usersCreated: number; scoring: HistoricalImportScoring | null }>("/api/admin/historical-bingos", bundle);
  input.log(`imported ${bundle.bingo.slug} through Site admin → Import historical Bingo (${usersCreated} new users)`);
  if (scoring) input.log(`scored by the engine: ${scoring.teams.map((t) => `${t.team} ${t.total}`).join(", ")}`);
}
