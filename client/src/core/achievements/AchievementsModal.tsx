import { useMyAchievements } from "../../api/queries";
import { useSlot } from "../../themes/context";
import { useDialogParts } from "../ui/useDialogParts";
import { SpinnerIcon } from "../ui/icons";
import { achievementCountLabel, orderForList } from "./achievementCard";

/**
 * Every switched-on Achievement for this bingo (CONTEXT.md "Achievement"), earned or not, in one column: earned first,
 * then the visible ones still to get, then the Hidden ones. Each row is the theme's (the AchievementRow slot). Opened
 * via the `?achievements=1` URL param by AchievementsProvider, so Back closes it like the player card.
 */
export function AchievementsModal({ slug, isOpen, onClose }: { slug: string; isOpen: boolean; onClose: () => void }) {
  const { Dialog, DialogHeader } = useDialogParts();
  const Row = useSlot("AchievementRow");
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
          <ul className="flex flex-col gap-3">
            {orderForList(data.achievements).map((a) => (
              <li key={a.key}>
                <Row achievement={a} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
