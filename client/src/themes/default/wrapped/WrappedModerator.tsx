import type { WrappedModeratorModel } from "../../../headless/types";
import { Reveal, WrappedScene } from "../../../core/wrapped/Scene";
import { WrappedHeading, WrappedSectionArt, WrappedStat } from "../../../core/wrapped/WrappedParts";

export function WrappedModerator({ section }: { section: WrappedModeratorModel }) {
  return (
    <WrappedScene steps={3}>
      <Reveal step={0}>
        <WrappedSectionArt art={section.art} />
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
