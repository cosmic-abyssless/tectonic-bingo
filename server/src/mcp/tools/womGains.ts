import * as z from "zod";
import { getWomLeaderboard } from "../../services/historicalService";
import { bossGainsOf, gainsOf, loadTimelines } from "../../services/womReadService";
import { defineTool, McpToolError } from "../tool";
import { teamRosters } from "./bingoSummary";
import { bingoBySlug, bingoIdForSlug, bingoSpan, fitList, hoursFrom, round2, slugInput } from "./common";

const HOUR_MS = 3_600_000;

/** A boss name as Wise Old Man's metric keys spell it: "K'ril Tsutsaroth" → "kril_tsutsaroth". */
const asMetric = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[\s-]+/g, "_");

export const womGains = defineTool({
  name: "wom_gains",
  title: "Wise Old Man gains",
  description:
    "Wise Old Man gains inside one Bingo, from the snapshots the site read for each Player on a Team, measured as the Titles measure them: from each Player's last snapshot at or before the window's start " +
    "(else their first one inside it) to their last one by its end, never negative. The window defaults to the Bingo's start to its end; fromHours/toHours move it (hours from the Bingo's start). " +
    "players: player (their RSN in this Bingo), borrowed (a Borrowed account), team, gains (ehb, ehp, clues completed, and asOfHours: the last snapshot counted, in hours from the start; null with no snapshot in the window) " +
    "and bossKills (kill counts gained per Wise Old Man boss metric, most first; only bosses matching `boss` when given, and then only Players who gained on one). Highest EHB first, or most matching kills with `boss`. " +
    "timeline (with timeline: true and a `player` matching exactly one Player): their snapshots through the window as {hours, ehb, ehp, clues} (totals, not gains), starting from the one gains are measured from. " +
    "competition: the Wise Old Man competition stored for this Bingo, if any (a Historical Bingo's gains usually live only here): its title, metric, and each participant's gained, rank among all participants and Team, plus each Team's total; " +
    "it covers the competition's own dates, not the window.",
  input: z.object({
    slug: slugInput,
    team: z.string().optional().describe("Only Players on the Team with this name (any case)."),
    player: z.string().optional().describe("Only Players whose RSN contains this (any case)."),
    boss: z.string().optional().describe('Only boss kill counts whose Wise Old Man metric contains this boss name (any case, e.g. "zulrah", "K\'ril").'),
    fromHours: z.number().min(0).optional().describe("Window start, in hours from the Bingo's start (default 0)."),
    toHours: z.number().positive().optional().describe("Window end, in hours from the Bingo's start (default the Bingo's end)."),
    timeline: z.boolean().optional().describe("Return one Player's snapshots over the window; needs `player` to match exactly one Player."),
    limit: z.number().int().positive().optional().describe("At most this many Players (and timeline points, and competition participants)."),
  }),
  bingoIdFor: bingoIdForSlug,
  run: ({ slug, team, player, boss, fromHours, toHours, timeline, limit }, { db, scope }) => {
    const bingo = bingoBySlug(db, slug, scope);
    const { start, end } = bingoSpan(db, bingo);
    if (!start) throw new McpToolError(`${bingo.name} hasn't started, so there are no gains to measure.`);
    if (fromHours !== undefined && toHours !== undefined && toHours <= fromHours) throw new McpToolError("toHours must be after fromHours.");
    const from = fromHours !== undefined ? new Date(start.getTime() + fromHours * HOUR_MS) : start;
    const to = toHours !== undefined ? new Date(start.getTime() + toHours * HOUR_MS) : end;

    const everyone = teamRosters(db, bingo.id);
    const roster = everyone.filter(
      (m) => (!team || m.team.toLowerCase() === team.toLowerCase()) && (!player || m.player.toLowerCase().includes(player.toLowerCase())),
    );
    const timelines = loadTimelines(db, bingo.id);
    const bossWanted = boss ? asMetric(boss) : null;
    const window = { fromHours: hoursFrom(start, from), toHours: to ? hoursFrom(start, to) : null };

    if (timeline) {
      if (!player || roster.length !== 1) {
        throw new McpToolError(
          `timeline needs \`player\` to match exactly one Player; it matches ${roster.length}${roster.length > 1 ? `: ${roster.map((m) => m.player).join(", ")}` : ""}.`,
        );
      }
      const who = roster[0]!;
      const snapshots = (timelines.get(who.userId) ?? []).filter((s) => !to || s.at <= to);
      // From the snapshot gains are measured from (the last at or before the window's start), as gainsOf picks it.
      const firstIdx = Math.max(0, snapshots.filter((s) => s.at <= from).length - 1);
      const points = snapshots.slice(firstIdx).map((s) => ({
        hours: hoursFrom(start, s.at),
        ehb: s.ehb === null ? null : round2(s.ehb),
        ehp: s.ehp === null ? null : round2(s.ehp),
        clues: s.clues,
        ...(bossWanted ? { kills: Object.fromEntries(Object.entries(s.bossKills).filter(([metric]) => metric.includes(bossWanted))) } : {}),
      }));
      const { items, truncated } = fitList(points, limit, "Narrow the window with fromHours/toHours, or a smaller `limit`.");
      return {
        bingo: { slug: bingo.slug, name: bingo.name },
        window,
        player: who.player,
        borrowed: who.borrowed,
        team: who.team,
        timeline: items,
        ...(truncated ? { truncated } : {}),
      };
    }

    const players = roster
      .map((m) => {
        const tl = timelines.get(m.userId);
        const gains = tl ? gainsOf(tl, from, to) : null;
        const bossKills = (tl ? bossGainsOf(tl, from, to) : [])
          .filter((b) => !bossWanted || b.metric.includes(bossWanted))
          .map((b) => ({ boss: b.metric, kills: b.kills }));
        return {
          player: m.player,
          borrowed: m.borrowed,
          team: m.team,
          gains: gains && { ehb: round2(gains.ehb), ehp: round2(gains.ehp), clues: gains.clues, asOfHours: hoursFrom(start, new Date(gains.asOf)) },
          bossKills,
        };
      })
      .filter((p) => !bossWanted || p.bossKills.length > 0);
    const kills = (p: (typeof players)[number]) => p.bossKills.reduce((sum, b) => sum + b.kills, 0);
    players.sort((a, b) => (bossWanted ? kills(b) - kills(a) : 0) || (b.gains?.ehb ?? -1) - (a.gains?.ehb ?? -1) || a.player.localeCompare(b.player));
    const playerList = fitList(players, limit, "Pass `team` or `player`, or a smaller `limit`.");

    // The competition's participants, ranked among all of them before any filter (ties share the better place).
    const board = getWomLeaderboard(db, bingo.id);
    let competition = null;
    if (board) {
      const borrowed = new Set(everyone.filter((m) => m.borrowed).map((m) => m.userId));
      const participants = board.players
        .map((p) => ({
          player: p.rsn,
          borrowed: p.user ? borrowed.has(p.user.id) : false,
          team: p.teamName,
          gained: round2(p.gained),
          rank: 1 + board.players.filter((o) => o.gained > p.gained).length,
        }))
        .filter((p) => (!team || p.team?.toLowerCase() === team.toLowerCase()) && (!player || p.player.toLowerCase().includes(player.toLowerCase())));
      const list = fitList(participants, limit, "Pass `team` or `player`, or a smaller `limit`.", 40_000);
      competition = {
        title: board.title,
        metric: board.metric,
        startsAtHours: hoursFrom(start, new Date(board.startsAt)),
        endsAtHours: hoursFrom(start, new Date(board.endsAt)),
        teams: board.teams.map((t) => ({ team: t.name, gained: t.gained, players: t.players })),
        participants: list.items,
        ...(list.truncated ? { truncated: list.truncated } : {}),
      };
    }

    return {
      bingo: { slug: bingo.slug, name: bingo.name, historical: bingo.historical },
      window,
      players: playerList.items,
      ...(playerList.truncated ? { truncated: playerList.truncated } : {}),
      competition,
    };
  },
});
