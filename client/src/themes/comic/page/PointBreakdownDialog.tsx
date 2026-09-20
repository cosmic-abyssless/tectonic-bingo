import type { ReactNode } from "react";
import type { TeamModel } from "../../../headless/types";
import { usePointBreakdown } from "../../../headless/usePointBreakdown";
import { formatPoints, formatSigned } from "../../../core/ui/points";
import { COMIC_FONT } from "../font";
import { ComicDialog, ComicDialogHeader } from "../ui/ComicDialog";
import { CaptionBox, InkTag } from "../ui/CaptionBox";
import { useComic } from "../ui/useComic";

/** Where the team's points come from, in caption boxes: each tile (parts and bonus), the line bonuses, mod adjustments. */
export function PointBreakdownDialog({ team, onClose }: { team: TeamModel | null; onClose: () => void }) {
  return (
    <ComicDialog isOpen={team !== null} onClose={onClose}>
      {team && <PointBreakdown team={team} onClose={onClose} />}
    </ComicDialog>
  );
}

function Score({ points, large }: { points: number; large?: boolean }) {
  const { colors } = useComic();
  return (
    <span className={`num shrink-0 tabular-nums ${large ? "text-lg leading-tight" : ""}`} style={{ color: points < 0 ? colors.RED : colors.INK, fontFamily: COMIC_FONT }}>
      {formatSigned(points)}
    </span>
  );
}

function Section({ title, points, children }: { title: string; points: number; children: ReactNode }) {
  return (
    <CaptionBox
      tone="paper"
      title={
        <span className="flex items-center justify-between gap-3">
          {title}
          <InkTag>{formatSigned(points)}</InkTag>
        </span>
      }
    >
      {children}
    </CaptionBox>
  );
}

function PointBreakdown({ team, onClose }: { team: TeamModel; onClose: () => void }) {
  const { colors } = useComic();
  const b = usePointBreakdown();
  const empty = b.tiles.items.length + b.lines.items.length + b.adjustments.items.length === 0;
  const row = "flex items-baseline justify-between gap-3 text-sm";
  const heading = "min-w-0 truncate text-lg leading-tight";

  return (
    <>
      <ComicDialogHeader title="Points" subtitle={`${team.name} \u00b7 ${formatPoints(b.total)} pts`} onClose={onClose} />
      <div className="space-y-5 p-5">
        {empty && b.unattributed === 0 && (
          <p className="text-sm italic" style={{ color: colors.INK_SUBTLE }}>
            No points yet.
          </p>
        )}

        {b.tiles.items.length > 0 && (
          <Section title="Tiles" points={b.tiles.points}>
            <ul className="space-y-2.5">
              {b.tiles.items.map((tile) => (
                <li key={tile.tileId}>
                  <div className={row} style={{ color: colors.INK }}>
                    <span className={heading} style={{ fontFamily: COMIC_FONT }}>
                      {tile.name}
                    </span>
                    <Score points={tile.points} large />
                  </div>
                  <ul className="mt-0.5 space-y-0.5 pl-3">
                    {tile.parts.map((part) => (
                      <li key={part.id} className={row} style={{ color: colors.INK_BODY }}>
                        <span className="min-w-0">{part.label}</span>
                        <span className="num shrink-0">{formatSigned(part.points)}</span>
                      </li>
                    ))}
                    {tile.bonus > 0 && (
                      <li className={row} style={{ color: colors.INK_BODY }}>
                        <span className="min-w-0 italic">Bonus for completing every part</span>
                        <span className="num shrink-0">{formatSigned(tile.bonus)}</span>
                      </li>
                    )}
                  </ul>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {b.lines.items.length > 0 && (
          <Section title="Line bonuses" points={b.lines.points}>
            <ul className="space-y-2.5">
              {b.lines.items.map((line) => (
                <li key={line.id}>
                  <div className={row} style={{ color: colors.INK }}>
                    <span className={heading} style={{ fontFamily: COMIC_FONT }}>
                      {line.label}
                    </span>
                    <Score points={line.points} large />
                  </div>
                  {line.tileNames.length > 0 && (
                    <p className="mt-0.5 pl-3 text-xs" style={{ color: colors.INK_SUBTLE }}>
                      {line.tileNames.join(", ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {b.adjustments.items.length > 0 && (
          <Section title="Mod adjustments" points={b.adjustments.points}>
            <ul className="space-y-1">
              {b.adjustments.items.map((item) => (
                <li key={item.id} className={row} style={{ color: colors.INK_BODY }}>
                  <span className="min-w-0">
                    {item.reason}{" "}
                    <span className="text-xs" style={{ color: colors.INK_SUBTLE }}>
                      {item.timeAgo}
                    </span>
                  </span>
                  <Score points={item.amount} />
                </li>
              ))}
            </ul>
          </Section>
        )}

        {b.withheld.length > 0 && (
          <CaptionBox tone="blue" title="Done, but points held back">
            <p className="mb-1.5 text-sm">These parts are complete; their points are awarded once the part they depend on is done.</p>
            <ul className="space-y-0.5 text-sm">
              {b.withheld.map((item) => (
                <li key={`${item.tileId}-${item.label}`}>
                  {item.tileName} &middot; {item.label} <span className="num">({formatPoints(item.points)} pts)</span>
                </li>
              ))}
            </ul>
          </CaptionBox>
        )}

        {b.unattributed !== 0 && (
          <CaptionBox tone="red" title="Unaccounted points">
            <p className="text-sm">
              <span className="num font-bold">{formatSigned(b.unattributed)}</span> points in the total aren't tied to any tile, line or adjustment above. That shouldn't happen: tell a mod.
            </p>
          </CaptionBox>
        )}
      </div>
    </>
  );
}
