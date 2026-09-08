import type { DraftPick, DraftTeam } from "@bingo/shared";
import { displayName } from "../ui/user";

/**
 * One team's roster: captain up top, picks below in draft order. Used in the
 * draft room (live, with the on-the-clock indicator) and on the bingo page
 * once the draft is done (the team reveal).
 */
export function TeamRoster({ team, picks, isCurrent, highlight }: { team: DraftTeam; picks: DraftPick[]; isCurrent?: boolean; highlight?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="h-4 text-[11px] font-medium uppercase tracking-wide text-fg">{isCurrent && "On the clock"}</div>
      <div
        className={`w-full rounded-md border px-2.5 py-2 transition-colors ${isCurrent ? "border-fg bg-surface-raised" : highlight ? "border-line-strong bg-surface-raised" : "border-line bg-surface"}`}
        style={team.color && !isCurrent ? { borderColor: `${team.color}99` } : undefined}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          {team.color && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: team.color }} />}
          <span className="truncate text-sm font-semibold text-fg">{team.name}</span>
        </div>
        <div className="mt-0.5 truncate text-xs text-fg-muted">
          <span className="text-fg-subtle">Captain</span> {team.captainRsn || "?"}
        </div>
      </div>
      <ul className="w-full space-y-1">
        {picks.map((p) => (
          <li key={p.id} className="truncate rounded-sm bg-surface px-2.5 py-1 text-sm text-fg-muted">
            {p.rsn || displayName(p.user)}
          </li>
        ))}
      </ul>
    </div>
  );
}
