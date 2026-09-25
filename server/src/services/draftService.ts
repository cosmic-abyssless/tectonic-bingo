import { now as clockNow } from "../clock";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { playerName, type AnswerViewer, type CutMode, type DraftCutPreview, type DraftShares } from "@bingo/shared";
import { visibleQuestionIds } from "./signupService";
import * as schema from "../db/schema";
import { bingos, draftPicks, pickRatings, signupAnswers, signups, teamMembers, teams, tileInterests, users } from "../db/schema";
import { ServiceError } from "./errors";
import { getAcceptedPairs } from "./pairingService";
import { rsnsInBingo } from "./playerNames";
import { getUserTeamForBingo, isTeamLead } from "./teamService";
import { audit, markAuditedNoop } from "../audit/record";
import { log } from "../log";

type Db = BetterSQLite3Database<typeof schema>;
type Bingo = typeof schema.bingos.$inferSelect;

type MinimalUser = Pick<typeof users.$inferSelect, "id" | "discordUsername" | "discordGlobalName" | "discordGuildNick"> & { rsn?: string | null };
const MINIMAL_USER_COLS = { id: users.id, discordUsername: users.discordUsername, discordGlobalName: users.discordGlobalName, discordGuildNick: users.discordGuildNick };

// Signup/captains scouting is captains + mods only. During draft, signed-up
// players (and anyone already on a team) can watch.
export function canViewDraftRoom(
  stage: Bingo["stage"] | string,
  viewer: { isMod: boolean; isLead: boolean; isOnTeam: boolean; isSignedUp: boolean },
): boolean {
  if (stage === "signup" || stage === "captains") return viewer.isMod || viewer.isLead;
  return viewer.isMod || viewer.isOnTeam || viewer.isSignedUp;
}

export function draftRoomForbiddenMessage(stage: Bingo["stage"] | string): string {
  if (stage === "signup" || stage === "captains") {
    return "Scouting is only visible to captains and mods";
  }
  return "The draft room is only visible to signed-up players and mods";
}

// Snake order: odd rounds go draftOrder ascending, even rounds descending.
// pickNumber is 1-based overall draft position. Pure so it's unit-testable
// without a DB.
export function pickOrderTeamIndex(teamCount: number, pickNumber: number): number {
  const round = Math.ceil(pickNumber / teamCount);
  const posInRound = (pickNumber - 1) % teamCount;
  return round % 2 === 1 ? posInRound : teamCount - 1 - posInRound;
}

function getDraftedUserIds(db: Db, bingoId: string): Set<string> {
  const teamRows = db.select({ id: teams.id }).from(teams).where(eq(teams.bingoId, bingoId)).all();
  const teamIds = teamRows.map((t) => t.id);
  if (teamIds.length === 0) return new Set();
  const memberRows = db.select({ userId: teamMembers.userId }).from(teamMembers).where(inArray(teamMembers.teamId, teamIds)).all();
  return new Set(memberRows.map((m) => m.userId));
}

// In duo mode a pair shares one pickNumber, so the next pick is max + 1
// rather than row count + 1.
function nextPickNumber(db: Db, bingoId: string): number {
  const rows = db.select({ pickNumber: draftPicks.pickNumber }).from(draftPicks).where(eq(draftPicks.bingoId, bingoId)).all();
  return rows.reduce((max, r) => Math.max(max, r.pickNumber), 0) + 1;
}

export interface DraftPoolEntry {
  signup: typeof signups.$inferSelect;
  user: MinimalUser;
  answers: (typeof signupAnswers.$inferSelect)[] | null; // null unless the requester may see answers
}

// What one pick drafts: a solo player, or an accepted duo pair.
export interface DraftUnit {
  pairingId: string | null;
  entries: DraftPoolEntry[];
  cut: boolean; // cut from the draft as things stand — see markCuts
}

const isPair = (unit: DraftUnit) => unit.entries.length > 1;

export const DRAFT_ORDER_REVEAL_MS = 2000;

export function isDraftOrderReady(teamRows: { draftOrder: number | null }[]): boolean {
  if (teamRows.length < 2) return false;
  const orders = teamRows.map((t) => t.draftOrder);
  if (orders.some((o) => o == null)) return false;
  const sorted = [...(orders as number[])].sort((a, b) => a - b);
  return sorted.every((n, i) => n === i + 1);
}

function draftPickCount(db: Db, bingoId: string): number {
  return db.select({ id: draftPicks.id }).from(draftPicks).where(eq(draftPicks.bingoId, bingoId)).all().length;
}

