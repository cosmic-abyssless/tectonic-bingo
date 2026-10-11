// Catch-up (CONTEXT.md): what happened in a Bingo since a user last had it open, from their point of view, shown at the
// top of its page when they come back. Presence (when they last had it open) comes from their tabs' socket
// (notificationPresence.ts) at most once a minute; a gap of VISIT_GAP_MS starts a new visit, whose Catch-up covers the
// time since the one before. Built per viewer under the same rules as the pages: their own Team only, the standing only
// once they can see the scoreboard, the queue only for a Moderator.
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { can, type AuditDetailsMap, type CatchUpLine, type CatchUpResponse, type CatchUpSection } from "@bingo/shared";
import * as schema from "../db/schema";
import { auditLog, bingoLines, bingoPresence, nodeEdges, signupPairings, submissions, teams, tiles, users } from "../db/schema";
import { getBingoAccess } from "./bingoAccess";
import { getDraftState } from "./draftService";
import { getLedTeam, getTeamProgress, getUserTeamForBingo } from "./teamService";
import { getAllSubmissionsForBingo, getPendingCount } from "./submissionService";
import { lineLabel } from "./scoringService";
import { rsnsInBingo } from "./playerNames";
import { getSettings } from "./notificationService";

type Db = BetterSQLite3Database<typeof schema>;
type Bingo = typeof schema.bingos.$inferSelect;
type User = { id: string; isAdmin: boolean; discordId: string };

/** Away this long, and the next time they're seen starts a new visit (and with it a new Catch-up window). */
export const VISIT_GAP_MS = 5 * 60_000;

/** Records that `userId` has `bingoId` open, in view, at `at`: starting a new visit after a gap. */
export function recordBingoPresence(db: Db, userId: string, bingoId: string, at: Date): void {
  const row = db.select().from(bingoPresence).where(and(eq(bingoPresence.userId, userId), eq(bingoPresence.bingoId, bingoId))).get();
  if (!row) {
    db.insert(bingoPresence).values({ userId, bingoId, lastSeenAt: at, visitStartedAt: at, windowFrom: null }).run();
    return;
  }
  if (at.getTime() <= row.lastSeenAt.getTime()) return;
  const newVisit = at.getTime() - row.lastSeenAt.getTime() > VISIT_GAP_MS;
  db.update(bingoPresence)
    .set(newVisit ? { lastSeenAt: at, visitStartedAt: at, windowFrom: row.lastSeenAt } : { lastSeenAt: at })
    .where(and(eq(bingoPresence.userId, userId), eq(bingoPresence.bingoId, bingoId)))
    .run();
}

/**
 * Where this visit's window starts, or null when there's no card to show: never seen before, or Got it pressed this
 * visit. A tab that hasn't reported in yet (the page just loaded) counts as starting a new visit, if it's been a while.
 */
function windowStart(db: Db, userId: string, bingoId: string, now: Date): Date | null {
  const row = db.select().from(bingoPresence).where(and(eq(bingoPresence.userId, userId), eq(bingoPresence.bingoId, bingoId))).get();
  if (!row) return null;
  if (now.getTime() - row.lastSeenAt.getTime() > VISIT_GAP_MS) return row.lastSeenAt;
  if (!row.windowFrom) return null;
  if (row.catchUpDismissedAt && row.catchUpDismissedAt.getTime() >= row.visitStartedAt.getTime()) return null;
  return row.windowFrom;
}

/** Got it: hides the card until the next visit. */
export function dismissCatchUp(db: Db, userId: string, bingoId: string, now: Date): void {
  recordBingoPresence(db, userId, bingoId, now);
  db.update(bingoPresence)
    .set({ catchUpDismissedAt: now })
    .where(and(eq(bingoPresence.userId, userId), eq(bingoPresence.bingoId, bingoId)))
    .run();
}

