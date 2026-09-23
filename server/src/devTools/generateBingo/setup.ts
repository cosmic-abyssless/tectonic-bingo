// Everything before the bingo goes live, driven through the real endpoints at spoofed times: the import, the
// users and their signups, duo pairings, captains, the draft, team names and raised hands.
import type { BingoExportDocument, BoardResponse, DraftState, DraftUnit, ExclusivityRule, SignupQuestion, TeamWithMembers } from "@bingo/shared";
import { answerQuestions } from "./answers";
import type { Api } from "./client";
import type { BoardInfo, PartModel } from "./board";
import type { Player } from "./people";
import type { Rng } from "./rng";
import { HOUR, MINUTE, fmt, type Timeline } from "./timeline";

export interface Ctx {
  api: Api;
  rng: Rng;
  tl: Timeline;
  slug: string;
  /** The site admin the run acts as (creator of the bingo, and a mod). */
  admin: string;
  /** The last moment anything may be stamped with. */
  limit: Date;
  /** Whether this player can do this part at all (rolled once per player and part, so a team's capable subset is fixed). */
  capable(player: Player, part: PartModel): boolean;
  log(message: string): void;
}

const path = (ctx: Ctx, rest: string) => `/api/bingos/${ctx.slug}${rest}`;
const plus = (d: Date, ms: number) => new Date(d.getTime() + ms);

export interface Timed {
  at: Date;
  run(): Promise<void>;
}

/** Runs timed actions in date order (stable), skipping any after the run's limit. Returns how many ran. */
export async function runInOrder(events: Timed[], limit: Date): Promise<number> {
  const ordered = events.map((e, i) => ({ e, i })).sort((a, b) => a.e.at.getTime() - b.e.at.getTime() || a.i - b.i);
  let ran = 0;
  for (const { e } of ordered) {
    if (e.at.getTime() > limit.getTime()) continue;
    await e.run();
    ran++;
  }
  return ran;
}

export async function setStage(ctx: Ctx, toStage: string, at: Date): Promise<void> {
  await ctx.api.as(ctx.admin).post(path(ctx, "/mod/stage"), { toStage }, { at });
  ctx.log(`stage -> ${toStage} at ${fmt(at)}`);
}

/** Creates the bingo from an exported board (see run.ts for where the document comes from) and sets its dates. */
export async function importBingo(ctx: Ctx, document: BingoExportDocument, name: string): Promise<void> {
  await ctx.api.as(ctx.admin).post("/api/admin/bingos/import", { slug: ctx.slug, name, document }, { at: ctx.tl.createdAt });
  const { tl } = ctx;
  await ctx.api.as(ctx.admin).patch(
    path(ctx, "/admin/settings"),
    {
      signupOpensAt: tl.signupOpensAt.toISOString(),
      draftScheduledAt: tl.draftAt.toISOString(),
      revealScheduledAt: tl.revealAt.toISOString(),
      startsAt: tl.startsAt.toISOString(),
      endsAt: tl.endsAt.toISOString(),
    },
    { at: plus(tl.createdAt, 5 * MINUTE) },
  );
  ctx.log(`imported ${ctx.slug} (created ${fmt(tl.createdAt)}, starts ${fmt(tl.startsAt)}, ends ${fmt(tl.endsAt)})`);
}

/** Signup timezones, weighted roughly like the real clan's (mostly US East/Central and the UK). */
const TIMEZONES: readonly (readonly [string, number])[] = [
  ["America/New_York", 34],
  ["America/Chicago", 19],
  ["Europe/London", 16],
  ["Europe/Helsinki", 8],
  ["America/Toronto", 5],
  ["America/Los_Angeles", 4],
  ["America/Denver", 3],
  ["Europe/Brussels", 3],
  ["Europe/Amsterdam", 2],
  ["Australia/Sydney", 2],
  ["America/Phoenix", 1],
  ["Asia/Jerusalem", 1],
];

