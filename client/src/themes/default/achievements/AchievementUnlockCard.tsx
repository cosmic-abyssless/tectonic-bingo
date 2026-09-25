import type { MyAchievement } from "@bingo/shared";
import { WikiIcon } from "../../../core/ui/ItemIcon";

// After OSRS's combat achievement / collection log popups: a dark translucent panel with a thin gold rule, the item
// sprite straight on it, and the Achievement's name in the game's orange.
export function AchievementUnlockCard({ achievement, contentShown }: { achievement: MyAchievement; contentShown: boolean }) {
  return (
    <div className="w-[min(30rem,calc(100vw-32px))] rounded-md border-2 border-t-[3px] border-achievement-border bg-achievement-surface px-5 py-4 shadow-pop">
      <div className={`flex items-center gap-4 transition-opacity duration-200 ${contentShown ? "opacity-100" : "opacity-0"}`}>
        <WikiIcon name={achievement.itemName ?? ""} className="size-12 shrink-0 object-contain [image-rendering:pixelated]" />
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-achievement-body">Achievement unlocked</div>
          <div className="text-lg font-semibold leading-tight text-achievement-title">{achievement.name}</div>
          <div className="mt-0.5 text-sm text-achievement-body">{achievement.description}</div>
        </div>
      </div>
    </div>
  );
}
