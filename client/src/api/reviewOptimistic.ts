import type { MinimalUser, ModSubmissionRow, ModSubmissionsResponse, SubmissionStatus } from "@bingo/shared";

/** The queue's quick review. Anything else (back to pending, another decision) is the Edit, which isn't shown early. */
export type ReviewAction = "approve" | "reject";

const STATUS_AFTER: Record<ReviewAction, SubmissionStatus> = { approve: "approved", reject: "rejected" };

/**
 * A review queue row as it will be once `action` is saved (scoringService's approve and reject), shown the moment a
 * Moderator presses the button.
 */
export function reviewedRow(row: ModSubmissionRow, action: ReviewAction, reviewer: MinimalUser | null, reviewerNotes: string | undefined, now: string): ModSubmissionRow {
  return {
    ...row,
    submission: {
      ...row.submission,
      status: STATUS_AFTER[action],
      reviewedAt: now,
      reviewedByUserId: reviewer?.id ?? null,
      reviewerNotes: reviewerNotes ?? null,
      updatedAt: now,
    },
    reviewedByUser: reviewer,
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
  // The latest press of each wins.
  const latest = new Map(reviews.map((r) => [r.submissionId, r]));
  return {
    ...data,
    submissions: data.submissions.map((row) => {
      const review = latest.get(row.submission.id);
      return review ? reviewedRow(row, review.action, reviewer, review.reviewerNotes, review.at) : row;
    }),
  };
}

/** How the pending count moves when a submission in status `before` is reviewed: down one if it was pending. */
export function pendingCountChange(before: SubmissionStatus): number {
  return before === "pending" ? -1 : 0;
}

/** The fields of the viewer's account a review queue row names its reviewer by. */
export function asMinimalUser(user: MinimalUser | null): MinimalUser | null {
  return user && { id: user.id, discordUsername: user.discordUsername, discordGlobalName: user.discordGlobalName, discordGuildNick: user.discordGuildNick, rsn: user.rsn };
}
