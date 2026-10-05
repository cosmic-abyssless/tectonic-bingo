import { Button as AriaButton } from "react-aria-components";
import { CheckIcon, CopyIcon } from "../../../core/ui/icons";
import { TextTooltip } from "../../../core/ui/Tooltip";
import { useCopyText } from "../../../core/ui/useCopyText";
import { COMIC_FONT } from "../font";
import { PrintedShade } from "../ui/tones";
import { useComic } from "../ui/useComic";
import { LETTERED } from "../../lettering";

/**
 * The team's Codeword (CONTEXT.md), which every screenshot must show: a small cousin of the scouting banner (the same
 * night-sky blue, knocked askew, with outlined cover lettering and a halftone shading), beside the masthead's title
 * while Live and at the top of the Submit flow. The whole banner copies the codeword; the copy icon on its right is
 * only the cue, turning to a check for a moment once copied.
 */
export function CodewordBanner({ codeword }: { codeword: string }) {
  const { colors } = useComic();
  const { copied, copy } = useCopyText(codeword);
  return (
    <TextTooltip text="Copy codeword">
      <AriaButton
        data-tutorial="codeword"
        aria-label="Copy codeword"
        onPress={copy}
        className="relative inline-flex max-w-full shrink-0 cursor-pointer items-center gap-2 overflow-hidden border-2 px-2.5 py-1 transition-[filter] hovered:brightness-110 pressed:brightness-95"
        style={{ background: `color-mix(in srgb, ${colors.BLUE} 70%, ${colors.ON_YELLOW})`, borderColor: colors.LINE, color: colors.ON_LOUD, boxShadow: `3px 3px 0 ${colors.SHADOW}`, transform: "rotate(-1.2deg)" }}
      >
        <PrintedShade ink={colors.ON_LOUD} strength={22} from={25} />
        <span
          className={`${LETTERED} comic-outline-text relative text-lg uppercase leading-none`}
          style={{ fontFamily: COMIC_FONT, letterSpacing: "0.03em", ["--comic-title-fill" as string]: colors.TITLE_FILL, ["--comic-title-stroke" as string]: colors.TITLE_STROKE }}
        >
          Codeword
        </span>
        {/* In the body font, exactly as it's spelled: the masthead letters everything in Bangers, which is all capitals. */}
        <span className="relative truncate font-sans text-sm font-bold normal-case tracking-normal">{codeword}</span>
        {copied ? <CheckIcon size={14} className="relative shrink-0" /> : <CopyIcon size={14} className="relative shrink-0" />}
      </AriaButton>
    </TextTooltip>
  );
}
