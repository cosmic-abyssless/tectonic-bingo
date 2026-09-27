import type { RewindControlsModel } from "../../../headless/types";
import { Button } from "../../../core/ui/Button";
import { Switch } from "../../../core/ui/Switch";
import { FastForwardIcon, PauseIcon, PlayIcon, RewindIcon, StepBackIcon, StepForwardIcon } from "../../../core/ui/icons";

/** The speed button cycles through the speeds, back to the slowest after the fastest. */
const nextSpeed = ({ speed, speeds }: RewindControlsModel) => speeds[(speeds.indexOf(speed) + 1) % speeds.length]!;

/**
 * Play/Pause between the steps: one Submission either way, and (outside) one notable-or-bigger Submission. Then Play's
 * speed, and where Play is.
 */
export function RewindControls({ controls }: { controls: RewindControlsModel }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex flex-wrap items-center gap-1">
        <Button size="sm" variant="ghost" aria-label="Previous notable submission" isDisabled={!controls.canPrevNotable} onPress={controls.prevNotable}>
          <RewindIcon />
        </Button>
        <Button size="sm" variant="ghost" aria-label="Previous submission" isDisabled={!controls.canPrev} onPress={controls.prev}>
          <StepBackIcon />
        </Button>
        <Button size="sm" variant="primary" className="w-24" aria-label={controls.playing ? "Pause" : "Play"} onPress={controls.togglePlay}>
          {controls.playing ? <PauseIcon /> : <PlayIcon />}
          {controls.playing ? "Pause" : "Play"}
        </Button>
        <Button size="sm" variant="ghost" aria-label="Next submission" isDisabled={!controls.canNext} onPress={controls.next}>
          <StepForwardIcon />
        </Button>
        <Button size="sm" variant="ghost" aria-label="Next notable submission" isDisabled={!controls.canNextNotable} onPress={controls.nextNotable}>
          <FastForwardIcon />
        </Button>
        <Button size="sm" variant="ghost" className="num w-12" aria-label={`Playback speed ${controls.speed}x`} onPress={() => controls.setSpeed(nextSpeed(controls))}>
          {controls.speed}×
        </Button>
        <span className="num ml-1 text-xs text-on-surface-subtle">{controls.positionLabel}</span>
      </div>
      <Switch isSelected={controls.showRejected} onChange={controls.setShowRejected}>
        Show rejected
      </Switch>
    </div>
  );
}
