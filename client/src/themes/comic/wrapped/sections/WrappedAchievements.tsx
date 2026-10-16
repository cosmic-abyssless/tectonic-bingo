import type { WrappedAchievementsModel } from "../../../../headless/types";
import { Reveal, WrappedScene } from "../../../../core/wrapped/Scene";
import { WikiIcon } from "../../../../core/ui/ItemIcon";
import { CaptionBox } from "../../ui/CaptionBox";
import { useComic } from "../../ui/useComic";
import { LETTERED } from "../../../lettering";
import { COVER } from "../coverParts";
import { ComicPerson, display, FULL_PANEL, Kicker, Minis, PADDED_PANEL, PanelHeading, Splash } from "./sectionParts-team-bingo";
import { PanelBody } from "./sectionParts-you-duo-captain-moderator";

/**
 * How many Players the leaderboard's page holds: as many as fit a page at phone width, never fewer than 5. The stored
 * list has up to 10.
 */
const LEADERBOARD_ROWS = 10;

/**
 * The comic Achievements section: its pages, each Reveal one panel, in the default section's order:
 *   1. The splash: the section's art, and how many Players unlocked one as its title.
 *   2. The leaderboard ("Most achievements by:").
 *   3. How many took part, in cells inked apart, and who completed all first.
 *   4. Unlocks per day, a bar for each, the busiest lettered.
 *   5. Every Team, by its Players' Achievements added up.
 *   6. Your place, for a Player: their rank, their count, and their rarest Achievements.
 * A part the Bingo has nothing for leaves its panel out, and a page left with none is not drawn.
 */
export function WrappedAchievements({ section: a }: { section: WrappedAchievementsModel }) {
  const p = a.participation;
  const leaders = a.leaderboard.slice(0, LEADERBOARD_ROWS);
  // The cells are [label, value], as Minis draws them; who earned every one takes the whole last row.
  const cells = p?.playersLabel
    ? [
        p.percentLabel && ["of Players unlocked one", p.percentLabel],
        p.earnedLabel && [p.averageLabel ?? "", p.earnedLabel],
        p.allLabel && ["", p.allLabel],
      ].filter((x): x is string[] => !!x)
    : [];
  const figures = [cells.length > 0, !!p?.allFirst];
  const count = (panels: boolean[]) => panels.filter(Boolean).length;
  const at = (panels: boolean[], i: number) => count(panels.slice(0, i));

  return (
    <>
      <WrappedScene steps={1}>
        <div className="flex flex-1 flex-col gap-3">
          <Reveal step={0} emphasis="splash" className={`flex-1 ${FULL_PANEL}`}>
            <Splash
              art={a.art}
              accent={COVER.GREEN}
              kicker="Achievements"
              title={p?.playersLabel ? `${p.playersLabel} unlocked one` : "Who unlocked the most"}
              titleBig={44}
            />
          </Reveal>
        </div>
      </WrappedScene>

      {leaders.length > 0 && (
        <WrappedScene steps={1}>
          <div className="flex flex-1 flex-col justify-center gap-3">
            <Reveal step={0} className={PADDED_PANEL}>
              <TopAchievers top={leaders} />
            </Reveal>
          </div>
        </WrappedScene>
      )}

      {p && count(figures) > 0 && (
        <WrappedScene steps={count(figures)}>
          <div className="flex flex-1 flex-col justify-center gap-3">
            {cells.length > 0 && (
              <Reveal step={0} className={FULL_PANEL}>
                <Minis cells={cells} />
              </Reveal>
            )}
            {p.allFirst && (
              <Reveal step={at(figures, 1)} className={PADDED_PANEL}>
                <AllFirst allFirst={p.allFirst} />
              </Reveal>
            )}
          </div>
        </WrappedScene>
      )}

      {a.byDay && (
        <WrappedScene steps={1}>
          <div className="flex flex-1 flex-col justify-center gap-3">
            <Reveal step={0} className={PADDED_PANEL}>
              <UnlocksPerDay byDay={a.byDay} />
            </Reveal>
          </div>
        </WrappedScene>
      )}

      {a.teams.length > 0 && (
        <WrappedScene steps={1}>
          <div className="flex flex-1 flex-col justify-center gap-3">
            <Reveal step={0} className={PADDED_PANEL}>
              <AchievementTeams teams={a.teams} />
            </Reveal>
          </div>
        </WrappedScene>
      )}

      {a.you && (
        <WrappedScene steps={1}>
          <div className="flex flex-1 flex-col justify-center gap-3">
            <Reveal step={0} className={PADDED_PANEL}>
              <YourPlace you={a.you} />
            </Reveal>
          </div>
        </WrappedScene>
      )}
    </>
  );
}

