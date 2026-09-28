import type { WrappedTeamModel } from "../../../headless/types";
import { Reveal, WrappedScene } from "../../../core/wrapped/Scene";
import { PointsChart } from "../../../core/wrapped/PointsChart";
import { WrappedCategoryArt, WrappedDropCard, WrappedHeading, WrappedPerson } from "../../../core/wrapped/WrappedParts";

export function WrappedTeam({ section: t }: { section: WrappedTeamModel }) {
  const medal = t.placement === 1 ? "text-gold" : t.placement === 2 ? "text-silver" : t.placement === 3 ? "text-bronze" : "";
  return (
    <>
      <WrappedScene steps={3}>
        <Reveal step={0}>
          <WrappedCategoryArt art={t.art} />
          <p className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-muted">
            {t.color && <span className="size-2.5 rounded-full" style={{ backgroundColor: t.color }} />}
            Your Team
          </p>
          <h2 className="mt-3 text-balance text-center text-4xl font-black tracking-tight sm:text-6xl">{t.name}</h2>
        </Reveal>
        <Reveal step={1} className="mt-10 text-center">
          <div className={`num text-6xl font-black sm:text-8xl ${medal}`}>{t.placementLabel}</div>
          <p className="mt-2 text-on-surface-muted">
            <span className="num">{t.pointsLabel}</span> points
          </p>
        </Reveal>
        <Reveal step={2} className="mt-8 flex gap-10 text-center">
          <div>
            <div className="num text-3xl font-bold">{t.tilesCompleted}</div>
            <div className="text-sm text-on-surface-muted">{t.tilesCompleted === 1 ? "Tile" : "Tiles"} completed</div>
          </div>
          <div>
            <div className="num text-3xl font-bold">{t.linesCompleted}</div>
            <div className="text-sm text-on-surface-muted">{t.linesCompleted === 1 ? "Line" : "Lines"} completed</div>
          </div>
        </Reveal>
      </WrappedScene>

      {(t.mvp || t.topGpEarner || t.biggestDrop || t.chart) && (
        <WrappedScene steps={3}>
          <div className="w-full max-w-2xl">
            {(t.mvp || t.topGpEarner) && (
              <Reveal step={0} className={`grid gap-4 ${t.mvp && t.topGpEarner ? "sm:grid-cols-2" : "mx-auto max-w-sm"}`}>
                {t.mvp && (
                  <div className="rounded-xl border border-outline bg-surface p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-muted">MVP</p>
                    <div className="mt-2">
                      <WrappedPerson person={t.mvp.person} detail={`${t.mvp.shareLabel} Points share`} />
                    </div>
                  </div>
                )}
                {t.topGpEarner && (
                  <div className="rounded-xl border border-outline bg-surface p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-muted">Top GP earner</p>
                    <div className="mt-2">
                      <WrappedPerson person={t.topGpEarner.person} detail={`${t.topGpEarner.gpLabel} GP gained`} />
                    </div>
                  </div>
                )}
              </Reveal>
            )}
            {t.biggestDrop && (
              <Reveal step={1} className="mt-6">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-muted">The Team's biggest drop</p>
                <WrappedDropCard drop={t.biggestDrop} showPlayer />
              </Reveal>
            )}
            {t.chart && (
              <Reveal step={2} className="mt-10">
                <WrappedHeading kicker="The climb">{t.pointsLabel} points</WrappedHeading>
                <div className="mt-6">
                  <PointsChart chart={t.chart} label={`${t.name}'s points over time`} />
                </div>
              </Reveal>
            )}
          </div>
        </WrappedScene>
      )}

      {t.superlatives.length > 0 && (
        <WrappedScene steps={1} className="text-center">
          <Reveal step={0}>
            <WrappedHeading kicker="Superlatives">Your Team decided</WrappedHeading>
            <ul className="mx-auto mt-8 max-w-md space-y-4">
              {t.superlatives.map((s) => (
                <li key={s.category}>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-muted">{s.category}</p>
                  <div className="mt-2 flex flex-wrap justify-center gap-4">
                    {s.winners.map((w) => (
                      <WrappedPerson key={w.id} person={w} />
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </Reveal>
        </WrappedScene>
      )}
    </>
  );
}
