// The Stats page's team filter, remembered in localStorage per Bingo and stage, so it's still set on the next visit.
// A Live Bingo starts out on the viewer's own Team, and a Finished one on every Team, so a choice made while it's Live
// doesn't follow it into Finished. Best-effort: unavailable storage just means every visit starts from the default.

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function statsTeamsStorageKey(slug: string, stage: string): string {
  return `stats:teams:v1:${slug}:${stage}`;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** The remembered Team ids (empty for every Team), or null when nothing is remembered. */
export function readStatsTeams(slug: string, stage: string, storage: StorageLike | null = defaultStorage()): string[] | null {
  try {
    const stored: unknown = JSON.parse(storage?.getItem(statsTeamsStorageKey(slug, stage)) ?? "null");
    return Array.isArray(stored) && stored.every((id) => typeof id === "string") ? stored : null;
  } catch {
    return null;
  }
}

export function writeStatsTeams(slug: string, stage: string, teamIds: readonly string[], storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(statsTeamsStorageKey(slug, stage), JSON.stringify(teamIds));
  } catch {
    // Full or blocked storage: the choice just isn't remembered.
  }
}

/**
 * The Teams the filter starts on: the remembered ones still on offer, or else the viewer's own Team while the Bingo is
 * Live (when they can see it among others), or else every Team (empty).
 */
export function initialStatsTeams(remembered: readonly string[] | null, viewer: { stage: string; myTeamId: string | null; teamIds: readonly string[] }): string[] {
  if (remembered) return remembered.filter((id) => viewer.teamIds.includes(id));
  if (viewer.stage === "live" && viewer.myTeamId && viewer.teamIds.includes(viewer.myTeamId)) return [viewer.myTeamId];
  return [];
}
