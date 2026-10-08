import { useEffect, useState } from "react";
import { formatCountdown, formatDuration, formatShortDuration } from "./time";

/** The time left until `target` (epoch ms), updated every second until it passes. */
export function useCountdown(target: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (Date.now() >= target) return;
    const id = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= target) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [target]);

  return Math.max(0, target - now);
}

/** Ticks every second until `target` (epoch ms) passes, then stops. */
export function CountdownTimer({ target, format = "duration", className }: { target: number; format?: "duration" | "short" | "clock"; className?: string }) {
  const remaining = useCountdown(target);
  return (
    <time dateTime={new Date(target).toISOString()} className={`num ${className ?? ""}`}>
      {format === "clock" ? formatCountdown(remaining) : format === "short" ? formatShortDuration(remaining) : formatDuration(remaining)}
    </time>
  );
}
