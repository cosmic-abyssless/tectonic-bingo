import type { MyAchievement } from "@bingo/shared";
import { useMyAchievements } from "../../api/queries";
import { useDialogParts } from "../ui/useDialogParts";
import { SpinnerIcon } from "../ui/icons";
import { WikiIcon } from "../ui/ItemIcon";
import { achievementCardKind, achievementCountLabel, progressFraction, progressLabel } from "./achievementCard";

/**
 * Every switched-on Achievement for this bingo (CONTEXT.md "Achievement"), earned or not — opened via the
 * `?achievements=1` URL param by AchievementsProvider, so Back closes it like the player card.
 */
export function AchievementsModal({ slug, isOpen, onClose }: { slug: string; isOpen: boolean; onClose: () => void }) {
  const { Dialog, DialogHeader } = useDialogParts();
  const { data } = useMyAchievements(slug, isOpen);
  return (
    <Dialog isOpen={isOpen} onClose={onClose} size="lg">
      <DialogHeader title="Achievements" subtitle={data ? achievementCountLabel(data.achievements) : undefined} onClose={onClose} />
      <div className="p-5">
        {!data ? (
          <div className="flex items-center gap-2 text-sm text-on-surface-muted">
            <SpinnerIcon /> Loading achievements…
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {data.achievements.map((a) => (
              <AchievementGridCard key={a.key} achievement={a} />
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}

function AchievementGridCard({ achievement }: { achievement: MyAchievement }) {
  const kind = achievementCardKind(achievement);

  if (kind === "masked") {
    return (
      <div className="flex items-start gap-3 rounded-md border border-outline bg-surface-raised p-3">
        <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-icon-backdrop text-sm font-semibold text-on-surface-subtle">
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
    <div className={`flex items-start gap-3 rounded-md border border-outline bg-surface p-3 ${earned ? "" : "opacity-60"}`}>
      <WikiIcon name={achievement.itemName ?? ""} className={`size-9 shrink-0 rounded-sm bg-icon-backdrop p-1 [image-rendering:pixelated] ${earned ? "" : "grayscale"}`} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-on-surface">{achievement.name}</div>
        <div className="text-xs text-on-surface-muted">{achievement.description}</div>
        {earned && achievement.earnedAt && (
          <div className="mt-1 text-[11px] text-on-surface-subtle">Earned {new Date(achievement.earnedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</div>
        )}
        {!earned && label && (
          <div className="mt-1.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
              <div className="h-full rounded-full bg-accent" style={{ width: `${(fraction ?? 0) * 100}%` }} />
            </div>
            <div className="num mt-0.5 text-[11px] text-on-surface-subtle">{label}</div>
          </div>
        )}
      </div>
    </div>
  );
}
