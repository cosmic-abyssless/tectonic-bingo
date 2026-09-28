import type { WrappedModeratorModel } from "../../../headless/types";
import { OsrsCaption } from "../../../core/wrapped/OsrsCaption";
import { Reveal, WrappedScene } from "../../../core/wrapped/Scene";
import { WrappedCategoryArt, WrappedHeading, WrappedStat } from "../../../core/wrapped/WrappedParts";

export function WrappedModerator({ section }: { section: WrappedModeratorModel }) {
  // Their name goes on the middle image, in place of any credit on it (or stands on its own without art), in OSRS's font.
  const images = section.art.images;
  const named = Math.floor((images.length - 1) / 2);
  return (
    <WrappedScene steps={3}>
      <Reveal step={0}>
        {images.length > 0 ? (
          <WrappedCategoryArt art={{ ...section.art, images: images.map((image, i) => (i === named ? { ...image, name: section.name } : image)) }} />
        ) : (
          <>
            <div className="mb-6 text-center">
              <OsrsCaption size="md">{section.name}</OsrsCaption>
            </div>
            <WrappedCategoryArt art={section.art} />
          </>
        )}
        <WrappedHeading kicker="Your reviews">{section.reviewedLabel} reviewed</WrappedHeading>
      </Reveal>
      <Reveal step={1} className="mt-12 grid gap-8 sm:grid-cols-2 sm:gap-16">
        <WrappedStat value={section.medianLabel} label="median wait" />
        <WrappedStat value={section.rejectionLabel} label="rejected" />
      </Reveal>
      <Reveal step={2} className="mt-10 max-w-md text-center text-lg">
        {section.banter}
      </Reveal>
    </WrappedScene>
  );
}
