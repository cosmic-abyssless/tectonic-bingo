// One generator run, start to finish: import a board, sign up the players, pick captains, run the draft, name the
// teams and play the bingo to the target stage, every write through the real endpoints at spoofed times.
// Driven by the in-server job (job.ts, started from the site admin's Test data tab) and by the CLI
// (scripts/generate-bingo/generate.ts). See docs/generate-bingo.md.
import type { BingoExportDocument } from "@bingo/shared";
import { buildBoard } from "./board";
import type { Api } from "./client";
import type { GenerateOptions } from "./options";
import { chooseMods, makePlayers, pairUp, type Player } from "./people";
import { Rng, clamp } from "./rng";
import { createTeams, fetchBoard, fetchExclusivityRules, fetchTeams, handEvents, importBingo, nameTeamEvents, runDraft, runInOrder, runSignups, setStage, type Ctx } from "./setup";
import { Simulation, describe, newPartState, type SimTeam } from "./simulate";
import { HOUR, buildTimeline, fmt, runLimit, type Timeline } from "./timeline";

/** The board to build the bingo from: another bingo on the same server (exported through the real endpoint), or a document. */
export type BoardSource = { kind: "bingo"; slug: string } | { kind: "document"; document: BingoExportDocument };

export interface RunInput {
  api: Api;
  /** The site admin the run acts as (creates the bingo, runs the draft, is a mod). */
  adminDiscordId: string;
  options: GenerateOptions;
  board: BoardSource;
  log(message: string): void;
  now?: Date;
}

export interface RunResult {
  slug: string;
  /** Sanity checks that failed: a bug in the generator, not the app. Empty when all is well. */
  problems: string[];
}

interface DevUser {
  id: string;
  discordId: string;
  discordUsername: string;
  isAdmin: boolean;
}

/** The timeline as log lines: when each stage happened, or is scheduled. */
export function describeTimeline(tl: Timeline): string[] {
  const lines = [`target stage: ${tl.stage}   now: ${fmt(tl.now)}`];
  for (const [label, at] of [
    ["created", tl.createdAt],
    ["signups open", tl.signupOpensAt],
    ["captains", tl.captainsAt],
    ["draft", tl.draftAt],
    ["reveal", tl.revealAt],
    ["starts", tl.startsAt],
    ["ends", tl.endsAt],
  ] as const) {
    lines.push(`  ${label.padEnd(13)} ${fmt(at)}${at > tl.now ? "  (scheduled)" : ""}`);
  }
  return lines;
}

export function playerCount(options: GenerateOptions): number {
  return options.teams * options.teamSize + 4;
}

