import type { QueryClient } from "@tanstack/react-query";
import type { SubmissionReaction, SubmissionReactionGroup, MinimalUser, TeamSubmissionsResponse } from "@bingo/shared";
import { SUBMISSION_REACTIONS } from "@bingo/shared";

// Reactions go into the cached lists of a Team's submissions as they happen, instead of the list being refetched: a
// Player going down the list reacting to each one is normal, and used to have every open page refetch the whole list
// every time (event loop lag, 2026-10-11).

/** useSetSubmissionReaction's: which of them are still on their way says whose answer a submission waits for. */
export const REACTION_MUTATION_KEY = ["submissionReaction"] as const;

/** One reaction on or off in a submission's groups, as the server will have it. */
export function toggleReaction(groups: SubmissionReactionGroup[], emoji: SubmissionReaction, user: MinimalUser, reacted: boolean): SubmissionReactionGroup[] {
  const users = (groups.find((g) => g.emoji === emoji)?.users ?? []).filter((u) => u.id !== user.id);
  const next = reacted ? [...users, user] : users;
  const others = groups.filter((g) => g.emoji !== emoji);
  const all = next.length > 0 ? [...others, { emoji, users: next }] : others;
  return SUBMISSION_REACTIONS.flatMap((e) => all.filter((g) => g.emoji === e));
}

/** A Team's list with these submissions' reactions put in. */
export function withReactions(list: TeamSubmissionsResponse, changes: { submissionId: string; reactions: SubmissionReactionGroup[] }[]): TeamSubmissionsResponse {
  const bySubmission = new Map(changes.map((c) => [c.submissionId, c.reactions]));
  if (!list.submissions.some((s) => bySubmission.has(s.submission.id))) return list;
  return { ...list, submissions: list.submissions.map((s) => (bySubmission.has(s.submission.id) ? { ...s, reactions: bySubmission.get(s.submission.id)! } : s)) };
}

/** How many of this tab's reactions to a submission are still on their way. */
export function reactionsOnTheirWay(queryClient: QueryClient, submissionId: string): number {
  return queryClient
    .getMutationCache()
    .findAll({ mutationKey: REACTION_MUTATION_KEY, status: "pending" })
    .filter((m) => (m.state.variables as { submissionId?: string } | undefined)?.submissionId === submissionId).length;
}

/**
 * Puts a submission_reactions_changed event's reactions into every cached list of the Team's submissions (a Team's id
 * is its own, whichever Bingo's page has it). A submission this tab is still reacting to is left as this tab shows it:
 * its own answer puts the server's reactions in when it lands, so an earlier event can't undo a click for a moment.
 */
export function applyReactionChanges(queryClient: QueryClient, teamId: string, changes: { submissionId: string; reactions: SubmissionReactionGroup[] }[]): void {
  const settled = changes.filter((c) => reactionsOnTheirWay(queryClient, c.submissionId) === 0);
  if (settled.length === 0) return;
  queryClient.setQueriesData<TeamSubmissionsResponse>({ queryKey: ["teamSubmissions"], predicate: (query) => query.queryKey[2] === teamId }, (list) => list && withReactions(list, settled));
}
