import { useMyAchievements } from "../../api/queries";
import { useSlot } from "../../themes/context";
import { useDialogParts } from "../ui/useDialogParts";
import { SpinnerIcon } from "../ui/icons";
import { achievementTotals, orderForList } from "./achievementCard";

/**
 * Every switched-on Achievement for this bingo (CONTEXT.md "Achievement"), earned or not, in one column: earned first,
 * then the visible ones still to get, then the Hidden ones, under the Player's total. The total and each row are the
 * theme's (the AchievementTotal and AchievementRow slots). Opened via the `?achievements=1` URL param by
 * AchievementsProvider, so Back closes it like the player card.
 */
export function AchievementsModal({ slug, isOpen, onClose }: { slug: string; isOpen: boolean; onClose: () => void }) {
  const { Dialog, DialogHeader } = useDialogParts();
  const Row = useSlot("AchievementRow");
  const Total = useSlot("AchievementTotal");
  const { data } = useMyAchievements(slug, isOpen);
  return (
    <Dialog isOpen={isOpen} onClose={onClose} size="lg">
      <DialogHeader title="Achievements" onClose={onClose} />
      <div className="p-5">
        {!data ? (
          <div className="flex items-center gap-2 text-sm text-on-surface-muted">
            <SpinnerIcon /> Loading achievements…
          </div>
        ) : (
          <>
            <Total {...achievementTotals(data.achievements)} />
            <ul className="mt-4 flex flex-col gap-3">
              {orderForList(data.achievements).map((a) => (
                <li key={a.key}>
                  <Row achievement={a} />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Dialog>
  );
}
