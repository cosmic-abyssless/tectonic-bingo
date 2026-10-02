import type { MinimalUser, ModSubmissionRow } from "@bingo/shared";
import type { MultiSelectOption } from "../ui/MultiSelect";
import type { inclusionFilter } from "../ui/inclusionFilter";
import { displayName } from "../ui/user";

// The Mod panel's Submissions view (issue #383): its Submitter and Reviewer filters. It draws the filtered list a page
// at a time with core/ui/paging.

/** Reviewer filter options that aren't a person. */
export const NOT_REVIEWED = "not-reviewed";
export const NOBODY_RECORDED = "nobody-recorded";

/** Who a Submission counts under in the Submitter filter: the Player it's credited to, and whoever posted it for them. */
export function submitterKeys(row: ModSubmissionRow): string[] {
  return [row.submittedByUser?.id, row.postedByUser?.id].filter((id): id is string => !!id);
}

/** Its key in the Reviewer filter: pending is Not reviewed; reviewed with no reviewer on record is Nobody recorded. */
export function reviewerKey(row: ModSubmissionRow): string {
  if (row.submission.status === "pending") return NOT_REVIEWED;
  return row.reviewedByUser?.id ?? NOBODY_RECORDED;
}

// One option per person, labelled by name with how many Submissions they're on, A to Z.
function peopleOptions(rows: ModSubmissionRow[], peopleOf: (row: ModSubmissionRow) => MinimalUser[]): MultiSelectOption[] {
  const byId = new Map<string, { label: string; count: number }>();
  for (const row of rows) {
    for (const user of peopleOf(row)) {
      const option = byId.get(user.id) ?? { label: displayName(user), count: 0 };
      option.count += 1;
      byId.set(user.id, option);
    }
  }
  return [...byId].map(([key, o]) => ({ key, ...o })).sort((a, b) => a.label.localeCompare(b.label));
}

/** Everyone a Submission is credited to or was posted by, with counts (a Player counts once per Submission). */
export function submitterOptions(rows: ModSubmissionRow[]): MultiSelectOption[] {
  return peopleOptions(rows, (row) => {
    const people = [row.submittedByUser, row.postedByUser].filter((u): u is MinimalUser => !!u);
    return people.filter((u, i) => people.findIndex((p) => p.id === u.id) === i);
  });
}

/** Each Moderator or Admin who reviewed something, then Not reviewed and Nobody recorded when any Submission is. */
export function reviewerOptions(rows: ModSubmissionRow[]): MultiSelectOption[] {
  const people = peopleOptions(rows, (row) => (row.submission.status !== "pending" && row.reviewedByUser ? [row.reviewedByUser] : []));
  const notReviewed = rows.filter((row) => reviewerKey(row) === NOT_REVIEWED).length;
  const nobody = rows.filter((row) => reviewerKey(row) === NOBODY_RECORDED).length;
  return [
    ...people,
    ...(notReviewed ? [{ key: NOT_REVIEWED, label: "Not reviewed", count: notReviewed }] : []),
    ...(nobody ? [{ key: NOBODY_RECORDED, label: "Nobody recorded", count: nobody }] : []),
  ];
}

/** A checklist filter, as inclusionFilter gives it. */
type Filter = Pick<ReturnType<typeof inclusionFilter>, "matches" | "narrowed">;

/** The rows passing every filter at once. */
export function filterSubmissions(
  rows: ModSubmissionRow[],
  filters: { status: Filter; team: Filter; submitter: Filter; reviewer: Filter },
): ModSubmissionRow[] {
  return rows.filter(
    (row) =>
      filters.status.matches(row.submission.status) &&
      filters.team.matches(row.team.name) &&
      // Any includes a Submission with no known submitter; a narrowed filter needs one of its people ticked.
      (!filters.submitter.narrowed || submitterKeys(row).some(filters.submitter.matches)) &&
      filters.reviewer.matches(reviewerKey(row)),
  );
}
