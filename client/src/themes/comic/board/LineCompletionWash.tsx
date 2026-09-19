import { memo, type MutableRefObject } from "react";
import { motion, useReducedMotion, useTransform, type MotionValue } from "motion/react";
import { lineWashGradient, type LinePulseStop } from "./linePulse";

function LineWashLayer({
  time,
  stop,
  boostedUntilRef,
}: {
  time: MotionValue<number>;
  stop: LinePulseStop;
  boostedUntilRef: MutableRefObject<Map<string, number>>;
}) {
  const reducedMotion = useReducedMotion();
  const backgroundImage = useTransform(() =>
    lineWashGradient(time.get(), stop, boostedUntilRef.current, Date.now(), !!reducedMotion),
  );

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-lg"
      style={{ backgroundImage }}
    />
  );
}

export const LineCompletionWash = memo(function LineCompletionWash({
  time,
  stops,
  boostedUntilRef,
}: {
  time: MotionValue<number>;
  stops: LinePulseStop[];
  boostedUntilRef: MutableRefObject<Map<string, number>>;
}) {
  return (
    <>
      {stops.map((stop) => (
        <LineWashLayer key={stop.lineId} time={time} stop={stop} boostedUntilRef={boostedUntilRef} />
      ))}
    </>
  );
});
