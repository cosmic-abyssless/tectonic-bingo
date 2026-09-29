import type { TutorialCardModel } from "../../../headless/types";
import { Button } from "../../../core/ui/Button";

/** The Tutorial's card (the TutorialCard slot): a popover, its step count beside the title, Skip and Next under it. */
export function TutorialCard({ card }: { card: TutorialCardModel }) {
  return (
    <div className="rounded-md border border-outline bg-surface-raised p-4 text-on-surface shadow-pop">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">{card.title}</h2>
        <span className="num shrink-0 text-xs text-on-surface-muted">
          {card.number} of {card.count}
        </span>
      </div>
      <div className="mt-1.5 space-y-1 text-sm text-on-surface-muted">
        {card.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onPress={card.onSkip}>
          Skip
        </Button>
        {card.primary && (
          <Button size="sm" variant="primary" onPress={card.primary.onPress}>
            {card.primary.label}
          </Button>
        )}
      </div>
    </div>
  );
}
