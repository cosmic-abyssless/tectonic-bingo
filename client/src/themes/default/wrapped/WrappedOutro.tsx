import { useMemo } from "react";
import type { WrappedOutroModel, WrappedShareCardModel } from "../../../headless/types";
import { Button } from "../../../core/ui/Button";
import { RewindIcon } from "../../../core/ui/icons";
import { Reveal, WrappedScene } from "../../../core/wrapped/Scene";
import { WrappedCategoryArt } from "../../../core/wrapped/WrappedParts";
import { WrappedShareCards } from "../../../core/wrapped/ShareCards";
import { useSlot } from "../../context";
// PROTOTYPE (#314): remove with the prototype.
import { PROTOTYPES_ON, PrototypeSwitcher, usePrototypeParam } from "../../../core/ui/PrototypeSwitcher";
import { FILLS, PrototypeShareCard, useLeftOutNote, usePrototypeCards, VARIANT_NAMES, VARIANTS } from "./ShareCardPrototype";

export function WrappedOutro(props: { section: WrappedOutroModel; preview: boolean; onRewind: () => void; onBoard: () => void }) {
  return PROTOTYPES_ON ? <PrototypeOutro {...props} /> : <RealOutro {...props} />;
}

/** #314's Outro: the cards first, then the way out; each card through the chosen prototype variant. */
function PrototypeOutro({ section, preview, onRewind, onBoard }: { section: WrappedOutroModel; preview: boolean; onRewind: () => void; onBoard: () => void }) {
  const variant = usePrototypeParam("variant", VARIANTS);
  const fill = usePrototypeParam("fill", FILLS);
  const cards = usePrototypeCards(section.cards, variant, fill);
  const note = useLeftOutNote();
  const Card = useMemo(() => ({ card }: { card: WrappedShareCardModel }) => <PrototypeShareCard card={card} variant={variant} />, [variant]);
  const hasCredits = section.art.credits.length > 0 || section.art.images.some((image) => image.name);
  return (
    <WrappedScene steps={2} className="text-center">
      <Reveal step={0}>
        {hasCredits && <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-muted">Brought to you by</p>}
        <WrappedCategoryArt art={section.art} />
        <h2 className="text-balance text-5xl font-black tracking-tight sm:text-7xl">That's a wrap.</h2>
      </Reveal>
      <Reveal step={1}>
        <p className="mt-4 text-lg text-on-surface-muted">Thanks for playing {section.bingoName}. See you at the next one.</p>
      </Reveal>
      <WrappedShareCards cards={cards} preview={preview} Card={Card} />
      <div className="mt-12 flex flex-wrap justify-center gap-3">
        <Button variant="primary" onPress={onRewind}>
          <RewindIcon />
          Watch the replay
        </Button>
        <Button variant="secondary" onPress={onBoard}>
          Back to the Board
        </Button>
      </div>
      <div className="h-24" />
      <PrototypeSwitcher variants={VARIANTS} names={VARIANT_NAMES} fills={FILLS} note={note || undefined} />
    </WrappedScene>
  );
}

function RealOutro({ section, preview, onRewind, onBoard }: { section: WrappedOutroModel; preview: boolean; onRewind: () => void; onBoard: () => void }) {
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
      {/* Not a Reveal: the jump to the cards lands here, and they should never be caught half faded in. */}
      <WrappedShareCards cards={section.cards} preview={preview} Card={ShareCard} />
    </WrappedScene>
  );
}
