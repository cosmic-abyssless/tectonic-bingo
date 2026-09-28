import type { WrappedOutroModel } from "../../../headless/types";
import { Button } from "../../../core/ui/Button";
import { RewindIcon } from "../../../core/ui/icons";
import { OsrsCaption } from "../../../core/wrapped/OsrsCaption";
import { Reveal, WrappedScene } from "../../../core/wrapped/Scene";
import { WrappedSectionArt } from "../../../core/wrapped/WrappedParts";

export function WrappedOutro({ section, onRewind, onBoard }: { section: WrappedOutroModel; onRewind: () => void; onBoard: () => void }) {
  const hasCredits = section.credits.length > 0;
  // Credits (CONTEXT.md): each name embedded on a piece of the Outro's own art, in the Admins' order — the first
  // credit on the first image, and so on. A credit with nothing left to put it on (more credits than art) falls back
  // to plain text below instead.
  const art = section.art.map((frames, i) => (i < section.credits.length ? { art: frames, name: section.credits[i]!.name } : frames));
  const overflowCredits = section.credits.slice(section.art.length);
  return (
    <WrappedScene steps={3} className="text-center">
      <Reveal step={0}>
        {hasCredits && <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-muted">Brought to you by</p>}
        <WrappedSectionArt art={art} />
        {overflowCredits.length > 0 && (
          <ul className="mb-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            {overflowCredits.map((credit, i) => (
              <li key={i} className="flex flex-col items-center gap-1">
                {credit.role && <span className="text-xs text-on-surface-subtle">{credit.role}</span>}
                <OsrsCaption size="md">{credit.name}</OsrsCaption>
              </li>
            ))}
          </ul>
        )}
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
