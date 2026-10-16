// Made-up Wise Old Man snapshots for a generated bingo's Players, so the WOM Titles (Grinder, and luck's Spoon, Dry
// and Clutch) and achievements have something to judge. A testdata- bingo is never read from WOM (womReadService), and
// its made-up RSNs aren't on WOM anyway.
//
// Each Player's kill counts are built backwards from their approved drops: the kills before a drop are drawn from the
// real drop rate (geometric), capped by how much the Player can kill in the time since, so most drops land near the
// odds and a few come in lucky. Some Players keep going at a Board boss after their last drop, or go at one with
// nothing to show for it, for as many kills as a real dry streak would last (again geometric, on the Board's drops
// from that boss), which is where Dry comes from. Snapshots come every few hours, plus one shortly after each drop,
// as if the Player updated on logout. Some Players also run a few of the raids and bosses Wrapped looks at (the Bingo's
// list), drops or not, so a generated Wrapped shows who killed each the most.
//
// EHB comes from the time a Player plays, not the kills, which the drops and raids can push past what one Player could
// do: each has a budget of hours over the Bingo (a share of it, by how much of the day they play). Each boss's EHB is
// its kills over that boss's kills an hour, as Wise Old Man works it out, so Effort has per-boss hours to count; where
// the kills gained come to more hours than the budget leaves, every boss's gain is scaled down to fit. The total EHB is
// the bosses' plus a modest filler for bosses the generator doesn't model, so the two agree.
import { eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../../db/schema";
import { bingos, teamMembers, teams, womReads, womSnapshots } from "../../db/schema";
import { now as clockNow } from "../../clock";
import { ServiceError } from "../../services/errors";
import { TESTDATA_PREFIX } from "../../services/devTestDataService";
import { effectiveStartsAt, endedAt } from "../../services/bingoStart";
import { getFullGraph } from "../../services/graphService";
import { getTeamCredits } from "../../services/statsService";
import { rsnsInBingo } from "../../services/playerNames";
import { getDropRates, type DropRateTable } from "../../services/luck/dropRates";
import type { BossMetric } from "../../services/luck/bossSources";
import type { WomSnapshot } from "../../services/womService";
import * as achievementService from "../../services/achievementService";
import { parseWrappedBosses } from "../../services/wrappedBossesService";
import { Rng } from "./rng";
import { HOUR, MINUTE } from "./timeline";

type Db = BetterSQLite3Database<typeof schema>;

// The hiscores list a boss from 5 kills; below that WOM reports it as unranked (null).
const HISCORE_MIN_KILLS = 5;

// Kills an hour at each boss, roughly Wise Old Man's main-account EHB rates: a boss's EHB is its kills over this. A boss
// not listed goes at DEFAULT_KILLS_PER_HOUR.
const KILLS_PER_HOUR: Partial<Record<BossMetric, number>> = {
  abyssal_sire: 45, alchemical_hydra: 33, amoxliatl: 55, araxxor: 38, artio: 60, barrows_chests: 22, brutus: 45, bryophyta: 9, callisto: 55,
  calvarion: 50, cerberus: 60, chambers_of_xeric: 3.5, chambers_of_xeric_challenge_mode: 2.3, chaos_elemental: 50, chaos_fanatic: 80,
  commander_zilyana: 50, corporeal_beast: 60, crazy_archaeologist: 75, dagannoth_prime: 90, dagannoth_rex: 90, dagannoth_supreme: 90,
  deranged_archaeologist: 80, doom_of_mokhaiotl: 10, duke_sucellus: 38, general_graardor: 50, giant_mole: 100, grotesque_guardians: 36,
  hespori: 60, kalphite_queen: 50, king_black_dragon: 120, kraken: 100, kreearra: 40, kril_tsutsaroth: 60, mimic: 60, nex: 13, nightmare: 14,
  phosanis_nightmare: 7, obor: 12, phantom_muspah: 30, sarachnis: 80, scorpia: 120, scurrius: 80, skotizo: 45, sol_heredit: 1.3, spindel: 60,
  the_gauntlet: 10, the_corrupted_gauntlet: 7, the_hueycoatl: 18, the_leviathan: 37, the_royal_titans: 60, the_whisperer: 28,
  theatre_of_blood: 3, theatre_of_blood_hard_mode: 2.6, thermonuclear_smoke_devil: 125, tombs_of_amascut: 2.5, tombs_of_amascut_expert: 2,
  tzkal_zuk: 0.8, tztok_jad: 2, vardorvis: 41, venenatis: 50, vetion: 40, vorkath: 34, yama: 9, zulrah: 40,
};
const DEFAULT_KILLS_PER_HOUR = 30;
const killsPerHour = (m: string) => KILLS_PER_HOUR[m as BossMetric] ?? DEFAULT_KILLS_PER_HOUR;

export interface FakeTimelineInput {
  start: Date;
  end: Date;
  /** The Player's approved item Claims, any order. */
  drops: { itemName: string; at: Date }[];
  /** Every Item name on the Board. */
  boardItems: string[];
  rates: DropRateTable;
  /** The raids and bosses Wrapped looks at (Bingo.wrappedBosses): some of them get kills, with or without a drop. */
  wrappedBosses?: string[];
}

/** Kills up to and including the next drop, at `rate` drops a kill: 1 + Geometric(rate). */
function killsUntilDrop(rng: Rng, rate: number): number {
  return rate >= 1 ? 1 : 1 + Math.floor(Math.log(1 - rng.float()) / Math.log(1 - rate));
}

/** One Player's snapshots, oldest first: a baseline before `start`, then up to `end`. */
export function fakeTimeline(rng: Rng, input: FakeTimelineInput): WomSnapshot[] {
  const { start, end, rates } = input;
  // The chance of some Board drop per kill, by boss: what a dry streak is judged on.
  const boardRate = new Map<BossMetric, number>();
  for (const item of new Set(input.boardItems.map((i) => i.toLowerCase()))) for (const { metric, rate } of rates.sourcesOf(item)) boardRate.set(metric, (boardRate.get(metric) ?? 0) + rate);
  const boardMetrics = [...boardRate.keys()].sort();
  // Kills an hour at one boss while they're at it, and how much of the day they're at it.
  const speed = rng.between(8, 30);
  const activity = rng.between(0.1, 0.35);
  const killsIn = (ms: number) => Math.floor((ms / HOUR) * speed * activity);
  const base = new Map<BossMetric, number>(boardMetrics.map((m) => [m, rng.chance(0.7) ? rng.int(0, 1500) : 0]));
  // Per boss, when the kill count (since the start) reached what: straight lines in between.
  const waypoints = new Map<BossMetric, { at: number; kills: number }[]>();
  const killsNow = (m: BossMetric) => waypoints.get(m)?.at(-1) ?? { at: start.getTime(), kills: 0 };
  const reach = (m: BossMetric, at: number, kills: number) => {
    if (!base.has(m)) base.set(m, rng.chance(0.5) ? rng.int(0, 500) : 0);
    waypoints.set(m, [...(waypoints.get(m) ?? []), { at, kills }]);
  };

  const lastDropKills = new Map<string, number>();
  const drops = [...input.drops].filter((d) => d.at >= start && d.at <= end).sort((a, b) => a.at.getTime() - b.at.getTime());
  for (const drop of drops) {
    const sources = rates.sourcesOf(drop.itemName);
    if (sources.length === 0) continue;
    const { metric, rate } = rng.weighted(sources.map((s) => [s, s.rate] as const));
    const prev = killsNow(metric);
    const item = drop.itemName.toLowerCase();
    const since = Math.max(prev.kills, lastDropKills.get(item) ?? 0);
    const kills = Math.min(since + killsUntilDrop(rng, rate), prev.kills + Math.max(1, killsIn(drop.at.getTime() - prev.at)));
    lastDropKills.set(item, kills);
    reach(metric, drop.at.getTime(), Math.max(kills, prev.kills + 1));
  }

  // Going on with nothing to show for it: after the last drop at a boss, or at a Board boss never dropped from. The
  // streak is the kills a real one would last (short of the next Board drop), as far as there's time for.
  const tail = new Set([...waypoints.keys()].filter((m) => boardRate.has(m) && rng.chance(0.5)));
  if (boardMetrics.length > 0 && rng.chance(0.35)) tail.add(rng.pick(boardMetrics));
  for (const m of tail) {
    const prev = killsNow(m);
    const kills = Math.min(killsUntilDrop(rng, boardRate.get(m)!) - 1, killsIn(end.getTime() - prev.at));
    if (kills > 0) reach(m, end.getTime(), prev.kills + kills);
  }

  // A few of Wrapped's raids and bosses, a steady few kills a day, on a fork of their own so the rest stays as it was.
  const raids = rng.fork("wrapped-bosses");
  const days = (end.getTime() - start.getTime()) / (24 * HOUR);
  for (const m of (input.wrappedBosses ?? []) as BossMetric[]) {
    if (!raids.chance(0.3)) continue;
    const kills = Math.max(1, Math.round(days * raids.between(0.5, 4)));
    if (!base.has(m)) base.set(m, raids.chance(0.85) ? raids.int(5, 300) : 0);
    reach(m, end.getTime(), killsNow(m).kills + kills);
  }

  const killsAt = (m: BossMetric, at: number) => {
    let from = { at: start.getTime(), kills: 0 };
    for (const w of waypoints.get(m) ?? []) {
      if (w.at <= at) {
        from = w;
        continue;
      }
      return Math.floor(from.kills + ((w.kills - from.kills) * (at - from.at)) / (w.at - from.at));
    }
    return from.kills;
  };

  const times = new Set<number>([start.getTime() - Math.round(rng.between(1, 20) * HOUR)]);
  for (let t = start.getTime() + rng.between(0.5, 4) * HOUR; t < end.getTime(); t += rng.between(2, 8) * HOUR) times.add(Math.round(t));
  for (const d of drops) times.add(Math.min(end.getTime(), d.at.getTime() + Math.round(rng.between(5, 90) * MINUTE)));
  times.add(end.getTime() - Math.round(rng.between(0, 2) * HOUR));

  // The hours they put in over the Bingo: the budget, part filler at bosses the generator doesn't model and the rest
  // at the bosses above, whose gains are scaled down when their kills come to more. New draws are on a fork of their
  // own, so the kills, ehp and clues stay as they were.
  const ehb0 = rng.between(0, 800);
  const ehbPerHour = activity * rng.between(0.5, 0.9);
  const spanHours = Math.max(1e-9, (end.getTime() - start.getTime()) / HOUR);
  const budget = spanHours * ehbPerHour;
  const filler = budget * rng.fork("ehb-filler").between(0.15, 0.4);
  const gainedHours = [...base.keys()].reduce((sum, m) => sum + killsAt(m, end.getTime()) / killsPerHour(m), 0);
  const scale = gainedHours > budget - filler ? (budget - filler) / gainedHours : 1;
  const ehp0 = rng.between(50, 3000);
  const clues0 = rng.int(0, 400);
  let ehp = ehp0;
  let clues = clues0;
  const out: WomSnapshot[] = [];
  for (const t of [...times].sort((a, b) => a - b)) {
    const during = t > start.getTime();
    const bossKills: Record<string, number | null> = {};
    const bossEhb: Record<string, number> = {};
    for (const [m, b] of base) {
      const k = during ? killsAt(m, t) : 0;
      bossKills[m] = b + k >= HISCORE_MIN_KILLS ? b + k : null;
      // Wise Old Man gives an unranked boss no EHB, as it has no kills to count.
      if (bossKills[m] !== null) bossEhb[m] = (b + k * scale) / killsPerHour(m);
    }
    const atBosses = Object.values(bossEhb).reduce((sum, h) => sum + h, 0);
    if (during) {
      ehp += rng.chance(0.3) ? rng.between(0, 1.5) : 0;
      clues += rng.chance(0.25) ? rng.int(1, 3) : 0;
    }
    out.push({ at: new Date(t), bossKills: bossKills as WomSnapshot["bossKills"], bossEhb, ehb: ehb0 + atBosses + (during ? (((t - start.getTime()) / HOUR) * filler) / spanHours : 0), ehp, clues });
  }
  return out;
}

/**
 * Replaces a generated bingo's WOM snapshots with made-up ones for every Player on a Team, up to now (or the bingo's
 * end), and marks them read, so stats say when. Seeded, so a run is repeatable.
 */
export function fillFakeWomSnapshots(db: Db, slug: string, seed: number): { players: number; snapshots: number } {
  if (!slug.startsWith(TESTDATA_PREFIX)) throw new ServiceError(400, `Only "${TESTDATA_PREFIX}" bingos can be given fake WOM snapshots`);
  const bingo = db.select().from(bingos).where(eq(bingos.slug, slug)).get();
  if (!bingo) throw new ServiceError(404, "Bingo not found");
  const start = effectiveStartsAt(db, bingo);
  const at = clockNow();
  const end = endedAt(db, bingo) ?? at;
  if (!start || start >= end) throw new ServiceError(400, "The bingo hasn't started yet");

  const rates = getDropRates();
  const { engineNodes } = getFullGraph(db, bingo.id);
  const boardItems = [...new Set(engineNodes.filter((n) => n.kind === "ITEM" && n.itemName).map((n) => n.itemName!))];
  const dropsByUser = new Map<string, { itemName: string; at: Date }[]>();
  for (const team of getTeamCredits(db, bingo.id)) {
    for (const c of team.claims) if (c.itemName) dropsByUser.set(c.userId, [...(dropsByUser.get(c.userId) ?? []), { itemName: c.itemName, at: c.submittedAt }]);
  }

  const teamIds = db.select({ id: teams.id }).from(teams).where(eq(teams.bingoId, bingo.id)).all().map((t) => t.id);
  const members = teamIds.length ? db.select({ userId: teamMembers.userId, discordId: schema.users.discordId }).from(teamMembers).innerJoin(schema.users, eq(teamMembers.userId, schema.users.id)).where(inArray(teamMembers.teamId, teamIds)).all() : [];
  const rsns = rsnsInBingo(db, bingo.id, members.map((m) => m.userId));
  const rng = new Rng(seed);
  const wrappedBosses = parseWrappedBosses(bingo.wrappedBossesJson);

  let snapshots = 0;
  db.transaction((tx) => {
    tx.delete(womSnapshots).where(eq(womSnapshots.bingoId, bingo.id)).run();
    tx.delete(womReads).where(eq(womReads.bingoId, bingo.id)).run();
    for (const m of members) {
      // Forked by Discord ID, which the seed fixes (unlike the user's id), so each Player's timeline is repeatable.
      const timeline = fakeTimeline(rng.fork(m.discordId), { start, end, drops: dropsByUser.get(m.userId) ?? [], boardItems, rates, wrappedBosses });
      for (const s of timeline) {
        tx.insert(womSnapshots).values({ bingoId: bingo.id, userId: m.userId, takenAt: s.at, ehb: s.ehb, ehp: s.ehp, clues: s.clues, bossKillsJson: JSON.stringify(s.bossKills), bossEhbJson: JSON.stringify(s.bossEhb) }).run();
      }
      snapshots += timeline.length;
      tx.insert(womReads).values({ bingoId: bingo.id, userId: m.userId, rsn: rsns.get(m.userId) ?? m.discordId, readAt: at, readThrough: end }).run();
    }
  });
  for (const m of members) achievementService.recordWomSnapshotsRead(db, bingo.id, m.userId);
  return { players: members.length, snapshots };
}
