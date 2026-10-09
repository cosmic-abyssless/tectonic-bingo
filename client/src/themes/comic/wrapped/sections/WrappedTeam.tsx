import type { ReactNode } from "react";
import type { WrappedPersonModel, WrappedTeamModel } from "../../../../headless/types";
import { PointsChart } from "../../../../core/wrapped/PointsChart";
import { Reveal, WrappedScene } from "../../../../core/wrapped/Scene";
import { useComic } from "../../ui/useComic";
import { LETTERED } from "../../../lettering";
import { COVER } from "../coverParts";
import { ComicDrop, ComicPerson, display, FULL_PANEL, GroundHalftone, InkBurst, Kicker, burstFont, PADDED_PANEL, PanelHeading, Splash, Sfx, Tally } from "./sectionParts-team-bingo";
import { Gp } from "./sectionParts-you-duo-captain-moderator";

/**
 * The comic Team section (#421): two pages. The first opens on a splash with the Team's Category images and name, then the
 * placement in a burst beside the Tiles and Lines, then the MVP and the top drop value as a two-cell panel. The second holds
 * the biggest drop and the Team's whole Drop value, the climb, and the Superlatives. Each Reveal is one panel; a field the Team has no data for leaves its
 * panel out, and a page left with none is not drawn, so nothing is left as a gap.
 */
export function WrappedTeam({ section: t }: { section: WrappedTeamModel }) {
  const hasStars = !!(t.mvp || t.topGpEarner);
  const second = [!!t.biggestDrop, !!t.dropValueLabel, !!t.chart, t.superlatives.length > 0];
  const { colors } = useComic();
  const secondSteps = second.filter(Boolean).length;
  const secondStep = (i: number) => second.slice(0, i).filter(Boolean).length;
  return (
    <>
      <WrappedScene steps={hasStars ? 4 : 3}>
        <div className="flex flex-1 flex-col gap-3">
          <Reveal step={0} emphasis="splash" className={`flex-1 ${FULL_PANEL}`}>
            <Splash art={t.art} accent={t.color ?? COVER.BLUE} kicker="Your Team" kickerDot={t.color} title={t.name} />
          </Reveal>
          <div className="grid grid-cols-2 gap-3">
            <Reveal step={1} className={FULL_PANEL}>
              <Placement t={t} />
            </Reveal>
            <Reveal step={2} className={PADDED_PANEL}>
              <Tallies t={t} />
            </Reveal>
          </div>
          {hasStars && (
            <Reveal step={3} className={FULL_PANEL}>
              <Stars t={t} />
            </Reveal>
          )}
        </div>
      </WrappedScene>

      {secondSteps > 0 && (
        <WrappedScene steps={secondSteps}>
          <div className="flex flex-1 flex-col justify-center gap-3">
            {t.biggestDrop && (
              <Reveal step={secondStep(0)} className={PADDED_PANEL}>
                <Kicker>The Team's biggest drop</Kicker>
                <div className="mt-3">
                  <ComicDrop drop={t.biggestDrop} showPlayer burst />
                </div>
              </Reveal>
            )}
            {t.dropValueLabel && (
              <Reveal step={secondStep(1)} className={FULL_PANEL}>
                <div className="flex flex-1 items-center justify-center px-2 py-4" style={{ background: colors.PAPER_RAISED }}>
                  <Tally value={<Gp label={t.dropValueLabel} />} label="the Team's drop value, all told" size={46} />
                </div>
              </Reveal>
            )}
            {t.chart && (
              <Reveal step={secondStep(2)} className={PADDED_PANEL}>
                <ClimbHeading t={t} />
                <div className="mt-3 -mx-1">
                  <PointsChart chart={t.chart} label={`${t.name}'s points over time`} />
                </div>
              </Reveal>
            )}
            {t.superlatives.length > 0 && (
              <Reveal step={secondStep(3)} className={PADDED_PANEL}>
                <Kicker>Superlatives</Kicker>
                <PanelHeading className="mt-1.5" size={28}>
                  Your Team decided
                </PanelHeading>
                <ul className="mt-2.5 flex flex-col gap-1.5">
                  {t.superlatives.map((s) => (
                    <li key={s.category} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-[2.5px] px-2 py-1.5" style={{ borderColor: colors.LINE, background: colors.YELLOW_TINT }}>
                      <span className={`${LETTERED} shrink-0 border-2 px-1.5 pt-[3px] pb-px`} style={{ ...display(15), background: colors.YELLOW, color: colors.ON_YELLOW, borderColor: colors.LINE, transform: "rotate(-1.5deg)" }}>
                        {s.category}
                      </span>
                      {s.winners.map((w) => (
                        <ComicPerson key={w.id} person={w} size={24} nameSize={13} />
                      ))}
                    </li>
                  ))}
                </ul>
              </Reveal>
            )}
          </div>
        </WrappedScene>
      )}
    </>
  );
}

