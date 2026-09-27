import type { WrappedModeratorModel } from "../../../headless/types";
import { OsrsCaption } from "../../../core/wrapped/OsrsCaption";
import { Reveal, WrappedScene } from "../../../core/wrapped/Scene";
import { WrappedHeading, WrappedSectionArt, WrappedStat } from "../../../core/wrapped/WrappedParts";

export function WrappedModerator({ section }: { section: WrappedModeratorModel }) {
  // Their name goes on the middle image (or stands on its own without art), in OSRS's font.
  const named = Math.floor((section.art.length - 1) / 2);
  return (
    <WrappedScene steps={3}>
      <Reveal step={0}>
        {section.art.length > 0 ? (
          <WrappedSectionArt art={section.art.map((art, i) => (i === named ? { art, name: section.name } : art))} />
        ) : (
          <div className="mb-6 text-center">
            <OsrsCaption size="md">{section.name}</OsrsCaption>
          </div>
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
