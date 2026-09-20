import { fitFontSize } from "../../../core/draft/revealMath";
import { COMIC_FONT } from "../font";
import { Burst } from "../ui/Burst";
import { useComic } from "../ui/useComic";

export function DraftPickBurst({ names, teamName, teamColor }: { names: string[]; teamName: string; teamColor: string | null }) {
  const { colors } = useComic();
  // Sized in the burst's own width units (cqw). Long names shrink to fit rather than being cut off, and only wrap
  // once they are already at the smallest readable size.
  const size = fitFontSize(names, { availableWidth: 58, charWidth: 0.52, max: 16, min: 3.5 });
  const teamSize = fitFontSize([teamName], { availableWidth: 20, charWidth: 0.5, max: 1.5, min: 0.8 });
  return (
    <div className="flex flex-col items-center">
      {/* Lettering for the yellow fill (the palette's ink turns light in the dark schemes, which is unreadable on it). */}
      <Burst className="w-[min(86vw,26rem)]" fill={colors.YELLOW} color={colors.ON_YELLOW} rotate={0} spikes={16}>
        <div className="flex max-w-[62%] flex-col items-center gap-[2cqw]">
          <div style={{ fontSize: "9cqw" }}>Drafted!</div>
          {names.map((name) => (
            <div key={name} className="max-w-full [overflow-wrap:anywhere]" style={{ fontSize: `${size}cqw`, lineHeight: 1 }}>
              {name}
            </div>
          ))}
        </div>
      </Burst>
      {/* Positioned so it paints over the burst (a positioned, transformed sibling would otherwise cover it). */}
      <div
        className="relative z-10 -mt-6 flex max-w-[min(86vw,26rem)] items-center gap-2 rounded-sm border-[3px] px-4 py-1.5"
        style={{ fontFamily: COMIC_FONT, fontSize: `${teamSize}rem`, lineHeight: 1.1, background: colors.PAPER, color: colors.INK, borderColor: colors.LINE, boxShadow: `4px 4px 0 ${colors.INK}` }}
      >
        {teamColor && <span className="size-4 shrink-0 rounded-full border-2" style={{ backgroundColor: teamColor, borderColor: colors.LINE }} />}
        <span className="text-center [overflow-wrap:anywhere]">{teamName}</span>
      </div>
    </div>
  );
}
