import type { DraftPick, DraftTeam } from "@bingo/shared";
import { CrownIcon } from "../ui/icons";
import { displayName } from "../ui/user";
import { PlayerName } from "../tectonic/PlayerName";

// A duo pair is drafted as one pick, so both rows share a pickNumber — show
// them as one entry so the roster reads the same way the draft was made.
function groupByPick(picks: DraftPick[]): DraftPick[][] {
  const byNumber = new Map<number, DraftPick[]>();
  for (const p of picks) byNumber.set(p.pickNumber, [...(byNumber.get(p.pickNumber) ?? []), p]);
  return [...byNumber.entries()].sort(([a], [b]) => a - b).map(([, group]) => group);
}

/**
 * For each pick round (the nth pick group of a team), whether any team's nth pick is a duo pair. Solo picks in that
 * round are padded to a pair's height, so a round lines up across the team columns.
 */
export function pairPickRows(picksByTeam: DraftPick[][]): boolean[] {
  const rows: boolean[] = [];
  for (const picks of picksByTeam) groupByPick(picks).forEach((group, i) => (rows[i] = rows[i] || group.length > 1));
  return rows;
}

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

export function TeamRoster({
  team,
  picks,
  isCurrent,
  highlight,
  showOrder,
  hiddenPickNumbers,
  reserveCoCaptainRow,
  pairRows,
}: {
  team: DraftTeam;
  picks: DraftPick[];
  isCurrent?: boolean;
  highlight?: boolean;
  showOrder?: boolean;
  /** Picks to keep invisible (their slot is still held) while a reveal is on its way to them. */
  hiddenPickNumbers?: ReadonlySet<number>;
  /** Some team in the row has a co-captain: keep the slot on those without one so the cards stay the same height. */
  reserveCoCaptainRow?: boolean;
  /** pairPickRows across all teams: which pick rounds hold a pair somewhere, so solo picks there match its height. */
  pairRows?: boolean[];
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="h-4 text-[11px] font-medium uppercase tracking-wide text-on-surface">
        {isCurrent ? "Currently picking" : showOrder && team.draftOrder != null ? ordinal(team.draftOrder) : null}
      </div>
      <div
        className={`w-full rounded-md border px-2.5 py-2 transition-colors ${isCurrent ? "border-on-surface bg-surface-raised" : highlight ? "border-outline-strong bg-surface-raised" : "border-outline-strong bg-surface-raised"}`}
        style={team.color && !isCurrent ? { borderColor: `${team.color}99` } : undefined}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          {team.color && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: team.color }} />}
          <span className="truncate text-sm font-semibold text-on-surface">{team.name}</span>
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-on-surface-muted">
          <CrownIcon size={12} className="shrink-0 text-warn" aria-label="Captain" />
          <PlayerName userId={team.captainUserId} className="truncate">
            {team.captainRsn || "?"}
          </PlayerName>
        </div>
        {team.coCaptain && (
          <div className="flex min-w-0 items-center gap-1 text-xs text-on-surface-muted">
            <CrownIcon size={12} className="shrink-0 text-on-surface-subtle" aria-label="Co-captain" />
            <PlayerName userId={team.coCaptain.userId} className="truncate">
              {team.coCaptain.rsn || "?"}
            </PlayerName>
          </div>
        )}
        {!team.coCaptain && reserveCoCaptainRow && <div aria-hidden className="h-4" />}
      </div>
      <ul className="w-full space-y-1">
        {groupByPick(picks).map((group, i) => (
          <li
            key={group[0].pickNumber}
            data-team-id={team.id}
            data-pick-number={group[0].pickNumber}
            className={`flex flex-col justify-center rounded-sm border border-outline bg-surface-raised px-2.5 py-1 text-sm text-on-surface ${group.length === 1 && pairRows?.[i] ? "min-h-[50px]" : ""} ${hiddenPickNumbers?.has(group[0].pickNumber) ? "invisible" : ""}`}
          >
            {group.map((p) => (
              <div key={p.id} className="truncate">
                <PlayerName userId={p.userId}>{p.rsn || displayName(p.user)}</PlayerName>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