/** The bingo's signup questions (from the imported board), which every player has to answer. */
export async function fetchSignupQuestions(ctx: Ctx): Promise<SignupQuestion[]> {
  return (await ctx.api.as(ctx.admin).get<{ questions: SignupQuestion[] }>(path(ctx, "/signup/questions"))).questions;
}

export async function fetchBoard(ctx: Ctx): Promise<BoardResponse> {
  return ctx.api.as(ctx.admin).get<BoardResponse>(path(ctx, "/board"));
}

// ---------------------------------------------------------------------------
// Signups
// ---------------------------------------------------------------------------

/**
 * Signups arrive front-loaded over the signup window (most in the first few days, a long tail after).
 * Each player's user is made just before their signup. Duo partners then pair up: the later of the two
 * signups sends the request a little after, and the other accepts a while later.
 */
export async function runSignups(ctx: Ctx, players: Player[], pairs: [Player, Player][]): Promise<void> {
  const { tl, rng } = ctx;
  const questions = await fetchSignupQuestions(ctx);
  const window = tl.captainsAt.getTime() - tl.signupOpensAt.getTime() - 2 * HOUR;
  for (const p of players) p.signupAt = plus(tl.signupOpensAt, Math.floor(window * Math.pow(rng.float(), 2.2)) + 10 * MINUTE);

  const signedUp = new Set<number>();
  const events: Timed[] = [];
  for (const p of players) {
    events.push({
      at: p.signupAt!,
      run: async () => {
        if (!p.isMe) {
          const { user } = await ctx.api.as(ctx.admin).post<{ user: { id: string } }>("/api/dev/users", { discordId: p.discordId, discordUsername: p.discordName }, { at: plus(p.signupAt!, -1 * MINUTE) });
          p.userId = user.id;
        }
        const timezone = rng.fork(`timezone-${p.index}`).weighted(TIMEZONES);
        await ctx.api.as(p.discordId).post(path(ctx, "/signup"), { rsn: p.name, timezone, answers: answerQuestions(questions, p, rng.fork(`answers-${p.index}`)) }, { at: p.signupAt! });
        signedUp.add(p.index);
      },
    });
  }
  for (const [a, b] of pairs) {
    // Pairings can only change while signups are open, so they are stamped before the captains stage begins.
    const latest = tl.captainsAt.getTime() - 15 * MINUTE;
    const requestAt = new Date(Math.min(Math.max(a.signupAt!.getTime(), b.signupAt!.getTime()) + rng.int(2, 120) * MINUTE, latest - MINUTE));
    const acceptAt = new Date(Math.min(requestAt.getTime() + rng.int(5, 180) * MINUTE, latest));
    let pairingId: string | null = null;
    events.push({
      at: requestAt,
      run: async () => {
        if (!signedUp.has(a.index) || !signedUp.has(b.index)) return;
        const { pairing } = await ctx.api.as(a.discordId).post<{ pairing: { id: string } }>(path(ctx, "/signup/pairing"), { targetDiscordId: b.discordId }, { at: requestAt });
        pairingId = pairing.id;
      },
    });
    events.push({
      at: acceptAt,
      run: async () => {
        if (!pairingId) return;
        await ctx.api.as(b.discordId).post(path(ctx, `/signup/pairing/${pairingId}/respond`), { accept: true }, { at: acceptAt });
      },
    });
  }
  const ran = await runInOrder(events, ctx.limit);
  for (const p of players) if (!signedUp.has(p.index)) p.signupAt = null;
  ctx.log(`${signedUp.size}/${players.length} players signed up, ${pairs.filter(([a, b]) => signedUp.has(a.index) && signedUp.has(b.index)).length} duos (${ran} requests)`);
}

// ---------------------------------------------------------------------------
// Captains and teams
// ---------------------------------------------------------------------------

export interface TeamSeed {
  teamId: string;
  captain: Player;
  coCaptain: Player | null;
}