function assertDraftStage(bingo: Bingo): void {
  if (bingo.stage !== "draft") {
    throw new ServiceError(400, `The draft can only be started during the draft stage (current stage: ${bingo.stage})`);
  }
}

function assertNoPicks(db: Db, bingoId: string): void {
  if (draftPickCount(db, bingoId) > 0) {
    throw new ServiceError(400, "Pick order is locked after the first pick");
  }
}

// The pick order can be shuffled or set until the draft is started; from "Start draft" on it is fixed (teams
// have seen it and are waiting their turn), whether or not anyone has picked yet.
function assertOrderEditable(db: Db, bingoId: string): void {
  const fresh = db.select({ draftStarted: bingos.draftStarted }).from(bingos).where(eq(bingos.id, bingoId)).get();
  if (fresh?.draftStarted) throw new ServiceError(400, "The draft has started, so the pick order can't be changed");
  assertNoPicks(db, bingoId);
}

function orderPayload(ordered: { id: string; name: string }[]) {
  return ordered.map((t, i) => ({ teamId: t.id, name: t.name, draftOrder: i + 1 }));
}

export interface DraftState {
  teams: ((typeof teams.$inferSelect) & { captainRsn: string; coCaptain: { userId: string; rsn: string } | null })[]; // sorted by draftOrder once pick order is set
  picks: ((typeof draftPicks.$inferSelect) & { user: MinimalUser; rsn: string })[];
  pool: DraftUnit[];
  draftStarted: boolean;
  orderReady: boolean;
  orderLockedUntil: string | null;
  // takes: what the team on the clock may still draft (see teamTakes).
  currentPick: { pickNumber: number; round: number; teamId: string; takes: { pairs: boolean; singles: boolean } } | null;
  // What every team drafts; null with no cuts or fewer than two teams (see markCuts).
  shares: DraftShares | null;
  // Signups left out of `pool` because they were cut (see hideCut in getDraftState); 0 when they are shown or none were.
  cutCount: number;
}

// Groups undrafted signups into units. Pairs whose other half is missing
// from the pool (withdrawn, or somehow already on a team) fall back to solo.
function groupIntoUnits(db: Db, bingoId: string, entries: DraftPoolEntry[]): DraftUnit[] {
  const byUserId = new Map(entries.map((e) => [e.user.id, e]));
  const units: DraftUnit[] = [];
  for (const { pairing, userIds } of getAcceptedPairs(db, bingoId)) {
    const pair = userIds.map((id) => byUserId.get(id)).filter((e): e is DraftPoolEntry => !!e);
    if (pair.length !== 2) continue;
    units.push({ pairingId: pairing.id, entries: pair, cut: false });
    for (const id of userIds) byUserId.delete(id);
  }
  for (const entry of byUserId.values()) units.push({ pairingId: null, entries: [entry], cut: false });
  return units;
}

// Who's cut so every team drafts the same: pairs and singles are split across the teams separately. With T teams and
// P pairs in all (drafted and not), each team drafts floor(P / T) pairs and the newest P mod T pairs are cut; singles
// the same way, except that "pairs_only" drafts no singles at all (every one is cut). A pair is as new as its later
// signup; a pair whose other half has gone is a single. Drafted picks count, so the answer holds as the draft goes.
// Returns each team's share, or null when nothing is cut: "none", or fewer than two teams (the team count decides it).
//
// createdAt only has 1-second resolution, so signups landing in the same second (bulk test seeding, a rush right
// as signups open) tie there. insertionOrder (true row insertion order — see its caller) breaks the tie, so the
// newest-first sort stays deterministic instead of falling back to whatever order the DB scan happened to return.
export function markCuts(
  units: DraftUnit[],
  cutMode: CutMode,
  teamCount: number,
  drafted: { pairs: number; singles: number },
  insertionOrder: Map<string, number>,
): DraftShares | null {
  if (cutMode === "none" || teamCount < 2) return null;
  const newestFirst = (list: DraftUnit[]) =>
    [...list].sort((a, b) => signedUpAt(b) - signedUpAt(a) || insertionRank(b, insertionOrder) - insertionRank(a, insertionOrder));
  const pairs = units.filter(isPair);
  const singles = units.filter((u) => !isPair(u));
  const shares = {
    pairs: Math.floor((drafted.pairs + pairs.length) / teamCount),
    singles: cutMode === "pairs_only" ? 0 : Math.floor((drafted.singles + singles.length) / teamCount),
  };
  const cutPairs = drafted.pairs + pairs.length - shares.pairs * teamCount;
  const cutSingles = drafted.singles + singles.length - shares.singles * teamCount;
  for (const unit of newestFirst(pairs).slice(0, Math.max(0, cutPairs))) unit.cut = true;
  for (const unit of newestFirst(singles).slice(0, Math.max(0, cutSingles))) unit.cut = true;
  return shares;
}

