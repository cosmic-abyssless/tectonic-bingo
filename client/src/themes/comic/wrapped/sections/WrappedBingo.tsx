import type { WrappedBingoModel } from "../../../../headless/types";
import { PointsChart } from "../../../../core/wrapped/PointsChart";
import { Reveal, WrappedScene } from "../../../../core/wrapped/Scene";
import { CaptionBox } from "../../ui/CaptionBox";
import { useComic } from "../../ui/useComic";
import { LETTERED } from "../../../lettering";
import { COVER } from "../coverParts";
import { ComicDrop, ComicPerson, display, FULL_PANEL, Kicker, PADDED_PANEL, PanelHeading, Sfx, Splash, StampLabel, Tally } from "./sectionParts-team-bingo";
import { Gp, PanelBody } from "./sectionParts-you-duo-captain-moderator";
import { DropRain } from "./DropRain";

/**
 * The comic Bingo section (#421): the Bingo-wide story, and for some viewers (a Moderator who didn't play) the only section,
 * so its first page reads on its own straight after the contents page. Its pages, each Reveal one panel, in the
 * default section's order:
 *   1. Everyone, together: the splash, the totals, the leaderboard.
 *   1½. It rained loot: every drop of the Bingo, its icon raining down into a pile filling the page.
 *   2. The highlights: the race, the rarest drop, the crowd favourite.
 *   2½. Raids and bosses: who killed each the most, a few to a page, dealt evenly over as many pages as they need.
 *   2¾. Achievements: the top Players ("Most achievements by:"); then who earned every one first, and every Team ranked.
 *   3. The draft's Steal, then Behind the scenes: who moderated (the Moderators category's art and credits), the wait times.
 *   4. The reviewers, then every Team's Superlatives, a few Teams to a page, dealt evenly over as many pages as they need.
 * A part the Bingo has nothing for leaves its panel out, and a page left with none is not drawn.
 */