/** The best players who signed up lead the teams; a captain with a duo partner brings them along as co-captain. */
export async function createTeams(ctx: Ctx, players: Player[], count: number): Promise<TeamSeed[]> {
  const { tl, rng } = ctx;
  const noisy = new Map(players.map((p) => [p.index, p.skill + rng.normal(0, 0.05)]));
  const eligible = players.filter((p) => p.signupAt && !p.isMe && !p.isMod).sort((a, b) => noisy.get(b.index)! - noisy.get(a.index)!);
  const chosen: TeamSeed[] = [];
  const taken = new Set<number>();
  for (const p of eligible) {
    if (chosen.length >= count) break;
    if (taken.has(p.index)) continue;
    const partner = p.partnerIndex !== null ? players[p.partnerIndex]! : null;
    if (partner && (!partner.signupAt || taken.has(partner.index))) continue;
    taken.add(p.index);
    if (partner) taken.add(partner.index);
    chosen.push({ teamId: "", captain: p, coCaptain: partner });
  }
  let at = plus(tl.captainsAt, rng.int(5, 30) * MINUTE);
  for (const seed of chosen) {
    const { team } = await ctx.api.as(ctx.admin).post<{ team: { id: string } }>(
      path(ctx, "/admin/teams"),
      { captainUserId: seed.captain.userId, coCaptainUserId: seed.coCaptain?.userId ?? null },
      { at },
    );
    seed.teamId = team.id;
    at = plus(at, rng.int(2, 25) * MINUTE);
  }
  ctx.log(`${chosen.length} teams created (${chosen.filter((s) => s.coCaptain).length} led by a duo)`);
  return chosen;
}

// ---------------------------------------------------------------------------
// Draft
// ---------------------------------------------------------------------------

/**
 * Captains pick in turn, a minute or so apart, preferring the better players (they can't see skill, so it is
 * skill plus noise). The admin steps in for a few picks. `stopAfter` leaves a draft half done.
 */
export async function runDraft(ctx: Ctx, players: Player[], seeds: TeamSeed[], opts: { stopAfterFraction?: number }): Promise<number> {
  const { tl, rng } = ctx;
  const byUserId = new Map(players.filter((p) => p.userId).map((p) => [p.userId!, p]));
  const admin = ctx.api.as(ctx.admin);
  // The draft can't start until the admin has set a pick order. Set it explicitly (a shuffle would lock picks for
  // two seconds of real time, which the spoofed clock can't skip) from a forked stream, so the rest is unchanged.
  await admin.put(path(ctx, "/mod/draft/order"), { teamIds: rng.fork("pick-order").shuffle(seeds.map((s) => s.teamId)) }, { at: plus(tl.draftAt, 20 * MINUTE) });
  let at = plus(tl.draftAt, 30 * MINUTE);
  await admin.post(path(ctx, "/mod/draft/start"), undefined, { at });

  let state = await admin.get<DraftState & { pool: DraftUnit[] }>(path(ctx, "/draft"));
  const total = state.pool.filter((u) => !u.leftover).length;
  const stopAt = opts.stopAfterFraction ? Math.ceil(total * opts.stopAfterFraction) : Infinity;
  const adminPicks = new Set([rng.int(6, 12), rng.int(20, 30), rng.int(34, 44)]);
  const captainOf = new Map<string, TeamSeed>();
  for (const s of seeds) captainOf.set(s.teamId, s);

  let picks = 0;
  while (state.currentPick && picks < stopAt) {
    const units = state.pool.filter((u) => !u.leftover);
    if (units.length === 0) break;
    const scored = units.map((u) => {
      const skills = u.entries.map((e) => byUserId.get(e.user.id)?.skill ?? 0.5);
      return [u, skills.reduce((a, b) => a + b, 0) / skills.length + rng.normal(0, 0.25)] as const;
    });
    const unit = scored.sort((a, b) => b[1] - a[1])[0]![0];
    at = plus(at, rng.int(30, 120) * 1000);
    if (at.getTime() > ctx.limit.getTime()) break;

    const seed = captainOf.get(state.currentPick.teamId);
    const actor = adminPicks.has(picks + 1) || !seed ? ctx.admin : seed.captain.discordId;
    await ctx.api.as(actor).post(path(ctx, "/draft/pick"), { userId: unit.entries[0]!.user.id }, { at });
    picks++;
    state = await admin.get<DraftState & { pool: DraftUnit[] }>(path(ctx, "/draft"));
  }
  ctx.log(`draft: ${picks} picks${state.currentPick ? " (left mid-way)" : " (complete)"}, ${fmt(plus(tl.draftAt, 30 * MINUTE))} to ${fmt(at)}`);
  return picks;
}

