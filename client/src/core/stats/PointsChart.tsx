import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PointsOverTimePoint, Team } from "@bingo/shared";
import { formatTimeTick, nearestDot, niceTicks, timeTicks } from "./chartMath";

// Tracks the current theme's muted-text color rather than a hardcoded hex —
// a fixed mid-gray reads fine on the default theme's near-black background
// but washes out against a bright/light theme's (e.g. comic's yellow) bg.
export const FALLBACK_TEAM_COLOR = "var(--color-on-surface-muted)";

const HEIGHT = 260;
const MARGIN = { top: 12, right: 16, bottom: 46, left: 50 };
const HOVER_REACH = 16;
const TOOLTIP_WIDTH = 224;

interface Dot {
  point: PointsOverTimePoint;
  x: number;
  y: number;
  color: string;
  teamName: string;
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

const signed = (n: number) => `${n > 0 ? "+" : ""}${n.toLocaleString()}`;

/**
 * Each team's running points over time. The axes are labelled, and hovering (or touching) near a dot says which
 * event earned those points: the task, tile bonus or line bonus, or a moderator's adjustment.
 */
export function PointsChart({ points, teams }: { points: PointsOverTimePoint[]; teams: Team[] }) {
  const [wrapRef, width] = useWidth(640);
  const [hovered, setHovered] = useState<number | null>(null);

  const chart = useMemo(() => {
    const times = points.map((p) => new Date(p.at).getTime());
    const minT = Math.min(...times);
    const maxT = Math.max(...times);
    const yTicks = niceTicks(Math.min(0, ...points.map((p) => p.cumulativePoints)), Math.max(1, ...points.map((p) => p.cumulativePoints)));
    const minY = yTicks[0]!;
    const maxY = yTicks[yTicks.length - 1]!;
    const plotW = Math.max(40, width - MARGIN.left - MARGIN.right);
    const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
    const x = (t: number) => MARGIN.left + ((t - minT) / (maxT - minT || 1)) * plotW;
    const y = (v: number) => MARGIN.top + plotH - ((v - minY) / (maxY - minY || 1)) * plotH;

    const teamById = new Map(teams.map((t) => [t.id, t]));
    const dots: Dot[] = points.map((p) => {
      const team = teamById.get(p.teamId);
      return { point: p, x: x(new Date(p.at).getTime()), y: y(p.cumulativePoints), color: team?.color ?? FALLBACK_TEAM_COLOR, teamName: team?.name ?? "Unknown team" };
    });
    const byTeam = new Map<string, Dot[]>();
    for (const d of dots) byTeam.set(d.point.teamId, [...(byTeam.get(d.point.teamId) ?? []), d]);
    return { dots, byTeam, yTicks, xTicks: timeTicks(minT, maxT), minT, maxT, x, y, plotW, plotH };
  }, [points, teams, width]);

  if (points.length === 0) return <p className="text-sm text-on-surface-subtle">No scoring activity yet.</p>;

  const { dots, byTeam, yTicks, xTicks, minT, maxT, x, y, plotW, plotH } = chart;
  const hover = hovered === null ? null : dots[hovered] ?? null;
  // Beside the dot on whichever side has room, kept inside the chart on a narrow screen.
  const tooltipWidth = Math.min(TOOLTIP_WIDTH, width - 16);
  const tooltipLeft = hover ? Math.max(8, Math.min(hover.x > width / 2 ? hover.x - tooltipWidth - 12 : hover.x + 12, width - tooltipWidth - 8)) : 0;

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
          aria-label="Points over time, by team"
          className="block rounded-md border border-outline bg-background"
          style={{ touchAction: "pan-y" }}
          onPointerMove={track}
          onPointerDown={track}
          onPointerLeave={() => setHovered(null)}
        >
          {/* Y axis: gridlines and point values. */}
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={MARGIN.left} y1={y(v)} x2={MARGIN.left + plotW} y2={y(v)} stroke="var(--color-outline)" strokeWidth={1} strokeDasharray={v === 0 ? undefined : "3 3"} opacity={v === 0 ? 1 : 0.6} />
              <text x={MARGIN.left - 8} y={y(v)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--color-on-surface-muted)">
                {v.toLocaleString()}
              </text>
            </g>
          ))}
          <text transform={`translate(13 ${MARGIN.top + plotH / 2}) rotate(-90)`} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--color-on-surface-muted)">
            Points
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

          {[...byTeam.entries()].map(([teamId, series]) => (
            <g key={teamId}>
              {series.length > 1 && <polyline points={series.map((d) => `${d.x},${d.y}`).join(" ")} fill="none" stroke={series[0]!.color} strokeWidth={2} />}
              {series.map((d, i) => (
                <circle key={i} cx={d.x} cy={d.y} r={d === hover ? 5 : 3} fill={d.color} stroke={d === hover ? "var(--color-on-surface)" : "none"} strokeWidth={2} />
              ))}
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
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: hover.color }} />
              {hover.teamName}
            </p>
            <p className="mt-1 text-on-surface">
              <span className="num font-semibold">{signed(hover.point.delta)}</span>{" "}
              {hover.point.source === "adjustment" ? `Moderator adjustment: ${hover.point.label}` : hover.point.label}
            </p>
            <p className="mt-0.5 text-on-surface-subtle">
              Total <span className="num">{hover.point.cumulativePoints.toLocaleString()}</span> · {new Date(hover.point.at).toLocaleString()}
            </p>
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-3">
        {[...byTeam.entries()].map(([teamId, series]) => (
          <span key={teamId} className="flex items-center gap-1.5 text-xs text-on-surface-muted">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: series[0]!.color }} />
            {series[0]!.teamName}
          </span>
        ))}
      </div>
    </div>
  );
}
