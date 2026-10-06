import type { CSSProperties } from "react";
import { Button as AriaButton, Dialog, DialogTrigger, Heading, Popover } from "react-aria-components";
import type { InterestedPerson, TaskInterestModel } from "../../headless/types";
import { PlayerName } from "../tectonic/PlayerName";

export interface TaskInterestPeopleProps {
  interest: TaskInterestModel;
}

/** How a theme draws the stack and its list: classes and inline style for each part. */
export interface TaskInterestSkin {
  /** "Unclaimed", when nobody has a hand up. */
  empty: Look;
  /** The button around the stack. */
  trigger: Look;
  /** One picture in the stack: its ring has to be the colour behind the stack, so the overlaps read as cut-outs. */
  avatar: Look;
  /** The "+5" circle at the end of a stack that doesn't fit. */
  more: Look;
  popover: Look;
  heading: Look;
}
type Look = { className: string; style?: CSSProperties };

/** At most this many circles: a longer list shows one fewer picture and then "+N" for the rest. */
const MAX_CIRCLES = 5;

/**
 * Who has a hand up on a part (CONTEXT.md "Task interest"): their pictures stacked in overlapping circles, "+N" at the
 * end when there are more than fit, and the whole stack a button that opens the list of names. Inside the Tile dialog,
 * so the list is a react-aria popover: it stacks above the dialog, scrolls on its own, and closes on Escape or a click
 * off without closing the dialog.
 */
export function TaskInterestPeople({ interest }: TaskInterestPeopleProps) {
  return <TaskInterestPeopleView interest={interest} skin={PLAIN_SKIN} />;
}

const PLAIN_SKIN: TaskInterestSkin = {
  empty: { className: "text-sm text-on-surface-subtle" },
  trigger: { className: "rounded-full hover:brightness-110" },
  avatar: { className: "bg-surface-raised ring-2 ring-surface" },
  more: { className: "bg-surface-raised text-on-surface-muted ring-2 ring-surface" },
  popover: { className: "rounded-md border border-outline bg-surface-raised shadow-pop" },
  heading: { className: "border-b border-outline text-on-surface" },
};

/** The stack with a theme's skin. */
export function TaskInterestPeopleView({ interest, skin }: TaskInterestPeopleProps & { skin: TaskInterestSkin }) {
  const people = interest.people;
  const count = people.length;
  if (count === 0) {
    return (
      <span className={skin.empty.className} style={skin.empty.style}>
        Unclaimed
      </span>
    );
  }

  const overflow = count > MAX_CIRCLES;
  const shown = overflow ? people.slice(0, MAX_CIRCLES - 1) : people;
  const label = `${count} ${count === 1 ? "teammate" : "teammates"} interested: ${people.map((p) => p.displayName).join(", ")}`;

  return (
    <DialogTrigger>
      <AriaButton
        aria-label={label}
        className={`inline-flex shrink-0 cursor-pointer items-center outline-none transition focus-visible:ring-2 focus-visible:ring-accent ${skin.trigger.className}`}
        style={skin.trigger.style}
      >
        <span className="flex -space-x-2" aria-hidden>
          {shown.map((p) => (
            <Avatar key={p.id} person={p} look={skin.avatar} />
          ))}
          {overflow && (
            <span className={`num flex size-7 items-center justify-center rounded-full text-[11px] font-bold ${skin.more.className}`} style={skin.more.style}>
              +{count - shown.length}
            </span>
          )}
        </span>
      </AriaButton>
      <Popover placement="bottom start" offset={6} className={`overlay-panel w-64 max-w-[calc(100vw-2rem)] outline-none ${skin.popover.className}`} style={skin.popover.style}>
        <Dialog aria-label="Interested teammates" className="flex max-h-[min(60vh,24rem)] flex-col outline-none">
          <Heading slot="title" className={`shrink-0 px-3 pb-1.5 pt-2.5 text-xs font-semibold ${skin.heading.className}`} style={skin.heading.style}>
            Interested teammates ({count})
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

function Avatar({ person, look }: { person: InterestedPerson; look: Look }) {
  return <img src={person.avatarUrl} alt="" loading="lazy" draggable={false} className={`size-7 shrink-0 rounded-full object-cover ${look.className}`} style={look.style} />;
}
