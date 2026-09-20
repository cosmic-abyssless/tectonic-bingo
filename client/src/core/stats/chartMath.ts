// The arithmetic behind the points chart's axes and hover, kept apart from the SVG so it can be tested.

/** Round tick values covering [min, max], about `target` of them: 0, 500, 1000, 1500. The first and last enclose the data. */
export function niceTicks(min: number, max: number, target = 5): number[] {
  const range = max - min || 1;
  const rough = range / Math.max(1, target - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  const ticks: number[] = [];
  for (let v = Math.floor(min / step) * step; v < Math.ceil(max / step) * step + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  if (ticks.length < 2) ticks.push(ticks[0]! + step); // an axis needs two ends
  return ticks;
}

/** `count` times spread evenly from the first to the last, or just the one when they coincide. */
export function timeTicks(minT: number, maxT: number, count = 5): number[] {
  if (maxT <= minT) return [minT];
  return Array.from({ length: count }, (_, i) => minT + ((maxT - minT) * i) / (count - 1));
}

/** "Sep 16" for a long span, "Sep 16, 2 PM" when the whole chart covers under three days. */
export function formatTimeTick(t: number, spanMs: number): string {
  const short = spanMs < 3 * 24 * 60 * 60 * 1000;
  return new Date(t).toLocaleString(undefined, short ? { month: "short", day: "numeric", hour: "numeric" } : { month: "short", day: "numeric" });
}

/** The index of the dot nearest (px, py), if one is within `maxDist`; ties go to the later dot (drawn on top). */
export function nearestDot(dots: readonly { x: number; y: number }[], px: number, py: number, maxDist: number): number | null {
  let best: number | null = null;
  let bestDist = maxDist * maxDist;
  dots.forEach((d, i) => {
    const dist = (d.x - px) ** 2 + (d.y - py) ** 2;
    if (dist <= bestDist) {
      best = i;
      bestDist = dist;
    }
  });
  return best;
}