/** "The climb" and the points, the lines the default's chart has over it. */
function ClimbHeading({ t }: { t: WrappedTeamModel }) {
  return (
    <div className="flex items-end justify-between gap-2">
      <div>
        <Kicker>The climb</Kicker>
        <PanelHeading className="mt-2" size={30}>
          {t.pointsLabel} points
        </PanelHeading>
      </div>
      <Sfx size={26} tilt={7} className="mb-1">
        Up, up!
      </Sfx>
    </div>
  );
}

/** The placement in a burst (gold, silver or bronze for the podium), with the points under it. */
function Placement({ t }: { t: WrappedTeamModel }) {
  const { colors } = useComic();
  const medal = t.placement === 1 ? colors.YELLOW : t.placement === 2 ? "#d6dae1" : t.placement === 3 ? "#e29a5c" : colors.PAPER_ALT;
  const sfx = t.placement === 1 ? "Ka-pow!" : t.placement === 2 ? "Wham!" : t.placement === 3 ? "Bam!" : null;
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-2 px-2 py-3" style={{ background: colors.PAPER_RAISED }}>
      <GroundHalftone color={colors.RULE} from={0.45} />
      {sfx && <Sfx size={22} tilt={-9} className="absolute top-1.5 left-2 z-[1]">{sfx}</Sfx>}
      <InkBurst fill={medal} tilt={-5} className="relative w-[112px]">
        <span className="num" style={{ fontSize: burstFont(t.placementLabel, 26) }}>
          {t.placementLabel}
        </span>
      </InkBurst>
      <p className="relative text-center text-[14px] leading-tight" style={{ color: colors.INK_BODY }}>
        <span className={`${LETTERED} num`} style={{ ...display(24), color: colors.INK }}>
          {t.pointsLabel}
        </span>{" "}
        points
      </p>
    </div>
  );
}

/** Tiles and Lines completed, one over the other. */
function Tallies({ t }: { t: WrappedTeamModel }) {
  const { colors } = useComic();
  return (
    <div className="flex flex-1 flex-col items-stretch justify-evenly gap-3">
      <Tally value={t.tilesCompleted} label={`${t.tilesCompleted === 1 ? "Tile" : "Tiles"} completed`} size={46} />
      <div aria-hidden className="mx-3 border-t-[3px] border-dashed" style={{ borderColor: colors.RULE }} />
      <Tally value={t.linesCompleted} label={`${t.linesCompleted === 1 ? "Line" : "Lines"} completed`} size={46} />
    </div>
  );
}

/** The MVP and the top drop value: a panel of two cells, alike row for row so they line up, with one cell it is that one's. */
function Stars({ t }: { t: WrappedTeamModel }) {
  const { colors } = useComic();
  return (
    <div className="flex flex-1" style={{ background: colors.PAPER_RAISED }}>
      {t.mvp && (
        <StarCell kicker={<Kicker>MVP</Kicker>} person={t.mvp.person} figure={t.mvp.shareLabel} label="Points share" drop={colors.YELLOW} />
      )}
      {t.mvp && t.topGpEarner && <div aria-hidden className="w-[3px] shrink-0" style={{ background: colors.LINE }} />}
      {t.topGpEarner && (
        <StarCell
          kicker={
            <Kicker tilt={1.5} fill={colors.GREEN_TINT}>
              Top drop value
            </Kicker>
          }
          person={t.topGpEarner.person}
          figure={<Gp label={t.topGpEarner.gpLabel} />}
          label="Drop value"
          drop={colors.GREEN_TINT}
        />
      )}
    </div>
  );
}

/** One of the Stars' cells: its tag, the Player, and their figure lettered big over what it is. */
function StarCell({ kicker, person, figure, label, drop }: { kicker: ReactNode; person: WrappedPersonModel; figure: ReactNode; label: string; drop: string }) {
  const { colors } = useComic();
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-3 px-4 pt-4 pb-5 text-center [&>p]:self-center">
      {kicker}
      <ComicPerson person={person} size={48} column nameSize={15} />
      <div data-beat="slam" className="mt-auto">
        <div className={`${LETTERED} num flex justify-center whitespace-nowrap`} style={{ ...display(30), color: colors.INK, textShadow: `2px 2px 0 ${drop}`, paddingRight: 2 }}>
          {figure}
        </div>
        <div className="mt-1 text-[12px] uppercase tracking-wide" style={{ color: colors.INK_SUBTLE, fontWeight: 700 }}>
          {label}
        </div>
      </div>
    </div>
  );
}
