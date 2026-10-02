import type { WrappedCaptainModel } from "../../../../headless/types";
import { Reveal, WrappedScene } from "../../../../core/wrapped/Scene";
import { WrappedCategoryArt } from "../../../../core/wrapped/WrappedParts";
import { CaptionBox } from "../../ui/CaptionBox";
import { useComic } from "../../ui/useComic";
import { Body, FILL, InkStamp, InkTitle, Kicker, Lettering, PanelBody, PersonChip, Sfx } from "./sectionParts-you-duo-captain-moderator";

const ART = "[&>div]:mb-2 [&>ul]:mb-2 [&_img]:max-h-40";

/**
 * Your Draft, as comic pages (#420): the splash and every pick against where it finished, and then the best Steal and the
 * grade. Only a pick that beat its draft position is picked out (CONTEXT.md "Steal"): the rest are just their numbers, and
 * the grade is a stamp, never a verdict on a pick.
 */
export function WrappedCaptain({ section: c }: { section: WrappedCaptainModel }) {
  const { colors } = useComic();
  const hasArt = c.art.images.length > 0;
  const hasSecond = !!(c.steal || c.grade);
  const gradeStep = c.steal ? 1 : 0;
  const gold = c.grade?.letter.startsWith("A");

  return (
    <>
      <WrappedScene steps={2}>
        <Reveal step={0} className={`${FILL} overflow-hidden`}>
          <PanelBody tone="blue" rays="85% 20%" gap={10}>
            {hasArt && (
              <div className={ART}>
                <WrappedCategoryArt art={c.art} />
              </div>
            )}
            <Kicker>Your Draft</Kicker>
            <InkTitle size={56}>Your picks</InkTitle>
            <Sfx className="absolute right-0 bottom-0" size={34} tilt={-8} fill={colors.YELLOW}>
              Pick!
            </Sfx>
          </PanelBody>
        </Reveal>

        <Reveal step={1} className={`${FILL} flex-[2]`}>
          <PanelBody align="start" gap={0}>
            <ol className="flex flex-col">
              {c.picks.map((p, i) => (
                <li
                  key={p.key}
                  className="flex items-center gap-2.5 px-1 py-2"
                  style={{ borderTop: i === 0 ? undefined : `2px dashed ${colors.RULE}`, background: p.beat ? `color-mix(in srgb, ${colors.GREEN} 16%, transparent)` : undefined }}
                >
                  <span className="shrink-0 border-2 px-1.5 py-0.5 text-center" style={{ minWidth: 62, background: colors.YELLOW, borderColor: colors.LINE, color: colors.ON_YELLOW }}>
                    <Lettering size={16} color={colors.ON_YELLOW}>
                      {p.pickLabel}
                    </Lettering>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    {p.people.map((person) => (
                      <PersonChip key={person.id} person={person} size={22} nameSize={17} />
                    ))}
                  </span>
                  <span className="shrink-0 text-right text-[12px] leading-tight" style={{ color: colors.INK_SUBTLE }}>
                    {p.positionLabel}
                    {p.rankLabel && (
                      <span className="block text-[15px] leading-tight" style={p.beat ? { color: colors.OK, fontWeight: 800 } : { color: colors.INK_BODY }}>
                        {p.beat && <span aria-hidden>★ </span>}
                        {p.rankLabel}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </PanelBody>
        </Reveal>
      </WrappedScene>

      {hasSecond && (
        <WrappedScene steps={c.steal && c.grade ? 2 : 1}>
          {c.steal && (
            <Reveal step={0} className={`${FILL} flex-[1.3] overflow-hidden`}>
              <PanelBody tone="yellow" rays="50% 105%" gap={10}>
                <Kicker tone="red">Your best Steal</Kicker>
                <p className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  {c.steal.people.map((person) => (
                    <PersonChip key={person.id} person={person} size={38} nameSize={34} />
                  ))}
                </p>
                <Sfx className="absolute right-0 top-0" size={36} tilt={9}>
                  Steal!
                </Sfx>
                <CaptionBox tone="paper" tilt={-0.8}>
                  <Body size={15}>
                    {c.steal.pickLabel}: drafted {c.steal.positionLabel}, finished {c.steal.rankLabel}. That's {c.steal.placesBeatenLabel} better than the draft thought.
                  </Body>
                </CaptionBox>
              </PanelBody>
            </Reveal>
          )}
          {c.grade && (
            <Reveal step={gradeStep} className={`${FILL} flex-1 overflow-hidden`}>
              <PanelBody tone={gold ? "yellow" : "cyan"} rays="15% 50%">
                <div className="flex items-center gap-4">
                  <div className="shrink-0">
                    <InkStamp color={gold ? colors.OK : colors.BLUE} size={13} tilt={-8} className="!px-3 !pb-2 !pt-1.5">
                      <span className="block">Draft grade</span>
                      <span className="block" style={{ fontSize: 76, lineHeight: 0.95, letterSpacing: 0 }}>
                        {c.grade.letter}
                      </span>
                    </InkStamp>
                  </div>
                  <CaptionBox tone="paper" tilt={1} className="min-w-0 flex-1">
                    <Lettering size={22} style={{ lineHeight: 1.1, letterSpacing: "0.02em" }}>
                      {c.grade.line}
                    </Lettering>
                  </CaptionBox>
                </div>
              </PanelBody>
            </Reveal>
          )}
        </WrappedScene>
      )}
    </>
  );
}
