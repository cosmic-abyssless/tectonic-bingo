import type { LineModel } from "../../../headless/types";

/** One pulse. comic-line-pulse's duration in comic.css is the same. */
export const LINE_PULSE_PERIOD_MS = 2400;
export const LINE_PULSE_PHASE = Math.PI / 2.5;

/** How long a line that completes while the board is open pulses at the boosted amplitude (comic-line-pulse-boost). */
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

/**
 * How far into its pulse (comic-line-pulse in comic.css) a wash layer that
 * samples the wave `position` Tiles along its line is, as an `animation-delay`
 * in (-period, 0], to the millisecond. Every layer's animation starts at the
 * document timeline's zero (LineCompletionWash), so the delay alone sets its
 * phase: the keyframe is (1 - cos)/2 from a trough, i.e. the sine
 * (1 + sin(2πt/period - position × LINE_PULSE_PHASE))/2 a quarter period on,
 * and each step along the line lags the one before it by LINE_PULSE_PHASE, so
 * the crest travels from the line's first Tile to its last.
 */
export function linePulseDelayMs(position: number): number {
  const lagMs = (position * LINE_PULSE_PHASE * LINE_PULSE_PERIOD_MS) / (2 * Math.PI);
  const leadMs = Math.round((((LINE_PULSE_PERIOD_MS / 4 - lagMs) % LINE_PULSE_PERIOD_MS) + LINE_PULSE_PERIOD_MS) % LINE_PULSE_PERIOD_MS);
  return leadMs === 0 || leadMs === LINE_PULSE_PERIOD_MS ? 0 : -leadMs;
}

export interface LineWashLayer {
  /** Where along the line, in Tiles, this layer samples the wave. */
  position: number;
  backgroundImage: string;
}

/**
 * The layers a stop's wash is drawn with: the wave sampled at the Tile's near
 * edge, middle and far edge, each a static tent of --tile-complete (at the
 * --line-pulse-amp alpha) peaking where it samples and fading to nothing at its
 * neighbour's peak. Stacked, with each layer's opacity pulsing on its own
 * delay, they interpolate the wave across the Tile along the line's angle.
 */
export function lineWashLayers(stop: LinePulseStop): LineWashLayer[] {
  const wash = "color-mix(in srgb, var(--tile-complete) var(--line-pulse-amp), transparent)";
  const gradient = (stops: string) => `linear-gradient(${stop.angleDeg}deg, ${stops})`;
  return [
    { position: stop.index - 0.5, backgroundImage: gradient(`${wash} 0%, transparent 50%`) },
    { position: stop.index, backgroundImage: gradient(`transparent 0%, ${wash} 50%, transparent 100%`) },
    { position: stop.index + 0.5, backgroundImage: gradient(`transparent 50%, ${wash} 100%`) },
  ];
}
