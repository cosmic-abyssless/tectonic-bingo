import { COMIC_FONT } from "../font";
import { useComic } from "../ui/useComic";

// The Player's total as a yellow caption over an inked bar, the same bar as a counted Achievement's row, only bigger.
export function AchievementTotal({ earned, total }: { earned: number; total: number }) {
  const { colors } = useComic();
  const fraction = total > 0 ? earned / total : 0;
  return (
    <div className="border-[3px] px-3 py-2.5" style={{ background: colors.YELLOW, color: colors.ON_YELLOW, borderColor: colors.LINE, boxShadow: `3px 3px 0 ${colors.LINE}` }}>
      <div className="flex items-baseline justify-between gap-3 uppercase leading-none tracking-wide" style={{ fontFamily: COMIC_FONT }}>
        <span className="text-xl">Unlocked</span>
        <span className="num text-2xl">
          {earned} / {total}
        </span>
      </div>
      <div className="mt-2 h-4 w-full border-[3px]" style={{ borderColor: colors.LINE, background: colors.PAPER_RAISED }}>
        <div className="h-full" style={{ width: `${fraction * 100}%`, background: colors.RED }} />
      </div>
    </div>
  );
}
