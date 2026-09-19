import type { ReactNode } from "react";
import type { TeamModel } from "../../headless/types";
import { usePointBreakdown } from "../../headless/usePointBreakdown";
import { Notice } from "../ui/Card";
import { Dialog, DialogHeader } from "../ui/Dialog";
import { formatPoints, formatSigned } from "../ui/points";

/** Where a team's points come from: each tile (parts and bonus), the line bonuses, and mod adjustments. */
export function PointBreakdownDialog({ team, onClose }: { team: TeamModel | null; onClose: () => void }) {
  return (
    <Dialog isOpen={team !== null} onClose={onClose}>
      {team && <PointBreakdown team={team} onClose={onClose} />}
    </Dialog>
  );
}

function Section({ title, points, children }: { title: string; points: number; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 flex items-baseline justify-between text-xs font-semibold uppercase tracking-wide text-on-surface-subtle">
        <span>{title}</span>
        <span className="num text-sm normal-case tracking-normal text-on-surface">{formatSigned(points)}</span>
      </h3>
      {children}
    </section>
  );
}

function Row({ label, points, hint, indent }: { label: ReactNode; points: number; hint?: ReactNode; indent?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1 text-sm ${indent ? "pl-4 text-on-surface-muted" : "text-on-surface"}`}>
      <span className="min-w-0">
        {label}
        {hint && <span className="ml-2 text-xs text-on-surface-subtle">{hint}</span>}
      </span>
      <span className="num shrink-0">{formatSigned(points)}</span>
    </div>
  );
}

function PointBreakdown({ team, onClose }: { team: TeamModel; onClose: () => void }) {
  const b = usePointBreakdown();
  const empty = b.tiles.items.length + b.lines.items.length + b.adjustments.items.length === 0;

  return (
    <>
      <DialogHeader title="Points" subtitle={`${team.name} \u00b7 ${formatPoints(b.total)} pts`} onClose={onClose} />
      <div className="space-y-5 p-5">
        {empty && b.unattributed === 0 && <p className="text-sm text-on-surface-subtle">No points yet.</p>}

        {b.tiles.items.length > 0 && (
          <Section title="Tiles" points={b.tiles.points}>
            <ul className="divide-y divide-outline rounded-md border border-outline px-3">
              {b.tiles.items.map((tile) => (
                <li key={tile.tileId} className="py-1">
                  <Row label={<span className="font-medium">{tile.name}</span>} points={tile.points} />
                  {tile.parts.map((part) => (
                    <Row key={part.id} label={part.label} points={part.points} indent />
                  ))}
                  {tile.bonus > 0 && <Row label="Bonus for completing every part" points={tile.bonus} indent />}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {b.lines.items.length > 0 && (
          <Section title="Line bonuses" points={b.lines.points}>
            <ul className="divide-y divide-outline rounded-md border border-outline px-3">
              {b.lines.items.map((line) => (
                <li key={line.id} className="py-1">
                  <Row label={<span className="font-medium">{line.label}</span>} points={line.points} />
                  {line.tileNames.length > 0 && <p className="pb-1 pl-4 text-xs text-on-surface-subtle">{line.tileNames.join(", ")}</p>}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {b.adjustments.items.length > 0 && (
          <Section title="Mod adjustments" points={b.adjustments.points}>
            <ul className="divide-y divide-outline rounded-md border border-outline px-3">
              {b.adjustments.items.map((item) => (
                <li key={item.id}>
                  <Row label={item.reason} hint={item.timeAgo} points={item.amount} />
                </li>
              ))}
            </ul>
          </Section>
        )}

        {b.withheld.length > 0 && (
          <Notice tone="info">
            <p className="mb-1 font-medium text-on-surface">Done, but points held back</p>
            <p className="mb-1.5">These parts are complete; their points are awarded once the part they depend on is done.</p>
            <ul className="space-y-0.5">
              {b.withheld.map((item) => (
                <li key={`${item.tileId}-${item.label}`}>
                  {item.tileName} &middot; {item.label} <span className="num">({formatPoints(item.points)} pts)</span>
                </li>
              ))}
            </ul>
          </Notice>
        )}

        {b.unattributed !== 0 && (
          <Notice tone="warn">
            <span className="num font-medium text-on-surface">{formatSigned(b.unattributed)}</span> points in the total aren't tied to any tile, line or adjustment above. That shouldn't happen: tell a mod.
          </Notice>
        )}
      </div>
    </>
  );
}
