import type { WrappedBingoModel } from "../../../../headless/types";
import { PointsChart } from "../../../../core/wrapped/PointsChart";
import { Reveal, WrappedScene } from "../../../../core/wrapped/Scene";
import { CaptionBox } from "../../ui/CaptionBox";
import { useComic } from "../../ui/useComic";
import { COVER } from "../coverParts";
import { ComicDrop, ComicPerson, display, FULL_PANEL, Kicker, PADDED_PANEL, PanelHeading, Sfx, Splash, StampLabel, Tally } from "./sectionParts-team-bingo";
import { PanelBody } from "./sectionParts-you-duo-captain-moderator";

/**
 * The comic Bingo section (#421): the Bingo-wide story, and for some viewers (a Moderator who didn't play) the only section,
 * so its first page reads on its own straight after the contents page. Up to four pages, each Reveal one panel, in the
 * default section's order:
 *   1. Everyone, together: the splash, the totals, the leaderboard.
 *   2. The highlights: the race, the rarest drop, the crowd favourite.
 *   3. The draft's Steal, then Behind the scenes: who moderated (the Moderators category's art and credits), the wait times.
 *   4. The reviewers, then every Team's Superlatives, a few Teams to a page, dealt evenly over as many pages as they need.
 * A part the Bingo has nothing for leaves its panel out, and a page left with none is not drawn.
 */