const CATCH_UP_STAGES = new Set<Bingo["stage"]>(["draft", "reveal", "live", "complete"]);

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function ago(from: Date, now: Date): string {
  const minutes = Math.round((now.getTime() - from.getTime()) / 60_000);
  if (minutes < 90) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} days`;
}

/** The viewer's Catch-up of `bingo` at `now`. */
export function getCatchUp(db: Db, bingo: Bingo, user: User, now: Date): CatchUpResponse {
  const enabled = getSettings(db, user.id).catchUpEnabled;
  return enabled ? buildCatchUp(db, bingo, user, now, enabled) : { enabled, since: null, summary: null, sections: [] };
}

function buildCatchUp(db: Db, bingo: Bingo, user: User, now: Date, enabled: boolean): CatchUpResponse {
  const empty: CatchUpResponse = { enabled, since: null, summary: null, sections: [] };
  if (bingo.historical || !CATCH_UP_STAGES.has(bingo.stage)) return empty;
  const access = getBingoAccess(db, bingo, user);
  if (!access.canSee) return empty;
  const from = windowStart(db, user.id, bingo.id, now);
  if (!from) return empty;

  const entries = db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.bingoId, bingo.id), gte(auditLog.createdAt, from), lte(auditLog.createdAt, now)))
    .orderBy(asc(auditLog.id))
    .all();
  const stageChanges = entries.filter((e) => e.action === "stage.changed").map((e) => JSON.parse(e.details) as AuditDetailsMap["stage.changed"]);
  // Finished: only on the first visit after it finished.
  if (bingo.stage === "complete" && !stageChanges.some((s) => s.to === "complete")) return empty;

  const team = getUserTeamForBingo(db, bingo.id, user.id);
  const isMod = access.isMod;
  const seesScoreboard = can(access.roles, bingo, "view_other_teams").ok;
  const link = (tileId?: string | null) => `/b/${bingo.slug}${tileId ? `?tile=${tileId}` : ""}`;
  const summary: string[] = [];

  // 1. Needs you.
  const needsYou: CatchUpLine[] = [];
  const mine = db
    .select()
    .from(submissions)
    .innerJoin(teams, eq(teams.id, submissions.teamId))
    .where(and(eq(teams.bingoId, bingo.id), eq(submissions.submittedByUserId, user.id)))
    .all()
    .map((r) => r.submissions);
  const tileNameOf = new Map<string, { name: string | null; tileId: string | null }>();
  for (const e of entries) {
    if (e.action === "submission.created" && e.entityId) {
      const d = JSON.parse(e.details) as AuditDetailsMap["submission.created"];
      tileNameOf.set(e.entityId, { name: d.tileName, tileId: d.tileId });
    }
  }
  const mineIds = mine.map((s) => s.id).filter((id) => !tileNameOf.has(id));
  if (mineIds.length) {
    for (const e of db.select().from(auditLog).where(and(eq(auditLog.entityType, "submission"), inArray(auditLog.entityId, mineIds), eq(auditLog.action, "submission.created"))).all()) {
      const d = JSON.parse(e.details) as AuditDetailsMap["submission.created"];
      tileNameOf.set(e.entityId!, { name: d.tileName, tileId: d.tileId });
    }
  }
  const inWindow = (at: Date | null) => !!at && at.getTime() >= from.getTime() && at.getTime() <= now.getTime();
  const tileOf = (id: string) => tileNameOf.get(id) ?? { name: null, tileId: null };
  const drop = (id: string) => (tileOf(id).name ? `${tileOf(id).name} drop` : "drop");

  const rejected = mine.filter((s) => s.status === "rejected" && inWindow(s.reviewedAt));
  for (const s of rejected) {
    needsYou.push({ text: `Your ${s.kind === "proof" ? "Proof screenshot" : drop(s.id)} was rejected${s.reviewerNotes ? `: "${s.reviewerNotes}"` : ""}. Submit again`, link: link(tileOf(s.id).tileId) });
  }
  const freshDrops = mine.filter((s) => s.kind === "drop" && s.status === "pending" && inWindow(s.submittedAt));
  if (freshDrops.length) {
    const flagged = new Set(getAllSubmissionsForBingo(db, bingo.id, "pending").filter((r) => r.proofChecks.some((c) => c.flag === "missing")).map((r) => r.submission.id));
    for (const s of freshDrops.filter((d) => flagged.has(d.id))) needsYou.push({ text: `Your ${drop(s.id)} needs a Proof screenshot`, link: link(tileOf(s.id).tileId) });
  }
  const pairing = db
    .select({ requesterUserId: signupPairings.requesterUserId })
    .from(signupPairings)
    .where(and(eq(signupPairings.bingoId, bingo.id), eq(signupPairings.targetDiscordId, user.discordId), eq(signupPairings.status, "pending")))
    .get();
  if (pairing) needsYou.push({ text: `${rsnsInBingo(db, bingo.id, [pairing.requesterUserId]).get(pairing.requesterUserId) ?? "Someone"} asked to be your Duo`, link: link() });
  if (bingo.stage === "draft") {
    const led = getLedTeam(db, bingo.id, user.id);
    const pick = led ? getDraftState(db, bingo, { includeAnswers: false }).currentPick : null;
    if (led && pick?.teamId === led.id) needsYou.push({ text: `You're on the clock: pick ${pick.pickNumber}`, link: `/b/${bingo.slug}/draft` });
  }
  if (isMod && bingo.stage !== "complete") {
    const waiting = getPendingCount(db, bingo.id);
    if (waiting > 0) {
      const oldest = db
        .select({ at: submissions.submittedAt })
        .from(submissions)
        .innerJoin(teams, eq(teams.id, submissions.teamId))
        .where(and(eq(teams.bingoId, bingo.id), eq(submissions.status, "pending")))
        .orderBy(asc(submissions.submittedAt))
        .limit(1)
        .get();
      needsYou.push({ text: `${waiting} waiting for review${oldest ? `, oldest ${ago(oldest.at, now)}` : ""}`, link: `/b/${bingo.slug}/mod?tab=submissions` });
    }
  }

  // 2. Your drops.
  const yourDrops: CatchUpLine[] = [];
  const pointsBySubmission = new Map<string, number>();
  for (const e of entries) {
    if (e.action === "submission.approved" && e.entityId) pointsBySubmission.set(e.entityId, (JSON.parse(e.details) as AuditDetailsMap["submission.approved"]).pointsDelta);
  }
  const approved = mine.filter((s) => s.kind === "drop" && s.status === "approved" && inWindow(s.reviewedAt));
  for (const s of approved) {
    const points = pointsBySubmission.get(s.id) ?? 0;
    yourDrops.push({ text: `Your ${drop(s.id)} was approved${points ? ` (+${points})` : ""}`, link: link(tileOf(s.id).tileId) });
    summary.push(`your ${drop(s.id)} was approved`);
  }
  for (const s of rejected.filter((r) => r.kind === "drop")) yourDrops.push({ text: `Your ${drop(s.id)} was rejected`, link: link(tileOf(s.id).tileId) });
  const stillPending = mine.filter((s) => s.kind === "drop" && s.status === "pending").length;
  if (stillPending > 0) yourDrops.push({ text: `${plural(stillPending, "drop")} still waiting for review`, link: link() });

  // 3. Your Team.
  const yourTeam: CatchUpLine[] = [];
  if (team) {
    const teamEntries = entries.filter((e) => e.teamId === team.id);
    let points = 0;
    for (const e of teamEntries) {
      if (e.action === "points.earned") points += (JSON.parse(e.details) as { points: number }).points;
      if (e.action === "points.lost") points -= (JSON.parse(e.details) as { points: number }).points;
      if (e.action === "points.adjusted") points += (JSON.parse(e.details) as AuditDetailsMap["points.adjusted"]).amount;
    }
    const completed = new Set<string>();
    let biggest: { points: number; userId: string; tileName: string | null } | null = null;
    for (const e of teamEntries.filter((x) => x.action === "submission.approved")) {
      const d = JSON.parse(e.details) as AuditDetailsMap["submission.approved"];
      for (const id of d.newlyCompletedNodeIds) completed.add(id);
      if (d.kind !== "proof" && d.pointsDelta > 0 && (!biggest || d.pointsDelta > biggest.points)) biggest = { points: d.pointsDelta, userId: d.submittedByUserId, tileName: d.tileName };
    }
    const ids = [...completed];
    const doneTiles = ids.length ? db.select({ name: tiles.name }).from(tiles).where(and(eq(tiles.bingoId, bingo.id), inArray(tiles.nodeId, ids))).all() : [];
    const doneLines = ids.length ? db.select().from(bingoLines).where(and(eq(bingoLines.bingoId, bingo.id), inArray(bingoLines.nodeId, ids))).all() : [];
    const doneParts = ids.length
      ? db.select({ id: nodeEdges.childId }).from(nodeEdges).innerJoin(tiles, eq(tiles.nodeId, nodeEdges.parentId)).where(and(eq(tiles.bingoId, bingo.id), inArray(nodeEdges.childId, ids))).all()
      : [];
    if (points) {
      yourTeam.push({ text: `${points > 0 ? "+" : ""}${points} points`, link: link() });
      summary.unshift(`${points > 0 ? "+" : ""}${points} points`);
    }
    if (doneTiles.length) {
      yourTeam.push({ text: `${plural(doneTiles.length, "Tile")} completed: ${doneTiles.map((t) => t.name).join(", ")}`, link: link() });
      summary.splice(points ? 1 : 0, 0, plural(doneTiles.length, "Tile"));
    }
    if (doneParts.length) yourTeam.push({ text: `${plural(doneParts.length, "Part")} completed`, link: link() });
    if (doneLines.length) yourTeam.push({ text: `${plural(doneLines.length, "Line")} closed: ${doneLines.map(lineLabel).join(", ")}`, link: link() });
    if (biggest) {
      const name = biggest.userId === user.id ? "yours" : (rsnsInBingo(db, bingo.id, [biggest.userId]).get(biggest.userId) ?? db.select({ name: users.discordUsername }).from(users).where(eq(users.id, biggest.userId)).get()?.name ?? "a teammate");
      yourTeam.push({ text: `Biggest drop: ${biggest.tileName ? `"${biggest.tileName}" ` : ""}+${biggest.points}, ${name === "yours" ? "yours" : `by ${name}`}`, link: link() });
    }
    if (seesScoreboard && (yourTeam.length > 0 || bingo.stage === "complete")) {
      const all = db.select({ id: teams.id, name: teams.name }).from(teams).where(eq(teams.bingoId, bingo.id)).all();
      const ranked = all.map((t) => ({ ...t, points: getTeamProgress(db, t.id).totalPoints })).sort((a, b) => b.points - a.points);
      const place = ranked.findIndex((t) => t.id === team.id) + 1;
      if (place > 0) yourTeam.push({ text: `${bingo.stage === "complete" ? "Final standing" : "Standing"}: ${ordinal(place)} of ${ranked.length}, ${ranked[place - 1]!.points} points`, link: `/b/${bingo.slug}/stats` });
    }
  }

  // 4. Bingo.
  const bingoLines_: CatchUpLine[] = [];
  for (const s of stageChanges) bingoLines_.push({ text: s.to === "complete" ? "The Bingo has Finished" : `The Bingo moved to ${stageWord(s.to)}`, link: link() });
  if (bingo.stage === "live" && bingo.endsAt && bingo.endsAt.getTime() > now.getTime() && (needsYou.length || yourDrops.length || yourTeam.length || bingoLines_.length)) {
    bingoLines_.push({ text: `${ago(now, bingo.endsAt).replace(/^-/, "")} left until the end`, link: null });
  }

  const sections: CatchUpSection[] = [
    { key: "needs_you" as const, title: "Needs you", lines: needsYou },
    { key: "your_drops" as const, title: "Your drops", lines: yourDrops },
    { key: "your_team" as const, title: "Your Team", lines: yourTeam },
    { key: "bingo" as const, title: "Bingo", lines: bingoLines_ },
  ].filter((s) => s.lines.length > 0);
  // Time left alone isn't news.
  if (sections.length === 0 || (sections.length === 1 && sections[0]!.key === "bingo" && stageChanges.length === 0)) return empty;
  if (summary.length === 0) summary.push(sections[0]!.lines[0]!.text);
  return { enabled, since: from.toISOString(), summary: summary.slice(0, 3).join(", "), sections };
}

function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
}

function stageWord(stage: Bingo["stage"]): string {
  return { planning: "Planning", signup: "Signups", captains: "Signups closed", draft: "the Draft", reveal: "Board revealed", live: "Live", complete: "Finished" }[stage];
}
