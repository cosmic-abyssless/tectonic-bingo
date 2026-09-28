// Wrapped (CONTEXT.md "Wrapped", "Steal"): a Finished Bingo's year-in-review. Publishing computes every Player's
// Wrapped and the Bingo-wide one once, from the same Stats, Points share, Luck, Title and Wise Old Man services the
// Stats page and Rewind use, and stores them. Reading a published Wrapped only reads what was stored, so a flood of
// viewers at launch costs a lookup each, and its numbers stay put until a Moderator publishes it again. Before it's
// published only Moderators can load it, as a live preview that's never stored.
import { and, count, eq, inArray, isNotNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  achievementDef,
  pickTitles,
  titlesHeldBy,
  type AvatarUser,
  type BingoWrapped,
  type BingoWrappedResponse,
  type MyWrappedResponse,
  type PlayerWrapped,
  type RewindSubmission,
  type WrappedCaptain,
  type WrappedDrop,
  type WrappedDuo,
  type WrappedDuoMoment,
  type WrappedModerator,
  type WrappedReviewStats,
  type WrappedState,
  type WrappedSteal,
  type WrappedTeam,
} from "@bingo/shared";
import * as schema from "../db/schema";
import { bingoLines, bingoWrapped, draftPicks, playerWrapped, submissions, teamMembers, teamNodeState, teams, tiles, users } from "../db/schema";
import { audit } from "../audit/record";
import { now as clockNow } from "../clock";
import { ServiceError } from "./errors";
import * as statsService from "./statsService";
import * as rewindService from "./rewindService";
import { getBingoTitleSettings } from "./titleSettingsService";
import { getEarnedAchievements } from "./achievementService";
import { bossGainsOf, gainsOf, loadTimelines } from "./womReadService";
import { effectiveStartsAt, endedAt } from "./bingoStart";
import { getAcceptedPairs } from "./pairingService";
import { artSet } from "./wrappedArtService";
import { rsnsInBingo } from "./playerNames";
import { BOSS_NAMES } from "./luck/bossSources";
import { computeWinners } from "./superlativeService";

type Db = BetterSQLite3Database<typeof schema>;
type Bingo = typeof schema.bingos.$inferSelect;

const HOUR_MS = 60 * 60 * 1000;
const TOP_DROPS = 3;
const TOP_BOSSES = 3;

// Points shares that differ only by floating-point noise (a Duo's halves) are the same.
const beats = (a: number, b: number) => a - b > 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** "abyssal_sire" → "Abyssal Sire" for a boss Wise Old Man has that the Luck tables don't name. */
function bossName(metric: string): string {
  return (BOSS_NAMES as Record<string, string>)[metric] ?? metric.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function avatarUsers(db: Db, bingoId: string, userIds: string[]): Map<string, AvatarUser> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const rows = db
    .select({ id: users.id, discordUsername: users.discordUsername, discordGlobalName: users.discordGlobalName, discordGuildNick: users.discordGuildNick, discordId: users.discordId, discordAvatar: users.discordAvatar })
    .from(users)
    .where(inArray(users.id, ids))
    .all();
  const rsns = rsnsInBingo(db, bingoId, ids);
  return new Map(rows.map((u) => [u.id, { ...u, rsn: rsns.get(u.id) ?? null }]));
}

/** Each approved Claim as a drop (its item, or its Task's label for proof with no item), from Rewind's replay. */
function dropsOf(subs: RewindSubmission[], userById: Map<string, AvatarUser>): WrappedDrop[] {
  return subs
    .filter((s) => s.status === "approved")
    .flatMap((s) =>
      s.claims.map((c) => ({
        submissionId: s.id,
        teamId: s.teamId,
        player: s.player ? (userById.get(s.player.id) ?? { ...s.player, discordId: "", discordAvatar: null }) : null,
        itemName: c.label,
        quantity: c.quantity,
        gpValue: c.gpValue,
        luckOneIn: c.luckOneIn,
        luckKills: c.luckKills,
        at: s.submittedAt,
        screenshotUrl: s.screenshotUrl,
      })),
    );
}

