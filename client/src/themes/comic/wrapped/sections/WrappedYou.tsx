import type { WrappedYouModel } from "../../../../headless/types";
import { Reveal, WrappedScene } from "../../../../core/wrapped/Scene";
import { WrappedCategoryArt } from "../../../../core/wrapped/WrappedParts";
import { WikiIcon } from "../../../../core/ui/ItemIcon";
import { CaptionBox } from "../../ui/CaptionBox";
import { useComic } from "../../ui/useComic";
import { Body, DropCard, FILL, headlineSize, InkStamp, InkTitle, Kicker, Lettering, PanelBody, Sfx, StatBurst } from "./sectionParts-you-duo-captain-moderator";

/** The art sits in the splash panel with less room around it than the default sections leave. */
const ART = "[&>div]:mb-2 [&>ul]:mb-2 [&_img]:max-h-28!";

/**
 * You, as two comic pages (#420). Page one is the numbers and the best drop: the splash with the Submission count, the
 * comparison and the Points share, the Drop value, the biggest drops and the luckiest. Page two is the rest of the story:
 * the driest streak, the first and last drops, the biggest day, Titles and Achievements, Wise Old Man, and Draft day.
 * Every line the default section has is here, in its order; a part with nothing to say is left out and the panels left
 * fill its room.
 */