// What a team may still draft: a pair while it has fewer than its share of pairs, a single likewise. The pool left
// always holds exactly what the teams still need, so the team on the clock always has something to take; if a mid-draft
// change (a new team, a switched mode) ever leaves it with nothing it may take, it takes whatever is left rather than
// stalling the draft.
function teamTakes(shares: DraftShares | null, has: { pairs: number; singles: number }, available: DraftUnit[]): { pairs: boolean; singles: boolean } {
  if (!shares) return { pairs: true, singles: true };
  const takes = { pairs: has.pairs < shares.pairs, singles: has.singles < shares.singles };
  return available.some((u) => (isPair(u) ? takes.pairs : takes.singles)) ? takes : { pairs: true, singles: true };
}

function signedUpAt(unit: DraftUnit): number {
  return Math.max(...unit.entries.map((e) => e.signup.createdAt.getTime()));
}

function insertionRank(unit: DraftUnit, insertionOrder: Map<string, number>): number {
  return Math.max(...unit.entries.map((e) => insertionOrder.get(e.signup.id) ?? -1));
}

// includeAnswers gates signup-answer visibility — only mods and team leads
// should see what a prospective draftee wrote on the signup form — and answerViewer (default "admin") then limits it
// to the questions visible at that level (QuestionVisibility).
//
// hideCut is for the draft room: signups that don't fit a full round in "cut" mode will never be drafted, so once
// signups have closed they are left out of the pool (and counted in cutCount) instead of sitting there greyed out.
// While signups are still open the newest ones are only at risk, and who is cut changes with every new signup, so
// they stay listed. Everything else (the at-risk warnings, pick validation) works on the full pool.
export function getDraftState(db: Db, bingo: Bingo, opts: { includeAnswers: boolean; answerViewer?: AnswerViewer; hideCut?: boolean }): DraftState {
  const bingoId = bingo.id;
  const fresh = db.select().from(bingos).where(eq(bingos.id, bingoId)).get() ?? bingo;
  const teamRows = db.select().from(teams).where(eq(teams.bingoId, bingoId)).all();
  const orderReady = isDraftOrderReady(teamRows);
  const draftStarted = fresh.draftStarted;
  const sortedTeamRows = orderReady ? [...teamRows].sort((a, b) => (a.draftOrder ?? 0) - (b.draftOrder ?? 0)) : teamRows;
  const orderLockedUntil = fresh.draftOrderLockedUntil?.toISOString() ?? null;
  const lockExpired = !fresh.draftOrderLockedUntil || fresh.draftOrderLockedUntil.getTime() <= Date.now();
  const teamIds = teamRows.map((t) => t.id);

  // Captains and co-captains never go through draftPicks (they're assigned
  // pre-draft), so their RSNs have to come from signups directly.
  const coCaptainRows = teamIds.length
    ? db.select({ teamId: teamMembers.teamId, userId: teamMembers.userId }).from(teamMembers).where(and(inArray(teamMembers.teamId, teamIds), eq(teamMembers.isCoCaptain, true))).all()
    : [];
  const coCaptainByTeamId = new Map(coCaptainRows.map((r) => [r.teamId, r.userId]));
  const leadUserIds = [...sortedTeamRows.map((t) => t.captainUserId), ...coCaptainRows.map((r) => r.userId)];
  const leadSignupRows = leadUserIds.length
    ? db.select({ userId: signups.userId, rsn: signups.rsn }).from(signups).where(and(eq(signups.bingoId, bingoId), inArray(signups.userId, leadUserIds))).all()
    : [];
  const leadRsnByUserId = new Map(leadSignupRows.map((s) => [s.userId, s.rsn]));
  const orderedTeams = sortedTeamRows.map((t) => {
    const coCaptainUserId = coCaptainByTeamId.get(t.id);
    return {
      ...t,
      captainRsn: leadRsnByUserId.get(t.captainUserId) ?? "",
      coCaptain: coCaptainUserId ? { userId: coCaptainUserId, rsn: leadRsnByUserId.get(coCaptainUserId) ?? "" } : null,
    };
  });

  const pickRows = db.select().from(draftPicks).where(eq(draftPicks.bingoId, bingoId)).orderBy(draftPicks.pickNumber, draftPicks.createdAt).all();
  const pickedUserIds = pickRows.map((p) => p.userId);
  const pickedUserRows = pickedUserIds.length ? db.select(MINIMAL_USER_COLS).from(users).where(inArray(users.id, pickedUserIds)).all() : [];
  const pickedUserById = new Map(pickedUserRows.map((u) => [u.id, u]));
  const pickedSignupRows = pickedUserIds.length
    ? db.select({ userId: signups.userId, rsn: signups.rsn }).from(signups).where(and(eq(signups.bingoId, bingoId), inArray(signups.userId, pickedUserIds))).all()
    : [];
  const pickedRsnByUserId = new Map(pickedSignupRows.map((s) => [s.userId, s.rsn]));
  const picks = pickRows.map((p) => ({ ...p, user: { ...pickedUserById.get(p.userId)!, rsn: pickedRsnByUserId.get(p.userId) ?? null }, rsn: pickedRsnByUserId.get(p.userId) ?? "" }));

  const draftedUserIds = getDraftedUserIds(db, bingoId);
  // rowid order is true insertion order — see markCuts, which uses it to break createdAt ties.
  const activeSignups = db.select().from(signups).where(and(eq(signups.bingoId, bingoId), eq(signups.status, "active"))).orderBy(sql`rowid`).all();
  const insertionOrder = new Map(activeSignups.map((s, i) => [s.id, i]));
  const poolSignups = activeSignups.filter((s) => !draftedUserIds.has(s.userId));
  const poolUserIds = poolSignups.map((s) => s.userId);
  const poolUserRows = poolUserIds.length ? db.select(MINIMAL_USER_COLS).from(users).where(inArray(users.id, poolUserIds)).all() : [];
  const poolUserById = new Map(poolUserRows.map((u) => [u.id, u]));
  const poolAnswers =
    opts.includeAnswers && poolSignups.length
      ? db.select().from(signupAnswers).where(inArray(signupAnswers.signupId, poolSignups.map((s) => s.id))).all()
      : [];

  const visibleQuestions = opts.includeAnswers ? visibleQuestionIds(db, bingo.id, opts.answerViewer ?? "admin") : new Set<string>();
  const poolEntries: DraftPoolEntry[] = poolSignups.map((s) => ({
    // Timezone follows the answers' visibility rule (it replaced a custom question that did).
    signup: opts.includeAnswers ? s : { ...s, timezone: null },
    user: { ...poolUserById.get(s.userId)!, rsn: s.rsn },
    answers: opts.includeAnswers ? poolAnswers.filter((a) => a.signupId === s.id && visibleQuestions.has(a.questionId)) : null,
  }));
  const fullPool = groupIntoUnits(db, bingoId, poolEntries);
  // Each pick is a pair (two rows under one pick number) or a single; what's been drafted, overall and per team.
  const pickSizes = new Map<number, { teamId: string; size: number }>();
  for (const p of pickRows) pickSizes.set(p.pickNumber, { teamId: p.teamId, size: (pickSizes.get(p.pickNumber)?.size ?? 0) + 1 });
  const drafted = { pairs: 0, singles: 0 };
  const draftedByTeam = new Map<string, { pairs: number; singles: number }>();
  for (const { teamId, size } of pickSizes.values()) {
    const team = draftedByTeam.get(teamId) ?? { pairs: 0, singles: 0 };
    const kind = size > 1 ? "pairs" : "singles";
    drafted[kind]++;
    team[kind]++;
    draftedByTeam.set(teamId, team);
  }
  const shares = markCuts(fullPool, fresh.cutMode, orderedTeams.length, drafted, insertionOrder);
  const hideCut = !!opts.hideCut && fresh.cutMode !== "none" && fresh.stage !== "signup";
  const pool = hideCut ? fullPool.filter((u) => !u.cut) : fullPool;
  const cutCount = hideCut ? fullPool.filter((u) => u.cut).reduce((n, u) => n + u.entries.length, 0) : 0;

  let currentPick: DraftState["currentPick"] = null;
  const available = fullPool.filter((u) => !u.cut);
  if (draftStarted && orderReady && lockExpired && available.length > 0) {
    const pickNumber = nextPickNumber(db, bingoId);
    const round = Math.ceil(pickNumber / orderedTeams.length);
    const teamId = orderedTeams[pickOrderTeamIndex(orderedTeams.length, pickNumber)]!.id;
    currentPick = { pickNumber, round, teamId, takes: teamTakes(shares, draftedByTeam.get(teamId) ?? { pairs: 0, singles: 0 }, available) };
  }

  return { teams: orderedTeams, picks, pool, draftStarted, orderReady, orderLockedUntil, currentPick, shares, cutCount };
}

