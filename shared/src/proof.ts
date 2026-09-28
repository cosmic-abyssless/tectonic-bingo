// Proof screenshots (CONTEXT.md "Proof screenshot"): a starting-state screenshot a Player posts before their drops on
// a Tile (or one of its Tasks) count. It's a kind of Submission with no Claims. The requirement lives on the Tile
// (Tile-wide) or on individual Tasks, never both; these helpers are the one place that decides which applies, whether
// a proof Submission satisfies it, and how a drop is flagged in review, for the server and the client alike.
import type { Submission, SubmissionStatus, Tile } from "./index.ts";

/** CONTEXT.md "Submission" kinds. Everything that counts drops (scoring, Stats, Titles, Rewind, Wrapped…) skips `proof`. */
export type SubmissionKind = "drop" | "proof";

/** One Proof screenshot requirement: Tile-wide (`taskId` null) or on one Task of the Tile. */
export interface ProofRequirement {
  tileId: string;
  taskId: string | null;
  /** The Tile's name, for a Tile-wide one; the Task's label for a per-Task one. */
  label: string;
  /** What to show ("an empty supply cart"), when the Admin wrote one. */
  note: string | null;
}

type TileForProof = Pick<Tile, "id" | "name" | "requiresProof" | "proofNote"> & {
  node: { children: { id: string; label: string | null; requiresProof: boolean; proofNote: string | null }[] };
};

/** Every requirement on a Tile: the Tile-wide one, or else one per Task that has its own. */
export function proofRequirements(tile: TileForProof): ProofRequirement[] {
  if (tile.requiresProof) return [{ tileId: tile.id, taskId: null, label: tile.name, note: tile.proofNote || null }];
  return tile.node.children.filter((t) => t.requiresProof).map((t) => ({ tileId: tile.id, taskId: t.id, label: t.label || tile.name, note: t.proofNote || null }));
}

/** The requirement a drop on this Task (or a proof posted from it) falls under, or null when there is none. */
export function proofRequirementFor(tile: TileForProof, taskId: string | null): ProofRequirement | null {
  const requirements = proofRequirements(tile);
  return requirements.find((r) => r.taskId === null) ?? requirements.find((r) => r.taskId === taskId) ?? null;
}

type ProofLike = Pick<Submission, "kind" | "proofTileId" | "proofTaskId">;

/**
 * Whether a Submission is a proof for this requirement. A Tile-wide requirement takes any proof for its Tile (one
 * posted while the requirement was per-Task still shows the Tile's starting state); a per-Task one takes only its own.
 */
export function isProofFor(submission: ProofLike, requirement: Pick<ProofRequirement, "tileId" | "taskId">): boolean {
  if (submission.kind !== "proof" || submission.proofTileId !== requirement.tileId) return false;
  return requirement.taskId === null || submission.proofTaskId === requirement.taskId;
}

/** A Player's standing on one requirement: any approved proof counts, for the whole Bingo. */
export type ProofStatus = "none" | SubmissionStatus;

/** `approved` if any of the Player's proofs for it is; else `pending`, else `rejected`, else `none`. */
export function proofStatus(submissions: (ProofLike & Pick<Submission, "submittedByUserId" | "status">)[], userId: string, requirement: Pick<ProofRequirement, "tileId" | "taskId">): ProofStatus {
  const statuses = new Set(submissions.filter((s) => s.submittedByUserId === userId && isProofFor(s, requirement)).map((s) => s.status));
  return statuses.has("approved") ? "approved" : statuses.has("pending") ? "pending" : statuses.has("rejected") ? "rejected" : "none";
}

/** Why a drop is flagged in review. Flags inform the review; they never block it. */
export type ProofFlag = "missing" | "before";

export const PROOF_FLAG_LABELS: Record<ProofFlag, string> = {
  missing: "No approved Proof screenshot",
  before: "Submitted before the Proof screenshot",
};

/**
 * A drop's flag for one requirement, from when it was submitted and when its Player's approved proofs for it were:
 * `missing` with none approved, `before` when the drop is earlier than the earliest one, else null.
 */
export function proofFlag(dropSubmittedAt: number, approvedProofTimes: number[]): ProofFlag | null {
  if (approvedProofTimes.length === 0) return "missing";
  return dropSubmittedAt < Math.min(...approvedProofTimes) ? "before" : null;
}

/** One of the Player's proofs, as a drop's review shows it next to the drop. */
export interface ProofSummary {
  submissionId: string;
  status: SubmissionStatus;
  submittedAt: string;
  screenshotUrl: string | null;
}

/** A drop's standing on one requirement it falls under, for the review queue. */
export interface ProofCheck {
  requirement: ProofRequirement;
  /** The Player's proofs for it, oldest first. */
  proofs: ProofSummary[];
  flag: ProofFlag | null;
}