const byGp = (a: WrappedDrop, b: WrappedDrop) => (b.gpValue ?? 0) - (a.gpValue ?? 0);
const byLuck = (a: WrappedDrop, b: WrappedDrop) => (b.luckOneIn ?? 0) - (a.luckOneIn ?? 0);
const byTime = (a: WrappedDrop, b: WrappedDrop) => Date.parse(a.at) - Date.parse(b.at);

/** How many best moments together a Duo's section gets. */
const DUO_MOMENTS = 3;

/**
 * A Duo's best moments together (WrappedDuo.moments): a Submission by each half on the same Tile, most valuable pair
 * first, each Tile and Submission used once; then, up to the limit, pairs on the same UTC day, one per day. Each
 * Submission shows as its most valuable drop.
 */
export function duoMoments(mine: WrappedDrop[], theirs: WrappedDrop[], tileOf: (submissionId: string) => { id: string; name: string } | null): WrappedDuoMoment[] {
  const bestPerSubmission = (drops: WrappedDrop[]) => {
    const best = new Map<string, WrappedDrop>();
    for (const d of drops) {
      const prev = best.get(d.submissionId);
      if (!prev || byGp(d, prev) < 0) best.set(d.submissionId, d);
    }
    return [...best.values()];
  };
  const a = bestPerSubmission(mine);
  const b = bestPerSubmission(theirs);
  const pairs = a.flatMap((m) => b.map((t) => ({ mine: m, theirs: t, value: (m.gpValue ?? 0) + (t.gpValue ?? 0), apart: Math.abs(Date.parse(m.at) - Date.parse(t.at)) })));
  const best = (x: (typeof pairs)[number], y: (typeof pairs)[number]) => y.value - x.value || x.apart - y.apart || Date.parse(x.mine.at) - Date.parse(y.mine.at);
  const day = (p: (typeof pairs)[number]) => (Date.parse(p.mine.at) <= Date.parse(p.theirs.at) ? p.mine.at : p.theirs.at).slice(0, 10);

  const used = new Set<string>();
  const seen = new Set<string>();
  const moments: WrappedDuoMoment[] = [];
  const take = (p: (typeof pairs)[number], kind: "tile" | "day", key: string, tileName: string | null) => {
    if (moments.length >= DUO_MOMENTS || used.has(p.mine.submissionId) || used.has(p.theirs.submissionId) || seen.has(key)) return;
    used.add(p.mine.submissionId).add(p.theirs.submissionId);
    seen.add(key);
    moments.push({ kind, tileName, date: day(p), mine: p.mine, theirs: p.theirs });
  };
  for (const p of pairs.filter((p) => tileOf(p.mine.submissionId) && tileOf(p.mine.submissionId)!.id === tileOf(p.theirs.submissionId)?.id).sort(best)) {
    const tile = tileOf(p.mine.submissionId)!;
    take(p, "tile", `tile:${tile.id}`, tile.name);
  }
  for (const p of pairs.filter((p) => p.mine.at.slice(0, 10) === p.theirs.at.slice(0, 10)).sort(best)) take(p, "day", `day:${day(p)}`, null);
  return moments;
}

