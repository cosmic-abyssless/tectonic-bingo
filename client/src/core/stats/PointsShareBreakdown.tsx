import type { ContributionAward, ContributionCount } from "@bingo/shared";
import { FALLBACK_TEAM_COLOR } from "./PointsChart";
import { formatGp } from "../ui/gp";

/** Points share to at most two decimals: 12, 12.5, 12.33. */
export function formatShare(points: number): string {
  return points.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

const GROUPS: { kind: ContributionAward["kind"]; title: string; hint: string }[] = [
  { kind: "task", title: "Tasks and parts", hint: "Split between the claims that completed each one." },
  { kind: "tile", title: "Tile bonuses", hint: "Split by each player's share of the tile's points." },
  { kind: "line", title: "Line bonuses", hint: "Each tile of the line carries an equal part, split by share of that tile." },
];

function Chip({ children }: { children: string }) {
  return <span className="inline-flex max-w-full items-center truncate rounded-sm bg-surface-hover px-1.5 py-0.5 text-[11px] text-on-surface-muted">{children}</span>;
}

function AwardRow({ award, color }: { award: ContributionAward; color: string }) {
  const chips =
    award.kind === "task"
      ? award.claims.map((c) => `${c.label} × ${formatShare(c.quantity)}`)
      : award.kind === "line"
        ? (award.viaTiles ?? [])
        : [`${Math.round(award.fraction * 100)}% of the tile`];
  return (
    <li className="space-y-1.5 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm text-on-surface">{award.label}</span>
        <span className="num shrink-0 text-sm">
          <span className="font-semibold text-on-surface">+{formatShare(award.points)}</span> <span className="text-on-surface-subtle">of {award.awardPoints}</span>
        </span>
      </div>
      {/* The player's part of the award. */}
      <div className="h-1 overflow-hidden rounded-full bg-surface-hover">
        <div className="h-full rounded-full" style={{ width: `${Math.max(2, award.fraction * 100)}%`, backgroundColor: color }} />
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {award.kind === "line" && <span className="text-[11px] text-on-surface-subtle">via</span>}
          {chips.map((c, i) => (
            <Chip key={i}>{c}</Chip>
          ))}
        </div>
      )}
    </li>
  );
}

/** Where a player's Points share (CONTEXT.md) came from, grouped by kind of award. */
export function PointsShareBreakdown({ contribution, teamColor, rank }: { contribution: ContributionCount; teamColor: string | null; rank: { place: number; of: number } }) {
  const color = teamColor ?? FALLBACK_TEAM_COLOR;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Figure label="Points share" value={formatShare(contribution.pointsShare)} />
        <Figure label="Submissions" value={String(contribution.approvedSubmissions)} />
        <Figure label="On the team" value={`#${rank.place} of ${rank.of}`} />
        {/* GP gained (CONTEXT.md): what their approved drops were worth. */}
        <Figure label="GP gained" value={formatGp(contribution.gpGained)} />
      </div>
      {contribution.awards.length === 0 ? (
        <p className="text-sm text-on-surface-subtle">None of their claims have completed anything yet.</p>
      ) : (
        GROUPS.map((group) => {
          const awards = contribution.awards.filter((a) => a.kind === group.kind);
          if (awards.length === 0) return null;
          const subtotal = awards.reduce((sum, a) => sum + a.points, 0);
          return (
            <section key={group.kind} className="rounded-lg border border-outline">
              <header className="flex items-baseline justify-between gap-3 border-b border-outline bg-surface-hover/50 px-3 py-2">
                <span>
                  <span className="text-xs font-semibold tracking-wide text-on-surface uppercase">{group.title}</span>{" "}
                  <span className="text-xs text-on-surface-subtle">{group.hint}</span>
                </span>
                <span className="num shrink-0 text-sm font-semibold text-on-surface">{formatShare(subtotal)}</span>
              </header>
              <ul className="divide-y divide-outline px-3">
                {awards.map((a) => (
                  <AwardRow key={a.nodeId} award={a} color={color} />
                ))}
              </ul>
            </section>
          );
        })
      )}
      <p className="text-xs text-on-surface-subtle">
        Only claims that completed something count: the first full set of an "any of", or up to the total a sum needs. Moderator adjustments aren't included.
      </p>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] tracking-wide text-on-surface-subtle uppercase">{label}</div>
      <div className="num mt-0.5 truncate text-lg font-semibold text-on-surface">{value}</div>
    </div>
  );
}
