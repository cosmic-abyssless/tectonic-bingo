import type { LineModel } from "../../../headless/types";

export const LINE_PULSE_PERIOD_MS = 2400;
export const LINE_PULSE_PHASE = Math.PI / 2.5;

export const IDLE_BASE = 0.02;
export const IDLE_AMP = 0.18;
export const BOOST_BASE = 0.08;
export const BOOST_AMP = 0.42;
export const BOOST_MS = 2500;

export interface LinePulseStop {
  lineId: string;
  index: number;
  length: number;
}

export function buildStopsByTileId(lines: LineModel[]): Map<string, LinePulseStop[]> {
  const byTile = new Map<string, LinePulseStop[]>();
  for (const line of lines) {
    if (!line.complete) continue;
    const length = line.tileIds.length;
    for (let index = 0; index < length; index++) {
      const tileId = line.tileIds[index]!;
      const stops = byTile.get(tileId);
      const stop = { lineId: line.id, index, length };
      if (stops) stops.push(stop);
      else byTile.set(tileId, [stop]);
    }
  }
  return byTile;
}

export function pulseOpacityAt(
  timeMs: number,
  stops: LinePulseStop[],
  boostedUntilByLineId: ReadonlyMap<string, number>,
  nowMs: number,
  reducedMotion: boolean,
): number {
  let max = 0;
  for (const stop of stops) {
    const boosted = (boostedUntilByLineId.get(stop.lineId) ?? 0) > nowMs;
    const base = boosted ? BOOST_BASE : IDLE_BASE;
    const amp = boosted ? BOOST_AMP : IDLE_AMP;
    if (reducedMotion) {
      if (base > max) max = base;
      continue;
    }
    const wave = 0.5 * (1 + Math.sin((2 * Math.PI * timeMs) / LINE_PULSE_PERIOD_MS - stop.index * LINE_PULSE_PHASE));
    const opacity = base + amp * wave;
    if (opacity > max) max = opacity;
  }
  return max;
}