// User ids of undrafted signups cut from the draft as things stand. Used by the roster and the signup page.
export function getCutUserIds(db: Db, bingo: Bingo): Set<string> {
  const { pool } = getDraftState(db, bingo, { includeAnswers: false });
  return new Set(pool.filter((u) => u.cut).flatMap((u) => u.entries.map((e) => e.user.id)));
}

// Who's cut as things stand, and what every team drafts: the confirmation before moving into the draft stage.
export function getCutPreview(db: Db, bingo: Bingo): DraftCutPreview {
  const { pool, shares, teams: teamRows } = getDraftState(db, bingo, { includeAnswers: false });
  const fresh = db.select({ cutMode: bingos.cutMode }).from(bingos).where(eq(bingos.id, bingo.id)).get() ?? bingo;
  const cut = pool
    .filter((u) => u.cut)
    .sort((a, b) => signedUpAt(b) - signedUpAt(a))
    .map((u) => ({ names: u.entries.map((e) => e.signup.rsn), pair: isPair(u) }));
  return { cutMode: fresh.cutMode, teamCount: teamRows.length, shares, cut };
}

function shuffled<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

export function shuffleDraftOrder(db: Db, bingo: Bingo) {
  assertDraftStage(bingo);
  const result = db.transaction((tx) => {
    assertOrderEditable(tx, bingo.id);
    const teamRows = tx.select().from(teams).where(eq(teams.bingoId, bingo.id)).all();
    if (teamRows.length < 2) throw new ServiceError(400, "At least 2 teams are required to set pick order");
    const ordered = shuffled(teamRows);
    ordered.forEach((team, i) => {
      tx.update(teams).set({ draftOrder: i + 1 }).where(eq(teams.id, team.id)).run();
    });
    const lockedUntil = new Date(Date.now() + DRAFT_ORDER_REVEAL_MS);
    tx.update(bingos).set({ draftOrderLockedUntil: lockedUntil }).where(eq(bingos.id, bingo.id)).run();
    audit(tx, {
      action: "draft.order_shuffled",
      bingoId: bingo.id,
      entity: { type: "bingo", id: bingo.id, label: bingo.name },
      details: { order: orderPayload(ordered) },
    });
    return { teams: tx.select().from(teams).where(eq(teams.bingoId, bingo.id)).all(), lockedUntil };
  });
  log.info("draft order shuffled", { bingoId: bingo.id, teamCount: result.teams.length, lockedUntil: result.lockedUntil.toISOString() });
  return result;
}

