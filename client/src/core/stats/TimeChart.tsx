import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatTimeTick, nearestDot, niceTicks, timeTicks } from "./chartMath";

// A line per series over time, with labelled axes and a tooltip for the dot nearest the pointer. The stats page's
// charts (points by Team, Points share by Player) are this with their own series and tooltips.

const HEIGHT = 260;
const MARGIN = { top: 12, right: 16, bottom: 46, left: 50 };
const HOVER_REACH = 16;
const TOOLTIP_WIDTH = 224;

export interface TimeSeries {
  key: string;
  name: string;
  color: string;
  /** A dashed line: tells apart two series that have to share a colour. */
  dashed?: boolean;
  dots: { at: number; value: number; tooltip: ReactNode }[];
}

interface Dot {
  series: TimeSeries;
  index: number;
  tooltip: ReactNode;
  x: number;
  y: number;
}

/** The element's width in pixels, kept up to date, so the chart is drawn at the size it is shown and its text stays readable. */
function useWidth(initial: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(initial);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(Math.round(el.clientWidth) || initial);
    const observer = new ResizeObserver(([entry]) => entry && setWidth(Math.round(entry.contentRect.width) || initial));
    observer.observe(el);
    return () => observer.disconnect();
  }, [initial]);
  return [ref, width] as const;
}

