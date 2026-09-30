import type { ProofStatus } from "@bingo/shared";

// How a Player's standing on a Proof screenshot requirement (CONTEXT.md) reads in the Tile modal, in either theme.

export const PROOF_STATUS_TEXT: Record<ProofStatus, string> = {
  none: "Not posted yet",
  pending: "Posted, waiting for review",
  approved: "Approved",
  rejected: "Rejected, post another",
};

export const PROOF_STATUS_TONE: Record<ProofStatus, "warn" | "info" | "ok" | "danger"> = {
  none: "warn",
  pending: "info",
  approved: "ok",
  rejected: "danger",
};

/** The alert's message when the Admin didn't write one: theirs is shown whole, in its place. */
export const DEFAULT_PROOF_MESSAGE = "Before your drops count, post a screenshot of the starting state.";

/** Whether to offer posting one: not while one is approved or waiting for review. Null (a Moderator) always can. */
export function canPostProof(status: ProofStatus | null): boolean {
  return status !== "approved" && status !== "pending";
}