export function setDraftOrder(db: Db, bingo: Bingo, teamIds: string[]) {
  assertDraftStage(bingo);
  const teamsOut = db.transaction((tx) => {
    assertOrderEditable(tx, bingo.id);
    const teamRows = tx.select().from(teams).where(eq(teams.bingoId, bingo.id)).all();
    if (teamRows.length < 2) throw new ServiceError(400, "At least 2 teams are required to set pick order");
    if (!Array.isArray(teamIds) || teamIds.length !== teamRows.length) {
      throw new ServiceError(400, "teamIds must list every team exactly once");
    }
    const currentIds = new Set(teamRows.map((t) => t.id));
    if (new Set(teamIds).size !== teamIds.length || teamIds.some((id) => !currentIds.has(id))) {
      throw new ServiceError(400, "teamIds must list every team exactly once");
    }
    const byId = new Map(teamRows.map((t) => [t.id, t]));
    const ordered = teamIds.map((id) => byId.get(id)!);
    ordered.forEach((team, i) => {
      tx.update(teams).set({ draftOrder: i + 1 }).where(eq(teams.id, team.id)).run();
    });
    tx.update(bingos).set({ draftOrderLockedUntil: null }).where(eq(bingos.id, bingo.id)).run();
    audit(tx, {
      action: "draft.order_set",
      bingoId: bingo.id,
      entity: { type: "bingo", id: bingo.id, label: bingo.name },
      details: { order: orderPayload(ordered) },
    });
    return tx.select().from(teams).where(eq(teams.bingoId, bingo.id)).all();
  });
  log.info("draft order set", { bingoId: bingo.id, teamCount: teamsOut.length });
  return teamsOut;
}

