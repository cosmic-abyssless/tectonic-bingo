// Generates a realistic test bingo on a running dev server, through the real endpoints, with spoofed
// timestamps. See docs/test-data-generator.md (and docs/test-data-generator-plan.md for the design).
//
//   npm run testdata -- --stage live --progress 0.5 --seed 7
import path from "node:path";
import { buildBoard } from "./board";
import { DEV_SERVER_HINT, UsageError, connect, parseArgs } from "./common";
import { chooseMods, makePlayers, pairUp, type Player } from "./people";
import { Rng, clamp } from "./rng";
import { HOUR, buildTimeline, fmt, runLimit, type Timeline } from "./timeline";
import { Simulation, describe, newPartState, type SimTeam } from "./simulate";
import { createTeams, fetchBoard, fetchExclusivityRules, fetchTeams, handEvents, importBingo, nameTeamEvents, runDraft, runInOrder, runSignups, setStage, type Ctx } from "./setup";

function printTimeline(tl: Timeline): void {
  console.log(`[testdata] target stage: ${tl.stage}   now: ${fmt(tl.now)}`);
  for (const [label, at] of [
    ["created", tl.createdAt],
    ["signups open", tl.signupOpensAt],
    ["captains", tl.captainsAt],
    ["draft", tl.draftAt],
    ["reveal", tl.revealAt],
    ["starts", tl.startsAt],
    ["ends", tl.endsAt],
  ] as const) {
    console.log(`[testdata]   ${label.padEnd(13)} ${fmt(at)}${at > tl.now ? "  (scheduled)" : ""}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const now = new Date();
  const tl = buildTimeline(args.stage, { now, progress: args.progress, days: args.days });
  const rng = new Rng(args.seed);
  const log = (message: string) => console.log(`[testdata] ${message}`);
  const playerCount = args.teams * args.teamSize + 4;

  log(`slug ${args.slug}, seed ${args.seed}, ${playerCount} players, ${args.teams} teams of ~${args.teamSize}${args.stage === "live" ? `, ${Math.round(args.progress * 100)}% through` : ""}`);
  printTimeline(tl);
  if (args.dryRun) {
    log("--dry-run: nothing was sent");
    return;
  }
  console.log(`[testdata] ${DEV_SERVER_HINT}`);

  const { api, admin, users } = await connect(args.base, args.admin);
  const exportPath = args.exportPath ?? path.resolve(__dirname, "../../../tectonic-comics-bingo-export.json");

  // The people.
  const players = makePlayers(rng.fork("people"), playerCount - (args.me ? 1 : 0), args.slug);
  if (args.me) {
    const me = users.find((u) => u.discordId === args.me);
    if (!me) throw new UsageError(`--me ${args.me} isn't a dev user (they need to have logged in to this server once)`);
    players.push({
      index: players.length, discordId: me.discordId, name: `Dev ${me.discordUsername.slice(0, 8)}`, discordName: me.discordUsername, userId: me.id, skill: 0.6, activity: 3, offset: -5,
      isMe: true, isMod: false, reviewWindows: [], partnerIndex: null, signupAt: null,
    });
  }
  const pairs = pairUp(players, rng.fork("pairs"), 0.6);
  const mods = chooseMods(players, rng.fork("mods"), args.mods);

  // Whether a player can do a part at all is rolled once, so a team's capable subset is fixed for the run.
  const capableRng = rng.fork("capable");
  const capableCache = new Map<string, boolean>();
  const ctx: Ctx = {
    api, rng, tl, slug: args.slug, admin: admin.discordId, limit: runLimit(tl), log,
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

  await importBingo(ctx, exportPath, `Test data ${args.slug.slice("testdata-".length)}`);
  await setStage(ctx, "signup", tl.signupOpensAt);
  await runSignups(ctx, players, pairs);
  const { signups: filled } = await api.as(admin.discordId).post<{ signups: number }>(`/api/dev/bingos/${args.slug}/fake-stats`, undefined, { at: tl.captainsAt });
  log(`made-up WOM, RuneProfile and combat achievement stats on ${filled} signups`);
  if (args.stage === "signup") return done(args.slug);

  await setStage(ctx, "captains", tl.captainsAt);
  const seeds = await createTeams(ctx, players, args.teams);
  const modAt = new Date(tl.captainsAt.getTime() + 4 * HOUR);
  for (const mod of [...mods, ...players.filter((p) => p.isMe)]) {
    if (mod.userId && mod.signupAt) await api.as(admin.discordId).post(`/api/bingos/${args.slug}/admin/mods`, { userId: mod.userId }, { at: modAt });
  }
  log(`${mods.length} mods${args.me ? " plus you" : ""}`);
  if (args.stage === "captains") return done(args.slug);

  await setStage(ctx, "draft", tl.draftAt);
  await runDraft(ctx, players, seeds, { stopAfterFraction: args.stage === "draft" ? 0.5 : undefined });
  if (args.stage === "draft") return done(args.slug);

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
  // Naming and hands share the reveal window, so they run together in date order.
  const hands = handEvents(ctx, teamRows.map((t) => ({ teamId: t.id, members: t.players })), board);
  await runInOrder([...nameTeamEvents(ctx, seeds), ...hands.events], new Date(Math.min(tl.startsAt.getTime(), ctx.limit.getTime())));
  const raised = hands.raised;
  const nameById = new Map((await fetchTeams(ctx)).map((t) => [t.id, t.name]));
  log(`${seeds.length} teams named, ${raised.length} hands raised`);
  if (args.stage === "reveal") return done(args.slug);

  await setStage(ctx, "live", tl.startsAt);

  // The teams.
  const simRng = rng.fork("teams");
  const totalCost = board.parts.filter((p) => !board.deadlocked.has(p.id)).reduce((sum, p) => sum + p.effort, 0);
  const simTeams: SimTeam[] = teamRows.map((t) => {
    const meanSkill = t.players.reduce((sum, p) => sum + p.skill, 0) / Math.max(1, t.players.length);
    const target = clamp(0.55 + 0.35 * simRng.float() + clamp((meanSkill - 0.5) * 0.6, -0.08, 0.08), 0.5, 0.95);
    const supply = t.players.reduce((sum, p) => sum + p.skill * p.activity * args.days, 0);
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
      await api.as(hand.player.discordId).put(`/api/bingos/${args.slug}/tiles/${hand.part.tileId}/tasks/${hand.part.id}/interest`, { interested: false }, { at: when }).catch(() => undefined);
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
    for (const [message, count] of [...summary.errors].sort((a, b) => b[1] - a[1]).slice(0, 8)) log(`  ${String(count).padStart(3)}x ${message}`);
  }

  // Sanity: a bug in the generator, not the app, if these fail.
  const problems: string[] = [];
  if (summary.earliest && summary.earliest < tl.startsAt) problems.push(`an action was stamped before the start (${fmt(summary.earliest)})`);
  if (summary.latest && summary.latest > ctx.limit) problems.push(`an action was stamped after the run's limit (${fmt(summary.latest)})`);
  for (const t of summary.teams) if (t.partsDone / t.partsTotal > t.target + 0.1) problems.push(`${t.name} finished ${Math.round((t.partsDone / t.partsTotal) * 100)}%, well past its ${Math.round(t.target * 100)}% target`);
  if (problems.length > 0) {
    for (const p of problems) console.error(`[testdata] SANITY CHECK FAILED: ${p}`);
    process.exitCode = 1;
  }
  done(args.slug);
}

function done(slug: string): void {
  console.log(`[testdata] done: /b/${slug}`);
  console.log(`[testdata] tear it down with: npm run testdata:teardown -- --slug ${slug}`);
}

main().catch((err) => {
  console.error(err instanceof UsageError ? `error: ${err.message}` : err);
  process.exit(err instanceof UsageError ? 2 : 1);
});
