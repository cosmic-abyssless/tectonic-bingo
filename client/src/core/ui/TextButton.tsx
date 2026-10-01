import { Button as AriaButton, type ButtonProps } from "react-aria-components";
import { INTERACTIVE_TEXT } from "./interactiveText";

// The same mark in the text's own colour, for text that isn't on the page's surface (a notice, the Achievement popup, a
// comic caption): a dotted underline that turns solid on hover or focus, and no colour change.
const OWN_COLOUR =
  "underline decoration-current/60 decoration-dotted underline-offset-[3px] hover:decoration-current hover:decoration-solid focus-visible:decoration-current focus-visible:decoration-solid focus-visible:outline-none";

/**
 * An inline action that reads as part of the text around it ("Clear", "Review cuts", "Post one instead"): marked like a
 * player's name (INTERACTIVE_TEXT). Size, weight and colour come from `className` or the text it sits in; `ownColour`
 * keeps that colour on hover, for text on a coloured background.
 */
export function TextButton({ className, ownColour = false, ...props }: Omit<ButtonProps, "className"> & { className?: string; ownColour?: boolean }) {
  return <AriaButton {...props} className={`rounded-sm text-left disabled:cursor-not-allowed disabled:opacity-40 ${ownColour ? OWN_COLOUR : INTERACTIVE_TEXT} ${className ?? ""}`} />;
}
