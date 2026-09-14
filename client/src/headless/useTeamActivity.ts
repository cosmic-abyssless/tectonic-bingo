import { useMemo } from "react";
import { useTeamActivity } from "../api/queries";
import { timeAgo } from "../core/ui/time";
import { displayName } from "../core/ui/user";
import type { ActivityEntryModel } from "./types";

/** Maps a team's activity feed onto the themeable ActivityEntryModel shape. */
export function useTeamActivityModel(slug: string | undefined, teamId: string | undefined) {
  const { data, isLoading } = useTeamActivity(slug, teamId);

  const entries = useMemo<ActivityEntryModel[]>(
    () =>
      (data?.entries ?? []).map((e) => ({
        id: e.id,
        label: e.label,
        tone: e.tone,
        category: e.category,
        at: new Date(e.at).getTime(),
        timeAgo: timeAgo(e.at),
        actorName: e.actor ? displayName(e.actor) : null,
      })),
    [data],
  );

  return { entries, isLoading };
}
