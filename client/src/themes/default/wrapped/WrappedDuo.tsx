import type { WrappedDuoModel } from "../../../headless/types";
import { Reveal, WrappedScene } from "../../../core/wrapped/Scene";
import { WrappedDropCard, WrappedHeading, WrappedPerson, WrappedSectionArt, WrappedStat } from "../../../core/wrapped/WrappedParts";

/** Your Duo: the pair's combined Points share and rank, who carried whom, and their best moments together. */
export function WrappedDuo({ section: d }: { section: WrappedDuoModel }) {
  return (
    <>
      <WrappedScene steps={4}>
        <Reveal step={0}>
          <WrappedSectionArt art={d.art} />
          <WrappedHeading kicker="Your Duo">
            You & <WrappedPerson person={d.partner} size="lg" />
          </WrappedHeading>
        </Reveal>
        <Reveal step={1} className="mt-12">
          <WrappedStat value={d.combinedShareLabel} label="Points share, together" tone={d.isTop ? "gold" : undefined} />
          {(d.rankLabel || d.pickLabel) && (
            <p className="mt-3 text-center text-on-surface-muted">{d.pickLabel ? `Drafted with ${d.pickLabel.toLowerCase()}${d.rankLabel ? `, finished ${d.rankLabel}` : ""}` : `Finished ${d.rankLabel}`}</p>
          )}
        </Reveal>
        {d.split && (
          <Reveal step={2} className="mt-10 w-full max-w-md">
            <div className="flex h-3 overflow-hidden rounded-full bg-surface-raised" role="img" aria-label={`You ${d.split.myPercent}%, ${d.partner.name} ${d.split.partnerPercent}%`}>
              <div className="bg-on-surface" style={{ width: `${d.split.myPercent}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-sm text-on-surface-muted">
              <span>
                You <span className="num text-on-surface">{d.split.myShareLabel}</span>
              </span>
              <span>
                {d.partner.name} <span className="num text-on-surface">{d.split.partnerShareLabel}</span>
              </span>
            </div>
          </Reveal>
        )}
        {d.carried && (
          <Reveal step={3} className="mt-8 max-w-md text-center text-lg">
            {d.carried}
          </Reveal>
        )}
      </WrappedScene>

      {d.moments.length > 0 && (
        <WrappedScene steps={1 + d.moments.length}>
          <Reveal step={0}>
            <WrappedHeading kicker="Your Duo">Best moments together</WrappedHeading>
          </Reveal>
          <div className="mt-10 w-full max-w-3xl space-y-8">
            {d.moments.map((m, i) => (
              <Reveal key={m.key} step={1 + i}>
                <p className="mb-2 text-center text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-muted">{m.label}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <WrappedDropCard drop={m.mine} />
                  <WrappedDropCard drop={m.theirs} showPlayer showTeam={false} />
                </div>
              </Reveal>
            ))}
          </div>
        </WrappedScene>
      )}
    </>
  );
}
