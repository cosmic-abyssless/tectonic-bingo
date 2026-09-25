import type { MyAchievement } from "@bingo/shared";
import { WikiIcon } from "../../../core/ui/ItemIcon";
import { achievementCardKind, earnedLabel, progressFraction, progressLabel } from "../../../core/achievements/achievementCard";
import { COMIC_FONT } from "../font";
import { InkTag } from "../ui/CaptionBox";
import { useComic } from "../ui/useComic";

/**
 * One Achievement as a caption box, like the rest of the book's dialogs: earned ones on bright paper with the sprite in
 * its little panel and a green tag with the date, the ones still to get on plain paper with the sprite in greyscale and
 * an inked progress bar, the Hidden ones a "???" box on the darker stock.
 */
export function AchievementRow({ achievement }: { achievement: MyAchievement }) {
  const { colors } = useComic();
  const kind = achievementCardKind(achievement);
  const earned = kind === "earned";
  const masked = kind === "masked";
  const label = progressLabel(achievement.progress);
  const fraction = progressFraction(achievement.progress);

  return (
    <div
      className="flex items-center gap-3 border-[3px] px-3 py-2.5"
      style={{
        background: earned ? colors.PAPER_RAISED : masked ? colors.PAPER_ALT : colors.PAPER,
        borderColor: colors.LINE,
        boxShadow: earned ? `3px 3px 0 ${colors.LINE}` : undefined,
        color: colors.INK_BODY,
      }}
    >
      <div className="grid size-14 shrink-0 place-items-center border-[3px]" style={{ background: masked ? colors.PAPER : colors.PAPER_RAISED, borderColor: colors.LINE }}>
        {masked ? (
          <span aria-hidden className="text-3xl leading-none" style={{ fontFamily: COMIC_FONT, color: colors.INK_SUBTLE }}>
            ?
          </span>
        ) : (
          <WikiIcon name={achievement.itemName ?? ""} className={`size-10 object-contain [image-rendering:pixelated] ${earned ? "" : "opacity-60 grayscale"}`} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 text-xl uppercase leading-none tracking-wide" style={{ fontFamily: COMIC_FONT, color: masked || !earned ? colors.INK_SUBTLE : colors.INK }}>
            {masked ? "???" : achievement.name}
          </div>
          {earned && (
            <InkTag fill={colors.GREEN_TINT} className="shrink-0">
              {earnedLabel(achievement.earnedAt)}
            </InkTag>
          )}
        </div>
        <div className={`mt-1 text-sm leading-snug ${masked ? "italic" : ""}`} style={{ color: earned ? colors.INK_BODY : colors.INK_SUBTLE }}>
          {masked ? "Keep playing to discover this one." : achievement.description}
        </div>
        {!masked && (
          <div className="text-sm italic leading-snug" style={{ color: colors.INK_SUBTLE }}>
            {achievement.flavor}
          </div>
        )}
        {!earned && !masked && label && (
          <div className="mt-2 flex items-center gap-2">
            <div className="h-3 flex-1 border-2" style={{ borderColor: colors.LINE, background: colors.PAPER_RAISED }}>
              <div className="h-full" style={{ width: `${(fraction ?? 0) * 100}%`, background: colors.YELLOW }} />
            </div>
            <span className="num shrink-0 text-base leading-none" style={{ fontFamily: COMIC_FONT, color: colors.INK }}>
              {label}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