/** Review stats over some reviewed Submissions (approved or rejected, with who reviewed them and when). */
function reviewStats(reviews: { reviewerId: string; status: string; submittedAt: Date; reviewedAt: Date }[], userById: Map<string, AvatarUser>): WrappedReviewStats {
  const waits = reviews.map((r) => Math.max(0, r.reviewedAt.getTime() - r.submittedAt.getTime()));
  const byHour = new Map<number, number>();
  for (const r of reviews) byHour.set(r.reviewedAt.getUTCHours(), (byHour.get(r.reviewedAt.getUTCHours()) ?? 0) + 1);
  const busiest = [...byHour].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];

  const perReviewer = new Map<string, { reviewed: number; rejected: number }>();
  for (const r of reviews) {
    const p = perReviewer.get(r.reviewerId) ?? { reviewed: 0, rejected: 0 };
    p.reviewed++;
    if (r.status === "rejected") p.rejected++;
    perReviewer.set(r.reviewerId, p);
  }
  const reviewers = [...perReviewer]
    .filter(([id]) => userById.has(id))
    .map(([id, p]) => ({
      user: userById.get(id)!,
      reviewed: p.reviewed,
      rejected: p.rejected,
      rejectionRate: p.rejected / p.reviewed,
      medianReviewMs: median(reviews.filter((r) => r.reviewerId === id).map((r) => Math.max(0, r.reviewedAt.getTime() - r.submittedAt.getTime())))!,
    }));
  const top = [...reviewers].sort((a, b) => b.reviewed - a.reviewed)[0];

  return {
    reviewed: reviews.length,
    medianReviewMs: median(waits),
    fastestReviewMs: waits.length ? Math.min(...waits) : null,
    withinHourFraction: waits.length ? waits.filter((w) => w <= HOUR_MS).length / waits.length : null,
    busiestHour: busiest ? { hour: busiest[0], reviews: busiest[1] } : null,
    topReviewer: top ? { user: top.user, reviewed: top.reviewed } : null,
    reviewers: reviewers.sort((a, b) => b.rejectionRate - a.rejectionRate || b.reviewed - a.reviewed),
  };
}

/**
 * Every Player's Wrapped and the Bingo-wide one, computed now. Only a Finished Bingo has one. Everything comes from
 * the existing services: Points share and Total drop value (statsService), Titles (statsService's facts, picked with the
 * Bingo's frozen Title settings, the whole Bingo as the pool), drops with their Luck and screenshots (Rewind's replay).
 */
