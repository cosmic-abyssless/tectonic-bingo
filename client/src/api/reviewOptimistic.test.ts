import { describe, expect, it } from "vitest";
import type { MinimalUser, ModSubmissionRow, SubmissionStatus } from "@bingo/shared";
import { pendingCountChange, reviewedRow, withReviewsInFlight } from "./reviewOptimistic";

const mod = { id: "mod", discordUsername: "mod", discordGlobalName: null, discordGuildNick: null, rsn: null } as MinimalUser;
const other = { ...mod, id: "other" } as MinimalUser;
const AT = "2026-10-11T12:00:00.000Z";

function row(id: string, status: SubmissionStatus = "pending", reviewer: MinimalUser | null = null): ModSubmissionRow {
  const reviewed = status !== "pending";
  return {
    submission: { id, status, reviewedAt: reviewed ? "2026-10-10T00:00:00.000Z" : null, reviewedByUserId: reviewer?.id ?? null, reviewerNotes: reviewed ? "old note" : null, updatedAt: "2026-10-10T00:00:00.000Z" },
    reviewedByUser: reviewer,
  } as unknown as ModSubmissionRow;
}

describe("reviewedRow", () => {
  it("approves and rejects as the viewer, with their notes", () => {
    expect(reviewedRow(row("1"), "approve", mod, "nice", AT)).toMatchObject({
      submission: { status: "approved", reviewedAt: AT, reviewedByUserId: "mod", reviewerNotes: "nice" },
      reviewedByUser: mod,
    });
    expect(reviewedRow(row("1"), "reject", mod, undefined, AT).submission).toMatchObject({ status: "rejected", reviewerNotes: null });
  });
});

describe("withReviewsInFlight", () => {
  const data = { submissions: [row("1"), row("2"), row("3", "approved", other)] };

  it("leaves the queue as it is with nothing on its way", () => {
    expect(withReviewsInFlight(data, [], mod)).toBe(data);
  });

  it("applies each review on its way, the latest press of a Submission winning", () => {
    const shown = withReviewsInFlight(
      data,
      [
        { submissionId: "1", action: "approve", at: AT },
        { submissionId: "1", action: "reject", at: AT },
        { submissionId: "2", action: "reject", reviewerNotes: "blurry", at: AT },
      ],
      mod,
    );
    expect(shown.submissions.map((r) => r.submission.status)).toEqual(["rejected", "rejected", "approved"]);
    expect(shown.submissions[1].submission.reviewerNotes).toBe("blurry");
  });

  it("is the same applied again, so a refetch that already has the review shows it unchanged", () => {
    const once = withReviewsInFlight(data, [{ submissionId: "1", action: "approve", at: AT }], mod);
    expect(withReviewsInFlight(once, [{ submissionId: "1", action: "approve", at: AT }], mod)).toEqual(once);
  });
});

describe("pendingCountChange", () => {
  it("counts a Submission leaving Pending", () => {
    expect(pendingCountChange("pending")).toBe(-1);
    expect(pendingCountChange("approved")).toBe(0);
    expect(pendingCountChange("rejected")).toBe(0);
  });
});
