import { burstLetteringSize } from "../../../core/draft/revealMath";
import { COMIC_FONT } from "../font";
import { Burst } from "../ui/Burst";
import { useComic } from "../ui/useComic";

export function DraftPickBurst({ names, teamName, teamColor }: { names: string[]; teamName: string; teamColor: string | null }) {
  const { colors } = useComic();
  const size = burstLetteringSize(names);
  return (
    <div className="flex flex-col items-center">
      <Burst className="w-[min(86vw,26rem)]" fill={colors.YELLOW} rotate={0} spikes={16}>
        <div className="flex max-w-[62%] flex-col items-center gap-[2cqw]">
          <div style={{ fontSize: "9cqw", color: colors.RED }}>Drafted!</div>
          {names.map((name) => (
            <div key={name} className="max-w-full truncate" style={{ fontSize: `${size}cqw`, lineHeight: 1 }}>
              {name}
            </div>
          ))}
        </div>
      </Burst>
      <div
        className="-mt-4 flex max-w-[86vw] items-center gap-2 rounded-sm border-2 px-3 py-1 text-xl"
        style={{ fontFamily: COMIC_FONT, background: colors.PAPER, color: colors.INK, borderColor: colors.LINE, boxShadow: `3px 3px 0 ${colors.INK}` }}
      >
        {teamColor && <span className="size-3 shrink-0 rounded-full border-2" style={{ backgroundColor: teamColor, borderColor: colors.LINE }} />}
        <span className="truncate">{teamName}</span>
      </div>
    </div>
  );
}