export function computeWrapped(db: Db, bingo: Bingo): { bingo: BingoWrapped; players: PlayerWrapped[] } {
  if (bingo.stage !== "complete") throw new ServiceError(403, "Wrapped is only available once the bingo is finished");
  const bingoId = bingo.id;

  const teamRows = db.select().from(teams).where(eq(teams.bingoId, bingoId)).all();
  const memberRows = teamRows.length ? db.select().from(teamMembers).where(inArray(teamMembers.teamId, teamRows.map((t) => t.id))).all() : [];
  const teamCredits = statsService.getTeamCredits(db, bingoId);
  const shares = statsService.getPointsShares(db, bingoId, teamCredits);
  const contributions = statsService.getContributionCounts(db, bingoId, shares);
  const contributionOf = new Map(contributions.map((c) => [c.userId, c]));
  const titleSettings = getBingoTitleSettings(db, bingo);
  const titleFacts = statsService.getTitleFacts(db, bingoId, contributions, teamCredits, shares, titleSettings.luck);
  const factsOf = new Map(titleFacts.map((f) => [f.userId, f]));
  const liveAt = effectiveStartsAt(db, bingo);
  const finishedAt = endedAt(db, bingo);
  const picked = pickTitles(titleFacts, { now: finishedAt ?? clockNow(), liveAt, endedAt: finishedAt }, titleSettings);
  const rewind = rewindService.getRewind(db, bingo);

  // Every review of the Bingo's Submissions (approved or rejected), by whoever made it: a Moderator or an Admin.
  const reviews = teamRows.length
    ? db
        .select({ reviewerId: submissions.reviewedByUserId, status: submissions.status, submittedAt: submissions.submittedAt, reviewedAt: submissions.reviewedAt })
        .from(submissions)
        .where(and(inArray(submissions.teamId, teamRows.map((t) => t.id)), inArray(submissions.status, ["approved", "rejected"]), isNotNull(submissions.reviewedByUserId), isNotNull(submissions.reviewedAt)))
        .all()
        .map((r) => ({ reviewerId: r.reviewerId!, status: r.status, submittedAt: r.submittedAt, reviewedAt: r.reviewedAt! }))
    : [];
  const picks = db.select().from(draftPicks).where(eq(draftPicks.bingoId, bingoId)).all();
  const pickOf = new Map(picks.map((p) => [p.userId, p]));

  const userById = avatarUsers(db, bingoId, [...memberRows.map((m) => m.userId), ...contributions.map((c) => c.userId), ...reviews.map((r) => r.reviewerId)]);
  for (const c of contributions) userById.set(c.userId, c.user);

  const drops = dropsOf(rewind.submissions, userById);
  const dropsBy = new Map<string, WrappedDrop[]>();
  for (const d of drops) if (d.player) dropsBy.set(d.player.id, [...(dropsBy.get(d.player.id) ?? []), d]);
  const approvedSubs = rewind.submissions.filter((s) => s.status === "approved");

  // Teams: placement by final score (the scoreboard's), then what they completed and who stood out.
  const finalPoints = new Map(rewind.teams.map((t) => [t.teamId, t.finalPoints]));
  const tileRows = db.select({ id: tiles.id, name: tiles.name, nodeId: tiles.nodeId }).from(tiles).where(eq(tiles.bingoId, bingoId)).all();
  const tileNodeIds = new Set(tileRows.map((t) => t.nodeId));
  const tileById = new Map(tileRows.map((t) => [t.id, t]));
  const tileOfSubmission = new Map(rewind.submissions.map((sub) => [sub.id, sub.tileId]));
  const tileOf = (submissionId: string) => {
    const tile = tileById.get(tileOfSubmission.get(submissionId) ?? "");
    return tile ? { id: tile.id, name: tile.name } : null;
  };
  const lineNodeIds = new Set(db.select({ nodeId: bingoLines.nodeId }).from(bingoLines).where(eq(bingoLines.bingoId, bingoId)).all().map((l) => l.nodeId));
  const stateRows = teamRows.length ? db.select({ teamId: teamNodeState.teamId, nodeId: teamNodeState.nodeId }).from(teamNodeState).where(inArray(teamNodeState.teamId, teamRows.map((t) => t.id))).all() : [];
  const pointsOverTime = statsService.getPointsOverTime(db, bingoId);
  const wrappedTeams: WrappedTeam[] = teamRows
    .map((team) => {
      const points = finalPoints.get(team.id) ?? 0;
      const mine = contributions.filter((c) => c.teamId === team.id);
      const mvp = mine.filter((c) => c.pointsShare > 0).sort((a, b) => b.pointsShare - a.pointsShare)[0];
      const gp = mine.filter((c) => c.gpGained > 0).sort((a, b) => b.gpGained - a.gpGained)[0];
      const biggest = drops.filter((d) => d.teamId === team.id && d.gpValue !== null && d.gpValue > 0).sort(byGp)[0];
      const superlatives = computeWinners(db, bingoId, team.id)
        .map((w) => ({ category: w.categoryName, winners: w.winnerUserIds.map((id) => userById.get(id)).filter((u): u is AvatarUser => !!u) }))
        .filter((s) => s.winners.length > 0);
      return {
        teamId: team.id,
        name: team.name,
        color: team.color,
        placement: 1 + teamRows.filter((o) => (finalPoints.get(o.id) ?? 0) > points).length,
        points,
        tilesCompleted: stateRows.filter((r) => r.teamId === team.id && tileNodeIds.has(r.nodeId)).length,
        linesCompleted: stateRows.filter((r) => r.teamId === team.id && lineNodeIds.has(r.nodeId)).length,
        mvp: mvp ? { player: mvp.user, pointsShare: mvp.pointsShare } : null,
        topGpEarner: gp ? { player: gp.user, gpGained: gp.gpGained } : null,
        biggestDrop: biggest ?? null,
        pointsOverTime: pointsOverTime.filter((p) => p.teamId === team.id).map((p) => ({ at: p.at.toISOString(), points: p.cumulativePoints })),
        superlatives,
      };
    })
    .sort((a, b) => a.placement - b.placement || a.name.localeCompare(b.name));

  // Steals: draft position against final Points share rank among drafted Players (statsService.draftFacts). A Duo's
  // halves share a position and the lower scorer always ranks worse, so only its higher scorer can be the Steal.
  // Busts (the other direction) are never looked at.
  let biggestSteal: WrappedSteal | null = null;
  for (const f of titleFacts) {
    if (!f.draft || f.pointsShare <= 0) continue;
    const placesBeaten = f.draft.position - f.draft.rank;
    if (placesBeaten <= 0 || (biggestSteal && placesBeaten <= biggestSteal.placesBeaten)) continue;
    biggestSteal = { player: userById.get(f.userId)!, teamId: f.teamId, pickNumber: pickOf.get(f.userId)!.pickNumber, position: f.draft.position, rank: f.draft.rank, placesBeaten };
  }

  const reactionsOf = (s: RewindSubmission) => s.reactions.reduce((sum, g) => sum + g.users.length, 0);
  const mostReacted = [...approvedSubs].sort((a, b) => reactionsOf(b) - reactionsOf(a) || Date.parse(a.submittedAt) - Date.parse(b.submittedAt))[0];
  const mostReactedDrop = mostReacted && reactionsOf(mostReacted) > 0 ? drops.filter((d) => d.submissionId === mostReacted.id).sort(byGp)[0] : undefined;
  const rarest = drops.filter((d) => d.luckOneIn !== null).sort(byLuck)[0];

  const bingoData: BingoWrapped = {
    bingoName: bingo.name,
    totalSubmissions: approvedSubs.length,
    totalGp: drops.reduce((sum, d) => sum + (d.gpValue ?? 0), 0),
    rarestDrop: rarest ?? null,
    mostReacted: mostReactedDrop ? { drop: mostReactedDrop, reactions: reactionsOf(mostReacted!) } : null,
    teams: wrappedTeams,
    biggestSteal,
    moderation: reviewStats(reviews, userById),
  };

  // Players: everyone on a Team.
  const playerIds = [...new Set(memberRows.map((m) => m.userId))];
  const averageSubmissions = playerIds.length ? playerIds.reduce((sum, id) => sum + (contributionOf.get(id)?.approvedSubmissions ?? 0), 0) / playerIds.length : 0;
  const averagePointsShare = playerIds.length ? playerIds.reduce((sum, id) => sum + (contributionOf.get(id)?.pointsShare ?? 0), 0) / playerIds.length : 0;
  const achievements = getEarnedAchievements(db, bingo);
  const timelines = loadTimelines(db, bingoId);
  const teamOfUser = new Map(memberRows.map((m) => [m.userId, m.teamId]));
  const pairs = getAcceptedPairs(db, bingoId).filter((p) => teamOfUser.has(p.userIds[0]) && teamOfUser.get(p.userIds[0]) === teamOfUser.get(p.userIds[1]));
  const shareOf = (id: string) => contributionOf.get(id)?.pointsShare ?? 0;
  const duoTotals = pairs.map((p) => shareOf(p.userIds[0]) + shareOf(p.userIds[1]));

  const players: PlayerWrapped[] = playerIds.map((userId) => {
    const teamId = teamOfUser.get(userId)!;
    const c = contributionOf.get(userId);
    const facts = factsOf.get(userId);
    const teammates = contributions.filter((o) => o.teamId === teamId);
    const mine = [...(dropsBy.get(userId) ?? [])].sort(byTime);
    const valued = mine.filter((d) => d.gpValue !== null && d.gpValue > 0).sort(byGp);
    const lucky = mine.filter((d) => d.luckOneIn !== null).sort(byLuck)[0];

    const perDay = new Map<string, Set<string>>();
    for (const d of mine) {
      const day = d.at.slice(0, 10);
      perDay.set(day, (perDay.get(day) ?? new Set()).add(d.submissionId));
    }
    const busiestDay = [...perDay].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))[0];

    const timeline = timelines.get(userId);
    const womGains = liveAt && timeline ? gainsOf(timeline, liveAt, finishedAt) : null;
    const pick = pickOf.get(userId);
    const gpGained = c?.gpGained ?? 0;
    const teamAwardPoints = facts?.teamAwardPoints ?? 0;

    const pair = pairs.find((p) => p.userIds.includes(userId));
    let duo: WrappedDuo | null = null;
    if (pair) {
      const partnerId = pair.userIds.find((id) => id !== userId)!;
      const combined = shareOf(userId) + shareOf(partnerId);
      duo = {
        partner: userById.get(partnerId)!,
        combinedPointsShare: combined,
        myPointsShare: shareOf(userId),
        partnerPointsShare: shareOf(partnerId),
        rank: 1 + duoTotals.filter((t) => beats(t, combined)).length,
        duoCount: pairs.length,
        pickNumber: pickOf.get(userId)?.pickNumber ?? pickOf.get(partnerId)?.pickNumber ?? null,
        moments: duoMoments(dropsBy.get(userId) ?? [], dropsBy.get(partnerId) ?? [], tileOf),
      };
    }

    const membership = memberRows.find((m) => m.userId === userId && m.teamId === teamId);
    let captain: WrappedCaptain | null = null;
    if (membership && (membership.isCaptain || membership.isCoCaptain)) {
      const byPick = new Map<number, string[]>();
      for (const p of picks.filter((p) => p.teamId === teamId)) byPick.set(p.pickNumber, [...(byPick.get(p.pickNumber) ?? []), p.userId]);
      captain = {
        teamId,
        drafted: picks.length,
        picks: [...byPick]
          .sort((a, b) => a[0] - b[0])
          .map(([pickNumber, ids]) => {
            const draft = ids.map((id) => factsOf.get(id)?.draft).filter((d): d is NonNullable<typeof d> => !!d);
            return {
              players: ids.map((id) => userById.get(id)!).filter(Boolean),
              pickNumber,
              position: draft[0]?.position ?? picks.filter((p) => p.pickNumber < pickNumber).length + 1,
              rank: draft.length ? Math.min(...draft.map((d) => d.rank)) : 0,
              pointsShare: Math.max(0, ...ids.map(shareOf)),
            };
          }),
      };
    }

    return {
      userId,
      teamId,
      you: {
        submissions: c?.approvedSubmissions ?? 0,
        bingoAverageSubmissions: averageSubmissions,
        bingoAveragePointsShare: averagePointsShare,
        pointsShare: c?.pointsShare ?? 0,
        teamPointsFraction: teamAwardPoints > 0 ? (c?.pointsShare ?? 0) / teamAwardPoints : 0,
        teamRank: 1 + teammates.filter((o) => beats(o.pointsShare, c?.pointsShare ?? 0)).length,
        teamSize: memberRows.filter((m) => m.teamId === teamId).length,
        gpGained,
        buyIn: bingo.buyinAmount ?? null,
        coveredBuyIn: bingo.buyinAmount ? gpGained >= bingo.buyinAmount : null,
        topDrops: valued.slice(0, TOP_DROPS),
        luckiestDrop: lucky ?? null,
        driestStreak: facts?.luck?.dry ? { boss: facts.luck.dry.boss, kills: facts.luck.dry.kills, oneIn: 10 ** facts.luck.dry.value } : null,
        firstDrop: mine[0] ?? null,
        lastDrop: mine.at(-1) ?? null,
        mostActiveDay: busiestDay ? { date: busiestDay[0], submissions: busiestDay[1].size, drops: mine.filter((d) => d.at.startsWith(busiestDay[0])) } : null,
        titles: titlesHeldBy(picked, userId).map((p) => ({ id: p.title.id, name: p.title.name, text: p.holders.find((h) => h.userId === userId)!.text })),
        achievements: (achievements?.get(userId) ?? []).map((a) => {
          const def = achievementDef(a.key);
          return { key: a.key, name: def.name, itemName: def.itemName, earnedAt: a.earnedAt.toISOString() };
        }),
        wom:
          womGains && timeline
            ? { ehb: womGains.ehb, bosses: bossGainsOf(timeline, liveAt!, finishedAt).slice(0, TOP_BOSSES).map((b) => ({ ...b, name: bossName(b.metric) })), asOf: womGains.asOf }
            : null,
        draft: pick && facts?.draft ? { pickNumber: pick.pickNumber, position: facts.draft.position } : null,
      },
      duo,
      captain,
    };
  });

  return { bingo: bingoData, players };
}

