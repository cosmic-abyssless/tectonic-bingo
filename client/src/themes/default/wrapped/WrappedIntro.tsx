import type { WrappedIntroModel } from "../../../headless/types";
import { Reveal, WrappedScene } from "../../../core/wrapped/Scene";
import { ChevronDownIcon } from "../../../core/ui/icons";
import { WrappedCategoryArt } from "../../../core/wrapped/WrappedParts";

export function WrappedIntro({ section, preview }: { section: WrappedIntroModel; preview: boolean }) {
  return (
    <WrappedScene steps={3} className="text-center">
      <Reveal step={0}>
        {preview && (
          <p className="mx-auto mb-10 max-w-md rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
            A Moderator's preview, computed just now. Nobody else can see it until it's published.
          </p>
        )}
        <WrappedCategoryArt art={section.art} />
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-on-surface-muted">{section.playerName ? "Your Bingo Wrapped" : "Bingo Wrapped"}</p>
      </Reveal>
      <Reveal step={1}>
        <h1 className="mt-4 text-balance text-5xl font-black tracking-tight [overflow-wrap:anywhere] sm:text-7xl">{section.bingoName}</h1>
        {section.datesLabel && <p className="num mt-4 text-on-surface-muted">{section.datesLabel}</p>}
      </Reveal>
      <Reveal step={2}>
        <p className="mt-10 text-lg sm:text-xl">{section.playerName ? `It's over, ${section.playerName}. Let's look back.` : "It's over. Let's look back."}</p>
        <ChevronDownIcon size={20} className="mx-auto mt-6 animate-bounce text-on-surface-muted motion-reduce:animate-none" />
      </Reveal>
    </WrappedScene>
  );
}
