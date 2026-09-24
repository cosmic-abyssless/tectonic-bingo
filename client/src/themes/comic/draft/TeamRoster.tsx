import { groupByPick, ordinal, type TeamRosterProps } from "../../../core/draft/TeamRoster";
import { PlayerName } from "../../../core/tectonic/PlayerName";
import { CrownIcon, LinkIcon } from "../../../core/ui/icons";
import { displayName } from "../../../core/ui/user";
import { pageColors } from "../board/colors";
import { COMIC_FONT } from "../font";
import { paperVars } from "../signup/parts";
import { useComic } from "../ui/useComic";

/**
 * The comic theme's draft room column for a team: a card like a character card (the team's colour as a band across
 * the top, its name in Bangers, the captains under it), then each pick as an ink-outlined slip. The team on the clock
 * is lifted and yellow. The cards and slips are the book pages' papyrus (in the dark palettes, set against the Teams
 * panel's charcoal); the order label above sits on the panel, in its palette.
 */
export function TeamRoster({ team, picks, isCurrent, showOrder, hiddenPickNumbers, reserveCoCaptainRow, pairRows }: TeamRosterProps) {
  const { colors: panel } = useComic();
  const colors = pageColors(panel);
  const label = isCurrent ? "Picking!" : showOrder && team.draftOrder != null ? ordinal(team.draftOrder) : null;
  return (
    // The chrome tokens point at the papyrus too, for PlayerName's underline and hover colours.
    <div className="flex min-w-0 flex-col gap-1.5" style={paperVars(colors)}>
      <div className="h-4 text-sm uppercase leading-none tracking-wide" style={{ fontFamily: COMIC_FONT, color: isCurrent ? panel.RED : panel.INK_SUBTLE }}>
        {label}
      </div>
      <div
        className="w-full overflow-hidden border-[3px] transition-[transform,box-shadow] duration-200"
        style={{
          borderColor: colors.LINE,
          background: isCurrent ? colors.YELLOW : colors.PAPER,
          color: isCurrent ? colors.ON_YELLOW : colors.INK,
          // Shadows in the panel's line colour: the papyrus's sepia ink vanishes against the charcoal.
          boxShadow: `${isCurrent ? 4 : 2}px ${isCurrent ? 4 : 2}px 0 ${panel.LINE}`,
          transform: isCurrent ? "translate(-1px, -2px)" : undefined,
        }}
      >
        {/* The team's colour, a band across the top (a team with none gets the paper's alternate shade). */}
        <div aria-hidden className="h-2 border-b-2" style={{ background: team.color ?? colors.PAPER_ALT, borderColor: colors.LINE }} />
        <div className="px-2 pb-1.5 pt-1">
          <div className="truncate text-lg uppercase leading-tight" style={{ fontFamily: COMIC_FONT, letterSpacing: "0.02em" }}>
            {team.name}
          </div>
          <div className="flex min-w-0 items-center gap-1 text-xs font-semibold">
            <CrownIcon size={12} className="shrink-0" style={{ color: isCurrent ? colors.ON_YELLOW : colors.WARN }} aria-label="Captain" />
            <PlayerName userId={team.captainUserId} className="truncate">
              {team.captainRsn || "?"}
            </PlayerName>
          </div>
          {team.coCaptain && (
            <div className="flex min-w-0 items-center gap-1 text-xs font-semibold">
              <CrownIcon size={12} className="shrink-0 opacity-60" aria-label="Co-captain" />
              <PlayerName userId={team.coCaptain.userId} className="truncate">
                {team.coCaptain.rsn || "?"}
              </PlayerName>
            </div>
          )}
          {!team.coCaptain && reserveCoCaptainRow && <div aria-hidden className="h-4" />}
        </div>
      </div>
      <ul className="w-full space-y-1.5">
        {groupByPick(picks).map((group, i) => (
          <li
            key={group[0].pickNumber}
            data-team-id={team.id}
            data-pick-number={group[0].pickNumber}
            className={`flex flex-col justify-center rounded-sm border-2 px-2 py-1 text-sm font-semibold ${group.length === 1 && pairRows?.[i] ? "min-h-[52px]" : ""} ${hiddenPickNumbers?.has(group[0].pickNumber) ? "invisible" : ""}`}
            style={{ borderColor: colors.LINE, background: colors.PAPER, color: colors.INK, boxShadow: `2px 2px 0 ${panel.LINE}` }}
          >
            {group.map((p, j) => (
              <div key={p.id} className="flex min-w-0 items-center gap-1">
                <PlayerName userId={p.userId} className="truncate">
                  {p.rsn || displayName(p.user)}
                </PlayerName>
                {/* A duo pair, drafted as one pick: linked. */}
                {j < group.length - 1 && <LinkIcon size={11} className="shrink-0" style={{ color: colors.INK_SUBTLE }} aria-label="paired with" />}
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