/** Submissions of the Bingo still waiting for review. */
function pendingCount(db: Db, bingoId: string): number {
  return (
    db
      .select({ n: count() })
      .from(submissions)
      .innerJoin(teams, eq(submissions.teamId, teams.id))
      .where(and(eq(teams.bingoId, bingoId), eq(submissions.status, "pending")))
      .get()?.n ?? 0
  );
}

/** Whether a Bingo's Wrapped has been published: one primary-key lookup, cheap enough for the Bingo shell. */
export function isPublished(db: Db, bingoId: string): boolean {
  return !!db.select({ bingoId: bingoWrapped.bingoId }).from(bingoWrapped).where(eq(bingoWrapped.bingoId, bingoId)).get();
}

export function getWrappedState(db: Db, bingo: Bingo): WrappedState {
  const row = db.select({ publishedAt: bingoWrapped.publishedAt }).from(bingoWrapped).where(eq(bingoWrapped.bingoId, bingo.id)).get();
  return { published: !!row, publishedAt: row?.publishedAt.toISOString() ?? null, publishOnFinish: bingo.publishWrappedOnFinish, pendingSubmissions: pendingCount(db, bingo.id) };
}

/**
 * Publishes a Finished Bingo's Wrapped, or publishes it again (after late Wise Old Man updates, say): computes it now
 * and replaces whatever was stored. Audited either way. Refused while any Submission is pending: Wrapped would be
 * missing them (the finish is when the review backlog is biggest, and the mods' final pass comes after).
 */
