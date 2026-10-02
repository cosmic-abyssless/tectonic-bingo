import type { WrappedModeratorModel } from "../../../../headless/types";
import { OsrsCaption } from "../../../../core/wrapped/OsrsCaption";
import { Reveal, WrappedScene } from "../../../../core/wrapped/Scene";
import { WrappedCategoryArt } from "../../../../core/wrapped/WrappedParts";
import { useComic } from "../../ui/useComic";
import { FILL, InkTitle, Kicker, Lettering, PanelBody, Sfx, StatBurst } from "./sectionParts-you-duo-captain-moderator";

const ART = "[&>div]:mb-2 [&>ul]:mb-2 [&_img]:max-h-36!";

/**
 * A Moderator's own reviews, as one comic page (#420): the splash with their count (their name captioned on the middle
 * Category image, or standing on its own without art), the median wait and the rejection rate as two bursts, and the
 * banter on that rate in a caption box.
 */
export function WrappedModerator({ section }: { section: WrappedModeratorModel }) {
  const { colors } = useComic();
  // Their name goes on the middle image, in place of any credit on it (or stands on its own without art), in OSRS's font.
  const images = section.art.images;
  const named = Math.floor((images.length - 1) / 2);
  const headline = `${section.reviewedLabel} reviewed`;
  return (
    <WrappedScene steps={3}>
      <Reveal step={0} className={`${FILL} flex-[1.6] overflow-hidden`}>
        <PanelBody tone="blue" rays="50% 105%" gap={10}>
          {images.length > 0 ? (
            <div className={ART}>
              <WrappedCategoryArt art={{ ...section.art, images: images.map((image, i) => (i === named ? { ...image, name: section.name } : image)) }} />
            </div>
          ) : (
            <>
              <div className="self-start">
                <OsrsCaption size="md">{section.name}</OsrsCaption>
              </div>
              <div className={ART}>
                <WrappedCategoryArt art={section.art} />
              </div>
            </>
          )}
          <Kicker>Your reviews</Kicker>
          <InkTitle size={headline.length <= 18 ? 50 : 38}>{headline}</InkTitle>
        </PanelBody>
      </Reveal>

      <div className="grid flex-1 grid-cols-2 gap-3">
        <Reveal step={1} className={FILL}>
          <PanelBody tone="cyan" rays="50% 20%">
            <div className="flex justify-center">
              <StatBurst value={section.medianLabel} label="median wait" size={150} fill={colors.PAPER_RAISED} tilt={-6} />
            </div>
          </PanelBody>
        </Reveal>
        <Reveal step={1} className={FILL}>
          <PanelBody tone="orange" rays="50% 20%">
            <div className="flex justify-center">
              <StatBurst value={section.rejectionLabel} label="rejected" size={150} fill={colors.YELLOW} tilt={6} />
            </div>
          </PanelBody>
        </Reveal>
      </div>

      <Reveal step={2} className={`${FILL} -rotate-1`}>
        <PanelBody tone="yellow">
          <Lettering size={25} style={{ lineHeight: 1.12, letterSpacing: "0.02em" }}>
            {section.banter}
          </Lettering>
          <Sfx className="absolute -top-8 right-3" size={26} tilt={8} fill={colors.RED}>
            Stamp!
          </Sfx>
        </PanelBody>
      </Reveal>
    </WrappedScene>
  );
}
