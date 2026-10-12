// Editing a Submission (CONTEXT.md "Submission", Editing): a Moderator changes any of it but its screenshots and its
// Team, in any status, from the mod queue. It replaced "Change player" and "Undo review": both are now just fields of
// the edit. The Submit flow's rules (Exclusive Items, submit gates, Freeze Periods, where a Proof screenshot is
// needed, the Bingo's dates) are warnings the Moderator can save over, not refusals: scoring applies Exclusive Items
// and gates by itself, so the points stay right either way.
import { and, asc, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { proofRequirements, type EditSubmissionInput, type GraphNode, type EditWarning, type SubmissionEditChange, type SubmissionKind, type SubmissionStatus } from "@bingo/shared";
import * as schema from "../db/schema";
import { claims, nodes, submissions, submissionScreenshots, teamNodeState, tiles } from "../db/schema";
import { now as clockNow } from "../clock";
import { audit, markUnchanged } from "../audit/record";
import { userLabelById } from "../audit/describe";
import { ServiceError } from "./errors";
import { getNodeTree, submitGateBlock } from "./graphService";
import { conflictMessage, conflictsForClaims } from "./exclusivityService";
import { effectiveStartsAt, endedAt } from "./bingoStart";
import { pricer, valuedAsOf } from "./gpValueService";
import { describeSubmissionTarget, getSubmissionNodeIds, rebuildTeamState, recordPointChanges, scoreTeam } from "./scoringService";
import { frozenMessage, frozenUntil, gateMessage, proofNotNeededMessage, tileForLeaf } from "./submissionService";
import { getTeamById, getTeamMembers } from "./teamService";

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Bingo = typeof schema.bingos.$inferSelect;
type Team = typeof schema.teams.$inferSelect;
type Tile = typeof tiles.$inferSelect;
type Leaf = typeof nodes.$inferSelect;
type SubmissionRow = typeof submissions.$inferSelect;

/** An edit refused for its warnings (it wasn't forced): the route answers 422 with them. */
export class EditWarningsError extends ServiceError {
  constructor(readonly warnings: EditWarning[]) {
    super(422, "This edit breaks the Submit flow's rules: save anyway to keep it", "edit_warnings");
  }
}

export interface EditSubmissionResult {
  submission: SubmissionRow;
  /** The warnings it was saved over. */
  warnings: EditWarning[];
  /** Every leaf its claims were on before or are on now: what the board and drawers refresh. */
  nodeIds: string[];
  /** It left pending: a Finished Bingo may now publish its Wrapped, as after a review. */
  reviewed: boolean;
  /** A claim it priced has no Drop value yet: the route runs the fill, as after a submission. */
  unpriced: boolean;
  /** Points the Team won or lost. */
  pointsDelta: number;
}

/** A Submission as an edit sees it: what it is (before) or will be (after). */
interface EditState {
  submittedByUserId: string;
  submittedAt: Date;
  status: SubmissionStatus;
  reviewerNotes: string | null;
  kind: SubmissionKind;
  /** A drop's, with their leaves. Empty for a proof. */
  claims: { nodeId: string; quantity: number; leaf: Leaf | undefined }[];
  /** A drop's Tile (where its claims are) or a proof's own. Null for a drop whose leaves left the board. */
  tile: Tile | null;
  /** A proof's Task, when its requirement is per-Task. */
  proofTaskId: string | null;
}

const STATUSES: SubmissionStatus[] = ["pending", "approved", "rejected"];
// The database keeps whole seconds.
const toSecond = (d: Date) => new Date(Math.floor(d.getTime() / 1000) * 1000);

export function editSubmission(db: Db, bingo: Bingo, params: { submissionId: string; editedByUserId: string; input: EditSubmissionInput }): EditSubmissionResult {
  return db.transaction((tx): EditSubmissionResult => {
    const submission = tx.select().from(submissions).where(eq(submissions.id, params.submissionId)).get();
    const team = submission ? getTeamById(tx, submission.teamId) : undefined;
    if (!submission || !team || team.bingoId !== bingo.id) throw new ServiceError(404, "Submission not found");

    const input = params.input ?? ({} as EditSubmissionInput);
    const expected = typeof input.expectedUpdatedAt === "string" ? Date.parse(input.expectedUpdatedAt) : NaN;
    if (Number.isNaN(expected)) throw new ServiceError(400, "expectedUpdatedAt must be an ISO date");
    // Another Moderator reviewed or edited it since the form was opened: saving would undo what they did unseen.
    if (expected !== submission.updatedAt.getTime()) throw new ServiceError(409, "This submission changed since you opened it", "stale");

    const oldClaims = tx.select().from(claims).where(eq(claims.submissionId, submission.id)).all();
    const before = stateOf(tx, bingo, submission, oldClaims);
    const after = readInput(tx, bingo, team, submission, before, input);

    // Only what the edit brings is a warning: an Exclusive Item rule published after the fact, say, doesn't nag
    // every later edit of a submission that already broke it.
    const already = new Set(warningsFor(tx, bingo, team.id, submission.id, before).map((w) => `${w.code}|${w.message}`));
    const warnings = warningsFor(tx, bingo, team.id, submission.id, after).filter((w) => !already.has(`${w.code}|${w.message}`));
    if (warnings.length > 0 && input.force !== true) throw new EditWarningsError(warnings);

    const statusChanged = after.status !== before.status;
    const claimsChanged = claimsKey(before) !== claimsKey(after);
    const changes = describeChanges(tx, bingo, before, after, claimsChanged);
    const oldNodeIds = [...new Set(oldClaims.map((c) => c.nodeId))];
    if (changes.length === 0 && !statusChanged && !claimsChanged) {
      markUnchanged();
      return { submission, warnings: [], nodeIds: oldNodeIds, reviewed: false, unpriced: false, pointsDelta: 0 };
    }

    const now = clockNow();
    // A changed credit keeps whoever uploaded it as the poster (none when that's who it's now credited to).
    const uploader = submission.postedByUserId ?? submission.submittedByUserId;
    const postedByUserId = after.submittedByUserId === submission.submittedByUserId ? submission.postedByUserId : after.submittedByUserId === uploader ? null : uploader;
    // A pending submission has no review. A new decision is the editor's, made now; an unchanged one keeps its reviewer.
    const review =
      after.status === "pending"
        ? { reviewedAt: null, reviewedByUserId: null, reviewerNotes: null }
        : statusChanged
          ? { reviewedAt: now, reviewedByUserId: params.editedByUserId, reviewerNotes: after.reviewerNotes }
          : { reviewerNotes: after.reviewerNotes };
    tx.update(submissions)
      .set({
        submittedByUserId: after.submittedByUserId,
        postedByUserId,
        kind: after.kind,
        proofTileId: after.kind === "proof" ? after.tile!.id : null,
        proofTaskId: after.kind === "proof" ? after.proofTaskId : null,
        submittedAt: after.submittedAt,
        status: after.status,
        ...review,
        updatedAt: now,
      })
      .where(eq(submissions.id, submission.id))
      .run();

    const unpriced = claimsChanged ? applyClaims(tx, submission.id, oldClaims, after) : false;
    if (after.kind !== before.kind) {
      // The first screenshot is the one a proof shows as its Proof screenshot, and a drop as its drop.
      const first = tx.select().from(submissionScreenshots).where(eq(submissionScreenshots.submissionId, submission.id)).orderBy(asc(submissionScreenshots.uploadedAt), asc(submissionScreenshots.id)).get();
      if (first && (after.kind === "proof" || first.screenshotType === "proof")) {
        tx.update(submissionScreenshots).set({ screenshotType: after.kind === "proof" ? "proof" : "main" }).where(eq(submissionScreenshots.id, first.id)).run();
      }
    }

    // Re-scored the way a review is (a full rebuild, diffed) when what counts changed: its claims or whether it's
    // approved. Its credit, notes and time don't score.
    let score: { before: (typeof teamNodeState.$inferSelect)[]; after: Map<string, { completedAt: Date; pointsAwarded: number }> } | null = null;
    if ((before.status === "approved" || after.status === "approved") && (statusChanged || claimsChanged)) {
      const was = tx.select().from(teamNodeState).where(eq(teamNodeState.teamId, team.id)).all();
      score = { before: was, after: rebuildTeamState(tx, team.id) };
    }
    const pointsDelta = score ? [...score.after.values()].reduce((sum, s) => sum + s.pointsAwarded, 0) - score.before.reduce((sum, r) => sum + r.pointsAwarded, 0) : 0;

    const updated = tx.select().from(submissions).where(eq(submissions.id, submission.id)).get()!;
    const nodeIds = getSubmissionNodeIds(tx, submission.id);
    const { tileName, taskLabels, label, proof } = describeSubmissionTarget(tx, bingo.id, nodeIds, updated);
    const entry = { bingoId: bingo.id, entity: { type: "submission" as const, id: submission.id, label }, teamId: team.id, actor: { userId: params.editedByUserId } };
    const common = { ...proof, tileName, taskLabels, nodeIds, submittedByUserId: after.submittedByUserId };

    // A status change is written as the review it is, so notifications, Catch-up and the activity feed treat it as one.
    if (statusChanged && after.status === "approved") {
      const beforeIds = new Set(score!.before.map((r) => r.nodeId));
      const newlyCompletedNodeIds = [...score!.after.keys()].filter((id) => !beforeIds.has(id));
      audit(tx, { ...entry, action: "submission.approved", details: { ...common, newlyCompletedNodeIds, pointsDelta, reviewerNotes: after.reviewerNotes } });
    } else if (statusChanged && after.status === "rejected") {
      audit(tx, { ...entry, action: "submission.rejected", details: { ...common, reviewerNotes: after.reviewerNotes } });
    } else if (statusChanged) {
      const uncompletedNodeIds = score ? score.before.map((r) => r.nodeId).filter((id) => !score.after.has(id)) : [];
      audit(tx, {
        ...entry,
        action: "submission.review_undone",
        details: {
          ...common,
          previousStatus: before.status as "approved" | "rejected",
          previousReviewerNotes: submission.reviewerNotes,
          previousReviewedByUserId: submission.reviewedByUserId,
          uncompletedNodeIds,
          pointsDelta,
        },
      });
    }
    // Also when only the status changed but it was saved over warnings: those are worth a record of their own.
    if (changes.length > 0 || warnings.length > 0) {
      audit(tx, {
        ...entry,
        action: "submission.edited",
        details: {
          ...common,
          changes,
          // The status entry carries the points when there is one.
          ...(score && !statusChanged ? { pointsDelta } : {}),
          ...(warnings.length > 0 ? { warnings: warnings.map((w) => w.message) } : {}),
        },
      });
    }
    if (score) recordPointChanges(tx, { bingoId: bingo.id, teamId: team.id, submissionId: submission.id, reviewerUserId: params.editedByUserId }, score.before, score.after);

    return {
      submission: updated,
      warnings,
      nodeIds: [...new Set([...oldNodeIds, ...nodeIds])],
      reviewed: before.status === "pending" && after.status !== "pending",
      unpriced,
      pointsDelta,
    };
  });
}

function stateOf(tx: Tx, bingo: Bingo, submission: SubmissionRow, rows: (typeof claims.$inferSelect)[]): EditState {
  const leaves = leavesById(tx, rows.map((c) => c.nodeId));
  let tile: Tile | null = null;
  if (submission.kind === "proof") tile = tx.select().from(tiles).where(eq(tiles.id, submission.proofTileId!)).get() ?? null;
  else {
    const index = tileIndex(tx, bingo.id);
    for (const c of rows) tile ??= tileForLeaf(tx, c.nodeId, index);
  }
  return {
    submittedByUserId: submission.submittedByUserId,
    submittedAt: submission.submittedAt,
    status: submission.status,
    reviewerNotes: submission.status === "pending" ? null : submission.reviewerNotes || null,
    kind: submission.kind,
    claims: rows.map((c) => ({ nodeId: c.nodeId, quantity: c.quantity, leaf: leaves.get(c.nodeId) })),
    tile,
    proofTaskId: submission.proofTaskId,
  };
}

// The form, checked: anything that can't be saved at all is a 400 (warnings come later).
function readInput(tx: Tx, bingo: Bingo, team: Team, submission: SubmissionRow, before: EditState, input: EditSubmissionInput): EditState {
  if (!STATUSES.includes(input.status)) throw new ServiceError(400, 'status must be "pending", "approved" or "rejected"');
  if (input.kind !== "drop" && input.kind !== "proof") throw new ServiceError(400, 'kind must be "drop" or "proof"');
  if (input.reviewerNotes !== null && input.reviewerNotes !== undefined && typeof input.reviewerNotes !== "string") throw new ServiceError(400, "reviewerNotes must be text");

  if (typeof input.submittedByUserId !== "string") throw new ServiceError(400, "submittedByUserId is required");
  // Only a new credit has to be on the Team: a removed Player's drops can still be reviewed and edited.
  if (input.submittedByUserId !== before.submittedByUserId && !getTeamMembers(tx, team.id).some((m) => m.userId === input.submittedByUserId)) {
    throw new ServiceError(400, `That player isn't on ${team.name}`);
  }

  const parsed = typeof input.submittedAt === "string" ? new Date(input.submittedAt) : new Date(NaN);
  if (Number.isNaN(parsed.getTime())) throw new ServiceError(400, "submittedAt must be an ISO date");
  const submittedAt = toSecond(parsed);
  if (submittedAt.getTime() > clockNow().getTime()) throw new ServiceError(400, "The submitted time can't be in the future");

  const notes = input.status === "pending" ? null : input.reviewerNotes || null;
  const common = { submittedByUserId: input.submittedByUserId, submittedAt, status: input.status, reviewerNotes: notes, kind: input.kind };
  if (input.kind === "proof") return { ...common, claims: [], ...readProof(tx, bingo, before, input) };
  return { ...common, ...readClaims(tx, bingo, submission, before, input), proofTaskId: null };
}

function readProof(tx: Tx, bingo: Bingo, before: EditState, input: EditSubmissionInput): Pick<EditState, "tile" | "proofTaskId"> {
  const tile = input.proofTileId ? tx.select().from(tiles).where(and(eq(tiles.id, input.proofTileId), eq(tiles.bingoId, bingo.id))).get() : undefined;
  if (!tile) throw new ServiceError(400, "Tile not found");
  const taskId = input.proofTaskId || null;
  if (taskId && !getNodeTree(tx, tile.nodeId)?.children.some((t) => t.id === taskId)) throw new ServiceError(400, "That task isn't on this tile");
  // A Tile-wide requirement takes no Task, as when a proof is posted (createProofSubmission); one posted while the
  // requirement was per-Task keeps the Task it has.
  const tileWide = proofRequirements({ ...tile, node: getNodeTree(tx, tile.nodeId)! }).some((r) => r.taskId === null);
  const unchanged = before.kind === "proof" && before.tile?.id === tile.id && before.proofTaskId === taskId;
  return { tile, proofTaskId: tileWide && !unchanged ? null : taskId };
}

function readClaims(tx: Tx, bingo: Bingo, submission: SubmissionRow, before: EditState, input: EditSubmissionInput): Pick<EditState, "claims" | "tile"> {
  const list = Array.isArray(input.claims) ? input.claims : [];
  if (list.length === 0) throw new ServiceError(400, "At least one claim is required");
  for (const c of list) {
    if (typeof c?.nodeId !== "string" || !Number.isInteger(c.quantity) || c.quantity < 1) throw new ServiceError(400, "Each claim needs a requirement and a quantity of at least 1");
  }
  const nodeIds = list.map((c) => c.nodeId);
  if (new Set(nodeIds).size !== nodeIds.length) throw new ServiceError(400, "A submission may not claim the same requirement twice — combine into one claim with a quantity");

  const leaves = leavesById(tx, nodeIds);
  const kept = new Set(submission.kind === "drop" ? before.claims.map((c) => c.nodeId) : []);
  const index = tileIndex(tx, bingo.id);
  const tileIds = new Set<string>();
  for (const nodeId of nodeIds) {
    const leaf = leaves.get(nodeId);
    const tile = leaf && leaf.bingoId === bingo.id ? tileForLeaf(tx, nodeId, index) : null;
    // A leaf it already claims may have left the board since; anything new must be on it now.
    if (kept.has(nodeId) && (!tile || leaf?.removedAt)) continue;
    if (!leaf || (leaf.kind !== "ITEM" && leaf.kind !== "MANUAL") || !tile || leaf.removedAt) throw new ServiceError(400, "Claims must target requirement leaves");
    tileIds.add(tile.id);
  }
  if (tileIds.size > 1) throw new ServiceError(400, "All claims in a submission must belong to the same tile");
  const tileId = [...tileIds][0];
  const tile = tileId ? tx.select().from(tiles).where(eq(tiles.id, tileId)).get()! : before.kind === "drop" ? before.tile : null;
  return { claims: list.map((c) => ({ nodeId: c.nodeId, quantity: c.quantity, leaf: leaves.get(c.nodeId) })), tile };
}

/** What would break the Submit flow's rules, for a submission in this state (none for a rejected one: it counts for nothing). */
function warningsFor(tx: Tx, bingo: Bingo, teamId: string, submissionId: string, state: EditState): EditWarning[] {
  if (state.status === "rejected") return [];
  const out: EditWarning[] = [];
  const startsAt = effectiveStartsAt(tx, bingo);
  if (startsAt && state.submittedAt < startsAt) out.push({ code: "before_start", message: `The bingo hadn't started yet at that time (it started ${startsAt.toISOString()})` });
  const ended = endedAt(tx, bingo);
  if (ended && state.submittedAt > ended) out.push({ code: "after_end", message: `The bingo had already ended at that time (it ended ${ended.toISOString()})` });
  const unlockAt = state.tile && startsAt ? frozenUntil(state.tile, startsAt) : null;
  if (unlockAt && state.submittedAt < unlockAt) out.push({ code: "frozen", message: frozenMessage(unlockAt) });

  if (state.kind === "proof") {
    const requirements = proofRequirements({ ...state.tile!, node: getNodeTree(tx, state.tile!.nodeId)! });
    if (!requirements.some((r) => r.taskId === null || r.taskId === state.proofTaskId)) {
      out.push({ code: "proof_not_required", message: proofNotNeededMessage(!!state.proofTaskId && requirements.length > 0) });
    }
    return out;
  }

  // The gates as they'd stand without this submission: what the team had done when it posted it, give or take.
  const nodeIds = state.claims.map((c) => c.nodeId);
  const completed = new Set(scoreTeam(tx, teamId, undefined, submissionId).keys());
  const blocked = new Set(nodeIds.map((id) => submitGateBlock(tx, id, completed)).filter((b): b is string => b !== null));
  for (const blockedBy of blocked) out.push({ code: "gate", message: gateMessage(blockedBy) });
  for (const conflict of conflictsForClaims(tx, bingo, teamId, nodeIds, submissionId)) out.push({ code: "exclusive", message: conflictMessage(conflict) });
  return out;
}

// Claims are matched by leaf: an unchanged one keeps its row and Drop value; a changed quantity or a new leaf is
// priced at today's prices, as Re-price would (null until the fill can); a leaf no longer claimed goes. Returns
// whether any it priced is still without a Drop value.
function applyClaims(tx: Tx, submissionId: string, oldClaims: (typeof claims.$inferSelect)[], after: EditState): boolean {
  const price = pricer(tx);
  const unused = [...oldClaims];
  let unpriced = false;
  for (const c of after.claims) {
    const leaf = c.leaf!;
    const at = unused.findIndex((o) => o.nodeId === c.nodeId);
    const old = at >= 0 ? unused.splice(at, 1)[0] : undefined;
    if (old && old.quantity === c.quantity) continue;
    const itemName = leaf.kind === "ITEM" ? leaf.itemName : null;
    const gpValue = price.gpValue(itemName, c.quantity, valuedAsOf(leaf));
    if (itemName && gpValue === null) unpriced = true;
    if (old) tx.update(claims).set({ quantity: c.quantity, itemName, gpValue }).where(eq(claims.id, old.id)).run();
    else tx.insert(claims).values({ submissionId, nodeId: c.nodeId, itemName, quantity: c.quantity, gpValue }).run();
  }
  if (unused.length > 0) tx.delete(claims).where(inArray(claims.id, unused.map((c) => c.id))).run();
  return unpriced;
}

// What the edit changed, each before and after in words, for the submission.edited entry. The status is left out:
// it is written as its own review entry, and so are the notes when the status changes with them.
function describeChanges(tx: Tx, bingo: Bingo, before: EditState, after: EditState, claimsChanged: boolean): SubmissionEditChange[] {
  const changes: SubmissionEditChange[] = [];
  const add = (field: SubmissionEditChange["field"], b: string | null, a: string | null) => {
    if (b !== a) changes.push({ field, before: b, after: a });
  };
  if (before.submittedByUserId !== after.submittedByUserId) {
    add("player", userLabelById(tx, before.submittedByUserId, bingo.id) ?? "Unknown", userLabelById(tx, after.submittedByUserId, bingo.id) ?? "Unknown");
  }
  add("kind", kindWord(before.kind), kindWord(after.kind));
  add("tile", before.tile?.name ?? null, after.tile?.name ?? null);
  add("task", taskLabel(tx, before), taskLabel(tx, after));
  const items = { before: itemsText(tx, before), after: itemsText(tx, after) };
  // Two leaves can read the same (one Item on two Parts' own lists): a moved claim is still a change.
  if (items.before !== items.after || claimsChanged) changes.push({ field: "items", ...items });
  add("submittedAt", before.submittedAt.toISOString(), after.submittedAt.toISOString());
  if (before.status === after.status) add("reviewerNotes", before.reviewerNotes, after.reviewerNotes);
  return changes;
}

const kindWord = (kind: SubmissionKind) => (kind === "proof" ? "Proof screenshot" : "Drop");

function taskLabel(tx: Tx, state: EditState): string | null {
  if (state.kind !== "proof" || !state.proofTaskId) return null;
  return tx.select({ label: nodes.label }).from(nodes).where(eq(nodes.id, state.proofTaskId)).get()?.label ?? null;
}

/**
 * "2× Tome of fire, 1 Bruma torch"; null for a proof. An Item on more than one Part's own list is named with its Part
 * ("1 Onyx (Page 2)"), so moving a claim between them reads as the change it is.
 */
function itemsText(tx: Tx, state: EditState): string | null {
  if (state.kind === "proof") return null;
  const parts = (state.tile ? getNodeTree(tx, state.tile.nodeId)?.children : undefined) ?? [];
  const under = (node: GraphNode, id: string): boolean => node.id === id || node.children.some((child) => under(child, id));
  const names = (node: GraphNode, into = new Set<string>()): Set<string> => {
    if (node.itemName) into.add(node.itemName.toLowerCase());
    for (const child of node.children) names(child, into);
    return into;
  };
  const namesByPart = parts.map((p) => names(p));
  return state.claims
    .map((c) => {
      if (c.leaf?.kind !== "ITEM") return `${c.quantity === 1 ? "" : `${c.quantity}× `}proof of ${c.leaf?.label ?? "a task"}`;
      const what = `${c.quantity === 1 ? "1" : `${c.quantity}×`} ${c.leaf.itemName}`;
      const onSeveral = namesByPart.filter((n) => n.has((c.leaf!.itemName ?? "").toLowerCase())).length > 1;
      const part = onSeveral ? parts.find((p) => under(p, c.nodeId)) : undefined;
      return part ? `${what} (${part.label || "Part"})` : what;
    })
    .join(", ");
}

/** The claims as a comparable key: leaf and quantity, in order. */
const claimsKey = (state: EditState) => state.claims.map((c) => `${c.nodeId}×${c.quantity}`).sort().join(",");

function leavesById(tx: Tx, nodeIds: string[]): Map<string, Leaf> {
  if (nodeIds.length === 0) return new Map();
  return new Map(tx.select().from(nodes).where(inArray(nodes.id, nodeIds)).all().map((n) => [n.id, n]));
}

function tileIndex(tx: Tx, bingoId: string): Map<string, Tile> {
  return new Map(tx.select().from(tiles).where(eq(tiles.bingoId, bingoId)).all().map((t) => [t.nodeId, t]));
}
