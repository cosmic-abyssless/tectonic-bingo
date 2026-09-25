import { now as clockNow } from "../clock";
import { and, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { playerName, SUBMISSION_REACTION_NAMES, SUBMISSION_REACTIONS, type ClaimInput, type NodeKind, type SubmissionReaction, type SubmissionReactionGroup, type ValuedAs } from "@bingo/shared";
import * as schema from "../db/schema";
import { claims, nodes, submissionReactions, submissions, submissionScreenshots, teamMembers, teamNodeState, teams, tiles, users } from "../db/schema";
import { ServiceError } from "./errors";
import { findAncestorIds, submitGateBlock } from "./graphService";
import { conflictMessage, conflictsForClaims } from "./exclusivityService";
import { effectiveStartsAt } from "./bingoStart";
import { rsnsAcrossBingos } from "./playerNames";
import { audit, markAuditedNoop } from "../audit/record";
import { pricer, valuedAsOf } from "./gpValueService";

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Bingo = typeof schema.bingos.$inferSelect;

// Which tile (if any) a leaf belongs to, found by walking edges upward from
// the leaf until an ancestor matches a tile's root node. Exported for
// audit/record's submission.approved/rejected labeling (scoringService.ts).
export function tileForLeaf(db: Db | Tx, leafId: string, tileByNodeId: Map<string, typeof tiles.$inferSelect>): typeof tiles.$inferSelect | null {
  const ancestors = findAncestorIds(db, leafId);
  for (const nodeId of ancestors) {
    const tile = tileByNodeId.get(nodeId);
    if (tile) return tile;
  }
  return null;
}

export interface CreateSubmissionParams {
  teamId: string;
  /** The player the drop belongs to: credited for it. */
  submittedByUserId: string;
  /** Who uploaded it, when that isn't the same player (see submissionTarget.ts). */
  postedByUserId?: string | null;
  claims: ClaimInput[];
  screenshotUrl: string;
  now?: Date; // injectable for tests
}

// All submission-time gating lives here — the client mirrors these checks
// for UX, but this is the enforcement.
export function createSubmission(db: Db, bingo: Bingo, params: CreateSubmissionParams) {
  return db.transaction((tx) => {
    const now = params.now ?? clockNow();

    if (bingo.stage !== "live") {
      throw new ServiceError(400, "Submissions are only open while the bingo is live");
    }
    const startsAt = effectiveStartsAt(tx, bingo);
    if (!startsAt || now < startsAt) {
      throw new ServiceError(400, "The bingo has not started yet");
    }
    if (params.claims.length === 0) throw new ServiceError(400, "At least one claim is required");

    const nodeIds = [...new Set(params.claims.map((c) => c.nodeId))];
    if (nodeIds.length !== params.claims.length) {
      throw new ServiceError(400, "A submission may not claim the same requirement twice — combine into one claim with a quantity");
    }
    const leaves = tx.select().from(nodes).where(inArray(nodes.id, nodeIds)).all();
    if (leaves.length !== nodeIds.length || leaves.some((n) => n.kind !== "ITEM" && n.kind !== "MANUAL")) {
      throw new ServiceError(400, "Claims must target requirement leaves");
    }
    const leafById = new Map(leaves.map((n) => [n.id, n]));

    // Launch scope: one submission covers one tile. Drop this to allow
    // cross-tile claims.
    const tileRows = tx.select().from(tiles).where(eq(tiles.bingoId, bingo.id)).all();
    const tileByNodeId = new Map(tileRows.map((t) => [t.nodeId, t]));
    const tilesTouched = new Set(nodeIds.map((id) => tileForLeaf(tx, id, tileByNodeId)?.id ?? null));
    if (tilesTouched.size !== 1 || tilesTouched.has(null)) {
      throw new ServiceError(400, "All claims in a submission must belong to the same tile");
    }
    const tile = tileRows.find((t) => t.id === [...tilesTouched][0])!;

    if (tile.hasFreezePeriod) {
      const unlockAt = new Date(startsAt.getTime() + tile.freezeDurationMinutes * 60_000);
      if (now < unlockAt) {
        throw new ServiceError(400, `This tile is frozen until ${unlockAt.toISOString()}`);
      }
    }

    // submitGateNodeId: a claim is refused while every route from its item up to the tile passes through a
    // node whose gate this team hasn't completed (see graphService.submitGateBlock: an item shared by two
    // pages counts toward both, so an ungated page keeps it submittable).
    const completedNodeIds = new Set(
      tx.select({ nodeId: teamNodeState.nodeId }).from(teamNodeState).where(eq(teamNodeState.teamId, params.teamId)).all().map((r) => r.nodeId),
    );
    for (const leafId of nodeIds) {
      const blockedBy = submitGateBlock(tx, leafId, completedNodeIds);
      if (blockedBy !== null) throw new ServiceError(400, `${blockedBy}: the previous requirement must be completed first`);
    }

    // Exclusive items: an item the team already has claimed (pending or approved) in another place.
    const [exclusive] = conflictsForClaims(tx, bingo, params.teamId, nodeIds);
    if (exclusive) throw new ServiceError(400, conflictMessage(exclusive));

    for (const claim of params.claims) {
      const leaf = leafById.get(claim.nodeId)!;
      if (leaf.kind !== "ITEM") continue;
      if (!claim.itemName) throw new ServiceError(400, "itemName is required for item claims");
      if (claim.itemName.toLowerCase() !== (leaf.itemName ?? "").toLowerCase()) {
        throw new ServiceError(400, `itemName does not match this requirement (expected "${leaf.itemName}")`);
      }
    }

    const postedByUserId = params.postedByUserId && params.postedByUserId !== params.submittedByUserId ? params.postedByUserId : null;
    const submission = tx
      .insert(submissions)
      .values({ teamId: params.teamId, submittedByUserId: params.submittedByUserId, postedByUserId, submittedAt: now, createdAt: now, updatedAt: now })
      .returning()
      .get();

    tx.insert(submissionScreenshots).values({ submissionId: submission.id, storageUrl: params.screenshotUrl, uploadedAt: now }).run();

    // GP values from the in-memory price table, so this never waits on the wiki; any it can't price yet are filled
    // in after a refresh (gpValueService.refreshPricesAndFill, run by the route after responding).
    const price = pricer(tx);
    for (const claim of params.claims) {
      const itemName = claim.itemName ?? null;
      const quantity = claim.quantity ?? 1;
      const gpValue = price.gpValue(itemName, quantity, valuedAsOf(leafById.get(claim.nodeId)!));
      tx.insert(claims).values({ submissionId: submission.id, nodeId: claim.nodeId, itemName, quantity, gpValue }).run();
    }

    const taskLabels = nodeIds.map((id) => leafById.get(id)?.label).filter((l): l is string => !!l);
    audit(tx, {
      action: "submission.created",
      bingoId: bingo.id,
      entity: { type: "submission", id: submission.id, label: tile.name },
      teamId: params.teamId,
      details: {
        tileId: tile.id,
        tileName: tile.name,
        taskLabels,
        claims: params.claims.map((c) => ({ nodeId: c.nodeId, itemName: c.itemName ?? null, quantity: c.quantity ?? 1 })),
        screenshotUrl: params.screenshotUrl,
      },
      // Whoever actually posted it is the actor; the player it belongs to is who they acted on behalf of.
      actor: { userId: postedByUserId ?? params.submittedByUserId },
      onBehalfOfUserId: postedByUserId ? params.submittedByUserId : null,
    });

    return submission;
  });
}

// Runs after createSubmission, once OCR finishes — see routes/bingos.ts.
// Best-effort: mods can still review without it, so a failure just leaves
// scrapeStatus "failed" rather than the submission itself.
// bingoId/teamId aren't known to the caller (routes/bingos.ts fires this
// after res.json(), outside the request's own submission-creation lookups),
// so they're re-resolved here from the submission row.
function teamAndBingoForSubmission(db: Db, submissionId: string): { teamId: string | null; bingoId: string | null } {
  const submission = db.select({ teamId: submissions.teamId }).from(submissions).where(eq(submissions.id, submissionId)).get();
  if (!submission) return { teamId: null, bingoId: null };
  const team = db.select({ bingoId: teams.bingoId }).from(teams).where(eq(teams.id, submission.teamId)).get();
  return { teamId: submission.teamId, bingoId: team?.bingoId ?? null };
}

export function recordScreenshotAnalysis(
  db: Db,
  submissionId: string,
  result: { extractedText: string[]; codewordFound: boolean; detectedItemName: string | null },
) {
  db.update(submissionScreenshots)
    .set({
      extractedText: result.extractedText.join("\n"),
      codewordVerified: result.codewordFound,
      detectedItemName: result.detectedItemName,
      scrapeStatus: "completed",
      scrapedAt: clockNow(),
    })
    .where(eq(submissionScreenshots.submissionId, submissionId))
    .run();

  const { teamId, bingoId } = teamAndBingoForSubmission(db, submissionId);
  audit(db, {
    action: "submission.screenshot_analyzed",
    bingoId,
    entity: { type: "submission", id: submissionId },
    teamId,
    details: { codewordVerified: result.codewordFound, detectedItemName: result.detectedItemName, textLength: result.extractedText.join("\n").length },
    actor: "system",
  });
}

export function markScreenshotAnalysisFailed(db: Db, submissionId: string) {
  db.update(submissionScreenshots).set({ scrapeStatus: "failed" }).where(eq(submissionScreenshots.submissionId, submissionId)).run();

  const { teamId, bingoId } = teamAndBingoForSubmission(db, submissionId);
  audit(db, {
    action: "submission.screenshot_analysis_failed",
    bingoId,
    entity: { type: "submission", id: submissionId },
    teamId,
    details: {},
    actor: "system",
  });
}

export type MinimalUser = Pick<typeof users.$inferSelect, "id" | "discordUsername" | "discordGlobalName" | "discordGuildNick"> & { rsn?: string | null };

export interface ClaimRow {
  id: string;
  submissionId: string;
  nodeId: string;
  itemName: string | null;
  quantity: number;
  gpValue: number | null;
}

export interface SubmissionDetails {
  submission: typeof submissions.$inferSelect;
  screenshots: (typeof submissionScreenshots.$inferSelect)[];
  claims: ClaimRow[];
  submittedByUser: MinimalUser | null;
  postedByUser: MinimalUser | null;
  reactions: SubmissionReactionGroup[];
}

// Attaches screenshots, claims, and the submitter's (minimal) user row to a
// set of submissions — every submission list the client renders needs all
// three to be reviewable/displayable.
function attachDetails(db: Db, subs: (typeof submissions.$inferSelect)[]): SubmissionDetails[] {
  if (subs.length === 0) return [];
  const submissionIds = subs.map((s) => s.id);
  const screenshots = db.select().from(submissionScreenshots).where(inArray(submissionScreenshots.submissionId, submissionIds)).all();
  const claimRows = db.select().from(claims).where(inArray(claims.submissionId, submissionIds)).all();
  const reactionRows = db.select().from(submissionReactions).where(inArray(submissionReactions.submissionId, submissionIds)).orderBy(submissionReactions.createdAt).all();
  const userIds = [
    ...new Set([...subs.flatMap((s) => (s.postedByUserId ? [s.submittedByUserId, s.postedByUserId] : [s.submittedByUserId])), ...reactionRows.map((r) => r.userId)]),
  ];
  const userRows = db
    .select({ id: users.id, discordUsername: users.discordUsername, discordGlobalName: users.discordGlobalName, discordGuildNick: users.discordGuildNick })
    .from(users)
    .where(inArray(users.id, userIds))
    .all();
  const userById = new Map(userRows.map((u) => [u.id, u]));
  // Named by the RSN they signed up with in the submission's bingo.
  const bingoByTeam = new Map(db.select({ id: teams.id, bingoId: teams.bingoId }).from(teams).where(inArray(teams.id, [...new Set(subs.map((s) => s.teamId))])).all().map((t) => [t.id, t.bingoId]));
  const rsns = rsnsAcrossBingos(db, subs.flatMap((s) => userIds.map((userId) => ({ bingoId: bingoByTeam.get(s.teamId) ?? null, userId }))));
  const userFor = (s: (typeof subs)[number], userId: string | null): MinimalUser | null => {
    const user = userId ? userById.get(userId) : undefined;
    return user ? { ...user, rsn: rsns.get(`${bingoByTeam.get(s.teamId)}|${user.id}`) ?? null } : null;
  };

  return subs.map((s) => ({
    submission: s,
    screenshots: screenshots.filter((sc) => sc.submissionId === s.id),
    claims: claimRows.filter((c) => c.submissionId === s.id),
    submittedByUser: userFor(s, s.submittedByUserId),
    postedByUser: userFor(s, s.postedByUserId),
    reactions: groupReactions(reactionRows.filter((r) => r.submissionId === s.id).map((r) => ({ emoji: r.emoji, user: userFor(s, r.userId) }))),
  }));
}

// A submission's reactions, one group per emoji in SUBMISSION_REACTIONS order, each with its reactors oldest first.
function groupReactions(rows: { emoji: string; user: MinimalUser | null }[]): SubmissionReactionGroup[] {
  return SUBMISSION_REACTIONS.map((emoji) => ({ emoji, users: rows.filter((r) => r.emoji === emoji && r.user).map((r) => r.user!) })).filter((g) => g.users.length > 0);
}

export function isSubmissionReaction(value: unknown): value is SubmissionReaction {
  return (SUBMISSION_REACTIONS as readonly unknown[]).includes(value);
}

/**
 * Puts one of a player's reactions on a submission, or takes it off. Only the submission's own team reacts. Audited for
 * the team (their activity feed), naming the reaction in words and whose submission for which tile. Returns the
 * submission's team, for the broadcast.
 */
export function setSubmissionReaction(db: Db, submissionId: string, userId: string, emoji: SubmissionReaction, reacted: boolean): { teamId: string } {
  return db.transaction((tx) => {
    const submission = tx.select({ teamId: submissions.teamId, submittedByUserId: submissions.submittedByUserId }).from(submissions).where(eq(submissions.id, submissionId)).get();
    if (!submission) throw new ServiceError(404, "Submission not found");
    const member = tx.select({ id: teamMembers.id }).from(teamMembers).where(and(eq(teamMembers.teamId, submission.teamId), eq(teamMembers.userId, userId))).get();
    if (!member) throw new ServiceError(403, "Only the submission's team can react to it");
    const where = and(eq(submissionReactions.submissionId, submissionId), eq(submissionReactions.userId, userId), eq(submissionReactions.emoji, emoji));
    const existing = tx.select({ id: submissionReactions.id }).from(submissionReactions).where(where).get();
    if (reacted === !!existing) {
      markAuditedNoop();
      return { teamId: submission.teamId };
    }
    if (reacted) tx.insert(submissionReactions).values({ submissionId, userId, emoji, createdAt: clockNow() }).run();
    else tx.delete(submissionReactions).where(where).run();

    const bingoId = tx.select({ bingoId: teams.bingoId }).from(teams).where(eq(teams.id, submission.teamId)).get()!.bingoId;
    const claim = tx.select({ nodeId: claims.nodeId }).from(claims).where(eq(claims.submissionId, submissionId)).get();
    const tileByNodeId = new Map(tx.select().from(tiles).where(eq(tiles.bingoId, bingoId)).all().map((t) => [t.nodeId, t]));
    const tile = claim ? tileForLeaf(tx, claim.nodeId, tileByNodeId) : null;
    const submitter = tx
      .select({ id: users.id, discordUsername: users.discordUsername, discordGlobalName: users.discordGlobalName, discordGuildNick: users.discordGuildNick })
      .from(users)
      .where(eq(users.id, submission.submittedByUserId))
      .get();
    const rsn = rsnsAcrossBingos(tx, [{ bingoId, userId: submission.submittedByUserId }]).get(`${bingoId}|${submission.submittedByUserId}`) ?? null;
    audit(tx, {
      action: "submission.reaction_set",
      bingoId,
      entity: { type: "submission", id: submissionId, label: tile?.name ?? null },
      teamId: submission.teamId,
      details: {
        emoji,
        reaction: SUBMISSION_REACTION_NAMES[emoji],
        reacted,
        tileName: tile?.name ?? null,
        submitterName: submitter ? playerName({ ...submitter, rsn }) : null,
        ownSubmission: submission.submittedByUserId === userId,
      },
    });
    return { teamId: submission.teamId };
  });
}

/** One submission as the team's list has it (with its reactions), or undefined. */
export function getSubmissionDetails(db: Db, submissionId: string): SubmissionDetails | undefined {
  const row = getSubmissionById(db, submissionId);
  return row ? attachDetails(db, [row])[0] : undefined;
}

export interface ClaimedLeaf {
  id: string;
  kind: NodeKind;
  label: string | null;
  /** Why an item claimed here has the GP value it does, when the Task has a Valued as. */
  valuedAs: ValuedAs | null;
}

export interface ModSubmissionRow extends SubmissionDetails {
  leaves: ClaimedLeaf[];
  tile: typeof tiles.$inferSelect;
  team: Pick<typeof teams.$inferSelect, "id" | "name" | "color">;
}

export function getAllSubmissionsForBingo(db: Db, bingoId: string): ModSubmissionRow[] {
  const rows = db
    .select({ submission: submissions, team: { id: teams.id, name: teams.name, color: teams.color } })
    .from(submissions)
    .innerJoin(teams, eq(submissions.teamId, teams.id))
    .where(eq(teams.bingoId, bingoId))
    .all();

  const details = attachDetails(db, rows.map((r) => r.submission));
  const leafIds = [...new Set(details.flatMap((d) => d.claims.map((c) => c.nodeId)))];
  const leafRows = leafIds.length ? db.select().from(nodes).where(inArray(nodes.id, leafIds)).all() : [];
  const leafById = new Map(leafRows.map((l): [string, ClaimedLeaf] => [l.id, { id: l.id, kind: l.kind, label: l.label, valuedAs: valuedAsOf(l) }]));

  const tileRows = db.select().from(tiles).where(eq(tiles.bingoId, bingoId)).all();
  const tileByNodeId = new Map(tileRows.map((t) => [t.nodeId, t]));

  return rows.map((r, i) => {
    const d = details[i]!;
    const claimedNodeIds = [...new Set(d.claims.map((c) => c.nodeId))];
    const leaves = claimedNodeIds.map((id) => leafById.get(id)!).filter(Boolean);
    const firstLeafId = claimedNodeIds[0];
    const tile = firstLeafId ? tileForLeaf(db, firstLeafId, tileByNodeId) : null;
    return { ...d, leaves, tile: tile!, team: r.team };
  });
}

export function getPendingSubmissions(db: Db, bingoId: string) {
  return getAllSubmissionsForBingo(db, bingoId).filter((row) => row.submission.status === "pending");
}

export function getPendingCount(db: Db, bingoId: string): number {
  return getPendingSubmissions(db, bingoId).length;
}

export function getSubmissionById(db: Db, submissionId: string) {
  return db.select().from(submissions).where(eq(submissions.id, submissionId)).get();
}

export function getTeamSubmissions(db: Db, teamId: string): SubmissionDetails[] {
  return attachDetails(db, db.select().from(submissions).where(eq(submissions.teamId, teamId)).all());
}
