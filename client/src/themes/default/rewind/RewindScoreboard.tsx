import type { RewindScoreboardModel } from "../../../headless/types";

/** Every Team's points at the moment being viewed. Pressing a Team shows its Board. */
export function RewindScoreboard({ scoreboard }: { scoreboard: RewindScoreboardModel }) {
  return (
    <section aria-label="Scoreboard" className="rounded-md border border-outline bg-surface">
      <h2 className="border-b border-outline px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-on-surface-subtle">Scoreboard</h2>
      <ol>
        {scoreboard.teams.map((team) => (
          <li key={team.id}>
            <button
              type="button"
              onClick={() => scoreboard.select(team.id)}
              aria-current={team.isViewed ? "true" : undefined}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-hover ${team.isViewed ? "bg-accent/10" : ""}`}
            >
              <span className="num w-5 shrink-0 text-xs text-on-surface-subtle">{team.rank}</span>
              <span className="size-2.5 shrink-0 rounded-full bg-on-surface-subtle" style={team.color ? { backgroundColor: team.color } : undefined} />
              <span className={`min-w-0 flex-1 truncate ${team.isViewed ? "font-semibold text-on-surface" : "text-on-surface-muted"}`}>
                {team.name}
                {team.isMine && <span className="ml-1 text-[10px] text-on-surface-subtle">you</span>}
              </span>
              <span className="num font-semibold text-on-surface">{team.points.toLocaleString()}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
