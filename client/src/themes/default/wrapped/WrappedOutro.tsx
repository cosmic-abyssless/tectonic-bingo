import type { WrappedOutroModel } from "../../../headless/types";
import { Button } from "../../../core/ui/Button";
import { RewindIcon } from "../../../core/ui/icons";
import { OsrsCaption } from "../../../core/wrapped/OsrsCaption";
import { Reveal, WrappedScene } from "../../../core/wrapped/Scene";
import { WrappedSectionArt } from "../../../core/wrapped/WrappedParts";

export function WrappedOutro({ section, onRewind, onBoard }: { section: WrappedOutroModel; onRewind: () => void; onBoard: () => void }) {
  const hasCredits = section.credits.length > 0;
  return (
    <WrappedScene steps={hasCredits ? 4 : 3} className="text-center">
      <Reveal step={0}>
        <WrappedSectionArt art={section.art} />
        <h2 className="text-balance text-5xl font-black tracking-tight sm:text-7xl">That's a wrap.</h2>
      </Reveal>
      <Reveal step={1}>
        <p className="mt-4 text-lg text-on-surface-muted">Thanks for playing {section.bingoName}. See you at the next one.</p>
      </Reveal>
      {/* Credits (CONTEXT.md): who put the Bingo together, in the Admins' order, each name in OSRS's font. */}
      {hasCredits && (
        <Reveal step={2} className="mt-10 w-full max-w-md">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-muted">Brought to you by</p>
          <ul className="flex flex-col items-center gap-3">
            {section.credits.map((credit, i) => (
              <li key={i} className="flex max-w-full flex-col items-center gap-1">
                {credit.role && <span className="text-xs text-on-surface-subtle">{credit.role}</span>}
                <OsrsCaption size="md">{credit.name}</OsrsCaption>
              </li>
            ))}
          </ul>
        </Reveal>
      )}
      <Reveal step={hasCredits ? 3 : 2}>
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