export function WrappedBingo({ section: b }: { section: WrappedBingoModel }) {
  const m = b.moderation;
  const minis = m ? [m.medianLabel && ["median wait", m.medianLabel], m.fastestLabel && ["fastest review", m.fastestLabel], m.withinHourLabel && ["within an hour", m.withinHourLabel], m.busiestHourLabel && [m.busiestHourDayLabel ? `busiest hour, ${m.busiestHourDayLabel}` : "busiest hour", m.busiestHourLabel]].filter((x): x is string[] => !!x) : [];
  // Each later page's panels, in the default section's order; a panel's step is how many of its page's panels come first.
  const highlights = [!!b.race, !!b.rarestDrop, !!b.mostReacted];
  const backstage = [!!b.steal, !!m, !!m && minis.length > 0];
  const ranked = [!!b.achievements?.allFirst, !!b.achievements?.teams.length];
  // The Superlatives of every Team can run long (a card per Team), so they are dealt over pages of a few cards each; the
  // first shares its page with the reviewers when there are any.
  const firstPick = m && m.reviewers.length > 0 ? 2 : 4;
  const pickPages = [b.teamSuperlatives.slice(0, firstPick)];
  const rest = b.teamSuperlatives.slice(firstPick);
  const perPage = rest.length ? Math.ceil(rest.length / Math.ceil(rest.length / 4)) : 4;
  for (let i = 0; i < rest.length; i += perPage) pickPages.push(rest.slice(i, i + perPage));
  if (pickPages[0]!.length === 0 && !(m && m.reviewers.length > 0)) pickPages.length = 0;
  const bossPages = dealt(b.bossLeaders, 4);
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

      {b.dropRain && (
        <WrappedScene steps={1}>
          <Reveal step={0} emphasis="highlight" className={`flex-1 ${PADDED_PANEL}`}>
            <PanelBody tone="blue" rays="50% -20%" align="start" gap={0}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Kicker>Every drop</Kicker>
                  <PanelHeading className="mt-2" size={34}>
                    It rained loot
                  </PanelHeading>
                </div>
                <Sfx size={26} tilt={8} className="mt-1">
                  Clink!
                </Sfx>
              </div>
              <p className="mt-1.5 text-[14px] font-semibold">
                {b.dropRain.dropsLabel}, {b.dropRain.kindsLabel}.
              </p>
              <DropRain items={b.dropRain.items} step={0} className="mt-2 min-h-[380px] flex-1" />
            </PanelBody>
          </Reveal>
        </WrappedScene>
      )}

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

      {bossPages.map((bosses, page) => (
        <WrappedScene key={`bosses-${page}`} steps={1}>
          <div className="flex flex-1 flex-col gap-3">
            {/* The title is lettered on the first page itself, over the bosses' panels. */}
            {page === 0 && (
              <div className="pt-1">
                <Kicker>Raids and bosses</Kicker>
                <PanelHeading className="mt-2" size={32}>
                  Who killed it the most
                </PanelHeading>
                {/* Wise Old Man can't tell which runs were done together, so this never calls them runs. */}
                <CaptionBox tone="paper" tilt={-0.5} className="mt-2 text-[13px]">
                  Kill counts each Team's Players gained, added up. A group raid counts once for every Player in it.
                </CaptionBox>
              </div>
            )}
            {/* Each boss a panel of its own, all at one step: the camera takes them in together. */}
            <div className={`grid flex-1 auto-rows-fr gap-3 ${bosses.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
              {bosses.map((boss, i) => (
                <Reveal key={boss.metric} step={0} className={`${PADDED_PANEL} ${bosses.length > 1 && bosses.length % 2 === 1 && i === bosses.length - 1 ? "col-span-2" : ""}`}>
                  <BossLeader boss={boss} />
                </Reveal>
              ))}
            </div>
          </div>
        </WrappedScene>
      ))}

      {b.achievements && b.achievements.top.length > 0 && (
        <WrappedScene steps={1}>
          <div className="flex flex-1 flex-col justify-center gap-3">
            <Reveal step={0} className={PADDED_PANEL}>
              <TopAchievers top={b.achievements.top} />
            </Reveal>
          </div>
        </WrappedScene>
      )}

      {b.achievements && count(ranked) > 0 && (
        <WrappedScene steps={count(ranked)}>
          <div className="flex flex-1 flex-col justify-center gap-3">
            {b.achievements.allFirst && (
              <Reveal step={0} className={PADDED_PANEL}>
                <AllFirst allFirst={b.achievements.allFirst} />
              </Reveal>
            )}
            {b.achievements.teams.length > 0 && (
              <Reveal step={at(ranked, 1)} className={PADDED_PANEL}>
                <AchievementTeams teams={b.achievements.teams} />
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
                  {teams.map((t, i) => (
                    // An odd one out takes the whole last row, not half of it beside a gap.
                    <Reveal key={t.teamId} step={reviewers ? 1 : 0} className={`${PADDED_PANEL} ${teams.length > 1 && teams.length % 2 === 1 && i === teams.length - 1 ? "col-span-2" : ""}`}>
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

/** A long list dealt over pages of at most `most` each, as evenly as it goes: 5 is 3 and 2, not 4 and 1. */
function dealt<T>(items: T[], most: number): T[][] {
  if (items.length === 0) return [];
  const perPage = Math.ceil(items.length / Math.ceil(items.length / most));
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += perPage) pages.push(items.slice(i, i + perPage));
  return pages;
}

/** One raid or boss: its name lettered at the head, then the Team (or tied Teams) that killed it the most, its kills stamped, and its top Players. */
function BossLeader({ boss }: { boss: WrappedBingoModel["bossLeaders"][number] }) {
  const { colors } = useComic();
  const lead = boss.teams[0]!;
  return (
    <PanelBody tone={boss.teams.length === 1 && lead.color ? { color: lead.color } : "yellow"} align="start" gap={0}>
      <h3 data-beat="slam" className={`${LETTERED} min-w-0 break-words leading-none`} style={{ ...display(18), color: colors.INK }}>
        {boss.name}
      </h3>
      <div className="mt-2 flex flex-col gap-2.5">
        {boss.teams.map((t) => (
          <div key={t.teamId}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {/* The dot stays beside the name: a long name wraps under itself, never off the dot. */}
              <p className="flex min-w-0 items-baseline gap-2">
                {t.color && <span aria-hidden className="size-3 shrink-0 translate-y-px self-center rounded-full border-2" style={{ background: t.color, borderColor: colors.LINE }} />}
                <span className="min-w-0 break-words font-bold leading-tight" style={{ color: colors.INK }}>
                  {t.name}
                  {t.isMine && (
                    <span className="ml-2 inline-block text-[11px] font-semibold uppercase tracking-wide" style={{ color: colors.INK_SUBTLE }}>
                      your Team
                    </span>
                  )}
                </span>
              </p>
              <StampLabel color={colors.INK} size={14} tilt={-4}>
                <span className="num">{t.killsLabel}</span>
              </StampLabel>
            </div>
            <div className="mt-1 flex flex-col gap-0.5">
              {t.topPlayers.map((p) => (
                <ComicPerson key={p.person.id} person={p.person} size={20} nameSize={12} detail={`Top: ${p.killsLabel}`} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </PanelBody>
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
        <Tally value={<Gp label={b.totalGpLabel} />} label="GP in drops" size={52} />
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
            <span className={`${LETTERED} num flex h-8 min-w-11 shrink-0 items-center justify-center border-2 px-1`} style={{ ...display(17), borderColor: colors.LINE, background: medal[t.placement - 1] ?? colors.PAPER_ALT, color: colors.INK }}>
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
            <span className={`${LETTERED} num shrink-0`} style={{ ...display(19), color: colors.INK }}>
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

type Achieved = NonNullable<WrappedBingoModel["achievements"]>;

/** The first to earn every Achievement: when, lettered big, and who. */
function AllFirst({ allFirst }: { allFirst: NonNullable<Achieved["allFirst"]> }) {
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
 * placement lettered, the Player with their Team and when they got there on lines of their own, the count lettered big.
 */
function TopAchievers({ top }: { top: Achieved["top"] }) {
  const { colors } = useComic();
  return (
    <PanelBody tone="cyan" rays="90% 10%" align="start" gap={0}>
      <Kicker>Achievements</Kicker>
      <PanelHeading className="mt-2" size={26}>
        Most achievements by:
      </PanelHeading>
      <ol className="mt-3 flex flex-col gap-1.5">
        {top.map((p) => (
          <li
            key={p.person.id}
            className="flex items-center gap-2 border-[2.5px] px-2 py-1.5"
            style={{ borderColor: colors.LINE, background: p.isMyTeam ? colors.YELLOW_TINT : colors.PAPER_RAISED, boxShadow: p.isMyTeam ? `3px 3px 0 ${colors.SHADOW}` : undefined }}
          >
            <span className={`${LETTERED} num w-9 shrink-0`} style={{ ...display(16), color: colors.INK }}>
              {p.placementLabel}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <ComicPerson person={p.person} size={26} nameSize={14} />
              {p.teamName && (
                <span className="flex min-w-0 items-center gap-1.5 text-[12px] font-semibold leading-tight" style={{ color: colors.INK_BODY }}>
                  {p.teamColor && <span aria-hidden className="size-2.5 shrink-0 rounded-full border-[1.5px]" style={{ background: p.teamColor, borderColor: colors.LINE }} />}
                  <span className="break-words">{p.teamName}</span>
                </span>
              )}
              {p.atLabel && (
                <span className="text-[12px] leading-tight" style={{ color: colors.INK_BODY }}>
                  {p.atLabel}
                </span>
              )}
            </span>
            <span className="flex shrink-0 flex-col items-end leading-none">
              <span className={`${LETTERED} num`} style={{ ...display(24), color: colors.INK }}>
                {p.earnedLabel}
              </span>
              <span className="mt-0.5 text-[11px] font-bold" style={{ color: colors.INK_BODY }}>
                {p.outOfLabel}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </PanelBody>
  );
}

/** Every Team by its Players' Achievements added up: placement, the Team's dot and name, the total and its average. */
function AchievementTeams({ teams }: { teams: Achieved["teams"] }) {
  const { colors } = useComic();
  return (
    <PanelBody tone="orange" rays="10% 90%" align="start" gap={0}>
      <Kicker>Achievements by Team</Kicker>
      <ol className="mt-3 flex flex-col gap-1.5">
        {teams.map((t) => (
          <li
            key={t.teamId}
            className="flex items-center gap-2.5 border-[2.5px] px-2 py-1.5"
            style={{ borderColor: colors.LINE, background: t.isMine ? colors.YELLOW_TINT : colors.PAPER_RAISED, boxShadow: t.isMine ? `3px 3px 0 ${colors.SHADOW}` : undefined }}
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
      <h3 data-beat="slam" className={`${LETTERED} flex items-center gap-1.5`} style={{ ...display(19), color: colors.INK }}>
        {team.color && <span aria-hidden className="size-3 shrink-0 rounded-full border-2" style={{ background: team.color, borderColor: colors.LINE }} />}
        <span className="min-w-0 break-words leading-none">{team.teamName}</span>
      </h3>
      <ul className="mt-2 flex flex-col gap-2">
        {team.superlatives.map((s) => (
          <li key={s.category}>
            <p className={LETTERED} style={{ ...display(12, { letterSpacing: "0.08em" }), color: colors.INK_SUBTLE }}>{s.category}</p>
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
