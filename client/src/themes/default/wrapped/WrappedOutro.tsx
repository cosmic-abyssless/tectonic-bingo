import type { WrappedOutroModel } from "../../../headless/types";
import { Button } from "../../../core/ui/Button";
import { RewindIcon } from "../../../core/ui/icons";
import { Reveal, WrappedScene } from "../../../core/wrapped/Scene";
import { WrappedCategoryArt } from "../../../core/wrapped/WrappedParts";
import { WrappedShareCards } from "../../../core/wrapped/ShareCards";
import { useSlot } from "../../context";

export function WrappedOutro({ section, preview, onRewind, onBoard, feedback }: { section: WrappedOutroModel; preview: boolean; onRewind: () => void; onBoard: () => void; feedback: { responded: boolean; onOpen: () => void } | null }) {
  const ShareCard = useSlot("WrappedShareCard");
  const hasCredits = section.art.credits.length > 0 || section.art.images.some((image) => image.name);
  return (
    <WrappedScene steps={3} className="text-center">
      <Reveal step={0}>
        {hasCredits && <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-muted">Brought to you by</p>}
        <WrappedCategoryArt art={section.art} />
        <h2 className="text-balance text-5xl font-black tracking-tight sm:text-7xl">That's a wrap.</h2>
      </Reveal>
      <Reveal step={1}>
        <p className="mt-4 text-lg text-on-surface-muted">Thanks for playing {section.bingoName}. See you at the next one.</p>
      </Reveal>
      {/* Not a Reveal: the jump to the cards lands here, and they should never be caught half faded in. */}
      <WrappedShareCards cards={section.cards} preview={preview} Card={ShareCard} />
      {/* Last, so the page ends with the way out. */}
      <Reveal step={2}>
        <div className="mt-12 flex flex-wrap justify-center gap-3">
          <Button variant="primary" onPress={onRewind}>
            <RewindIcon />
            Watch the replay
          </Button>
          <Button variant="secondary" onPress={onBoard}>
            Back to the Board
          </Button>
          {feedback && (
            <Button variant="secondary" onPress={feedback.onOpen}>
              {feedback.responded ? "Edit your feedback" : "Give feedback"}
            </Button>
          )}
        </div>
      </Reveal>
    </WrappedScene>
  );
}
