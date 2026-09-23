import type { CSSProperties } from "react";
import type { DraftPick, DraftTeam } from "@bingo/shared";
import { CrownIcon, LinkIcon } from "../ui/icons";
import { displayName } from "../ui/user";
import { PlayerName } from "../tectonic/PlayerName";
import { inkOn } from "./teamColor";
import { groupByPick } from "./TeamRoster";

const HEADING_FONT: CSSProperties = { fontFamily: "var(--font-heading, inherit)", fontWeight: "var(--font-heading-weight, revert)" };

function FinalTeamCard({ team, picks, mine }: { team: DraftTeam; picks: DraftPick[]; mine: boolean }) {
  const color = team.color ?? "var(--color-accent)";
  const ink = team.color ? inkOn(team.color) : "var(--color-on-accent)";
  const captains = [
    { userId: team.captainUserId, rsn: team.captainRsn, co: false },
    ...(team.coCaptain ? [{ userId: team.coCaptain.userId, rsn: team.coCaptain.rsn, co: true }] : []),
  ];
  return (
    <article
      className={`flex min-w-0 flex-col overflow-hidden rounded-lg border-2 bg-surface-raised shadow-[4px_4px_0_var(--color-shade)] ${mine ? "" : "border-outline-strong"}`}
      // The own team gets a heavy frame in its colour, lifted off the row; the others keep a neutral edge.
      style={mine ? { borderColor: color, boxShadow: `0 0 0 3px ${color}, 0 8px 20px var(--color-shade)`, transform: "translateY(-2px)" } : undefined}
    >
      <header className="px-3 py-2.5" style={{ backgroundColor: color, color: ink }}>
        <div className="flex items-center justify-between gap-2">
          <h4 className="truncate text-lg font-bold leading-tight" style={HEADING_FONT}>
            {team.name}
          </h4>
          {mine && <span className="shrink-0 rounded-full bg-black/25 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide">Your team</span>}
        </div>
        <ul className="mt-0.5 space-y-0.5 text-xs opacity-95">
          {captains.map((c) => (
            <li key={c.userId} className="flex min-w-0 items-center gap-1">
              <CrownIcon size={12} className="shrink-0" aria-label={c.co ? "Co-captain" : "Captain"} />
              <PlayerName userId={c.userId} className="truncate">
                {c.rsn || "?"}
              </PlayerName>
            </li>
          ))}
        </ul>
      </header>
      <ul className="space-y-1.5 p-2.5">
        {groupByPick(picks).map((group) => (
          <li key={group[0].pickNumber}>
            {group.length > 1 ? (
              // A duo pair: one bracketed unit with a link between the two names.
              <div className="relative rounded-md border-2 px-2.5 py-1 text-sm text-on-surface" style={{ borderColor: color }}>
                {group.map((p, i) => (
                  <div key={p.id} className="truncate">
                    <PlayerName userId={p.userId}>{p.rsn || displayName(p.user)}</PlayerName>
                    {i < group.length - 1 && <LinkIcon size={12} className="ml-1.5 inline text-on-surface-subtle" aria-label="paired with" />}
                  </div>
                ))}
              </div>
            ) : (
              <div className="truncate rounded-md border border-outline px-2.5 py-1 text-sm text-on-surface">
                <PlayerName userId={group[0].userId}>{group[0].rsn || displayName(group[0].user)}</PlayerName>
              </div>
            )}
          </li>
        ))}
        {picks.length === 0 && <li className="text-sm text-on-surface-subtle">No players drafted.</li>}
      </ul>
    </article>
  );
}

/** The finished draft: one card per team — captains up top, Duo pairs linked, the viewer's own team framed. */
export function FinalTeams({ teams, picks, myUserId }: { teams: DraftTeam[]; picks: DraftPick[]; myUserId: string | null }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {teams.map((team) => (
        <FinalTeamCard
          key={team.id}
          team={team}
          picks={picks.filter((p) => p.teamId === team.id)}
          mine={!!myUserId && (team.captainUserId === myUserId || team.coCaptain?.userId === myUserId || picks.some((p) => p.teamId === team.id && p.userId === myUserId))}
        />
      ))}
    </div>
  );
}
