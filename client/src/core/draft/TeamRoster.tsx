import type { DraftPick, DraftTeam } from "@bingo/shared";
import { CaptainEmblem } from "../ui/CaptainEmblem";
import { displayName } from "../ui/user";
import { PlayerName } from "../tectonic/PlayerName";
import { useOptionalSlot } from "../../themes/context";
import { UndoPickButton, type UndoLatestPick } from "./UndoPick";

// A duo pair is drafted as one pick, so both rows share a pickNumber — show
// them as one entry so the roster reads the same way the draft was made.
export function groupByPick<P extends DraftPick>(picks: P[]): P[][] {
  const byNumber = new Map<number, P[]>();
  for (const p of picks) byNumber.set(p.pickNumber, [...(byNumber.get(p.pickNumber) ?? []), p]);
  return [...byNumber.entries()].sort(([a], [b]) => a - b).map(([, group]) => group);
}

/** A pick on a Team's roster; `left`: drafted, but no longer on the Team (removed, or moved to another). */
export type RosterPick = DraftPick & { left?: boolean };

/**
 * A Team's roster once the Draft is over, as picks: every pick it made, with whoever has since left it marked `left`
 * (shown struck through, so a pair stays a pair), then each member it never drafted (a Late signup, a Player moved in)
 * as a single of their own after the last pick. The pick numbers only order and group the slips; none is shown.
 */
export function currentRosterPicks(team: DraftTeam, picks: DraftPick[]): RosterPick[] {
  // A drafted Player made Captain or co-captain since is still on the Team, though not among its members.
  const onTeam = new Set([...team.members.map((m) => m.userId), team.captainUserId, team.coCaptain?.userId]);
  const drafted: RosterPick[] = picks.filter((p) => p.teamId === team.id).map((p) => (onTeam.has(p.userId) ? p : { ...p, left: true }));
  const draftedIds = new Set(drafted.map((p) => p.userId));
  const after = Math.max(0, ...picks.map((p) => p.pickNumber));
  const added = team.members
    .filter((m) => !draftedIds.has(m.userId))
    .map((m, i) => ({ id: `member-${m.userId}`, bingoId: team.bingoId, pickNumber: after + 1 + i, teamId: team.id, userId: m.userId, pickedByUserId: "", createdAt: "", user: m.user, rsn: m.rsn }));
  return [...drafted, ...added];
}

/** A pick's name on a roster slip; one who has left the Team is struck through and dimmed. */
export function RosterName({ pick, className = "" }: { pick: RosterPick; className?: string }) {
  const name = pick.rsn || displayName(pick.user);
  return (
    <PlayerName userId={pick.userId} className={`${className} ${pick.left ? "opacity-50" : ""}`}>
      {pick.left ? <span className="line-through">{name}</span> : name}
      {pick.left && <span className="sr-only"> (no longer on the team)</span>}
    </PlayerName>
  );
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

export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

export interface TeamRosterProps {
  team: DraftTeam;
  picks: RosterPick[];
  isCurrent?: boolean;
  highlight?: boolean;
  showOrder?: boolean;
  /** Picks to keep invisible (their slot is still held) while a reveal is on its way to them. */
  hiddenPickNumbers?: ReadonlySet<number>;
  /** Some team in the row has a co-captain: keep the slot on those without one so the cards stay the same height. */
  reserveCoCaptainRow?: boolean;
  /** pairPickRows across all teams: which pick rounds hold a pair somewhere, so solo picks there match its height. */
  pairRows?: boolean[];
  /** This team holds the latest pick and the viewer may take it back: its slip gets the undo button (UndoPickButton). */
  undo?: UndoLatestPick;
}

/**
 * One team's column in the draft room: its card (name, captains), then its picks in order. Inside a theme that draws
 * its own (the DraftTeamRoster slot) it's the theme's. Either way each pick's element carries data-team-id and
 * data-pick-number: the pick reveal flies to it (DraftPickReveal), and it stays invisible while listed in
 * hiddenPickNumbers.
 */
export function TeamRoster(props: TeamRosterProps) {
  const Themed = useOptionalSlot("DraftTeamRoster");
  return Themed ? <Themed {...props} /> : <PlainTeamRoster {...props} />;
}

export function PlainTeamRoster({ team, picks, isCurrent, highlight, showOrder, hiddenPickNumbers, reserveCoCaptainRow, pairRows, undo }: TeamRosterProps) {
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
          <CaptainEmblem />
          <PlayerName userId={team.captainUserId} className="truncate">
            {team.captainRsn || "?"}
          </PlayerName>
        </div>
        {team.coCaptain && (
          <div className="flex min-w-0 items-center gap-1 text-xs text-on-surface-muted">
            <CaptainEmblem co />
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
            className={`flex items-center gap-1 rounded-sm border border-outline bg-surface-raised px-2.5 py-1 text-sm text-on-surface ${group.length === 1 && pairRows?.[i] ? "min-h-[50px]" : ""} ${hiddenPickNumbers?.has(group[0].pickNumber) ? "invisible" : ""}`}
          >
            <div className="flex min-w-0 flex-1 flex-col justify-center">
              {group.map((p) => (
                <div key={p.id} className="truncate">
                  <RosterName pick={p} />
                </div>
              ))}
            </div>
            {undo?.pickNumber === group[0].pickNumber && <UndoPickButton undo={undo} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
