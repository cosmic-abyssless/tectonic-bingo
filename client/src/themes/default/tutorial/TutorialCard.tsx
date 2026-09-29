import type { TutorialCardModel } from "../../../headless/types";
import { Button } from "../../../core/ui/Button";
import { PointerClickIcon } from "../../../core/ui/icons";

/**
 * The Tutorial's card (the TutorialCard slot): a popover, its step count beside the title, Skip (Exit once under way) and
 * Next under it. A step that waits for a click says it's the Player's turn instead of offering Next.
 */
export function TutorialCard({ card }: { card: TutorialCardModel }) {
  return (
    // The welcome (large) gets a bigger heading and text, and more room.
    <div className={`rounded-md border border-outline bg-surface-raised text-on-surface shadow-pop ${card.large ? "p-6" : "p-4"}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className={card.large ? "text-xl font-semibold" : "text-sm font-semibold"}>{card.title}</h2>
        <span className="num shrink-0 text-xs text-on-surface-muted">
          {card.label} of {card.count}
        </span>
      </div>
      <div className={`space-y-1 text-on-surface-muted ${card.large ? "mt-2.5 text-base" : "mt-1.5 text-sm"}`}>
        {card.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onPress={card.onSkip}>
          {card.skipLabel}
        </Button>
        {card.waitsForClick && (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-warn/10 px-2.5 py-1.5 text-sm font-semibold text-warn">
            <PointerClickIcon />
            Your turn: click it
          </span>
        )}
        {card.primary && (
          <Button size="sm" variant="primary" onPress={card.primary.onPress}>
            {card.primary.label}
          </Button>
        )}
      </div>
    </div>
  );
}
