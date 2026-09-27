import type { WrappedOutroModel } from "../../../headless/types";
import { Button } from "../../../core/ui/Button";
import { RewindIcon } from "../../../core/ui/icons";
import { Reveal, WrappedScene } from "../../../core/wrapped/Scene";
import { WrappedSectionArt } from "../../../core/wrapped/WrappedParts";

export function WrappedOutro({ section, onRewind, onBoard }: { section: WrappedOutroModel; onRewind: () => void; onBoard: () => void }) {
  return (
    <WrappedScene steps={3} className="text-center">
      <Reveal step={0}>
        <WrappedSectionArt art={section.art} />
        <h2 className="text-balance text-5xl font-black tracking-tight sm:text-7xl">That's a wrap.</h2>
      </Reveal>
      <Reveal step={1}>
        <p className="mt-4 text-lg text-on-surface-muted">Thanks for playing {section.bingoName}. See you at the next one.</p>
      </Reveal>
      <Reveal step={2}>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Button variant="primary" onPress={onRewind}>
            <RewindIcon />
            Watch it again in Rewind
          </Button>
          <Button variant="secondary" onPress={onBoard}>
            Back to the Board
          </Button>
        </div>
      </Reveal>
      {/* Share cards (#232) go here. */}
      <div data-wrapped-share-cards className="w-full" />
    </WrappedScene>
  );
}