export function startDraft(db: Db, bingo: Bingo) {
  assertDraftStage(bingo);
  const teamsOut = db.transaction((tx) => {
    const fresh = tx.select().from(bingos).where(eq(bingos.id, bingo.id)).get()!;
    if (fresh.draftStarted) throw new ServiceError(400, "The draft has already started");
    const teamRows = tx.select().from(teams).where(eq(teams.bingoId, bingo.id)).all();
    if (!isDraftOrderReady(teamRows)) {
      throw new ServiceError(400, "Set pick order before starting the draft");
    }
    assertNoPicks(tx, bingo.id);
    const ordered = [...teamRows].sort((a, b) => (a.draftOrder ?? 0) - (b.draftOrder ?? 0));
    tx.update(bingos).set({ draftStarted: true }).where(eq(bingos.id, bingo.id)).run();
    audit(tx, {
      action: "draft.started",
      bingoId: bingo.id,
      entity: { type: "bingo", id: bingo.id, label: bingo.name },
      details: { order: orderPayload(ordered) },
    });
    return tx.select().from(teams).where(eq(teams.bingoId, bingo.id)).all();
  });
  log.info("draft started", { bingoId: bingo.id, teamCount: teamsOut.length });
  return teamsOut;
}

// Players are named by their RSN within a bingo, falling back to their Discord name.
function displayNamesFor(db: Db, bingoId: string, userIds: string[]): string[] {
  const userRows = db.select(MINIMAL_USER_COLS).from(users).where(inArray(users.id, userIds)).all();
  const rsns = rsnsInBingo(db, bingoId, userIds);
  const displayNameById = new Map(userRows.map((u) => [u.id, playerName({ ...u, rsn: rsns.get(u.id) })]));
  return userIds.map((id) => displayNameById.get(id) ?? "Unknown");
}

export interface MakePickParams {
  bingo: Bingo;
  pickedUserId: string;
  actingUserId: string;
  actingIsAdmin: boolean;
}

// A lead (captain or co-captain) of the team currently on the clock picks a
// signed-up player out of the undrafted pool. In duo mode, picking either
// half of a pair drafts both onto the team under one pick number. Site
// admins can pick on behalf of whichever team is currently on the clock
// (they don't get to jump the queue either) — a regular per-bingo mod who
// isn't also a site admin does not get this override.
export function makePick(db: Db, params: MakePickParams) {
  const { bingo, pickedUserId, actingUserId, actingIsAdmin } = params;
  if (bingo.stage !== "draft") {
    throw new ServiceError(400, `Picks can only be made during the draft stage (current stage: ${bingo.stage})`);
  }

  return db.transaction((tx) => {
    const fresh = tx.select().from(bingos).where(eq(bingos.id, bingo.id)).get()!;
    if (!fresh.draftStarted) {
      throw new ServiceError(400, "The draft hasn't started yet");
    }
    const teamRows = tx.select().from(teams).where(eq(teams.bingoId, bingo.id)).all();
    if (!isDraftOrderReady(teamRows)) {
      throw new ServiceError(400, "The draft hasn't started yet");
    }
    if (fresh.draftOrderLockedUntil && fresh.draftOrderLockedUntil.getTime() > Date.now()) {
      throw new ServiceError(400, "Pick order is still being revealed");
    }
    const orderedTeams = [...teamRows].sort((a, b) => (a.draftOrder ?? 0) - (b.draftOrder ?? 0));

    const pickNumber = nextPickNumber(tx, bingo.id);
    const currentTeam = orderedTeams[pickOrderTeamIndex(orderedTeams.length, pickNumber)]!;

    const isLead = isTeamLead(tx, currentTeam.id, actingUserId);
    if (!actingIsAdmin && !isLead) {
      throw new ServiceError(403, "It's not your team's turn to pick");
    }

    const pair = getAcceptedPairs(tx, bingo.id).find((p) => p.userIds.includes(pickedUserId));
    const userIds = pair ? pair.userIds : [pickedUserId];

    const teamIds = teamRows.map((t) => t.id);
    for (const userId of userIds) {
      const signup = tx
        .select({ id: signups.id })
        .from(signups)
        .where(and(eq(signups.bingoId, bingo.id), eq(signups.userId, userId), eq(signups.status, "active")))
        .get();
      if (!signup) throw new ServiceError(400, "That player isn't signed up for this bingo");

      const alreadyDrafted = tx.select({ id: teamMembers.id }).from(teamMembers).where(and(inArray(teamMembers.teamId, teamIds), eq(teamMembers.userId, userId))).get();
      if (alreadyDrafted) throw new ServiceError(400, "That player has already been drafted");
    }

    // Cut signups are never drafted, and a team only takes a pair (or a single) while it's short of its share.
    const state = getDraftState(tx, bingo, { includeAnswers: false });
    const unit = state.pool.find((u) => u.entries.some((e) => e.user.id === pickedUserId));
    if (!unit || unit.cut) {
      const pairsOnly = !!unit && !isPair(unit) && bingo.cutMode === "pairs_only";
      throw new ServiceError(400, pairsOnly ? "Singles aren't drafted in this bingo (pairs only)" : "That signup is cut from the draft: they don't split evenly across the teams");
    }
    const takes = state.currentPick?.takes ?? { pairs: true, singles: true };
    if (state.shares && (isPair(unit) ? !takes.pairs : !takes.singles)) {
      const count = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;
      const { pairs, singles } = state.shares;
      throw new ServiceError(
        400,
        `${currentTeam.name} already has its ${isPair(unit) ? count(pairs, "pair") : count(singles, "single")}: every team drafts ${count(pairs, "pair")} and ${count(singles, "single")}`,
      );
    }

    const picks = userIds.map((userId) =>
      tx.insert(draftPicks).values({ bingoId: bingo.id, pickNumber, teamId: currentTeam.id, userId, pickedByUserId: actingUserId, createdAt: clockNow() }).returning().get(),
    );
    for (const userId of userIds) tx.insert(teamMembers).values({ teamId: currentTeam.id, userId, isCaptain: false, joinedAt: clockNow() }).run();

    const displayNames = displayNamesFor(tx, bingo.id, userIds);
    audit(tx, {
      action: "draft.pick",
      bingoId: bingo.id,
      entity: { type: "user", id: pickedUserId, label: displayNames.join(" & ") },
      teamId: currentTeam.id,
      details: { pickNumber, userIds, displayNames, pair: !!pair },
      onBehalfOfUserId: actingIsAdmin && !isLead ? currentTeam.captainUserId : null,
    });
    return picks;
  });
}

