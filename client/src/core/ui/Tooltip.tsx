// A real tooltip — readable size, appears quickly, gone the instant the
// pointer leaves — for anywhere a native `title` attribute isn't good
// enough (small, slow, and inconsistent across browsers). Wrap a single
// native-element child (a <span>, not one of our own components) — <Focusable>
// below is what makes a plain element hoverable/focusable-as-a-trigger; its
// type requires exactly that (a DOM element, not a custom component).
//
//   <Tooltip content="The full text">
//     <span className="truncate">shortened…</span>
//   </Tooltip>
import type { ComponentProps, ReactNode } from "react";
import { Focusable, Tooltip as AriaTooltip, TooltipTrigger, type Placement } from "react-aria-components";

// react-aria's default is 1.5s before showing (tuned for "don't spam a
// tooltip on every incidental hover") — noticeably slow for something meant
// to read truncated text; closeDelay 0 so it isn't sticky on the way out.
const DELAY_MS = 200;

type FocusableChild = ComponentProps<typeof Focusable>["children"];

export function Tooltip({ children, content, placement = "top" }: { children: FocusableChild; content: ReactNode; placement?: Placement }) {
  if (!content) return children;
  return (
    <TooltipTrigger delay={DELAY_MS} closeDelay={0}>
      {/* TooltipTrigger only provides context with the hover/focus wiring — react-aria-components' own
          <Button>/<Link> know to read it, but a plain element (our <span>) doesn't unless wrapped in
          <Focusable>, which applies it via cloneElement regardless of the child's type. */}
      <Focusable>{children}</Focusable>
      <AriaTooltip
        placement={placement}
        offset={6}
        className="overlay-panel max-w-xs rounded-md border border-outline bg-surface-raised px-2.5 py-1.5 text-xs text-on-surface shadow-pop outline-none"
      >
        {content}
      </AriaTooltip>
    </TooltipTrigger>
  );
}

/** Tooltip whose content is just text — the common case (a truncated cell, an abbreviated label, ...). */
export function TextTooltip({ children, text, placement }: { children: FocusableChild; text: string; placement?: Placement }) {
  return (
    <Tooltip content={text} placement={placement}>
      {children}
    </Tooltip>
  );
}
