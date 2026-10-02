import type { WrappedDuoModel } from "../../../../headless/types";
import { Reveal, WrappedScene } from "../../../../core/wrapped/Scene";
import { WrappedCategoryArt } from "../../../../core/wrapped/WrappedParts";
import { CaptionBox } from "../../ui/CaptionBox";
import { useComic } from "../../ui/useComic";
import { Body, DropCard, FILL, headlineSize, InkTitle, Kicker, Lettering, PanelBody, Sfx, StatBurst } from "./sectionParts-you-duo-captain-moderator";

const ART = "[&>div]:mb-2 [&>ul]:mb-2 [&_img]:max-h-36!";

/**
 * Your Duo, as a comic page (#420), and a second for their best moments together when they have any. The splash names the
 * pair, then the Points share they made together, how it split between them and who carried whom (told as friendly
 * teasing, never a verdict). Every line of the default section is here, in its order.
 */
export function WrappedDuo({ section: d }: { section: WrappedDuoModel }) {
  const { colors } = useComic();
  const hasArt = d.art.images.length > 0;
  const together = d.pickLabel ? `Drafted together at ${d.pickLabel}${d.rankLabel ? `, finished ${d.rankLabel}` : ""}` : d.rankLabel ? `Finished ${d.rankLabel}` : null;
  const stepCount = 2 + (d.split ? 1 : 0) + (d.carried ? 1 : 0);
  const split = d.split ? 2 : -1;
  const carried = d.carried ? (d.split ? 3 : 2) : -1;

  return (
    <>
      <WrappedScene steps={stepCount}>
        <Reveal step={0} emphasis="splash" className={`${FILL} flex-[1.2] overflow-hidden`}>
          <PanelBody tone="cyan" rays="15% 25%" gap={10}>
            {hasArt && (
              <div className={ART}>
                <WrappedCategoryArt art={d.art} />
              </div>
            )}
            <Kicker>Your Duo</Kicker>
            <InkTitle size={headlineSize(`You & ${d.partner.name}`, [60, 50, 40, 32])}>
              You &{" "}
              <img src={d.partner.avatarUrl} alt="" className="inline-block size-[0.85em] rounded-full border-[3px] align-[-0.1em]" style={{ borderColor: colors.LINE, background: colors.PAPER_ALT }} />{" "}
              {d.partner.name}
            </InkTitle>
            <Sfx className="absolute right-0 top-0" size={34} tilt={8} fill={colors.YELLOW}>
              Team-up!
            </Sfx>
          </PanelBody>
        </Reveal>

        <Reveal step={1} className={`${FILL} flex-[1.1]`}>
          <PanelBody tone={d.isTop ? "yellow" : "orange"} rays="85% 50%">
            <div className="flex items-center gap-4">
              <StatBurst value={d.combinedShareLabel} size={140} fill={d.isTop ? colors.YELLOW : colors.PAPER_RAISED} tilt={-6} />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Lettering size={25} style={{ lineHeight: 1.05 }}>
                  Points share, together
                </Lettering>
                {together && (
                  <Body size={15} className="font-semibold">
                    {together}
                  </Body>
                )}
              </div>
            </div>
          </PanelBody>
        </Reveal>

        {d.split && (
          <Reveal step={split} className={FILL}>
            <PanelBody gap={8}>
              <div className="flex items-end justify-between gap-3" role="img" aria-label={`You ${d.split.myPercent}%, ${d.partner.name} ${d.split.partnerPercent}%`}>
                <div className="min-w-0">
                  <Lettering size={22} className="block">
                    You
                  </Lettering>
                  <span className="num text-[18px] font-bold leading-none" style={{ color: colors.INK }}>
                    {d.split.myShareLabel}
                  </span>
                </div>
                <div className="min-w-0 text-right">
                  <Lettering size={22} className="block truncate">
                    {d.partner.name}
                  </Lettering>
                  <span className="num text-[18px] font-bold leading-none" style={{ color: colors.INK }}>
                    {d.split.partnerShareLabel}
                  </span>
                </div>
              </div>
              <div aria-hidden className="flex h-7 overflow-hidden border-[3px]" style={{ borderColor: colors.LINE, background: colors.ORANGE, boxShadow: `3px 3px 0 ${colors.SHADOW}` }}>
                <div style={{ width: `${d.split.myPercent}%`, background: colors.BLUE, borderRight: d.split.myPercent > 0 && d.split.myPercent < 100 ? `3px solid ${colors.LINE}` : undefined }} />
              </div>
            </PanelBody>
          </Reveal>
        )}

        {d.carried && (
          <Reveal step={carried} emphasis="narration" className={`${FILL} -rotate-1`}>
            <PanelBody tone="yellow" gap={4}>
              <Lettering size={25} style={{ lineHeight: 1.1, letterSpacing: "0.02em" }}>
                {d.carried}
              </Lettering>
            </PanelBody>
          </Reveal>
        )}
      </WrappedScene>

      {d.moments.length > 0 && (
        <WrappedScene steps={1 + d.moments.length}>
          <Reveal step={0} className={`${FILL} flex-1 overflow-hidden`}>
            <PanelBody tone="yellow" rays="20% 80%" gap={10}>
              <Kicker>Your Duo</Kicker>
              <InkTitle size={46}>Best moments together</InkTitle>
            </PanelBody>
          </Reveal>
          {d.moments.map((m, i) => (
            <Reveal key={m.key} step={1 + i} className={FILL}>
              <PanelBody align="start" gap={10}>
                <CaptionBox tone={i % 2 ? "cyan" : "yellow"} tilt={i % 2 ? 1 : -1} style={{ alignSelf: "flex-start" }}>
                  <Lettering size={17}>{m.label}</Lettering>
                </CaptionBox>
                <div className="grid grid-cols-2 gap-3">
                  <DropCard drop={m.mine} stacked className="h-full" />
                  <DropCard drop={m.theirs} showPlayer showTeam={false} stacked className="h-full" />
                </div>
              </PanelBody>
            </Reveal>
          ))}
        </WrappedScene>
      )}
    </>
  );
}
