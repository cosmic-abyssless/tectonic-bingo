import type { WrappedBingoModel } from "../../../headless/types";
import { Reveal, WrappedScene } from "../../../core/wrapped/Scene";
import { PointsChart } from "../../../core/wrapped/PointsChart";
import { WrappedCategoryArt, WrappedDropCard, WrappedHeading, WrappedPerson, WrappedStat } from "../../../core/wrapped/WrappedParts";

const MEDAL = ["text-gold", "text-silver", "text-bronze"];

export function WrappedBingo({ section: b }: { section: WrappedBingoModel }) {
  const m = b.moderation;
  return (
    <>
      <WrappedScene steps={2}>
        <Reveal step={0}>
          <WrappedCategoryArt art={b.art} />
          <WrappedHeading kicker="The Bingo">Everyone, together</WrappedHeading>
        </Reveal>
        <Reveal step={1} className="mt-12 grid grid-cols-2 gap-8 sm:gap-16">
          <WrappedStat value={b.totalSubmissionsLabel} label={b.totalSubmissions === 1 ? "Submission" : "Submissions"} />
          <WrappedStat value={b.totalGpLabel} label="GP in drops" />
        </Reveal>
      </WrappedScene>

      <WrappedScene steps={2}>
        <div className="w-full max-w-2xl">
          <Reveal step={0}>
            <WrappedHeading kicker="Final standings">The leaderboard</WrappedHeading>
            <ol className="mt-8 space-y-2">
              {b.leaderboard.map((t) => (
                <li key={t.teamId} className={`flex items-center gap-3 rounded-xl border bg-surface px-4 py-3 ${t.isMine ? "border-on-surface" : "border-outline"}`}>
                  <span className={`num w-10 shrink-0 font-black ${MEDAL[t.placement - 1] ?? "text-on-surface-muted"}`}>{t.placementLabel}</span>
                  {t.color && <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />}
                  <span className="min-w-0 flex-1 truncate font-semibold">
                    {t.name}
                    {t.isMine && <span className="ml-2 text-xs font-normal text-on-surface-muted">your Team</span>}
                  </span>
                  <span className="num shrink-0">{t.pointsLabel}</span>
                </li>
              ))}
            </ol>
          </Reveal>
          {b.race && (
            <Reveal step={1} className="mt-10">
              <PointsChart chart={b.race} label="Every Team's points over time" />
            </Reveal>
          )}
        </div>
      </WrappedScene>

      {(b.rarestDrop || b.mostReacted) && (
        <WrappedScene steps={2}>
          <div className="w-full max-w-lg">
            {b.rarestDrop && (
              <Reveal step={0}>
                <WrappedHeading kicker="The rarest drop">{b.rarestDrop.itemName}</WrappedHeading>
                <p className="mt-3 text-center text-lg text-on-surface-muted">{b.rarestDrop.luck?.sentence}</p>
                <WrappedDropCard drop={b.rarestDrop} showPlayer className="mt-6" />
              </Reveal>
            )}
            {b.mostReacted && (
              <Reveal step={b.rarestDrop ? 1 : 0} className="mt-14">
                <p className="mb-2 text-center text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-muted">The crowd favourite · {b.mostReacted.reactionsLabel}</p>
                <WrappedDropCard drop={b.mostReacted.drop} showPlayer />
              </Reveal>
            )}
          </div>
        </WrappedScene>
      )}

      {b.steal && (
        <WrappedScene steps={2} className="text-center">
          <Reveal step={0}>
            <WrappedHeading kicker="Steal of the draft">
              <WrappedPerson person={b.steal.person} size="lg" />
            </WrappedHeading>
          </Reveal>
          <Reveal step={1} className="mt-6 max-w-md text-lg text-on-surface-muted">
            The {b.steal.positionLabel} Player drafted{b.steal.teamName && ` (by ${b.steal.teamName})`}, finished {b.steal.rankLabel} in Points share. {b.steal.placesBeatenLabel} better than their draft spot.
          </Reveal>
        </WrappedScene>
      )}

      {m && (
        <WrappedScene steps={3}>
          <div className="w-full max-w-2xl">
            <Reveal step={0}>
              <WrappedCategoryArt art={m.art} />
              <WrappedHeading kicker="Behind the scenes">{m.reviewedLabel}</WrappedHeading>
            </Reveal>
            <Reveal step={1} className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-4">
              {m.medianLabel && <MiniStat value={m.medianLabel} label="median wait" />}
              {m.fastestLabel && <MiniStat value={m.fastestLabel} label="fastest review" />}
              {m.withinHourLabel && <MiniStat value={m.withinHourLabel} label="within an hour" />}
              {m.busiestHourLabel && <MiniStat value={m.busiestHourLabel} label={m.busiestHourDayLabel ? `busiest hour, ${m.busiestHourDayLabel}` : "busiest hour"} />}
            </Reveal>
            {m.reviewers.length > 0 && (
              <Reveal step={2} className="mt-12">
                <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-muted">Who had to deal with the most nonsense</p>
                <ol className="mt-4 space-y-2">
                  {m.reviewers.map((r) => (
                    <li key={r.person.id} className="flex items-center justify-between gap-3 rounded-xl border border-outline bg-surface px-4 py-2">
                      <WrappedPerson person={r.person} detail={r.reviewedLabel} />
                      <span className="shrink-0 text-sm">
                        <span className="num font-semibold">{r.rejectionLabel}</span> <span className="text-on-surface-muted">rejected</span>
                      </span>
                    </li>
                  ))}
                </ol>
                {m.banter && <p className="mt-4 text-center text-on-surface-muted">{m.banter}</p>}
                {m.topReviewer && (
                  <p className="mt-2 text-center text-sm text-on-surface-muted">
                    Most reviews: <span className="font-semibold text-on-surface">{m.topReviewer.person.name}</span> with {m.topReviewer.reviewedLabel}.
                  </p>
                )}
              </Reveal>
            )}
          </div>
        </WrappedScene>
      )}

      {b.teamSuperlatives.length > 0 && (
        <WrappedScene steps={1} className="text-center">
          <div className="w-full max-w-2xl">
            <Reveal step={0}>
              <WrappedHeading kicker="Superlatives">Every Team's picks</WrappedHeading>
              <div className="mt-8 space-y-6">
                {b.teamSuperlatives.map((t) => (
                  <div key={t.teamId} className="rounded-xl border border-outline bg-surface p-4">
                    <p className="flex items-center justify-center gap-2 text-sm font-semibold">
                      {t.color && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />}
                      {t.teamName}
                    </p>
                    <ul className="mt-3 space-y-3">
                      {t.superlatives.map((s) => (
                        <li key={s.category}>
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-muted">{s.category}</p>
                          <div className="mt-1.5 flex flex-wrap justify-center gap-4">
                            {s.winners.map((w) => (
                              <WrappedPerson key={w.id} person={w} size="sm" />
                            ))}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </WrappedScene>
      )}
    </>
  );
}

function MiniStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="num whitespace-nowrap text-2xl font-bold sm:text-3xl">{value}</div>
      <div className="mt-1 text-xs text-on-surface-muted">{label}</div>
    </div>
  );
}
