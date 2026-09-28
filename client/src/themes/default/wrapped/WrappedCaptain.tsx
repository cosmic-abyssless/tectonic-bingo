import type { WrappedCaptainModel } from "../../../headless/types";
import { Reveal, WrappedScene } from "../../../core/wrapped/Scene";
import { WrappedCategoryArt, WrappedHeading, WrappedPerson, WrappedStat } from "../../../core/wrapped/WrappedParts";

/** Your Draft: every pick against where it finished, the best Steal, and a grade. Only a pick that beat its spot is highlighted. */
export function WrappedCaptain({ section: c }: { section: WrappedCaptainModel }) {
  return (
    <>
      <WrappedScene steps={2}>
        <div className="w-full max-w-2xl">
          <Reveal step={0}>
            <WrappedCategoryArt art={c.art} />
            <WrappedHeading kicker="Your Draft">Your picks</WrappedHeading>
          </Reveal>
          <Reveal step={1}>
            <ol className="mt-8 space-y-2">
              {c.picks.map((p) => (
                <li key={p.key} className="flex items-center gap-3 rounded-xl border border-outline bg-surface px-4 py-3">
                  <span className="num w-16 shrink-0 text-sm text-on-surface-muted">{p.pickLabel}</span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    {p.people.map((person) => (
                      <WrappedPerson key={person.id} person={person} size="sm" />
                    ))}
                  </span>
                  <span className="shrink-0 text-right text-xs text-on-surface-subtle">
                    {p.positionLabel}
                    {p.rankLabel && <span className={`block text-sm ${p.beat ? "font-semibold text-ok" : "text-on-surface-muted"}`}>{p.rankLabel}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </WrappedScene>

      {(c.steal || c.grade) && (
        <WrappedScene steps={2}>
          {c.steal && (
            <Reveal step={0} className="text-center">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-muted">Your best Steal</p>
              <p className="flex flex-wrap justify-center gap-x-3 text-3xl font-black sm:text-5xl">
                {c.steal.people.map((person) => (
                  <WrappedPerson key={person.id} person={person} size="lg" />
                ))}
              </p>
              <p className="mt-3 text-on-surface-muted">
                {c.steal.pickLabel}: drafted {c.steal.positionLabel}, finished {c.steal.rankLabel}. That's {c.steal.placesBeatenLabel} better than the draft thought.
              </p>
            </Reveal>
          )}
          {c.grade && (
            <Reveal step={1} className="mt-14">
              <WrappedStat value={c.grade.letter} label="Draft grade" tone={c.grade.letter.startsWith("A") ? "gold" : undefined} />
              <p className="mt-3 text-center text-lg">{c.grade.line}</p>
            </Reveal>
          )}
        </WrappedScene>
      )}
    </>
  );
}
