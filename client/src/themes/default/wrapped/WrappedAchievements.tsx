import type { WrappedAchievementsModel } from "../../../headless/types";
import { Reveal, WrappedScene } from "../../../core/wrapped/Scene";
import { WikiIcon } from "../../../core/ui/ItemIcon";
import { WrappedCategoryArt, WrappedHeading, WrappedPerson } from "../../../core/wrapped/WrappedParts";

/**
 * The Achievements section: who unlocked one, the leaderboard ("Most achievements by:"), how many took part and who
 * completed all first, unlocks per day, every Team, then the viewer's own place. A part with nothing to say is left out.
 */
export function WrappedAchievements({ section: a }: { section: WrappedAchievementsModel }) {
  const p = a.participation;
  const counted = !!p?.playersLabel;
  const figures = [counted, !!p?.allFirst];
  const charts = [!!a.byDay, a.teams.length > 0];
  const count = (parts: boolean[]) => parts.filter(Boolean).length;
  const at = (parts: boolean[], i: number) => count(parts.slice(0, i));

  return (
    <>
      <WrappedScene steps={a.leaderboard.length > 0 ? 2 : 1}>
        <div className="w-full max-w-2xl">
          <Reveal step={0}>
            <WrappedCategoryArt art={a.art} />
            <WrappedHeading kicker="Achievements">{p?.playersLabel ? `${p.playersLabel} unlocked one` : "Who unlocked the most"}</WrappedHeading>
          </Reveal>
          {a.leaderboard.length > 0 && (
            <Reveal step={1} className="mt-12">
              <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-muted">Most achievements by:</p>
              <ol className="mt-4 space-y-2">
                {a.leaderboard.map((r) => (
                  <li
                    key={r.person.id}
                    className={`flex items-center gap-3 rounded-xl border bg-surface px-4 py-2 ${r.isMyTeam ? "border-on-surface" : "border-outline"}`}
                  >
                    <span className="num w-10 shrink-0 font-black text-on-surface-muted">{r.placementLabel}</span>
                    <span className="min-w-0 flex-1">
                      <WrappedPerson person={r.person} detail={r.teamName} />
                      {r.atLabel && <span className="mt-0.5 block text-xs text-on-surface-muted">{r.atLabel}</span>}
                    </span>
                    <span className="shrink-0 whitespace-nowrap">
                      <span className="num text-lg font-bold">{r.earnedLabel}</span> <span className="text-sm text-on-surface-muted">{r.outOfLabel}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </Reveal>
          )}
        </div>
      </WrappedScene>

      {p && count(figures) > 0 && (
        <WrappedScene steps={count(figures)} className="text-center">
          <div className="w-full max-w-2xl">
            {counted && (
              <Reveal step={0}>
                <div className="grid grid-cols-2 gap-6">
                  {p.percentLabel && <MiniStat value={p.percentLabel} label="of Players unlocked one" />}
                  {p.earnedLabel && <MiniStat value={p.earnedLabel} label={p.averageLabel} />}
                </div>
                {p.allLabel && <p className="mt-6 text-lg font-semibold">{p.allLabel}</p>}
              </Reveal>
            )}
            {p.allFirst && (
              <Reveal step={at(figures, 1)} className={counted ? "mt-14" : undefined}>
                <WrappedHeading kicker="Completed all first, at:">{p.allFirst.atLabel}</WrappedHeading>
                <div className="mt-4 flex justify-center">
                  <WrappedPerson person={p.allFirst.person} />
                </div>
              </Reveal>
            )}
          </div>
        </WrappedScene>
      )}

      {count(charts) > 0 && (
        <WrappedScene steps={count(charts)} className="text-center">
          <div className="w-full max-w-2xl">
            {a.byDay && (
              <Reveal step={0}>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-muted">Unlocks per day</p>
                <UnlocksChart byDay={a.byDay} />
              </Reveal>
            )}
            {a.teams.length > 0 && (
              <Reveal step={at(charts, 1)} className={a.byDay ? "mt-12" : undefined}>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-muted">Achievements by Team</p>
                <ol className="mt-4 space-y-2 text-left">
                  {a.teams.map((t) => (
                    <li
                      key={t.teamId}
                      className={`flex items-center gap-3 rounded-xl border bg-surface px-4 py-2 ${t.isMine ? "border-on-surface" : "border-outline"}`}
                    >
                      <span className="num w-10 shrink-0 font-black text-on-surface-muted">{t.placementLabel}</span>
                      {t.color && <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />}
                      <span className="min-w-0 flex-1 truncate font-semibold">
                        {t.name}
                        {t.isMine && <span className="ml-2 text-xs font-normal text-on-surface-muted">your Team</span>}
                      </span>
                      <span className="shrink-0 text-right leading-tight">
                        <span className="num block font-semibold">{t.earnedLabel}</span>
                        <span className="block text-xs text-on-surface-muted">{t.averageLabel}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </Reveal>
            )}
          </div>
        </WrappedScene>
      )}

      {a.you && (
        <WrappedScene steps={a.you.rarest.length > 0 ? 2 : 1} className="text-center">
          <div className="w-full max-w-lg">
            <Reveal step={0}>
              <WrappedHeading kicker="Your place">{a.you.rankLabel ?? `${a.you.earnedLabel} ${a.you.outOfLabel} unlocked`}</WrappedHeading>
              {a.you.rankLabel && (
                <p className="mt-3 text-lg text-on-surface-muted">
                  {a.you.earnedLabel} {a.you.outOfLabel} unlocked
                </p>
              )}
            </Reveal>
            {a.you.rarest.length > 0 && (
              <Reveal step={1} className="mt-12">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-muted">Your rarest</p>
                <ul className="mt-4 space-y-2 text-left">
                  {a.you.rarest.map((r) => (
                    <li key={r.key} className="flex items-center gap-3 rounded-xl border border-outline bg-surface px-3 py-2">
                      <WikiIcon name={r.itemName} className="size-8 shrink-0 [image-rendering:pixelated]" />
                      <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
                      <span className="shrink-0 text-sm text-on-surface-muted">{r.percentLabel} of Players</span>
                    </li>
                  ))}
                </ul>
              </Reveal>
            )}
          </div>
        </WrappedScene>
      )}
    </>
  );
}

/** Unlocks per day as plain bars, the busiest one picked out, the first and last day under them and the busiest named. */
function UnlocksChart({ byDay }: { byDay: NonNullable<WrappedAchievementsModel["byDay"]> }) {
  const most = Math.max(1, ...byDay.days.map((d) => d.earned));
  return (
    <div className="mt-6">
      <div aria-hidden className="flex h-40 items-end gap-1 border-b border-outline-strong">
        {byDay.days.map((d, i) => (
          <div
            key={i}
            title={`${d.dayLabel}: ${d.earned}`}
            className={`min-w-0 flex-1 rounded-t-sm ${d.isBusiest ? "bg-on-surface" : "bg-on-surface-subtle"}`}
            style={{ height: `${(d.earned / most) * 100}%` }}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between gap-2 text-xs text-on-surface-muted">
        <span>{byDay.days[0]!.dayLabel}</span>
        <span>{byDay.days.at(-1)!.dayLabel}</span>
      </div>
      <p className="mt-4 text-lg">
        <span className="text-on-surface-muted">Busiest day · </span>
        <span className="num font-semibold">{byDay.busiestLabel}</span>
      </p>
    </div>
  );
}

function MiniStat({ value, label }: { value: string; label: string | null }) {
  return (
    <div className="text-center">
      <div className="num whitespace-nowrap text-2xl font-bold sm:text-3xl">{value}</div>
      {label && <div className="mt-1 text-xs text-on-surface-muted">{label}</div>}
    </div>
  );
}
