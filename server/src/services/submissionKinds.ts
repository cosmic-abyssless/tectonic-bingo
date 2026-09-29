import { eq } from "drizzle-orm";
import type { SubmissionKind } from "@bingo/shared";
import { submissions } from "../db/schema";

// CONTEXT.md "Submission" kinds. A Proof screenshot is a Submission with no Claims and no points, so anything that
// counts drops (Stats, Titles, Rewind, Wrapped, Achievements, Reactions) keeps to drops through these. Queries that
// join claims already skip proofs, having none.

/** A where-clause for drop Submissions only. */
export const dropsOnly = eq(submissions.kind, "drop");

/** Whether a loaded Submission row is a drop. */
export const isDrop = (submission: { kind: SubmissionKind }): boolean => submission.kind === "drop";
