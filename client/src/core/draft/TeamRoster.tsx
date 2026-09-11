import type { DraftPick, DraftTeam } from "@bingo/shared";
import { CrownIcon } from "../ui/icons";
import { displayName } from "../ui/user";

// A duo pair is drafted as one pick, so both rows share a pickNumber — show
// them as one entry so the roster reads the same way the draft was made.
function groupByPick(picks: DraftPick[]): DraftPick[][] {
  const byNumber = new Map<number, DraftPick[]>();
  for (const p of picks) byNumber.set(p.pickNumber, [...(byNumber.get(p.pickNumber) ?? []), p]);
  return [...byNumber.entries()].sort(([a], [b]) => a - b).map(([, group]) => group);
}

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
        <div className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-fg-muted">
          <CrownIcon size={12} className="shrink-0 text-warn" aria-label="Captain" />
          <span className="truncate">{team.captainRsn || "?"}</span>
        </div>
        {team.coCaptain && (
          <div className="flex min-w-0 items-center gap-1 text-xs text-fg-muted">
            <CrownIcon size={12} className="shrink-0 text-fg-subtle" aria-label="Co-captain" />
            <span className="truncate">{team.coCaptain.rsn || "?"}</span>
          </div>
        )}
      </div>
      <ul className="w-full space-y-1">
        {groupByPick(picks).map((group) => (
          <li key={group[0].pickNumber} className="rounded-sm bg-surface px-2.5 py-1 text-sm text-fg-muted">
            {group.map((p) => (
              <div key={p.id} className="truncate">
                {p.rsn || displayName(p.user)}
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
