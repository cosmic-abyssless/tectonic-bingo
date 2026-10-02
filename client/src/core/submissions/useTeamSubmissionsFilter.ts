import { useState } from "react";
import type { SubmissionStatus } from "@bingo/shared";
import type { SubmissionModel } from "../../headless/types";
import type { MultiSelectOption } from "../ui/MultiSelect";
import { useLoadMore } from "../ui/paging";

const STATUSES: { key: SubmissionStatus; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

/**
 * The Team submissions drawer's filters, for both themes: Status and Player multiselects (nothing ticked is any), each
 * counting what the other leaves, and the filtered list drawn a page at a time, back to the first page on a new filter
 * or a fresh open.
 */
export function useTeamSubmissionsFilter(submissions: SubmissionModel[], isOpen: boolean) {
  const [statuses, setStatuses] = useState<string[]>([]);
  // Names come from the submissions themselves, so the list only ever offers people who actually submitted something.
  const [players, setPlayers] = useState<string[]>([]);
  const byStatus = (s: SubmissionModel) => statuses.length === 0 || statuses.includes(s.status);
  const byPlayer = (s: SubmissionModel) => players.length === 0 || (s.submittedBy != null && players.includes(s.submittedBy));

  const statusOptions: MultiSelectOption[] = STATUSES.map(({ key, label }) => ({ key, label, count: submissions.filter((s) => byPlayer(s) && s.status === key).length }));
  const playerNames = [...new Set(submissions.flatMap((s) => (s.submittedBy ? [s.submittedBy] : [])))].sort();
  const playerOptions: MultiSelectOption[] = playerNames.map((name) => ({ key: name, label: name, count: submissions.filter((s) => byStatus(s) && s.submittedBy === name).length }));

  const shown = submissions.filter((s) => byStatus(s) && byPlayer(s));
  const drawn = useLoadMore(shown, `${isOpen}:${statuses.join(",")}:${players.join(",")}`);

  // "No pending or rejected submissions by Zezima."
  const statusWords = STATUSES.filter((s) => statuses.includes(s.key)).map((s) => s.label.toLowerCase());
  const emptyText = `No ${statusWords.length > 0 ? `${statusWords.join(" or ")} ` : ""}submissions${players.length === 1 ? ` by ${players[0]}` : players.length > 1 ? " by those Players" : ""}.`;

  return { statusOptions, statuses, setStatuses, playerOptions, players, setPlayers, showPlayers: playerNames.length > 1, shown, drawn, emptyText };
}
