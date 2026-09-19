import type { LineModel } from "../../../headless/types";

export const LINE_PULSE_PERIOD_MS = 2400;
export const LINE_PULSE_PHASE = Math.PI / 2.5;

export const IDLE_BASE = 0.02;
export const IDLE_AMP = 0.18;
export const BOOST_BASE = 0.08;
export const BOOST_AMP = 0.42;
export const BOOST_MS = 2500;

export interface TilePos {
  row: number;
  col: number;
}

export interface LinePulseStop {
  lineId: string;
  index: number;
  length: number;
  angleDeg: number;
}

export function gradientAngleDeg(self: TilePos, prev: TilePos | undefined, next: TilePos | undefined): number {
  const from = prev ?? self;
  const to = next ?? self;
  const dx = to.col - from.col;
  const dy = to.row - from.row;
  if (dx === 0 && dy === 0) return 90;
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

export function buildStopsByTileId(lines: LineModel[], posById: ReadonlyMap<string, TilePos>): Map<string, LinePulseStop[]> {
  const byTile = new Map<string, LinePulseStop[]>();
  for (const line of lines) {
    if (!line.complete) continue;
    const length = line.tileIds.length;
    for (let index = 0; index < length; index++) {
      const tileId = line.tileIds[index]!;
      const self = posById.get(tileId);
      if (!self) continue;
      const prevId = line.tileIds[index - 1];
      const nextId = line.tileIds[index + 1];
      const stop: LinePulseStop = {
        lineId: line.id,
        index,
        length,
        angleDeg: gradientAngleDeg(self, prevId ? posById.get(prevId) : undefined, nextId ? posById.get(nextId) : undefined),
      };
      const stops = byTile.get(tileId);
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
    const opacity = pulseOpacityForIndex(timeMs, stop.index, stop.lineId, boostedUntilByLineId, nowMs, reducedMotion);
    if (opacity > max) max = opacity;
  }
  return max;
}

export function pulseOpacityForIndex(
  timeMs: number,
  index: number,
  lineId: string,
  boostedUntilByLineId: ReadonlyMap<string, number>,
  nowMs: number,
  reducedMotion: boolean,
): number {
  const boosted = (boostedUntilByLineId.get(lineId) ?? 0) > nowMs;
  const base = boosted ? BOOST_BASE : IDLE_BASE;
  const amp = boosted ? BOOST_AMP : IDLE_AMP;
  if (reducedMotion) return base;
  const wave = 0.5 * (1 + Math.sin((2 * Math.PI * timeMs) / LINE_PULSE_PERIOD_MS - index * LINE_PULSE_PHASE));
  return base + amp * wave;
}

export function lineWashGradient(
  timeMs: number,
  stop: LinePulseStop,
  boostedUntilByLineId: ReadonlyMap<string, number>,
  nowMs: number,
  reducedMotion: boolean,
): string {
  const start = pulseOpacityForIndex(timeMs, stop.index - 0.5, stop.lineId, boostedUntilByLineId, nowMs, reducedMotion);
  const mid = pulseOpacityForIndex(timeMs, stop.index, stop.lineId, boostedUntilByLineId, nowMs, reducedMotion);
  const end = pulseOpacityForIndex(timeMs, stop.index + 0.5, stop.lineId, boostedUntilByLineId, nowMs, reducedMotion);
  const stopAt = (opacity: number) => `color-mix(in srgb, var(--tile-complete) ${Math.round(opacity * 100)}%, transparent)`;
  return `linear-gradient(${stop.angleDeg}deg, ${stopAt(start)} 0%, ${stopAt(mid)} 50%, ${stopAt(end)} 100%)`;
}