export function WrappedYou({ section: y }: { section: WrappedYouModel }) {
  const { colors } = useComic();
  const hasArt = y.art.images.length > 0;
  const opening = !!(y.submissions || y.points || hasArt);

  // Page one's panels, one per Reveal step, in the order the default section tells them.
  let a = 0;
  const splash = opening ? a++ : -1;
  const comparison = y.submissions?.comparison ? a++ : -1;
  const points = y.points ? a++ : -1;
  const gp = y.gp ? a++ : -1;
  const drops = y.topDrops.length > 0 ? a++ : -1;
  const luckiest = y.luckiestDrop ? a++ : -1;
  const driest = y.driestStreak ? a++ : -1;

  // Page two's.
  let b = 0;
  const firstLast = y.firstLast ? b++ : -1;
  const dayHead = y.mostActiveDay ? b++ : -1;
  const dayDrops = y.mostActiveDay ? b++ : -1;
  const titles = y.titles.length > 0 ? b++ : -1;
  const achievements = y.achievements.length > 0 ? b++ : -1;
  const wom = y.wom ? b++ : -1;
  const draft = y.draft ? b++ : -1;

  const headline = y.submissions ? y.submissions.countLabel : "You showed up";
  const metaLine = y.points ? [y.points.comparison, y.points.teamPercentLabel, y.points.rankLabel].filter(Boolean).join(" · ") : "";
  const titleNames = y.titles.map((t) => t.name).join(" · ");

  return (
    <>
      {a > 0 && (
        <WrappedScene steps={a} className="gap-2!">
          {opening && (
            <Reveal step={splash} className={`${FILL} flex-[1.25] overflow-hidden`}>
              <PanelBody tone="cyan" rays="82% 30%" gap={8}>
                {hasArt && (
                  <div className={ART}>
                    <WrappedCategoryArt art={y.art} />
                  </div>
                )}
                <Kicker>You</Kicker>
                <InkTitle size={headlineSize(headline)}>{headline}</InkTitle>
                <Sfx className="absolute right-0 bottom-0" size={36} tilt={-9} fill={colors.YELLOW}>
                  {y.submissions ? "Pow!" : "Hi!"}
                </Sfx>
              </PanelBody>
            </Reveal>
          )}

          {y.submissions?.comparison && (
            <Reveal step={comparison} className={`${FILL} -rotate-1`}>
              <PanelBody tone="yellow" gap={4}>
                <Lettering size={26} style={{ lineHeight: 1.05, letterSpacing: "0.02em" }}>
                  {y.submissions.comparison}
                </Lettering>
              </PanelBody>
            </Reveal>
          )}

          {y.points && (
            <Reveal step={points} className={`${FILL} flex-[1.1]`}>
              <PanelBody tone={y.points.isTop ? "yellow" : "orange"} rays="22% 50%" gap={6}>
                <div className="flex items-center gap-3">
                  <StatBurst value={y.points.shareLabel} size={118} fill={y.points.isTop ? colors.YELLOW : colors.PAPER_RAISED} />
                  <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                    <Lettering size={24}>Points share</Lettering>
                    {y.points.isTop && (
                      <InkStamp color={colors.OK} size={17} tilt={-5}>
                        Your Team's top scorer.
                      </InkStamp>
                    )}
                    {metaLine && (
                      <Body size={13.5} className="text-center font-semibold">
                        {metaLine}
                      </Body>
                    )}
                  </div>
                </div>
              </PanelBody>
            </Reveal>
          )}

          {y.gp && (
            <Reveal step={gp} className={FILL}>
              <PanelBody tone="green" rays="18% 50%">
                <div className="flex items-center gap-3">
                  <StatBurst value={y.gp.gainedLabel} size={112} fill={colors.YELLOW} tilt={-7} />
                  <div className="relative flex min-w-0 flex-1 flex-col gap-2">
                    <Lettering size={24}>Total drop value</Lettering>
                    {y.gp.buyInLabel && y.gp.coveredBuyIn !== null && (
                      <>
                        <CaptionBox tone="paper" tilt={1}>
                          <Body size={14}>{y.gp.coveredBuyIn ? `That's your ${y.gp.buyInLabel} buy-in covered.` : `Not quite the ${y.gp.buyInLabel} buy-in. There's always next Bingo.`}</Body>
                        </CaptionBox>
                        {y.gp.coveredBuyIn && (
                          <Sfx className="absolute -top-5 right-0" size={24} tilt={8}>
                            Ka-ching!
                          </Sfx>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </PanelBody>
            </Reveal>
          )}

          {y.topDrops.length > 0 && (
            <Reveal step={drops} className={`${FILL} flex-[1.2]`}>
              <PanelBody align="start" gap={8}>
                <Kicker tilt={-1.5}>Your biggest drops</Kicker>
                <div className="flex flex-col gap-2.5">
                  {y.topDrops.map((d) => (
                    <DropCard key={d.key} drop={d} />
                  ))}
                </div>
              </PanelBody>
            </Reveal>
          )}

          {y.luckiestDrop && (
            <Reveal step={luckiest} className={`${FILL} flex-[1.2] overflow-hidden`}>
              <PanelBody tone="yellow" rays="90% 15%" gap={6}>
                <Kicker>Your luckiest drop</Kicker>
                <InkTitle size={headlineSize(y.luckiestDrop.itemName, [46, 40, 34, 28])}>{y.luckiestDrop.itemName}</InkTitle>
                <Sfx className="absolute right-0 top-0" size={28} tilt={8}>
                  Lucky!
                </Sfx>
                <Body size={14} className="font-semibold">
                  {y.luckiestDrop.luck?.sentence}
                </Body>
                <DropCard drop={y.luckiestDrop} />
              </PanelBody>
            </Reveal>
          )}
          {y.driestStreak && (
            <Reveal step={driest} className={`${FILL} flex-1 overflow-hidden`}>
              <PanelBody tone="orange" rays="10% 90%" gap={5}>
                <Kicker tone="red" tilt={-1.5}>
                  Your driest streak
                </Kicker>
                <Lettering size={headlineSize(`${y.driestStreak.killsLabel} of ${y.driestStreak.boss}`, [36, 32, 28, 25])} style={{ lineHeight: 1.05 }}>
                  {y.driestStreak.killsLabel} of {y.driestStreak.boss}
                </Lettering>
                <Body size={14}>
                  Without a single Board drop. They drop at {y.driestStreak.rateLabel} combined there: only {y.driestStreak.chanceLabel} go that dry.
                </Body>
              </PanelBody>
            </Reveal>
          )}
        </WrappedScene>
      )}

      {b > 0 && (
        <WrappedScene steps={b} className="gap-2!">
          {y.firstLast && (
            <div className={`grid flex-1 gap-3 ${y.firstLast.last ? "grid-cols-2" : "grid-cols-1"}`}>
              <Reveal step={firstLast} className={FILL}>
                <PanelBody align="start" gap={6}>
                  <Kicker tilt={-2}>Your first drop</Kicker>
                  <DropCard drop={y.firstLast.first} stacked={!!y.firstLast.last} />
                </PanelBody>
              </Reveal>
              {y.firstLast.last && (
                <Reveal step={firstLast} className={FILL}>
                  <PanelBody align="start" gap={6}>
                    <Kicker tilt={2} tone="cyan">
                      And your last
                    </Kicker>
                    <DropCard drop={y.firstLast.last} stacked />
                  </PanelBody>
                </Reveal>
              )}
            </div>
          )}

          {y.mostActiveDay && (
            <div className="grid flex-1 grid-cols-[0.8fr_1.4fr] gap-2">
              <Reveal step={dayHead} className={`${FILL} overflow-hidden`}>
                <PanelBody tone="cyan" rays="50% 100%" gap={6}>
                  <Kicker>Your biggest day</Kicker>
                  <InkTitle size={23}>{y.mostActiveDay.dateLabel}</InkTitle>
                  <Body size={14} className="font-semibold">
                    {y.mostActiveDay.submissionsLabel} in one day.
                  </Body>
                </PanelBody>
              </Reveal>
              <Reveal step={dayDrops} className={FILL}>
                <PanelBody align="start" gap={6}>
                  {y.mostActiveDay.drops.slice(0, 4).map((d) => (
                    <DropCard key={d.key} drop={d} />
                  ))}
                  {y.mostActiveDay.drops.length > 4 && (
                    <Body size={14} className="text-center font-semibold">
                      and {y.mostActiveDay.drops.length - 4} more
                    </Body>
                  )}
                </PanelBody>
              </Reveal>
            </div>
          )}

          {y.titles.length > 0 && (
            <Reveal step={titles} className={`${FILL} flex-1 overflow-hidden`}>
              <PanelBody tone="orange" rays="50% 130%" gap={6}>
                <Kicker tone="red">{y.titles.length === 1 ? "Your Title" : "Your Titles"}</Kicker>
                <InkTitle size={headlineSize(titleNames, [44, 38, 32, 26])}>{titleNames}</InkTitle>
                <ul className="mt-0.5 flex flex-col gap-1.5">
                  {y.titles.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-x-2 border-[3px] px-2 py-1" style={{ background: colors.PAPER_RAISED, borderColor: colors.LINE, boxShadow: `2px 2px 0 ${colors.SHADOW}` }}>
                      <Lettering size={19}>{t.name}</Lettering>
                      <Body size={13} className="min-w-0">
                        · {t.text}
                      </Body>
                    </li>
                  ))}
                </ul>
              </PanelBody>
            </Reveal>
          )}

          {y.achievements.length > 0 && (
            <Reveal step={achievements} className={`${FILL} flex-1`}>
              <PanelBody align="start" gap={8}>
                <Kicker tone="green" tilt={-1.5}>
                  {y.achievements.length === 1 ? "Achievement unlocked" : `${y.achievements.length} Achievements unlocked`}
                </Kicker>
                <ul className={`grid gap-2 ${y.achievements.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
                  {y.achievements.map((ach) => (
                    <li key={ach.key} className="flex min-w-0 items-start gap-1.5 border-[3px] p-1.5" style={{ background: colors.PAPER, borderColor: colors.LINE, boxShadow: `2px 2px 0 ${colors.SHADOW}` }}>
                      <WikiIcon name={ach.itemName} className="mt-0.5 size-7 shrink-0 [image-rendering:pixelated]" />
                      <span className="min-w-0 flex-1">
                        <Lettering size={16} className="block truncate" style={{ lineHeight: 1.2 }}>
                          {ach.name}
                        </Lettering>
                        <span className="block text-[11px] leading-tight" style={{ color: colors.INK_SUBTLE }}>
                          {ach.earnedLabel}
                        </span>
                        {ach.description && (
                          <span className="mt-0.5 block text-[11.5px] leading-tight" style={{ color: colors.INK_BODY }}>
                            {ach.description}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </PanelBody>
            </Reveal>
          )}

          {(y.wom || y.draft) && (
            <div className={`grid flex-1 gap-3 ${y.wom && y.draft ? "grid-cols-[1.4fr_1fr]" : "grid-cols-1"}`}>
              {y.wom && (
                <Reveal step={wom} className={`${FILL} overflow-hidden`}>
                  <PanelBody tone="blue" rays="50% 60%" gap={6}>
                    <div className="flex justify-center">
                      <StatBurst value={y.wom.ehbLabel} label="Efficient hours bossed" size={y.draft ? 104 : 130} fill={colors.PAPER_RAISED} tilt={5} />
                    </div>
                    {y.wom.bosses.length > 0 && (
                      <ul className="flex flex-wrap justify-center gap-1">
                        {y.wom.bosses.map((boss) => (
                          <li key={boss.name} className="border-2 px-1.5 py-0.5 text-[12px] leading-tight" style={{ background: colors.PAPER_RAISED, borderColor: colors.LINE }}>
                            <Lettering size={13}>{boss.name}</Lettering> <span className="num font-semibold">{boss.killsLabel}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </PanelBody>
                </Reveal>
              )}
              {y.draft && (
                <Reveal step={draft} className={FILL}>
                  <PanelBody tone="red" gap={5}>
                    <Kicker tone="yellow" tilt={-2}>
                      Draft day
                    </Kicker>
                    <InkTitle size={y.wom ? 36 : 52}>{y.draft.pickLabel}</InkTitle>
                    <Body size={14} className="font-semibold">
                      The {y.draft.positionLabel} Player off the board.
                    </Body>
                  </PanelBody>
                </Reveal>
              )}
            </div>
          )}
        </WrappedScene>
      )}
    </>
  );
}