export function WrappedBingo({ section: b }: { section: WrappedBingoModel }) {
  const m = b.moderation;
  const minis = m ? [m.medianLabel && ["median wait", m.medianLabel], m.fastestLabel && ["fastest review", m.fastestLabel], m.withinHourLabel && ["within an hour", m.withinHourLabel], m.busiestHourLabel && ["busiest hour", m.busiestHourLabel]].filter((x): x is string[] => !!x) : [];
  // Each later page's panels, in the default section's order; a panel's step is how many of its page's panels come first.
  const highlights = [!!b.race, !!b.rarestDrop, !!b.mostReacted];
  const backstage = [!!b.steal, !!m, !!m && minis.length > 0];
  // The Superlatives of every Team can run long (a card per Team), so they are dealt over pages of a few cards each; the
  // first shares its page with the reviewers when there are any.
  const firstPick = m && m.reviewers.length > 0 ? 2 : 4;
  const pickPages = [b.teamSuperlatives.slice(0, firstPick)];
  const rest = b.teamSuperlatives.slice(firstPick);
  const perPage = rest.length ? Math.ceil(rest.length / Math.ceil(rest.length / 4)) : 4;
  for (let i = 0; i < rest.length; i += perPage) pickPages.push(rest.slice(i, i + perPage));
  if (pickPages[0]!.length === 0 && !(m && m.reviewers.length > 0)) pickPages.length = 0;
  const count = (panels: boolean[]) => panels.filter(Boolean).length;
  const at = (panels: boolean[], i: number) => count(panels.slice(0, i));

  return (
    <>
      <WrappedScene steps={3}>
        <div className="flex flex-1 flex-col gap-3">
          <Reveal step={0} emphasis="splash" className={`flex-1 ${FULL_PANEL}`}>
            <Splash art={b.art} accent={COVER.ORANGE} kicker="The Bingo" title="Everyone, together" titleBig={44} />
          </Reveal>
          <Reveal step={1} className={FULL_PANEL}>
            <Totals b={b} />
          </Reveal>
          <Reveal step={2} className={PADDED_PANEL}>
            <Leaderboard b={b} />
          </Reveal>
        </div>
      </WrappedScene>

      {count(highlights) > 0 && (
        <WrappedScene steps={count(highlights)}>
          <div className="flex flex-1 flex-col justify-center gap-3">
            {b.race && (
              <Reveal step={at(highlights, 0)} className={PADDED_PANEL}>
                {/* The sound effect rides above the chart, clear of the lines' finish at its top right. */}
                <div className="relative -mx-1 pt-8">
                  <Sfx size={26} tilt={6} className="absolute top-0 right-1 z-[1]">
                    Zoom!
                  </Sfx>
                  <PointsChart chart={b.race} label="Every Team's points over time" />
                </div>
              </Reveal>
            )}
            {b.rarestDrop && (
              <Reveal step={at(highlights, 1)} className={PADDED_PANEL}>
                <PanelBody tone="yellow" rays="88% 12%" align="start" gap={0}>
                  <Kicker>The rarest drop</Kicker>
                  <PanelHeading className="mt-2" size={30}>
                    {b.rarestDrop.itemName}
                  </PanelHeading>
                  {b.rarestDrop.luck && (
                    <CaptionBox tone="paper" tilt={-0.6} className="mt-2.5 text-[14px]">
                      {b.rarestDrop.luck.sentence}
                    </CaptionBox>
                  )}
                  <div className="mt-3.5">
                    <ComicDrop drop={b.rarestDrop} showPlayer />
                  </div>
                </PanelBody>
              </Reveal>
            )}
            {b.mostReacted && (
              <Reveal step={at(highlights, 2)} className={PADDED_PANEL}>
                <PanelBody tone="orange" rays="10% 90%" align="start" gap={0}>
                  <Kicker tilt={1.2}>The crowd favourite · {b.mostReacted.reactionsLabel}</Kicker>
                  <div className="mt-3">
                    <ComicDrop drop={b.mostReacted.drop} showPlayer />
                  </div>
                </PanelBody>
              </Reveal>
            )}
          </div>
        </WrappedScene>
      )}

      {count(backstage) > 0 && (
        <WrappedScene steps={count(backstage)}>
          <div className="flex flex-1 flex-col justify-center gap-3">
            {b.steal && (
              <Reveal step={at(backstage, 0)} className={PADDED_PANEL}>
                <Steal steal={b.steal} />
              </Reveal>
            )}
            {m && (
              <Reveal step={at(backstage, 1)} className={`flex-1 ${FULL_PANEL}`}>
                <Splash art={m.art} accent={COVER.PURPLE} kicker="Behind the scenes" title={m.reviewedLabel} titleBig={44} />
              </Reveal>
            )}
            {m && minis.length > 0 && (
              <Reveal step={at(backstage, 2)} className={FULL_PANEL}>
                <Minis cells={minis} />
              </Reveal>
            )}
          </div>
        </WrappedScene>
      )}

      {pickPages.map((teams, page) => {
        const reviewers = page === 0 && !!m && m.reviewers.length > 0;
        if (teams.length === 0 && !reviewers) return null;
        const first = page === 0;
        return (
          <WrappedScene key={page} steps={(reviewers ? 1 : 0) + (teams.length > 0 ? 1 : 0)}>
            <div className="flex flex-1 flex-col gap-3">
              {reviewers && m && (
                <Reveal step={0} className={PADDED_PANEL}>
                  <PanelBody tone="red" rays="90% 10%" align="start" gap={0}>
                    <Reviewers m={m} />
                  </PanelBody>
                </Reveal>
              )}
              {/* The Superlatives' title is lettered on the page itself, over the Teams' panels. */}
              {teams.length > 0 && first && (
                <div className="pt-1">
                  <Kicker>Superlatives</Kicker>
                  <PanelHeading className="mt-2" size={32}>
                    Every Team's picks
                  </PanelHeading>
                </div>
              )}
              {/* Each Team's picks a panel of its own, all at one step: the camera takes them in together. */}
              {teams.length > 0 && (
                <div className={`grid flex-1 auto-rows-fr gap-3 ${teams.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
                  {teams.map((t) => (
                    <Reveal key={t.teamId} step={reviewers ? 1 : 0} className={PADDED_PANEL}>
                      <TeamPicks team={t} />
                    </Reveal>
                  ))}
                </div>
              )}
            </div>
          </WrappedScene>
        );
      })}
    </>
  );
}

/** The totals: Submissions and GP in drops, each a headline number in a cell of a two-cell panel. */
function Totals({ b }: { b: WrappedBingoModel }) {
  const { colors } = useComic();
  return (
    <div className="relative flex flex-1 items-stretch" style={{ background: colors.PAPER_RAISED }}>
      <div className="flex flex-1 flex-col items-center justify-center px-2 py-4">
        <Tally value={b.totalSubmissionsLabel} label={b.totalSubmissions === 1 ? "Submission" : "Submissions"} size={52} />
      </div>
      <div aria-hidden className="w-[3px] shrink-0" style={{ background: colors.LINE }} />
      <div className="flex flex-1 flex-col items-center justify-center px-2 py-4">
        <Tally value={b.totalGpLabel} label="GP in drops" size={52} />
      </div>
    </div>
  );
}

/** The leaderboard: one row per Team, the viewer's Team marked and lit. */
function Leaderboard({ b }: { b: WrappedBingoModel }) {
  const { colors } = useComic();
  const medal = [colors.YELLOW, "#d6dae1", "#e29a5c"];
  return (
    <>
      <div className="flex items-end justify-between gap-2">
        <div>
          <Kicker>Final standings</Kicker>
          <PanelHeading className="mt-2" size={32}>
            The leaderboard
          </PanelHeading>
        </div>
        <Sfx size={24} tilt={7} className="mb-1">
          Ding!
        </Sfx>
      </div>
      <ol className="mt-3 flex flex-col gap-1.5">
        {b.leaderboard.map((t) => (
          <li
            key={t.teamId}
            className="flex items-center gap-2.5 border-[2.5px] px-2 py-1.5"
            style={{ borderColor: colors.LINE, background: t.isMine ? colors.YELLOW_TINT : colors.PAPER_RAISED, boxShadow: t.isMine ? `3px 3px 0 ${colors.SHADOW}` : undefined }}
          >
            <span className="num flex h-8 min-w-11 shrink-0 items-center justify-center border-2 px-1" style={{ ...display(17), borderColor: colors.LINE, background: medal[t.placement - 1] ?? colors.PAPER_ALT, color: colors.INK }}>
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
            <span className="num shrink-0" style={{ ...display(19), color: colors.INK }}>
              {t.pointsLabel}
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}

/** The draft's best Steal: the Player who made it, lettered on a printed ground, and how far they beat their pick in a caption. */
function Steal({ steal }: { steal: NonNullable<WrappedBingoModel["steal"]> }) {
  const { colors } = useComic();
  return (
    <PanelBody tone="cyan" rays="88% 18%" align="start" gap={0}>
      <Kicker>Steal of the draft</Kicker>
      <Sfx size={30} tilt={9} className="absolute top-0 right-0">
        Steal!
      </Sfx>
      <div className="mt-3 pr-20">
        <ComicPerson person={steal.person} size={44} nameSize={30} lettered />
      </div>
      <CaptionBox tone="yellow" tilt={-0.6} className="mt-3 text-[14px]">
        <span style={{ color: colors.INK_BODY }}>
          The {steal.positionLabel} Player drafted{steal.teamName && ` (by ${steal.teamName})`}, finished {steal.rankLabel} in Points share. {steal.placesBeatenLabel} better than their draft spot.
        </span>
      </CaptionBox>
    </PanelBody>
  );
}

/** The wait-time stats as a grid of cells inked apart, an odd one out taking the whole last row. */
function Minis({ cells }: { cells: string[][] }) {
  const { colors } = useComic();
  return (
    <div className="grid grid-cols-2 gap-[3px]" style={{ background: colors.LINE }}>
      {cells.map(([label, value], i) => (
        <div key={label} className={`px-2 py-3.5 ${cells.length % 2 === 1 && i === cells.length - 1 ? "col-span-2" : ""}`} style={{ background: colors.PAPER_RAISED }}>
          <Tally value={value} label={label} size={30} />
        </div>
      ))}
    </div>
  );
}

/** The reviewers who had the most nonsense to deal with: their rejection rate stamped, then the banter and the top reviewer. */
function Reviewers({ m }: { m: NonNullable<WrappedBingoModel["moderation"]> }) {
  const { colors } = useComic();
  return (
    <>
      <CaptionBox tone="yellow" tilt={-0.8} title="Who had to deal with the most nonsense" />
      <ol className="mt-3 flex flex-col">
        {m.reviewers.map((r) => (
          <li key={r.person.id} className="flex items-center justify-between gap-2 py-1.5" style={{ borderBottom: `2px dashed ${colors.RULE}` }}>
            <ComicPerson person={r.person} size={32} detail={r.reviewedLabel} nameSize={14} />
            <StampLabel color={colors.BAD} size={15} tilt={-5}>
              <span className="num">{r.rejectionLabel}</span>&nbsp;rejected
            </StampLabel>
          </li>
        ))}
      </ol>
      {m.banter && (
        <CaptionBox tone="paper" tilt={0.6} className="mt-3.5 text-[14px]">
          <span style={{ color: colors.INK_BODY }}>{m.banter}</span>
        </CaptionBox>
      )}
      {m.topReviewer && (
        <p className="mt-3 text-center text-[13px]" style={{ color: colors.INK_BODY }}>
          Most reviews: <span className="font-bold" style={{ color: colors.INK }}>{m.topReviewer.person.name}</span> with {m.topReviewer.reviewedLabel}.
        </p>
      )}
    </>
  );
}

/** One Team's Superlatives, as a panel printed in the Team's colour: the Team lettered at its head, each category a label over its winners. */
function TeamPicks({ team }: { team: WrappedBingoModel["teamSuperlatives"][number] }) {
  const { colors } = useComic();
  return (
    <PanelBody tone={team.color ? { color: team.color } : "yellow"} align="start" gap={0}>
      <h3 data-beat="slam" className="flex items-center gap-1.5" style={{ ...display(19), color: colors.INK }}>
        {team.color && <span aria-hidden className="size-3 shrink-0 rounded-full border-2" style={{ background: team.color, borderColor: colors.LINE }} />}
        <span className="min-w-0 break-words leading-none">{team.teamName}</span>
      </h3>
      <ul className="mt-2 flex flex-col gap-2">
        {team.superlatives.map((s) => (
          <li key={s.category}>
            <p style={{ ...display(12, { letterSpacing: "0.08em" }), color: colors.INK_SUBTLE }}>{s.category}</p>
            <div className="mt-0.5 flex flex-col gap-0.5">
              {s.winners.map((w) => (
                <ComicPerson key={w.id} person={w} size={20} nameSize={12} />
              ))}
            </div>
          </li>
        ))}
      </ul>
    </PanelBody>
  );
}
