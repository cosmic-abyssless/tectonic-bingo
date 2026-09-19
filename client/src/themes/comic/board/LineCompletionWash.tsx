import { memo, type MutableRefObject } from "react";
import { motion, useReducedMotion, useTransform, type MotionValue } from "motion/react";
import { pulseOpacityAt, type LinePulseStop } from "./linePulse";

export const LineCompletionWash = memo(function LineCompletionWash({
  time,
  stops,
  boostedUntilRef,
}: {
  time: MotionValue<number>;
  stops: LinePulseStop[];
  boostedUntilRef: MutableRefObject<Map<string, number>>;
}) {
  const reducedMotion = useReducedMotion();
  const opacity = useTransform(() => pulseOpacityAt(time.get(), stops, boostedUntilRef.current, Date.now(), !!reducedMotion));

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-lg"
      style={{ backgroundColor: "var(--tile-complete)", opacity, willChange: "opacity" }}
    />
  );
});
