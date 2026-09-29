import { Button as AriaButton } from "react-aria-components";
import { CheckIcon, CopyIcon } from "../../../core/ui/icons";
import { TextTooltip } from "../../../core/ui/Tooltip";
import { useCopyText } from "../../../core/ui/useCopyText";

/**
 * The team's Codeword (CONTEXT.md), which every screenshot must show: a small info-toned banner, like the scouting one,
 * beside the header's title while Live and at the top of the Submit flow. The whole banner copies the codeword; the
 * copy icon on its right is only the cue, turning to a check for a moment once copied.
 */
export function CodewordBanner({ codeword }: { codeword: string }) {
  const { copied, copy } = useCopyText(codeword);
  return (
    <TextTooltip text="Copy codeword">
      <AriaButton
        aria-label="Copy codeword"
        onPress={copy}
        className="inline-flex max-w-full shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-info/30 bg-info/5 px-2 py-1 text-xs text-info transition-colors hovered:bg-info/10 pressed:bg-info/15"
      >
        Codeword
        <strong className="truncate font-semibold text-on-surface">{codeword}</strong>
        {copied ? <CheckIcon size={12} className="shrink-0" /> : <CopyIcon size={12} className="shrink-0" />}
      </AriaButton>
    </TextTooltip>
  );
}
