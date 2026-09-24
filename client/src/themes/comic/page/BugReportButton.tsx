import { BugReportIcon, type BugReportButtonProps } from "../../../core/ui/BugReportButton";
import { PulseDot } from "../../../core/ui/Card";
import { TextTooltip } from "../../../core/ui/Tooltip";
import { ComicButton } from "../ui/ComicButton";
import { useComic } from "../ui/useComic";

/**
 * The header's report-a-bug button as one of the masthead's ink buttons (the same border, hard shadow and lift on hover
 * as Rules beside it): a square as tall as they are, with the Kalphite Queen head a little bigger than core's 16px. In
 * a dark palette it's the yellow button, since the dark green head barely shows on dark paper; in the light palette
 * the header itself is yellow, so it stays paper there.
 */
export function BugReportButton({ onPress, hasUnseen }: BugReportButtonProps) {
  const { scheme } = useComic();
  return (
    <TextTooltip text="Report a bug">
      <ComicButton
        aria-label="Report a bug"
        size="sm"
        variant={scheme === "dark" ? "yellow" : "secondary"}
        sfx={false}
        className="relative w-8 px-0!"
        onPress={onPress}
      >
        <BugReportIcon className="h-[19px] w-[22px]" />
        {hasUnseen && <PulseDot className="-right-1.5 -top-1.5" />}
      </ComicButton>
    </TextTooltip>
  );
}
