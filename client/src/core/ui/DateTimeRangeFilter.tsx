import { Dialog as AriaDialog, DialogTrigger, Popover } from "react-aria-components";
import { Button } from "./Button";
import { Field, Input } from "./Field";
import { ChevronDownIcon } from "./icons";
import { RANGE_PRESETS, fromLocalInput, isInverted, isRangeSet, presetRange, rangeSummary, toLocalInput, type TimeRange } from "./timeRange";

/**
 * Popover filter for a start/end time, in the same style as MultiSelect: quick "last hour / day / week / month"
 * windows, or an exact From and To in the viewer's local time. Either side can be left empty for an open end.
 * A preset is turned into a fixed window when picked (not recomputed on every render), so the query it drives stays put.
 */
export function DateTimeRangeFilter({ label = "Time", value, onChange }: { label?: string; value: TimeRange; onChange: (range: TimeRange) => void }) {
  const active = isRangeSet(value);
  const from = toLocalInput(value.since);
  const to = toLocalInput(value.until);

  return (
    <DialogTrigger>
      <Button variant="secondary" size="sm" className={active ? "border-on-surface" : ""}>
        <span className="text-on-surface-subtle">{label}:</span> {rangeSummary(value)}
        <ChevronDownIcon size={14} />
      </Button>
      <Popover placement="bottom start" offset={6} className="overlay-panel w-96 max-w-[calc(100vw-2rem)] rounded-md border border-outline bg-surface-raised p-3 shadow-pop outline-none">
        <AriaDialog aria-label={`${label} range`} className="space-y-3 outline-none">
          {({ close }) => (
            <>
              <div className="flex flex-wrap gap-1.5">
                {RANGE_PRESETS.map((preset) => (
                  <Button
                    key={preset.key}
                    size="sm"
                    onPress={() => {
                      onChange(presetRange(preset.key, new Date()));
                      close();
                    }}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <Field label="From">
                  <Input
                    type="datetime-local"
                    size="sm"
                    className="num"
                    value={from}
                    max={to || undefined}
                    onChange={(e) => onChange({ ...value, since: fromLocalInput(e.target.value, "start") })}
                  />
                </Field>
                <Field label="To">
                  <Input
                    type="datetime-local"
                    size="sm"
                    className="num"
                    value={to}
                    min={from || undefined}
                    onChange={(e) => onChange({ ...value, until: fromLocalInput(e.target.value, "end") })}
                  />
                </Field>
              </div>

              {isInverted(value) && <p className="text-xs text-danger">The start is after the end, so nothing can match.</p>}

              <div className="flex justify-between gap-2">
                <Button size="sm" variant="ghost" onPress={() => onChange({})} isDisabled={!active}>
                  Clear
                </Button>
                <Button size="sm" variant="primary" onPress={close}>
                  Done
                </Button>
              </div>
            </>
          )}
        </AriaDialog>
      </Popover>
    </DialogTrigger>
  );
}
