import { BugReportIcon, type BugReportButtonProps } from "../../../core/ui/BugReportButton";
import { PulseDot } from "../../../core/ui/Card";
import { ComicButton } from "../ui/ComicButton";
import { useComic } from "../ui/useComic";

/**
 * The header's report-a-bug button as one of the masthead's ink buttons (the same border, hard shadow and lift on hover
 * as Rules beside it): a square as tall as they are, with the Kalphite Queen head a little bigger than core's 16px. In
 * a dark palette the fill is lifted toward the lettering colour, since the dark green head barely shows on dark paper.
 */
export function BugReportButton({ onPress, hasUnseen }: BugReportButtonProps) {
  const { colors, scheme } = useComic();
  return (
    <ComicButton
      aria-label="Report a bug"
      size="sm"
      sfx={false}
      className="relative w-8 px-0!"
      style={scheme === "dark" ? { background: `color-mix(in srgb, ${colors.PAPER_RAISED} 55%, ${colors.INK})` } : undefined}
      onPress={onPress}
    >
      <BugReportIcon className="h-[19px] w-[22px]" />
      {hasUnseen && <PulseDot className="-right-1.5 -top-1.5" />}
    </ComicButton>
  );
}