export interface UndoPickParams {
  bingo: Bingo;
  actingUserId: string;
  actingIsAdmin: boolean;
}

// Takes back the most recent pick (both players of a duo pair): they leave the team and go back into the pool, and
// that team is on the clock again. Only the latest pick can be undone, so the snake order for everyone else never shifts.
// Site admins only, and only while the bingo is still in the draft stage.
export function undoLastPick(db: Db, params: UndoPickParams) {
  const { bingo, actingUserId, actingIsAdmin } = params;
  if (!actingIsAdmin) throw new ServiceError(403, "Only site admins can undo a pick");
  if (bingo.stage !== "draft") {
    throw new ServiceError(400, `Picks can only be undone during the draft stage (current stage: ${bingo.stage})`);
  }

  return db.transaction((tx) => {
    const rows = tx.select().from(draftPicks).where(eq(draftPicks.bingoId, bingo.id)).all();
    if (rows.length === 0) throw new ServiceError(400, "There are no picks to undo");
    const pickNumber = rows.reduce((max, r) => Math.max(max, r.pickNumber), 0);
    const undone = rows.filter((r) => r.pickNumber === pickNumber);
    const teamId = undone[0]!.teamId;
    const userIds = undone.map((r) => r.userId);

    const displayNames = displayNamesFor(tx, bingo.id, userIds);
    for (const userId of userIds) {
      tx.delete(tileInterests).where(and(eq(tileInterests.teamId, teamId), eq(tileInterests.userId, userId))).run();
      tx.delete(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId))).run();
    }
    tx.delete(draftPicks).where(inArray(draftPicks.id, undone.map((r) => r.id))).run();

    audit(tx, {
      action: "draft.pick_undone",
      bingoId: bingo.id,
      entity: { type: "user", id: userIds[0]!, label: displayNames.join(" & ") },
      teamId,
      details: { pickNumber, userIds, displayNames, pair: userIds.length > 1 },
      onBehalfOfUserId: null,
    });
    log.info("draft pick undone", { bingoId: bingo.id, pickNumber, teamId, actingUserId });
    return { pickNumber, teamId, userIds };
  });
}

// ---------------------------------------------------------------------------
// Pick ratings — a team's private scouting notes on signups.
// ---------------------------------------------------------------------------

export interface PickRating {
  stars: number; // 1-3
  note: string;
}

