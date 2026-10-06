import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Button as AriaButton, Dialog, DialogTrigger, Heading, Popover } from "react-aria-components";
import type { InterestedPerson, TaskInterestModel } from "../../headless/types";
import { PlayerName, useOpenProfile } from "../tectonic/PlayerName";
import { TextTooltip } from "./Tooltip";

export interface TaskInterestPeopleProps {
  interest: TaskInterestModel;
}

/** How a theme draws the stack and its list: classes and inline style for each part. */
export interface TaskInterestSkin {
  /** "Unclaimed", when nobody has a hand up. */
  empty: Look;
  /** The room the stack has (the row's spare width): where in it the stack sits, e.g. justify-end. */
  room: Look;
  /** One picture in the stack: its ring has to be the colour behind the stack, so the overlaps read as cut-outs. */
  avatar: Look;
  /** The "+5" circle at the end of a stack that doesn't fit. */
  more: Look;
  popover: Look;
  heading: Look;
}
type Look = { className: string; style?: CSSProperties };

// A circle is CIRCLE px wide, and each one after the first overlaps the one before (the -space-x-2 below): STEP more.
const CIRCLE = 28;
const STEP = CIRCLE - 8;
/** How wide `n` circles are, overlapped. */
const stackWidth = (n: number) => (n <= 0 ? 0 : CIRCLE + STEP * (n - 1));

/**
 * How many pictures fit in `width`: all of them, or, once they don't, as many as leave room for the "+N" circle after
 * them. Before the room is known (the first render), all of them.
 */
export function picturesThatFit(count: number, width: number | null): number {
  if (width === null || stackWidth(count) <= width) return count;
  let shown = count - 1;
  while (shown > 0 && stackWidth(shown + 1) > width) shown--;
  return shown;
}

/**
 * Who has a hand up on a part (CONTEXT.md "Task interest"): their pictures in overlapping circles, as many as there's
 * room for, each a button to their profile with their name on hover. Only when they run out of room does the stack end
 * in "+N", which opens the whole list ("View all"). The list is a react-aria popover: it stacks above the Tile dialog,
 * scrolls on its own, and closes on Escape or a click off without closing the dialog. Takes the width it's given
 * (flex-1), so put it where the row's spare room is.
 */
export function TaskInterestPeople({ interest }: TaskInterestPeopleProps) {
  return <TaskInterestPeopleView interest={interest} skin={PLAIN_SKIN} />;
}

const PLAIN_SKIN: TaskInterestSkin = {
  empty: { className: "text-sm text-on-surface-subtle" },
  // Against the hand-up button at the end of the row, not floating mid-row.
  room: { className: "justify-end" },
  avatar: { className: "bg-surface-raised ring-2 ring-surface" },
  more: { className: "bg-surface-raised text-on-surface-muted ring-2 ring-surface" },
  popover: { className: "rounded-md border border-outline bg-surface-raised shadow-pop" },
  heading: { className: "border-b border-outline text-on-surface" },
};

/** The stack with a theme's skin. */
export function TaskInterestPeopleView({ interest, skin }: TaskInterestPeopleProps & { skin: TaskInterestSkin }) {
  const people = interest.people;
  const count = people.length;
  const roomRef = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<number | null>(null);
  const hasPeople = count > 0;

  // The room is the box's own width (it's flex-1, so its content doesn't decide it): measured before the first paint,
  // and again whenever the row changes size.
  useLayoutEffect(() => {
    const el = roomRef.current;
    if (!el) return;
    setRoom(el.clientWidth);
    const observer = new ResizeObserver(() => setRoom(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasPeople]);

  if (!hasPeople) {
    return (
      <span className={skin.empty.className} style={skin.empty.style}>
        Unclaimed
      </span>
    );
  }

  const shown = picturesThatFit(count, room);
  const hidden = count - shown;

  return (
    <div ref={roomRef} className={`flex min-w-0 flex-1 items-center ${skin.room.className}`} style={skin.room.style} role="group" aria-label={`${count} ${count === 1 ? "teammate" : "teammates"} interested`}>
      <div className="flex shrink-0 -space-x-2">
        {people.slice(0, shown).map((p) => (
          <Avatar key={p.id} person={p} look={skin.avatar} />
        ))}
        {hidden > 0 && <ViewAll people={people} hidden={hidden} skin={skin} />}
      </div>
    </div>
  );
}

// One picture: a button to the player's profile, their name on hover. Lifts above its neighbours on hover and focus,
// so the whole circle shows.
function Avatar({ person, look }: { person: InterestedPerson; look: Look }) {
  const open = useOpenProfile();
  return (
    <TextTooltip text={person.displayName}>
      <AriaButton
        aria-label={`${person.displayName}: view player profile`}
        isDisabled={!open}
        onPress={() => open?.(person.id)}
        className="relative shrink-0 cursor-pointer rounded-full outline-none transition-transform hover:z-10 hover:-translate-y-0.5 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-default"
      >
        <img src={person.avatarUrl} alt="" loading="lazy" draggable={false} className={`size-7 rounded-full object-cover ${look.className}`} style={look.style} />
      </AriaButton>
    </TextTooltip>
  );
}

// The "+N" at the end of a stack that ran out of room: opens the list of everyone.
function ViewAll({ people, hidden, skin }: { people: InterestedPerson[]; hidden: number; skin: TaskInterestSkin }) {
  return (
    <DialogTrigger>
      <TextTooltip text="View all">
        <AriaButton
          aria-label={`View all ${people.length} interested teammates`}
          className={`num relative flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-[11px] font-bold outline-none transition-transform hover:z-10 hover:-translate-y-0.5 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-accent ${skin.more.className}`}
          style={skin.more.style}
        >
          +{hidden}
        </AriaButton>
      </TextTooltip>
      <Popover placement="bottom end" offset={6} className={`overlay-panel w-64 max-w-[calc(100vw-2rem)] outline-none ${skin.popover.className}`} style={skin.popover.style}>
        <Dialog aria-label="Interested teammates" className="flex max-h-[min(60vh,24rem)] flex-col outline-none">
          <Heading slot="title" className={`shrink-0 px-3 pb-1.5 pt-2.5 text-xs font-semibold ${skin.heading.className}`} style={skin.heading.style}>
            Interested teammates ({people.length})
          </Heading>
          <ul className="flex min-h-0 flex-col gap-1.5 overflow-y-auto overscroll-contain px-3 py-2.5 text-sm">
            {people.map((p) => (
              // shrink-0: a row in this scrolling column keeps its height. (The list it replaces truncated each row, and
              // overflow-hidden rows in a flex column shrink to nothing instead of scrolling: past ~10 names they overlapped.)
              <li key={p.id} className="flex min-w-0 shrink-0 items-center gap-2">
                <img src={p.avatarUrl} alt="" loading="lazy" className="size-6 shrink-0 rounded-full" />
                {/* Wraps rather than truncates: a long RSN is read in full. */}
                <span className="min-w-0 break-words">
                  <PlayerName userId={p.id} className="font-medium">
                    {p.displayName}
                  </PlayerName>
                </span>
              </li>
            ))}
          </ul>
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}