/** The first to earn every Achievement: when, lettered big, and who. */
function AllFirst({ allFirst }: { allFirst: NonNullable<NonNullable<WrappedAchievementsModel["participation"]>["allFirst"]> }) {
  return (
    <PanelBody tone="green" rays="85% 85%" align="start" gap={0}>
      <Kicker tilt={1.2}>Completed all first, at:</Kicker>
      <PanelHeading className="mt-2" size={30}>
        {allFirst.atLabel}
      </PanelHeading>
      <div className="mt-3">
        <ComicPerson person={allFirst.person} size={32} nameSize={16} />
      </div>
    </PanelBody>
  );
}

/**
 * "Most achievements by:": the top Players, each on a paper strip so the ink reads over the panel's print. The
 * placement lettered, the Player with their Team and when they got there on one line under them, the count lettered
 * big. Rows are kept compact so ten fit a page.
 */
function TopAchievers({ top }: { top: WrappedAchievementsModel["leaderboard"] }) {
  const { colors } = useComic();
  return (
    <PanelBody tone="cyan" rays="90% 10%" align="start" gap={0}>
      <Kicker>Leaderboard</Kicker>
      <PanelHeading className="mt-2" size={24}>
        Most achievements by:
      </PanelHeading>
      <ol className="mt-2.5 flex flex-col gap-1">
        {top.map((r) => (
          <li
            key={r.person.id}
            className="flex items-center gap-2 border-2 px-2 py-0.5"
            style={{
              borderColor: colors.LINE,
              background: r.isMyTeam ? colors.YELLOW_TINT : colors.PAPER_RAISED,
              boxShadow: r.isMyTeam ? `2px 2px 0 ${colors.SHADOW}` : undefined,
            }}
          >
            <span className={`${LETTERED} num w-8 shrink-0`} style={{ ...display(15), color: colors.INK }}>
              {r.placementLabel}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <ComicPerson person={r.person} size={20} nameSize={13} />
              {(r.teamName || r.atLabel) && (
                <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold leading-tight" style={{ color: colors.INK_BODY }}>
                  {r.teamColor && (
                    <span aria-hidden className="size-2 shrink-0 rounded-full border-[1.5px]" style={{ background: r.teamColor, borderColor: colors.LINE }} />
                  )}
                  <span className="truncate">{[r.teamName, r.atLabel].filter(Boolean).join(" · ")}</span>
                </span>
              )}
            </span>
            <span className="flex shrink-0 flex-col items-end leading-none">
              <span className={`${LETTERED} num`} style={{ ...display(20), color: colors.INK }}>
                {r.earnedLabel}
              </span>
              <span className="mt-0.5 text-[10px] font-bold" style={{ color: colors.INK_BODY }}>
                {r.outOfLabel}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </PanelBody>
  );
}

/**
 * Unlocks per day: a bar printed for each day of the Bingo on a ruled baseline, the busiest picked out with its count
 * lettered over it, the first and last day under them, and the busiest day named in a caption.
 */
function UnlocksPerDay({ byDay }: { byDay: NonNullable<WrappedAchievementsModel["byDay"]> }) {
  const { colors } = useComic();
  const most = Math.max(1, ...byDay.days.map((d) => d.earned));
  return (
    <PanelBody tone="blue" rays="12% 12%" align="start" gap={0}>
      <Kicker>Unlocks per day</Kicker>
      <div aria-hidden className="mt-3 flex h-44 items-stretch gap-[3px] border-b-[3px] pt-5" style={{ borderColor: colors.LINE }}>
        {byDay.days.map((d, i) => {
          const height = (d.earned / most) * 100;
          return (
            <div key={i} className="relative flex min-w-0 flex-1 flex-col justify-end">
              {d.isBusiest && (
                <span
                  className={`${LETTERED} num absolute inset-x-0 text-center whitespace-nowrap`}
                  style={{ ...display(14), color: colors.INK, bottom: `calc(${height}% + 3px)` }}
                >
                  {d.earned}
                </span>
              )}
              {d.earned > 0 && (
                <div
                  className="border-2 border-b-0"
                  style={{ height: `${height}%`, background: d.isBusiest ? colors.YELLOW : colors.CYAN, borderColor: colors.LINE }}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between gap-2 text-[12px] font-semibold" style={{ color: colors.INK_BODY }}>
        <span>{byDay.days[0]!.dayLabel}</span>
        <span>{byDay.days.at(-1)!.dayLabel}</span>
      </div>
      <CaptionBox tone="paper" tilt={-0.6} className="mt-3 text-[14px]">
        <span style={{ color: colors.INK_BODY }}>Busiest day · </span>
        <span className="num font-bold" style={{ color: colors.INK }}>
          {byDay.busiestLabel}
        </span>
      </CaptionBox>
    </PanelBody>
  );
}

/** Every Team by its Players' Achievements added up: placement, the Team's dot and name, the total and its average. */
function AchievementTeams({ teams }: { teams: WrappedAchievementsModel["teams"] }) {
  const { colors } = useComic();
  return (
    <PanelBody tone="orange" rays="10% 90%" align="start" gap={0}>
      <Kicker>Achievements by Team</Kicker>
      <ol className="mt-3 flex flex-col gap-1.5">
        {teams.map((t) => (
          <li
            key={t.teamId}
            className="flex items-center gap-2.5 border-[2.5px] px-2 py-1.5"
            style={{
              borderColor: colors.LINE,
              background: t.isMine ? colors.YELLOW_TINT : colors.PAPER_RAISED,
              boxShadow: t.isMine ? `3px 3px 0 ${colors.SHADOW}` : undefined,
            }}
          >
            <span className={`${LETTERED} num w-9 shrink-0`} style={{ ...display(16), color: colors.INK }}>
              {t.placementLabel}
            </span>
            {t.color && <span aria-hidden className="size-3 shrink-0 rounded-full border-2" style={{ background: t.color, borderColor: colors.LINE }} />}
            <span className="min-w-0 flex-1 break-words font-bold leading-tight" style={{ color: colors.INK }}>
              {t.name}
              {t.isMine && (
                <span className="ml-2 inline-block text-[11px] font-semibold uppercase tracking-wide" style={{ color: colors.INK_SUBTLE }}>
                  your Team
                </span>
              )}
            </span>
            <span className="flex shrink-0 flex-col items-end leading-none">
              <span className={`${LETTERED} num`} style={{ ...display(20), color: colors.INK }}>
                {t.earnedLabel}
              </span>
              <span className="mt-0.5 text-[11px] font-bold" style={{ color: colors.INK_BODY }}>
                {t.averageLabel}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </PanelBody>
  );
}

/** The viewer's own place: their rank lettered big, how many they unlocked, then their rarest, each with its item's icon on a paper strip. */
function YourPlace({ you }: { you: NonNullable<WrappedAchievementsModel["you"]> }) {
  const { colors } = useComic();
  return (
    <PanelBody tone="yellow" rays="85% 15%" align="start" gap={0}>
      <Kicker>Your place</Kicker>
      <PanelHeading className="mt-2" size={40}>
        {you.rankLabel ?? `${you.earnedLabel} ${you.outOfLabel} unlocked`}
      </PanelHeading>
      {you.rankLabel && (
        <p className="mt-1 text-[15px] font-semibold" style={{ color: colors.INK_BODY }}>
          {you.earnedLabel} {you.outOfLabel} unlocked
        </p>
      )}
      {you.rarest.length > 0 && (
        <>
          <p className={`${LETTERED} mt-3.5`} style={{ ...display(14, { letterSpacing: "0.08em" }), color: colors.INK_SUBTLE }}>
            Your rarest
          </p>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {you.rarest.map((r) => (
              <li key={r.key} className="flex items-center gap-2 border-2 px-2 py-1" style={{ borderColor: colors.LINE, background: colors.PAPER_RAISED }}>
                <WikiIcon name={r.itemName} className="size-7 shrink-0 [image-rendering:pixelated]" />
                <span className="min-w-0 flex-1 truncate font-bold" style={{ color: colors.INK }}>
                  {r.name}
                </span>
                <span className="shrink-0 text-[12px] font-bold" style={{ color: colors.INK_BODY }}>
                  {r.percentLabel} of Players
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </PanelBody>
  );
}
