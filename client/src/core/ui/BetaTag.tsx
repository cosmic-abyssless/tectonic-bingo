import { useOptionalSlot } from "../../themes/context";
import { InfoIcon } from "./icons";
import { TextTooltip } from "./Tooltip";

const BETA_NOTE = "This is new and still being tuned, so it won't be perfect yet. Tell us what feels off with the report-a-bug button at the top of the page.";

/**
 * "Beta" after the heading of a section still being tried out (the stats page's Titles), with an info icon asking for
 * feedback. The tag itself is the theme's (the BetaTag slot) inside one that draws its own.
 */
export function BetaTag() {
  const Themed = useOptionalSlot("BetaTag");
  return (
    <span className="inline-flex items-center gap-1.5">
      {Themed ? <Themed /> : <PlainBetaTag />}
      <TextTooltip text={BETA_NOTE}>
        <span role="img" aria-label="About this beta" className="inline-flex shrink-0 cursor-help text-on-surface-subtle hover:text-on-surface">
          <InfoIcon size={14} />
        </span>
      </TextTooltip>
    </span>
  );
}

// Shaped like a Badge, in purple (--color-beta), a colour no status uses, so it doesn't read as a warning. Not a Badge:
// its tone's text colour would win over this one.
export function PlainBetaTag() {
  return <span className="inline-flex items-center rounded-sm border border-beta/40 px-1.5 py-0.5 text-[11px] font-medium leading-4 text-beta">Beta</span>;
}
