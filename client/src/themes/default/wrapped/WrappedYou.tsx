import type { WrappedYouModel } from "../../../headless/types";
import { Reveal, WrappedScene } from "../../../core/wrapped/Scene";
import { WrappedDropCard, WrappedHeading, WrappedStat } from "../../../core/wrapped/WrappedParts";
import { WikiIcon } from "../../../core/ui/ItemIcon";

/** You: a screen per group of facts, each left out when it has nothing to say. */
export function WrappedYou({ section: y }: { section: WrappedYouModel }) {
  return (
    <>
      {(y.submissions || y.points) && (
        <WrappedScene steps={3}>
          <Reveal step={0}>
            <WrappedHeading kicker="You">{y.submissions ? y.submissions.countLabel : "You showed up"}</WrappedHeading>
          </Reveal>
          {y.submissions?.comparison && (
            <Reveal step={1} className="mt-4 text-center text-lg text-on-surface-muted">
              {y.submissions.comparison}
            </Reveal>
          )}
          {y.points && (
            <Reveal step={2} className="mt-12">
              <WrappedStat value={y.points.shareLabel} label="Points share" tone={y.points.isTop ? "gold" : undefined} />
              {y.points.isTop && <p className="mt-3 text-center font-semibold text-gold">Your Team's top scorer.</p>}
              {(y.points.comparison || y.points.teamPercentLabel || y.points.rankLabel) && (
                <p className="mt-2 text-center text-on-surface-muted">{[y.points.comparison, y.points.teamPercentLabel, y.points.rankLabel].filter(Boolean).join(" · ")}</p>
              )}
            </Reveal>
          )}
        </WrappedScene>
      )}

      {(y.gp || y.topDrops.length > 0) && (
        <WrappedScene steps={1 + y.topDrops.length}>
          {y.gp && (
            <Reveal step={0}>
              <WrappedStat value={y.gp.gainedLabel} label="GP gained" />
              {y.gp.buyInLabel && y.gp.coveredBuyIn !== null && (
                <p className="mt-3 text-center text-on-surface-muted">{y.gp.coveredBuyIn ? `That's your ${y.gp.buyInLabel} buy-in covered.` : `Not quite the ${y.gp.buyInLabel} buy-in. There's always next Bingo.`}</p>
              )}
            </Reveal>
          )}
          {y.topDrops.length > 0 && (
            <div className="mt-10 w-full max-w-lg space-y-3">
              <Reveal step={y.gp ? 1 : 0}>
                <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-muted">Your biggest drops</p>
              </Reveal>
              {y.topDrops.map((d, i) => (
                <Reveal key={d.key} step={(y.gp ? 1 : 0) + i}>
                  <WrappedDropCard drop={d} />
                </Reveal>
              ))}
            </div>
          )}
        </WrappedScene>
      )}

      {(y.luckiestDrop || y.driestStreak) && (
        <WrappedScene steps={2}>
          {y.luckiestDrop && (
            <Reveal step={0} className="w-full max-w-lg">
              <WrappedHeading kicker="Your luckiest drop">{y.luckiestDrop.itemName}</WrappedHeading>
              <p className="mt-3 text-center text-lg text-on-surface-muted">{y.luckiestDrop.luck?.sentence}</p>
              <WrappedDropCard drop={y.luckiestDrop} className="mt-6" />
            </Reveal>
          )}
          {y.driestStreak && (
            <Reveal step={y.luckiestDrop ? 1 : 0} className="mt-14 max-w-lg text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-muted">Your driest streak</p>
              <p className="mt-3 text-2xl font-bold sm:text-3xl">
                {y.driestStreak.killsLabel} of {y.driestStreak.boss}
              </p>
              <p className="mt-1 text-on-surface-muted">
                Without a single Board drop. They drop at {y.driestStreak.rateLabel} combined there: only {y.driestStreak.chanceLabel} go that dry.
              </p>
            </Reveal>
          )}
        </WrappedScene>
      )}

      {(y.firstLast || y.mostActiveDay) && (
        <WrappedScene steps={3}>
          {y.firstLast && (
            <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-2">
              <Reveal step={0}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-muted">Your first drop</p>
                <WrappedDropCard drop={y.firstLast.first} />
              </Reveal>
              {y.firstLast.last && (
                <Reveal step={0}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-muted">And your last</p>
                  <WrappedDropCard drop={y.firstLast.last} />
                </Reveal>
              )}
            </div>
          )}
          {y.mostActiveDay && (
            <div className="mt-14 w-full max-w-lg">
              <Reveal step={1}>
                <WrappedHeading kicker="Your biggest day">{y.mostActiveDay.dateLabel}</WrappedHeading>
                <p className="mt-3 text-center text-on-surface-muted">{y.mostActiveDay.submissionsLabel} in one day.</p>
              </Reveal>
              <Reveal step={2} className="mt-6 space-y-2">
                {y.mostActiveDay.drops.slice(0, 4).map((d) => (
                  <WrappedDropCard key={d.key} drop={d} />
                ))}
                {y.mostActiveDay.drops.length > 4 && <p className="text-center text-sm text-on-surface-muted">and {y.mostActiveDay.drops.length - 4} more</p>}
              </Reveal>
            </div>
          )}
        </WrappedScene>
      )}

      {(y.titles.length > 0 || y.achievements.length > 0) && (
        <WrappedScene steps={2}>
          {y.titles.length > 0 && (
            <Reveal step={0} className="w-full max-w-lg">
              <WrappedHeading kicker={y.titles.length === 1 ? "Your Title" : "Your Titles"}>{y.titles.map((t) => t.name).join(" · ")}</WrappedHeading>
              <ul className="mt-6 space-y-2">
                {y.titles.map((t) => (
                  <li key={t.id} className="rounded-xl border border-outline bg-surface px-4 py-3 text-center">
                    <span className="font-semibold">{t.name}</span> <span className="text-on-surface-muted">· {t.text}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
          )}
          {y.achievements.length > 0 && (
            <Reveal step={y.titles.length ? 1 : 0} className="mt-14 w-full max-w-lg">
              <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-muted">{y.achievements.length === 1 ? "Achievement unlocked" : `${y.achievements.length} Achievements unlocked`}</p>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {y.achievements.map((a) => (
                  <li key={a.key} className="flex items-center gap-3 rounded-xl border border-outline bg-surface px-3 py-2">
                    <WikiIcon name={a.itemName} className="size-8 [image-rendering:pixelated]" />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{a.name}</span>
                      <span className="block text-xs text-on-surface-subtle">{a.earnedLabel}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Reveal>
          )}
        </WrappedScene>
      )}

      {(y.wom || y.draft) && (
        <WrappedScene steps={2}>
          {y.wom && (
            <Reveal step={0}>
              <WrappedStat value={y.wom.ehbLabel} label="Efficient hours bossed" />
              {y.wom.bosses.length > 0 && (
                <ul className="mt-6 flex flex-wrap justify-center gap-2">
                  {y.wom.bosses.map((b) => (
                    <li key={b.name} className="rounded-full border border-outline bg-surface px-3 py-1 text-sm">
                      <span className="font-semibold">{b.name}</span> <span className="num text-on-surface-muted">{b.killsLabel}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Reveal>
          )}
          {y.draft && (
            <Reveal step={y.wom ? 1 : 0} className="mt-14 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-muted">Draft day</p>
              <p className="mt-3 text-3xl font-bold">{y.draft.pickLabel}</p>
              <p className="mt-1 text-on-surface-muted">The {y.draft.positionLabel} Player off the board.</p>
            </Reveal>
          )}
        </WrappedScene>
      )}
    </>
  );
}