export function publishWrapped(db: Db, bingo: Bingo, userId: string): WrappedState {
  if (bingo.stage !== "complete") throw new ServiceError(403, "Wrapped is only available once the bingo is finished");
  const pending = pendingCount(db, bingo.id);
  if (pending > 0) {
    throw new ServiceError(409, `${pending === 1 ? "1 submission is" : `${pending} submissions are`} still pending. Review them before publishing Wrapped.`, "wrapped_pending_submissions");
  }
  const computed = computeWrapped(db, bingo);
  const at = clockNow();
  db.transaction((tx) => {
    const republish = !!tx.select({ bingoId: bingoWrapped.bingoId }).from(bingoWrapped).where(eq(bingoWrapped.bingoId, bingo.id)).get();
    tx.delete(playerWrapped).where(eq(playerWrapped.bingoId, bingo.id)).run();
    tx.delete(bingoWrapped).where(eq(bingoWrapped.bingoId, bingo.id)).run();
    tx.insert(bingoWrapped).values({ bingoId: bingo.id, publishedAt: at, publishedByUserId: userId, dataJson: JSON.stringify(computed.bingo) }).run();
    for (const p of computed.players) tx.insert(playerWrapped).values({ bingoId: bingo.id, userId: p.userId, dataJson: JSON.stringify(p) }).run();
    audit(tx, {
      action: republish ? "wrapped.republished" : "wrapped.published",
      bingoId: bingo.id,
      entity: { type: "bingo", id: bingo.id, label: bingo.name },
      details: { players: computed.players.length },
      actor: { userId },
    });
  });
  return getWrappedState(db, bingo);
}