export function TimeChart({
  series,
  ariaLabel,
  yLabel,
  legend = series,
  focusHovered = false,
  restingFocus,
}: {
  series: TimeSeries[];
  ariaLabel: string;
  yLabel: string;
  /** One entry per colour; by default one per series. */
  legend?: { key: string; name: string; color: string; dashed?: boolean }[];
  /** Fade every other series while a dot is hovered, for a chart with too many lines to tell apart. */
  focusHovered?: boolean;
  /** With focusHovered, the series (by key) to single out while nothing is hovered: the viewer's own. */
  restingFocus?: string;
}) {
  const [wrapRef, width] = useWidth(640);
  const [hovered, setHovered] = useState<number | null>(null);

  const chart = useMemo(() => {
    const all = series.flatMap((s) => s.dots);
    const times = all.map((d) => d.at);
    const minT = Math.min(...times);
    const maxT = Math.max(...times);
    const values = all.map((d) => d.value);
    const yTicks = niceTicks(Math.min(0, ...values), Math.max(1, ...values));
    const minY = yTicks[0]!;
    const maxY = yTicks[yTicks.length - 1]!;
    const plotW = Math.max(40, width - MARGIN.left - MARGIN.right);
    const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
    const x = (t: number) => MARGIN.left + ((t - minT) / (maxT - minT || 1)) * plotW;
    const y = (v: number) => MARGIN.top + plotH - ((v - minY) / (maxY - minY || 1)) * plotH;
    const dots: Dot[] = series.flatMap((s) => s.dots.map((d, index) => ({ series: s, index, tooltip: d.tooltip, x: x(d.at), y: y(d.value) })));
    return { dots, yTicks, xTicks: timeTicks(minT, maxT), minT, maxT, x, y, plotW, plotH };
  }, [series, width]);

  const { dots, yTicks, xTicks, minT, maxT, x, y, plotW, plotH } = chart;
  const hover = hovered === null ? null : dots[hovered] ?? null;
  // Beside the dot on whichever side has room, kept inside the chart on a narrow screen.
  const tooltipWidth = Math.min(TOOLTIP_WIDTH, width - 16);
  const tooltipLeft = hover ? Math.max(8, Math.min(hover.x > width / 2 ? hover.x - tooltipWidth - 12 : hover.x + 12, width - tooltipWidth - 8)) : 0;
  const focused = hover ? hover.series.key : series.some((s) => s.key === restingFocus) ? restingFocus : undefined;
  const faded = (s: TimeSeries) => focusHovered && focused !== undefined && s.key !== focused;
  // The focused series drawn last, so it sits on top of the faded ones.
  const drawOrder = focused === undefined ? series : [...series.filter((s) => s.key !== focused), ...series.filter((s) => s.key === focused)];

  function track(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    setHovered(nearestDot(dots, e.clientX - rect.left, e.clientY - rect.top, HOVER_REACH));
  }

  return (
    <div>
      <div ref={wrapRef} className="relative">
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={ariaLabel}
          className="block rounded-md border border-outline bg-background"
          style={{ touchAction: "pan-y" }}
          onPointerMove={track}
          onPointerDown={track}
          onPointerLeave={() => setHovered(null)}
        >
          {/* Y axis: gridlines and values. */}
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={MARGIN.left} y1={y(v)} x2={MARGIN.left + plotW} y2={y(v)} stroke="var(--color-outline)" strokeWidth={1} strokeDasharray={v === 0 ? undefined : "3 3"} opacity={v === 0 ? 1 : 0.6} />
              <text x={MARGIN.left - 8} y={y(v)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--color-on-surface-muted)">
                {v.toLocaleString()}
              </text>
            </g>
          ))}
          <text transform={`translate(13 ${MARGIN.top + plotH / 2}) rotate(-90)`} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--color-on-surface-muted)">
            {yLabel}
          </text>

          {/* X axis: times. */}
          {xTicks.map((t, i) => (
            <g key={t}>
              <line x1={x(t)} y1={MARGIN.top + plotH} x2={x(t)} y2={MARGIN.top + plotH + 4} stroke="var(--color-outline-strong)" strokeWidth={1} />
              <text
                x={x(t)}
                y={MARGIN.top + plotH + 17}
                textAnchor={xTicks.length === 1 ? "middle" : i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
                fontSize={11}
                fill="var(--color-on-surface-muted)"
              >
                {formatTimeTick(t, maxT - minT)}
              </text>
            </g>
          ))}
          <text x={MARGIN.left + plotW / 2} y={HEIGHT - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--color-on-surface-muted)">
            Time
          </text>

          {drawOrder.map((s) => (
            <g key={s.key} opacity={faded(s) ? 0.2 : 1}>
              {s.dots.length > 1 && <polyline points={s.dots.map((d) => `${x(d.at)},${y(d.value)}`).join(" ")} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? "6 4" : undefined} />}
              {s.dots.map((d, i) => {
                const on = hover?.series === s && hover.index === i;
                return <circle key={i} cx={x(d.at)} cy={y(d.value)} r={on ? 5 : 3} fill={s.color} stroke={on ? "var(--color-on-surface)" : "none"} strokeWidth={2} />;
              })}
            </g>
          ))}
        </svg>

        {hover && (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-10 rounded-md border border-outline-strong bg-surface px-3 py-2 text-xs shadow-lg"
            style={{
              width: tooltipWidth,
              left: tooltipLeft,
              // Above the dot, or below it when the dot is near the top.
              top: hover.y < HEIGHT / 3 ? hover.y + 12 : undefined,
              bottom: hover.y < HEIGHT / 3 ? undefined : HEIGHT - hover.y + 12,
            }}
          >
            <p className="flex items-center gap-1.5 font-semibold text-on-surface">
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: hover.series.color }} />
              {hover.series.name}
            </p>
            {hover.tooltip}
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-3">
        {legend.map((l) => (
          <span key={l.key} className="flex items-center gap-1.5 text-xs text-on-surface-muted">
            {l.dashed ? (
              // A dashed series' swatch is a piece of its line, so it can't be mistaken for the solid one in its colour.
              <svg width={16} height={4} className="shrink-0" aria-hidden>
                <line x1={0} y1={2} x2={16} y2={2} stroke={l.color} strokeWidth={2} strokeDasharray="4 2" />
              </svg>
            ) : (
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: l.color }} />
            )}
            {l.name}
          </span>
        ))}
      </div>
    </div>
  );
}
