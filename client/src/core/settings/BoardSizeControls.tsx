import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BOARD_SIZE_DEVICE_LABELS, BOARD_SIZE_MODE_LABELS, BOARD_SIZE_MODES, BOARD_WIDTH_PERCENT, type BoardSizeDevice, type BoardSizeMode } from "@bingo/shared";
import { previewUserSettings, useUpdateUserSettings, useUserSettings } from "../../api/userSettingsApi";
import { Checkbox } from "../ui/Checkbox";
import { RangeInput } from "../ui/RangeInput";

const HINTS: Record<BoardSizeMode, string> = {
  fit: "Tries to fit the whole board in the window, so there are no scrollbars.",
  maximize: "Fills the window's longer side: as wide as the window, or as tall. Expect to scroll the other way.",
  custom: "Pick the board's width. Past 100% it's wider than the window and scrolls sideways.",
};

/**
 * One device's Board size (shared userSettings.ts): Fit screen, Maximize or Custom, and Custom's width slider. Each
 * pick saves at once; the slider shows every step on the Board and saves when it's let go of.
 */
export function BoardSizeControls({ device }: { device: BoardSizeDevice }) {
  const size = useUserSettings().boardSize[device];
  const update = useUpdateUserSettings();
  const queryClient = useQueryClient();
  // The slider's own value while it's in use. The query cache tells the page about a change a tick late, and a
  // controlled slider snaps back to its old value until then: a quick second arrow-key press would start from there.
  const [sliding, setSliding] = useState<number | null>(null);
  return (
    <div role="radiogroup" aria-label={`Board size (${BOARD_SIZE_DEVICE_LABELS[device]})`} className="space-y-3">
      {BOARD_SIZE_MODES.map((mode) => (
        <div key={mode} className="space-y-2">
          <Checkbox type="radio" name={`board-size-${device}`} checked={size.mode === mode} onChange={() => update.mutate({ boardSize: { [device]: { mode } } })} hint={HINTS[mode]}>
            {BOARD_SIZE_MODE_LABELS[mode]}
            {mode === "fit" && <span className="text-on-surface-subtle"> (default)</span>}
          </Checkbox>
          {mode === "custom" && size.mode === "custom" && (
            <div className="flex items-center gap-3 pl-6">
              <RangeInput
                aria-label="Board width, as a percentage of the window's"
                min={BOARD_WIDTH_PERCENT.min}
                max={BOARD_WIDTH_PERCENT.max}
                step={BOARD_WIDTH_PERCENT.step}
                value={sliding ?? size.widthPercent}
                onChange={(widthPercent) => {
                  setSliding(widthPercent);
                  previewUserSettings(queryClient, { boardSize: { [device]: { widthPercent } } });
                }}
                onCommit={(widthPercent) => update.mutate({ boardSize: { [device]: { widthPercent } } })}
                onBlur={() => setSliding(null)}
                className="w-full max-w-xs accent-accent"
              />
              <span className="w-12 shrink-0 text-right text-sm tabular-nums text-on-surface">{sliding ?? size.widthPercent}%</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