/**
 * "Publish Wrapped when the Bingo finishes" (off by default): publishes it on its own the first time a Finished Bingo
 * has nothing pending. Called as it moves to Finished, and after each review (the last pending one clears the way).
 * Only once: after that, publishing again is a Moderator's call. Late Wise Old Man reads need a Re-publish. Whether it
 * published.
 */
export function publishWhenReady(db: Db, bingo: Bingo, userId: string): boolean {
  if (bingo.stage !== "complete" || !bingo.publishWrappedOnFinish) return false;
  if (getWrappedState(db, bingo).published || pendingCount(db, bingo.id) > 0) return false;
  publishWrapped(db, bingo, userId);
  return true;
}

export interface WrappedViewer {
  userId: string;
  isMod: boolean;
  myTeamId: string | null;
}

/**
 * With "Show screenshots once Finished" off, other Teams' screenshots are left out for anyone but the mods, the same
 * rule as Rewind and a Team's submission list. Applied on read, so the stored data doesn't depend on the viewer.
 */
function hideScreenshots(data: BingoWrapped, bingo: Bingo, viewer: WrappedViewer): BingoWrapped {
  if (viewer.isMod || bingo.showScreenshotsWhenFinished) return data;
  const hide = (d: WrappedDrop | null): WrappedDrop | null => (d && d.teamId !== viewer.myTeamId ? { ...d, screenshotUrl: null } : d);
  return {
    ...data,
    rarestDrop: hide(data.rarestDrop),
    mostReacted: data.mostReacted && { ...data.mostReacted, drop: hide(data.mostReacted.drop)! },
    teams: data.teams.map((t) => ({ ...t, biggestDrop: hide(t.biggestDrop) })),
  };
}

