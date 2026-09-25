import type { CSSProperties } from "react";
import { Button as AriaButton, Dialog, DialogTrigger, Popover } from "react-aria-components";
import { SUBMISSION_REACTIONS, type SubmissionReaction } from "@bingo/shared";
import type { ReactionModel } from "../../headless/types";
import { useOptionalSlot } from "../../themes/context";
import { SmilePlusIcon } from "../ui/icons";
import { TextTooltip } from "../ui/Tooltip";
import { REACTION_ART } from "./reactionArt";

export interface ReactionBarProps {
  reactions: ReactionModel[];
  canReact: boolean;
  onToggle: (emoji: SubmissionReaction) => void;
  className?: string;
}

/** How a theme draws the bar's parts: classes and inline style for each. */
export interface ReactionSkin {
  chip: (mine: boolean, interactive: boolean) => Look;
  add: Look;
  popover: Look;
  option: (mine: boolean) => Look;
}
type Look = { className: string; style?: CSSProperties };

/**
 * Teammates' emoji reactions on a submission: a chip per emoji someone has left (with the count, and who on hover),
 * then a smiley button to add one. A chip toggles the viewer's own. Read-only (no smiley, chips inert) for someone who
 * can see the submission but isn't on its team, i.e. a mod; nothing at all when that leaves nothing to show. Inside a
 * theme that draws its own (the ReactionBar slot) it's the theme's.
 */
export function ReactionBar(props: ReactionBarProps) {
  const Themed = useOptionalSlot("ReactionBar");
  return Themed ? <Themed {...props} /> : <ReactionBarView {...props} skin={PLAIN_SKIN} />;
}

const PLAIN_SKIN: ReactionSkin = {
  chip: (mine, interactive) => ({
    className: `rounded-full border ${mine ? "border-accent bg-accent/15 text-on-surface" : "border-outline-strong bg-surface text-on-surface"} ${interactive ? "hover:border-accent" : ""}`,
  }),
  add: { className: "rounded-full text-on-surface-muted hover:bg-surface-hover hover:text-on-surface" },
  popover: { className: "rounded-full border border-outline bg-surface-raised shadow-pop" },
  option: (mine) => ({ className: `rounded-full hover:bg-surface-hover ${mine ? "bg-accent/15" : ""}` }),
};

/** One reaction's art. */
export function ReactionIcon({ emoji, size = 16 }: { emoji: SubmissionReaction; size?: number }) {
  return <img src={REACTION_ART[emoji].src} alt="" aria-hidden draggable={false} className="shrink-0 select-none" style={{ width: size, height: size }} />;
}

/** The bar with a theme's skin: what the ReactionBar slot renders, with its own. */
export function ReactionBarView({ reactions, canReact, onToggle, className = "", skin }: ReactionBarProps & { skin: ReactionSkin }) {
  if (!canReact && reactions.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {reactions.map((r) => {
        const look = skin.chip(r.mine, canReact);
        const name = REACTION_ART[r.emoji].name;
        return (
          <TextTooltip key={r.emoji} text={r.names.join(", ")}>
            <AriaButton
              isDisabled={!canReact}
              aria-pressed={r.mine}
              aria-label={`${name}, ${r.count}: ${r.names.join(", ")}${canReact ? (r.mine ? ". Take yours off" : ". Add yours") : ""}`}
              onPress={() => onToggle(r.emoji)}
              className={`inline-flex h-7 items-center gap-1 px-2 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent ${canReact ? "cursor-pointer" : "cursor-default"} ${look.className}`}
              style={look.style}
            >
              <ReactionIcon emoji={r.emoji} />
              <span className="num">{r.count}</span>
            </AriaButton>
          </TextTooltip>
        );
      })}
      {canReact && <ReactionPicker reactions={reactions} onToggle={onToggle} skin={skin} />}
    </div>
  );
}

// The smiley: a small popover with every reaction, the viewer's own ones marked. Picking one toggles it and closes.
function ReactionPicker({ reactions, onToggle, skin }: { reactions: ReactionModel[]; onToggle: (emoji: SubmissionReaction) => void; skin: ReactionSkin }) {
  const mine = new Set(reactions.filter((r) => r.mine).map((r) => r.emoji));
  return (
    <DialogTrigger>
      <AriaButton
        aria-label="Add a reaction"
        className={`flex size-7 cursor-pointer items-center justify-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent ${skin.add.className}`}
        style={skin.add.style}
      >
        <SmilePlusIcon size={16} />
      </AriaButton>
      <Popover placement="top start" offset={6} className={`overlay-panel p-1 outline-none ${skin.popover.className}`} style={skin.popover.style}>
        <Dialog aria-label="React" className="flex gap-0.5 outline-none">
          {({ close }) =>
            SUBMISSION_REACTIONS.map((emoji) => {
              const look = skin.option(mine.has(emoji));
              return (
                <AriaButton
                  key={emoji}
                  aria-label={`${mine.has(emoji) ? "Take off" : "React with"} ${REACTION_ART[emoji].name}`}
                  aria-pressed={mine.has(emoji)}
                  onPress={() => {
                    onToggle(emoji);
                    close();
                  }}
                  className={`flex size-9 cursor-pointer items-center justify-center outline-none transition-transform hover:scale-125 focus-visible:ring-2 focus-visible:ring-accent ${look.className}`}
                  style={look.style}
                >
                  <ReactionIcon emoji={emoji} size={22} />
                </AriaButton>
              );
            })
          }
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}