/** The bingo's exclusive-item rules (from the imported board), which the simulated teams must respect. */
export async function fetchExclusivityRules(ctx: Ctx): Promise<ExclusivityRule[]> {
  const shell = await ctx.api.as(ctx.admin).get<{ bingo: { exclusivityRules?: ExclusivityRule[] } }>(path(ctx, ""));
  return shell.bingo.exclusivityRules ?? [];
}

export async function fetchTeams(ctx: Ctx): Promise<TeamWithMembers[]> {
  const shell = await ctx.api.as(ctx.admin).get<{ teams: TeamWithMembers[] }>(path(ctx, ""));
  return shell.teams;
}

// ---------------------------------------------------------------------------
// Reveal: names and hands
// ---------------------------------------------------------------------------

const TEAM_NAMES = [
  "The Avengers of Gielinor", "Justice Leaguers", "X-Men of Lumbridge", "The Fantastic Four Scapers", "Guardians of the Wilderness",
  "Teen Titans of Tectonic", "The Watchmen", "Suicide Squad Ironmen", "The Defenders", "Sinister Six Slayers", "The Incredibles", "Doom Patrol",
];

/** Each captain names their team some time after the reveal. */
export function nameTeamEvents(ctx: Ctx, seeds: TeamSeed[]): Timed[] {
  const { tl, rng } = ctx;
  const names = rng.shuffle(TEAM_NAMES);
  return seeds.map((seed, i) => {
    const at = plus(tl.revealAt, rng.int(10, 300) * MINUTE);
    return { at, run: () => ctx.api.as(seed.captain.discordId).patch<unknown>(path(ctx, `/teams/${seed.teamId}`), { name: names[i % names.length] }, { at }).then(() => undefined) };
  });
}

/**
 * Members put their hands up for the parts they mean to do, spread over the reveal window. `raised` fills in
 * as the events run, so a few of those hands can be lowered again once the bingo is live.
 */
export function handEvents(
  ctx: Ctx,
  teams: { teamId: string; members: Player[] }[],
  board: BoardInfo,
): { events: Timed[]; raised: { teamId: string; player: Player; part: PartModel }[] } {
  const { tl, rng } = ctx;
  const windowEnd = Math.min(tl.startsAt.getTime(), ctx.limit.getTime());
  const events: Timed[] = [];
  const raised: { teamId: string; player: Player; part: PartModel }[] = [];
  const seen = new Set<string>();
  const reachable = board.parts.filter((p) => !board.deadlocked.has(p.id));
  for (const team of teams) {
    const count = rng.int(10, 25);
    for (let n = 0; n < count; n++) {
      const player = rng.pick(team.members);
      const options = reachable.filter((p) => ctx.capable(player, p));
      if (options.length === 0) continue;
      const part = rng.pick(options);
      const key = `${player.index}:${part.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const at = new Date(tl.revealAt.getTime() + rng.float() * Math.max(0, windowEnd - tl.revealAt.getTime()) * 0.98);
      events.push({
        at,
        run: async () => {
          await ctx.api.as(player.discordId).put(path(ctx, `/tiles/${part.tileId}/tasks/${part.id}/interest`), { interested: true }, { at });
          raised.push({ teamId: team.teamId, player, part });
        },
      });
    }
  }
  return { events, raised };
}
