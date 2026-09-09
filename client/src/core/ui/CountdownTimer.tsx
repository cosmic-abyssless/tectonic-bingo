import { useEffect, useState } from "react";
import { formatCountdown, formatDuration } from "./time";

/** Ticks every second until `target` (epoch ms) passes, then stops. */
export function CountdownTimer({ target, format = "duration", className }: { target: number; format?: "duration" | "clock"; className?: string }) {
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

  const remaining = Math.max(0, target - now);
  return (
    <time dateTime={new Date(target).toISOString()} className={`num ${className ?? ""}`}>
      {format === "clock" ? formatCountdown(remaining) : formatDuration(remaining)}
    </time>
  );
}
