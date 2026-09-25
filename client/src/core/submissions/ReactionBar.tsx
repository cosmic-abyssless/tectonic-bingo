import { Button as AriaButton, Dialog, DialogTrigger, Popover } from "react-aria-components";
import { SUBMISSION_REACTIONS, type SubmissionReaction } from "@bingo/shared";
import type { ReactionModel } from "../../headless/types";
import { IconButton } from "../ui/Button";
import { SmilePlusIcon } from "../ui/icons";
import { TextTooltip } from "../ui/Tooltip";

/**
 * Teammates' emoji reactions on a submission: a chip per emoji someone has left (with the count, and who on hover),
 * then a smiley button to add one. A chip toggles the viewer's own. Read-only (no smiley, chips inert) for someone who
 * can see the submission but isn't on its team, i.e. a mod; nothing at all when that leaves nothing to show.
 */
export function ReactionBar({ reactions, canReact, onToggle, className = "" }: { reactions: ReactionModel[]; canReact: boolean; onToggle: (emoji: SubmissionReaction) => void; className?: string }) {
  if (!canReact && reactions.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      {reactions.map((r) => (
        <TextTooltip key={r.emoji} text={r.names.join(", ")}>
          <AriaButton
            isDisabled={!canReact}
            aria-pressed={r.mine}
            aria-label={`${r.emoji} ${r.count}: ${r.names.join(", ")}${canReact ? (r.mine ? ". Take yours off" : ". Add yours") : ""}`}
            onPress={() => onToggle(r.emoji)}
            className={`inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent ${
              r.mine ? "border-accent bg-accent/15 text-on-surface" : "border-outline text-on-surface-muted"
            } ${canReact ? "cursor-pointer hover:border-outline-strong" : "cursor-default"}`}
          >
            <span aria-hidden>{r.emoji}</span>
            <span className="num">{r.count}</span>
          </AriaButton>
        </TextTooltip>
      ))}
      {canReact && <ReactionPicker reactions={reactions} onToggle={onToggle} />}
    </div>
  );
}

// The smiley: a small popover with every reaction, the viewer's own ones marked. Picking one toggles it and closes.
function ReactionPicker({ reactions, onToggle }: { reactions: ReactionModel[]; onToggle: (emoji: SubmissionReaction) => void }) {
  const mine = new Set(reactions.filter((r) => r.mine).map((r) => r.emoji));
  return (
    <DialogTrigger>
      <IconButton size="sm" label="Add a reaction" className="size-6!">
        <SmilePlusIcon size={14} />
      </IconButton>
      <Popover placement="top start" offset={6} className="overlay-panel rounded-full border border-outline bg-surface-raised p-1 shadow-pop outline-none">
        <Dialog aria-label="React" className="flex gap-0.5 outline-none">
          {({ close }) =>
            SUBMISSION_REACTIONS.map((emoji) => (
              <AriaButton
                key={emoji}
                aria-label={mine.has(emoji) ? `Take off ${emoji}` : `React ${emoji}`}
                aria-pressed={mine.has(emoji)}
                onPress={() => {
                  onToggle(emoji);
                  close();
                }}
                className={`flex size-8 cursor-pointer items-center justify-center rounded-full text-lg outline-none transition-transform hover:scale-125 hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent ${mine.has(emoji) ? "bg-accent/15" : ""}`}
              >
                {emoji}
              </AriaButton>
            ))
          }
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}
