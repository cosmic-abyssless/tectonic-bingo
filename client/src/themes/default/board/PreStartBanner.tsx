import { CountdownTimer } from "../../../core/ui/CountdownTimer";
import { Notice } from "../../../core/ui/Card";
import { ClockIcon } from "../../../core/ui/icons";

export function PreStartBanner({ startsAt }: { startsAt: number }) {
  return (
    <Notice tone="info" icon={<ClockIcon />} className="mb-3">
      Bingo starts in <CountdownTimer target={startsAt} className="text-on-surface" />. Look over the tiles now — submissions open when the timer hits zero.
    </Notice>
  );
}