export async function runGenerate(input: RunInput): Promise<RunResult> {
  const { api, adminDiscordId, options, log } = input;
  const now = input.now ?? new Date();
  const tl = buildTimeline(options.stage, { now, progress: options.progress, days: options.days });
  const rng = new Rng(options.seed);
  const slug = options.slug;
  const count = playerCount(options);
  const result: RunResult = { slug, problems: [] };

  log(`slug ${slug}, seed ${options.seed}, ${count} players, ${options.teams} teams of ~${options.teamSize}${options.stage === "live" ? `, ${Math.round(options.progress * 100)}% through` : ""}`);
  for (const line of describeTimeline(tl)) log(line);

  const document =
    input.board.kind === "document"
      ? input.board.document
      : await api.as(adminDiscordId).get<BingoExportDocument>(`/api/bingos/${input.board.slug}/admin/export`);
  if (input.board.kind === "bingo") log(`copying the board of ${input.board.slug}`);

  const players = makePlayers(rng.fork("people"), count - (options.me ? 1 : 0), slug);
  if (options.me) {
    const users = (await api.as(null).get<{ users: DevUser[] }>("/auth/dev-users")).users;
    const me = users.find((u) => u.discordId === options.me);
    if (!me) throw new Error(`No user with discordId ${options.me} (they need to have logged in to this server once)`);
    players.push({
      index: players.length, discordId: me.discordId, name: `Dev ${me.discordUsername.slice(0, 8)}`, discordName: me.discordUsername, userId: me.id, skill: 0.6, activity: 3, offset: -5,
      isMe: true, isMod: false, reviewWindows: [], partnerIndex: null, signupAt: null,
    });
  }
  // A solo bingo refuses pairing requests, so its players sign up alone.
  const pairs = document.bingo.signupMode === "duo" ? pairUp(players, rng.fork("pairs"), 0.6) : [];
  const mods = chooseMods(players, rng.fork("mods"), options.mods);

  const capableRng = rng.fork("capable");
  const capableCache = new Map<string, boolean>();
  const ctx: Ctx = {
    api, rng, tl, slug, admin: adminDiscordId, limit: runLimit(tl), log,
    capable: (player, part) => {
      const key = `${player.index}:${part.id}`;
      let can = capableCache.get(key);
      if (can === undefined) {
        can = capableRng.float() < clamp(part.eligible * (0.5 + player.skill), 0, 1);
        capableCache.set(key, can);
      }
      return can;
    },
  };

  await importBingo(ctx, document, `Test data ${slug.slice("testdata-".length)}`);
  await setStage(ctx, "signup", tl.signupOpensAt);
  await runSignups(ctx, players, pairs);
  const { signups: filled } = await api.as(adminDiscordId).post<{ signups: number }>(`/api/dev/bingos/${slug}/fake-stats`, undefined, { at: tl.captainsAt });
  log(`made-up WOM, RuneProfile and combat achievement stats on ${filled} signups`);
  if (options.stage === "signup") return result;

  await setStage(ctx, "captains", tl.captainsAt);
  const seeds = await createTeams(ctx, players, options.teams);
  const modAt = new Date(tl.captainsAt.getTime() + 4 * HOUR);
  for (const mod of [...mods, ...players.filter((p) => p.isMe)]) {
    if (mod.userId && mod.signupAt) await api.as(adminDiscordId).post(`/api/bingos/${slug}/admin/mods`, { userId: mod.userId }, { at: modAt });
  }
  log(`${mods.length} mods${options.me ? " plus you" : ""}`);
  if (options.stage === "captains") return result;

  await setStage(ctx, "draft", tl.draftAt);
  await runDraft(ctx, players, seeds, { stopAfterFraction: options.stage === "draft" ? 0.5 : undefined });
  if (options.stage === "draft") return result;

  await setStage(ctx, "reveal", tl.revealAt);
  const boardData = await fetchBoard(ctx);
  const rules = await fetchExclusivityRules(ctx);
  const board = buildBoard(boardData.tiles, boardData.lines, rules);
  if (rules.length > 0) log(`exclusive items: ${rules.map((r) => `${r.label} (${r.scope})`).join(", ")}`);
  if (board.deadlocked.size > 0) {
    log(`WARNING: ${board.deadlocked.size} parts can never be completed on this board, so the run leaves them alone:`);
    for (const reason of board.deadlocked.values()) log(`  ${reason}`);
  }

  const byUserId = new Map(players.filter((p) => p.userId).map((p) => [p.userId!, p]));
  const teamRows = (await fetchTeams(ctx)).map((t) => ({ ...t, players: t.members.map((m) => byUserId.get(m.user.id)).filter((p): p is Player => !!p) }));
  const hands = handEvents(ctx, teamRows.map((t) => ({ teamId: t.id, members: t.players })), board);
  await runInOrder([...nameTeamEvents(ctx, seeds), ...hands.events], new Date(Math.min(tl.startsAt.getTime(), ctx.limit.getTime())));
  const raised = hands.raised;
  const nameById = new Map((await fetchTeams(ctx)).map((t) => [t.id, t.name]));
  log(`${seeds.length} teams named, ${raised.length} hands raised`);
  if (options.stage === "reveal") return result;

  await setStage(ctx, "live", tl.startsAt);
  const simRng = rng.fork("teams");
  const totalCost = board.parts.filter((p) => !board.deadlocked.has(p.id)).reduce((sum, p) => sum + p.effort, 0);
  const simTeams: SimTeam[] = teamRows.map((t) => {
    const meanSkill = t.players.reduce((sum, p) => sum + p.skill, 0) / Math.max(1, t.players.length);
    const target = clamp(0.55 + 0.35 * simRng.float() + clamp((meanSkill - 0.5) * 0.6, -0.08, 0.08), 0.5, 0.95);
    const supply = t.players.reduce((sum, p) => sum + p.skill * p.activity * options.days, 0);
    const costMult = clamp((0.6 * supply) / (target * totalCost), 0.25, 3);
    const team: SimTeam = {
      id: t.id, name: nameById.get(t.id) ?? t.name, members: t.players, target, costMult, completed: new Set(), dirty: false,
      pref: new Map(board.tiles.map((tile) => [tile.id, simRng.between(0.6, 1.6)])),
      live: new Map(),
      parts: new Map(),
    };
    for (const part of board.parts) if (!board.deadlocked.has(part.id)) team.parts.set(part.id, newPartState(part, costMult, simRng));
    return team;
  });
  log(`${simTeams.length} teams, ${simTeams.map((t) => t.members.length).join("/")} players; aiming for ${simTeams.map((t) => `${Math.round(t.target * 100)}%`).join(", ")} of the board`);

  const sim = new Simulation(ctx, board, simTeams, mods);
  // A few hands come down in the first days, as people change their minds.
  for (const hand of raised.filter(() => simRng.chance(0.15))) {
    const when = new Date(tl.startsAt.getTime() + simRng.between(2, 30) * HOUR);
    sim.at(when, async () => {
      await api.as(hand.player.discordId).put(`/api/bingos/${slug}/tiles/${hand.part.tileId}/tasks/${hand.part.id}/interest`, { interested: false }, { at: when }).catch(() => undefined);
    });
  }

  log(`playing ${fmt(tl.startsAt)} to ${fmt(ctx.limit)}...`);
  const summary = await sim.run();
  await sim.fillPoints();

  log(describe(summary));
  for (const t of summary.teams) {
    log(`  ${t.name.padEnd(28)} ${String(t.members).padStart(2)} players  ${t.partsDone}/${t.partsTotal} parts (aiming ${Math.round(t.target * 100)}%)  ${String(t.points).padStart(4)} pts  ${t.pending} pending`);
  }
  if (summary.errors.size > 0) {
    log("things the server refused (expected to be rare):");
    for (const [message, n] of [...summary.errors].sort((a, b) => b[1] - a[1]).slice(0, 8)) log(`  ${String(n).padStart(3)}x ${message}`);
  }

  // Sanity: a bug in the generator, not the app, if these fail.
  if (summary.earliest && summary.earliest < tl.startsAt) result.problems.push(`an action was stamped before the start (${fmt(summary.earliest)})`);
  if (summary.latest && summary.latest > ctx.limit) result.problems.push(`an action was stamped after the run's limit (${fmt(summary.latest)})`);
  for (const t of summary.teams) {
    if (t.partsDone / t.partsTotal > t.target + 0.1) result.problems.push(`${t.name} finished ${Math.round((t.partsDone / t.partsTotal) * 100)}%, well past its ${Math.round(t.target * 100)}% target`);
  }
  for (const p of result.problems) log(`SANITY CHECK FAILED: ${p}`);
  return result;
}
