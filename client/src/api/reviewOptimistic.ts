import type { MinimalUser, ModSubmissionRow, ModSubmissionsResponse, SubmissionStatus } from "@bingo/shared";

export type ReviewAction = "approve" | "reject" | "undo";

const STATUS_AFTER: Record<ReviewAction, SubmissionStatus> = { approve: "approved", reject: "rejected", undo: "pending" };

/**
 * A review queue row as it will be once `action` is saved (scoringService's approve, reject and undo), shown the moment
 * a Moderator presses the button. Undo clears the review, notes and all.
 */
export function reviewedRow(row: ModSubmissionRow, action: ReviewAction, reviewer: MinimalUser | null, reviewerNotes: string | undefined, now: string): ModSubmissionRow {
  const reviewed = action !== "undo";
  return {
    ...row,
    submission: {
      ...row.submission,
      status: STATUS_AFTER[action],
      reviewedAt: reviewed ? now : null,
      reviewedByUserId: reviewed ? (reviewer?.id ?? null) : null,
      reviewerNotes: reviewed ? (reviewerNotes ?? null) : null,
      updatedAt: now,
    },
    reviewedByUser: reviewed ? reviewer : null,
  };
}

/** A review on its way to the server: what was pressed, and when. */
export interface ReviewInFlight {
  submissionId: string;
  action: ReviewAction;
  reviewerNotes?: string;
  at: string;
}

/** The review queue with the viewer's reviews still on their way already applied, as they will be once saved. */
export function withReviewsInFlight(data: ModSubmissionsResponse, reviews: ReviewInFlight[], reviewer: MinimalUser | null): ModSubmissionsResponse {
  if (reviews.length === 0) return data;
  // The latest press of each wins (an Undo straight after an Approve).
  const latest = new Map(reviews.map((r) => [r.submissionId, r]));
  return {
    ...data,
    submissions: data.submissions.map((row) => {
      const review = latest.get(row.submission.id);
      return review ? reviewedRow(row, review.action, reviewer, review.reviewerNotes, review.at) : row;
    }),
  };
}

/** How the pending count moves when a submission goes from `before` to `after`. */
export function pendingCountChange(before: SubmissionStatus, action: ReviewAction): number {
  return (STATUS_AFTER[action] === "pending" ? 1 : 0) - (before === "pending" ? 1 : 0);
}

/** The fields of the viewer's account a review queue row names its reviewer by. */
export function asMinimalUser(user: MinimalUser | null): MinimalUser | null {
  return user && { id: user.id, discordUsername: user.discordUsername, discordGlobalName: user.discordGlobalName, discordGuildNick: user.discordGuildNick, rsn: user.rsn };
}
