import type { RewindControlsModel } from "../../../headless/types";
import { FastForwardIcon, PauseIcon, PlayIcon, RewindIcon, StepBackIcon, StepForwardIcon } from "../../../core/ui/icons";
import { COMIC_FIGURES_FONT } from "../font";
import { ComicButton, ComicIconButton } from "../ui/ComicButton";
import { ComicCheckbox } from "../ui/ComicCheckbox";
import { useComic } from "../ui/useComic";

/** The speed button cycles through the speeds, back to the slowest after the fastest. */
const nextSpeed = ({ speed, speeds }: RewindControlsModel) => speeds[(speeds.indexOf(speed) + 1) % speeds.length]!;

/**
 * Play/Pause, a red Bangers button, between the steps: one Submission either way, and (outside) one notable-or-bigger
 * Submission, each an ink-ringed button like the Wrapped's page turns. Then Play's speed and where Play is, and the
 * "Show rejected" chip.
 */
export function RewindControls({ controls }: { controls: RewindControlsModel }) {
  const { colors } = useComic();
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex flex-wrap items-center gap-2 max-sm:gap-1.5">
        <ComicIconButton
          label="Previous notable submission"
          sfx={false}
          isDisabled={!controls.canPrevNotable}
          onPress={controls.prevNotable}
          className="size-9 max-sm:size-8"
        >
          <RewindIcon />
        </ComicIconButton>
        <ComicIconButton label="Previous submission" sfx={false} isDisabled={!controls.canPrev} onPress={controls.prev} className="size-9 max-sm:size-8">
          <StepBackIcon />
        </ComicIconButton>
        <ComicButton
          size="md"
          variant="primary"
          sfx={controls.playing ? false : { text: "GO!" }}
          className="w-[7.5rem] max-sm:w-[6.25rem] max-sm:px-2"
          aria-label={controls.playing ? "Pause" : "Play"}
          onPress={controls.togglePlay}
        >
          {controls.playing ? <PauseIcon /> : <PlayIcon />}
          {controls.playing ? "Pause" : "Play"}
        </ComicButton>
        <ComicIconButton label="Next submission" sfx={false} isDisabled={!controls.canNext} onPress={controls.next} className="size-9 max-sm:size-8">
          <StepForwardIcon />
        </ComicIconButton>
        <ComicIconButton label="Next notable submission" sfx={false} isDisabled={!controls.canNextNotable} onPress={controls.nextNotable} className="size-9 max-sm:size-8">
          <FastForwardIcon />
        </ComicIconButton>
        <ComicButton
          size="sm"
          variant="yellow"
          sfx={false}
          className="num w-14 max-sm:w-11"
          aria-label={`Playback speed ${controls.speed}x`}
          onPress={() => controls.setSpeed(nextSpeed(controls))}
        >
          {controls.speed}×
        </ComicButton>
        <span className="num ml-1 text-[13px] font-bold" style={{ color: colors.INK_SUBTLE, fontFamily: COMIC_FIGURES_FONT }}>
          {controls.positionLabel}
        </span>
      </div>
      <ComicCheckbox checked={controls.showRejected} onChange={controls.setShowRejected}>
        Show rejected
      </ComicCheckbox>
    </div>
  );
}
