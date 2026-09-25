import type { MyAchievement } from "@bingo/shared";
import { WikiIcon } from "../../../core/ui/ItemIcon";
import { achievementCardKind, earnedLabel, progressFraction, progressLabel } from "../../../core/achievements/achievementCard";

export function AchievementRow({ achievement }: { achievement: MyAchievement }) {
  const kind = achievementCardKind(achievement);

  if (kind === "masked") {
    return (
      <div className="flex items-center gap-3 rounded-md border border-outline bg-surface-raised p-3">
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-icon-backdrop text-sm font-semibold text-on-surface-subtle">
          ?
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-on-surface-subtle">???</div>
          <div className="text-xs text-on-surface-subtle">Keep playing to discover this one.</div>
        </div>
      </div>
    );
  }

  const earned = kind === "earned";
  const label = progressLabel(achievement.progress);
  const fraction = progressFraction(achievement.progress);

  return (
    <div className={`flex items-center gap-3 rounded-md border border-outline bg-surface p-3 ${earned ? "" : "opacity-60"}`}>
      <WikiIcon name={achievement.itemName ?? ""} className={`size-10 shrink-0 rounded-sm bg-icon-backdrop p-1 [image-rendering:pixelated] ${earned ? "" : "grayscale"}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-sm font-semibold text-on-surface">{achievement.name}</div>
          {earned && <div className="shrink-0 text-[11px] text-on-surface-subtle">{earnedLabel(achievement.earnedAt)}</div>}
        </div>
        <div className="text-xs text-on-surface-muted">{achievement.description}</div>
        {earned && <div className="text-xs italic text-on-surface-subtle">{achievement.flavor}</div>}
        {!earned && label && (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-raised">
              <div className="h-full rounded-full bg-accent" style={{ width: `${(fraction ?? 0) * 100}%` }} />
            </div>
            <div className="num shrink-0 text-[11px] text-on-surface-subtle">{label}</div>
          </div>
        )}
      </div>
    </div>
  );
}