/** The viewer's Moderator section: their entry in the stored moderation stats. */
function moderatorOf(data: BingoWrapped, userId: string): WrappedModerator | null {
  const mine = data.moderation.reviewers.find((r) => r.user.id === userId);
  return mine ? { reviewed: mine.reviewed, medianReviewMs: mine.medianReviewMs, rejectionRate: mine.rejectionRate } : null;
}

function notPublished(): never {
  throw new ServiceError(404, "Wrapped hasn't been published yet", "wrapped_not_published");
}

/**
 * The Bingo-wide Wrapped (and, with `withPlayer`, the viewer's own). Published: read from storage only. Not yet:
 * Moderators get a preview computed on the spot, everyone else "not published".
 */
function read(db: Db, bingo: Bingo, viewer: WrappedViewer, withPlayer: boolean): MyWrappedResponse {
  if (bingo.stage !== "complete") throw new ServiceError(403, "Wrapped is only available once the bingo is finished");
  const state = getWrappedState(db, bingo);
  if (state.published) {
    const stored = db.select({ dataJson: bingoWrapped.dataJson }).from(bingoWrapped).where(eq(bingoWrapped.bingoId, bingo.id)).get()!;
    const mine = withPlayer ? db.select({ dataJson: playerWrapped.dataJson }).from(playerWrapped).where(and(eq(playerWrapped.bingoId, bingo.id), eq(playerWrapped.userId, viewer.userId))).get() : undefined;
    const data = JSON.parse(stored.dataJson) as BingoWrapped;
    return {
      state,
      preview: false,
      bingo: hideScreenshots(data, bingo, viewer),
      player: mine ? (JSON.parse(mine.dataJson) as PlayerWrapped) : null,
      moderator: moderatorOf(data, viewer.userId),
      art: artSet(db, bingo.id),
    };
  }
  if (!viewer.isMod) notPublished();
  const computed = computeWrapped(db, bingo);
  return {
    state,
    preview: true,
    bingo: computed.bingo,
    player: withPlayer ? (computed.players.find((p) => p.userId === viewer.userId) ?? null) : null,
    moderator: moderatorOf(computed.bingo, viewer.userId),
    art: artSet(db, bingo.id),
  };
}

/** The viewer's Wrapped: their own Player Wrapped (null for a viewer who wasn't a Player) and the Bingo-wide one. */
export function readMyWrapped(db: Db, bingo: Bingo, viewer: WrappedViewer): MyWrappedResponse {
  return read(db, bingo, viewer, true);
}

export function readBingoWrapped(db: Db, bingo: Bingo, viewer: WrappedViewer): BingoWrappedResponse {
  const { state, preview, bingo: data, art } = read(db, bingo, viewer, false);
  return { state, preview, bingo: data, art };
}
