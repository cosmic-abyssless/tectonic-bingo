import { useId, useMemo, useState, type PointerEvent } from "react";
import type { WrappedChartModel, WrappedSeriesModel } from "../../headless/types";

// Points over time for Wrapped: one Team's climb, or every Team's race. Team colours are the Teams' own; the viewer's
// Team is drawn heavier and the rest recede. Hover (or touch) for every Team's points at that moment.

const W = 640;
const H = 260;
const PAD = { top: 12, right: 12, bottom: 24, left: 40 };
const FALLBACK_COLOR = "var(--color-on-surface-muted)";

/** A step line: points only change at an award, so the total holds flat until the next one. */
function stepPath(points: { t: number; points: number }[], x: (t: number) => number, y: (p: number) => number): string {
  let d = "";
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    if (i === 0) d += `M${x(p.t).toFixed(1)},${y(p.points).toFixed(1)}`;
    else d += `H${x(p.t).toFixed(1)}V${y(p.points).toFixed(1)}`;
  }
  return d;
}

function pointsAt(series: WrappedSeriesModel, t: number): number {
  let value = 0;
  for (const p of series.points) {
    if (p.t > t) break;
    value = p.points;
  }
  return value;
}

/** Up to 4 round gridline values from 0 to about max. */
function ticks(max: number): number[] {
  const raw = max / 3;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) out.push(v);
  return out;
}

const dateLabel = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const momentLabel = (ms: number) => new Date(ms).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function PointsChart({ chart, label }: { chart: WrappedChartModel; label: string }) {
  const titleId = useId();
  const [hoverT, setHoverT] = useState<number | null>(null);
  const x = (t: number) => PAD.left + ((t - chart.start) / (chart.end - chart.start)) * (W - PAD.left - PAD.right);
  const y = (p: number) => H - PAD.bottom - (p / chart.maxPoints) * (H - PAD.top - PAD.bottom);
  const hasMine = chart.series.some((s) => s.isMine);
  // The viewer's Team last, so it's drawn on top.
  const ordered = useMemo(() => [...chart.series].sort((a, b) => Number(a.isMine) - Number(b.isMine)), [chart.series]);
  const grid = useMemo(() => ticks(chart.maxPoints), [chart.maxPoints]);

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const frac = Math.min(1, Math.max(0, (px - PAD.left) / (W - PAD.left - PAD.right)));
    setHoverT(chart.start + frac * (chart.end - chart.start));
  };

  const hovered = hoverT === null ? null : [...chart.series].map((s) => ({ s, points: pointsAt(s, hoverT) })).sort((a, b) => b.points - a.points);
  const hoverLeft = hoverT === null ? 0 : (x(hoverT) / W) * 100;

  return (
    <figure className="w-full">
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full touch-pan-y overflow-visible"
          role="img"
          aria-labelledby={titleId}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHoverT(null)}
        >
          <title id={titleId}>{label}</title>
          {grid.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--color-outline)" strokeWidth={1} />
              <text x={PAD.left - 6} y={y(v)} dy="0.32em" textAnchor="end" className="num fill-on-surface-subtle text-[11px]">
                {v.toLocaleString()}
              </text>
            </g>
          ))}
          <text x={PAD.left} y={H - 6} className="fill-on-surface-subtle text-[11px]">
            {dateLabel(chart.start)}
          </text>
          <text x={W - PAD.right} y={H - 6} textAnchor="end" className="fill-on-surface-subtle text-[11px]">
            {dateLabel(chart.end)}
          </text>
          {ordered.map((s) => (
            <path
              key={s.teamId}
              d={stepPath(s.points, x, y)}
              fill="none"
              stroke={s.color ?? FALLBACK_COLOR}
              strokeWidth={s.isMine || !hasMine ? 2.5 : 2}
              strokeOpacity={hasMine && !s.isMine ? 0.45 : 1}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {hoverT !== null && <line x1={x(hoverT)} x2={x(hoverT)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--color-outline-strong)" strokeWidth={1} />}
        </svg>
        {hovered && hoverT !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 min-w-40 rounded-lg border border-outline bg-surface px-3 py-2 text-xs shadow-lg"
            style={hoverLeft > 50 ? { right: `${100 - hoverLeft + 2}%` } : { left: `${hoverLeft + 2}%` }}
          >
            <div className="mb-1 text-on-surface-muted">{momentLabel(hoverT)}</div>
            {hovered.map(({ s, points }) => (
              <div key={s.teamId} className={`flex items-center justify-between gap-3 ${s.isMine ? "font-semibold" : ""}`}>
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: s.color ?? FALLBACK_COLOR }} />
                  <span className="truncate">{s.name}</span>
                </span>
                <span className="num">{points.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {chart.series.length > 1 && (
        <figcaption className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-on-surface-muted">
          {chart.series.map((s) => (
            <span key={s.teamId} className={`inline-flex items-center gap-1.5 ${s.isMine ? "font-semibold text-on-surface" : ""}`}>
              <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: s.color ?? FALLBACK_COLOR }} />
              {s.name}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}
