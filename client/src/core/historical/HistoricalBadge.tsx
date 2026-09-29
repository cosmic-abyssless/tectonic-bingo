import { Badge } from "../ui/Card";
import { ClockIcon } from "../ui/icons";

/** The Historical badge (CONTEXT.md "Historical Bingo"): in the Bingo list and the Bingo's header. */
export function HistoricalBadge({ className }: { className?: string }) {
  return (
    <Badge tone="info" className={className}>
      <ClockIcon size={11} />
      Historical
    </Badge>
  );
}