export const MAX_RATING_STARS = 3;

// The ratings (stars and notes) a user gets to see: their team's, only if they lead it (the captain or the
// co-captain). Never the team's drafted players, and never a mod who doesn't lead a team: they're the leads' private
// opinions about players, some of whom end up on that very team.
export function ratingsForViewer(db: Db, bingoId: string, userId: string): Record<string, PickRating> {
  const team = getUserTeamForBingo(db, bingoId, userId);
  return team && isTeamLead(db, team.id, userId) ? getTeamRatings(db, team.id) : {};
}

export function getTeamRatings(db: Db, teamId: string): Record<string, PickRating> {
  const rows = db.select({ signupId: pickRatings.signupId, stars: pickRatings.stars, note: pickRatings.note }).from(pickRatings).where(eq(pickRatings.teamId, teamId)).all();
  return Object.fromEntries(rows.map((r) => [r.signupId, { stars: r.stars, note: r.note }]));
}

// Stars 0 clears the rating. Only leads of the team may write; the route
// resolves the caller's team before calling this. Duo pairs are drafted as
// one unit, so a rating on either partner is written to both signups.
export function setPickRating(db: Db, teamId: string, signupId: string, rating: PickRating): void {
  if (!Number.isInteger(rating.stars) || rating.stars < 0 || rating.stars > MAX_RATING_STARS) {
    throw new ServiceError(400, `Stars must be a whole number from 0 to ${MAX_RATING_STARS}`);
  }
  const note = rating.note.trim().slice(0, 200);
  db.transaction((tx) => {
    const signup = tx.select({ id: signups.id, bingoId: signups.bingoId, userId: signups.userId, rsn: signups.rsn }).from(signups).where(eq(signups.id, signupId)).get();
    const team = tx.select({ bingoId: teams.bingoId }).from(teams).where(eq(teams.id, teamId)).get();
    if (!signup || !team || signup.bingoId !== team.bingoId) throw new ServiceError(404, "Signup not found");

    const pair = getAcceptedPairs(tx, team.bingoId).find((p) => p.userIds.includes(signup.userId));
    const partnerUserId = pair?.userIds.find((id) => id !== signup.userId);
    const partner = partnerUserId
      ? tx
          .select({ id: signups.id, rsn: signups.rsn })
          .from(signups)
          .where(and(eq(signups.bingoId, team.bingoId), eq(signups.userId, partnerUserId), eq(signups.status, "active")))
          .get()
      : undefined;
    const rated = partner ? [signup, partner] : [signup];
    const signupIds = rated.map((s) => s.id);
    const names = rated.map((s) => s.rsn);
    const label = names.join(" & ");

    // What the save changes: the stars, the note, or both (the table saves them separately). Nothing: no write, no entry.
    const before = tx
      .select({ stars: pickRatings.stars, note: pickRatings.note })
      .from(pickRatings)
      .where(and(eq(pickRatings.teamId, teamId), inArray(pickRatings.signupId, signupIds)))
      .get() ?? { stars: 0, note: "" };
    const starsChanged = rating.stars !== before.stars;
    const noteChanged = note !== before.note;
    if (!starsChanged && !noteChanged) {
      markAuditedNoop();
      return;
    }

    if (rating.stars === 0 && !note) {
      tx.delete(pickRatings).where(and(eq(pickRatings.teamId, teamId), inArray(pickRatings.signupId, signupIds))).run();
    } else {
      tx.insert(pickRatings)
        .values(signupIds.map((id) => ({ teamId, signupId: id, stars: rating.stars, note })))
        .onConflictDoUpdate({ target: [pickRatings.teamId, pickRatings.signupId], set: { stars: rating.stars, note, updatedAt: clockNow() } })
        .run();
    }
    // Ratings and notes are the leads' private opinions, so each entry stays team-scoped rather than joining the
    // mod-visible signup history, and says only that the stars or the note changed, never to what.
    if (starsChanged) {
      audit(tx, {
        action: "draft.rating_set",
        bingoId: team.bingoId,
        teamId,
        entity: { type: "signup", id: signupId, label },
        details: { rsn: label, names, hasRating: rating.stars > 0, cleared: rating.stars === 0 },
      });
    }
    if (noteChanged) {
      audit(tx, {
        action: "draft.note_set",
        bingoId: team.bingoId,
        teamId,
        entity: { type: "signup", id: signupId, label },
        details: { rsn: label, names, hasNote: note.length > 0, cleared: note.length === 0 },
      });
    }
  });
}
