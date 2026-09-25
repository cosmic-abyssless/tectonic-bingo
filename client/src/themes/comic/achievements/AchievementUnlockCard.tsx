import type { MyAchievement } from "@bingo/shared";
import { WikiIcon } from "../../../core/ui/ItemIcon";
import { COMIC_FONT } from "../font";
import { useComic } from "../ui/useComic";

// A yellow narration caption, inked and hard-shadowed like the rest of the book, with the item sprite in a little
// paper panel of its own.
export function AchievementUnlockCard({ achievement }: { achievement: MyAchievement }) {
  const { colors } = useComic();
  return (
    <div
      className="w-[min(30rem,calc(100vw-32px))] border-[3px] px-4 py-3"
      style={{ background: colors.YELLOW, color: colors.ON_YELLOW, borderColor: colors.LINE, boxShadow: `5px 5px 0 ${colors.LINE}` }}
    >
      <div className="flex items-center gap-4">
        <div className="grid size-16 shrink-0 place-items-center border-[3px]" style={{ background: colors.PAPER_RAISED, borderColor: colors.LINE }}>
          <WikiIcon name={achievement.itemName ?? ""} className="size-12 object-contain [image-rendering:pixelated]" />
        </div>
        <div className="min-w-0">
          <div className="text-sm uppercase leading-none tracking-wider" style={{ fontFamily: COMIC_FONT }}>
            Achievement unlocked!
          </div>
          <div className="mt-1 text-3xl uppercase leading-none tracking-wide [overflow-wrap:anywhere]" style={{ fontFamily: COMIC_FONT }}>
            {achievement.name}
          </div>
          <div className="mt-1 text-base font-semibold leading-snug">{achievement.description}</div>
        </div>
      </div>
    </div>
  );
}
