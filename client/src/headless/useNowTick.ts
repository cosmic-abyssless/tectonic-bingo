import { useEffect, useState } from "react";

// Ticks `now` every second until `tickUntil` (epoch ms) has passed, then
// stops — pass null to never tick. Ports BoardGrid.tsx's freeze-countdown
// effect exactly: no interval is set up at all if there's no time left when
// this (re-)runs.
export function useNowTick(tickUntil: number | null): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (tickUntil === null) return;
    if (Date.now() >= tickUntil) return;
    const id = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= tickUntil) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [tickUntil]);

  return now;
}
