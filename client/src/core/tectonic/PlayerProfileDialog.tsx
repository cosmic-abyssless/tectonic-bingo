import type { ReactNode } from "react";
import type { PlayerProfile, SignupQuestion } from "@bingo/shared";
import { usePlayerProfile, useSignupQuestions } from "../../api/queries";
import { Dialog, DialogHeader } from "../ui/Dialog";
import { Badge, Notice } from "../ui/Card";
import { SpinnerIcon } from "../ui/icons";
import { AccountTypeIcon } from "../ui/AccountTypeIcon";
import { displayName } from "../ui/user";
import { AchievementIcons, Medal, PlaceBreakdown, TierBadge } from "./ProfileBadges";
import { formatRecordValue, isBingoEvent, podiumSummary, recordSummary } from "./profile";

/**
 * One player's card: clan standing (tier, records, event placements), account
 * type, EHB and — for mods and team leads — their signup answers. Fetches on
 * open so it can be reached from any name on any page.
 */
export function PlayerProfileDialog({ slug, userId, onClose }: { slug: string; userId: string | null; onClose: () => void }) {
  return (
    <Dialog isOpen={userId !== null} onClose={onClose} size="lg">
      {userId && <ProfileLoader slug={slug} userId={userId} onClose={onClose} />}
    </Dialog>
  );
}

function ProfileLoader({ slug, userId, onClose }: { slug: string; userId: string; onClose: () => void }) {
  const { data, error } = usePlayerProfile(slug, userId);
  const { data: questionsData } = useSignupQuestions(slug);

  if (error) {
    return (
      <>
        <DialogHeader title="Player" onClose={onClose} />
        <div className="p-5">
          <Notice tone="danger">{error.message}</Notice>
        </div>
      </>
    );
  }
  if (!data) {
    return (
      <>
        <DialogHeader title="Player" onClose={onClose} />
        <div className="flex items-center gap-2 p-5 text-sm text-fg-muted">
          <SpinnerIcon /> Loading profile…
        </div>
      </>
    );
  }
  return <ProfileBody player={data.player} questions={questionsData?.questions ?? []} onClose={onClose} />;
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-fg-subtle">{label}</div>
      <div className="num mt-0.5 truncate text-sm font-medium text-fg">{children}</div>
    </div>
  );
}

function ProfileBody({ player, questions, onClose }: { player: PlayerProfile; questions: SignupQuestion[]; onClose: () => void }) {
  const { profile } = player;
  const name = displayName(player.user);
  const podiums = profile ? podiumSummary(profile) : null;
  const recordPlaces = profile ? recordSummary(profile) : null;
  const records = profile ? [...profile.records].sort((a, b) => a.position - b.position || b.date.localeCompare(a.date)) : [];
  const events = profile ? [...profile.events].sort((a, b) => a.placement - b.placement) : [];
  const answerFor = (questionId: string) => player.answers?.find((a) => a.questionId === questionId)?.value;

  return (
    <>
      <DialogHeader
        title={player.rsn ?? name}
        subtitle={player.rsn ? name : "Not signed up for this bingo"}
        onClose={onClose}
        action={
          profile && (
            <div className="flex items-center gap-3">
              <AchievementIcons profile={profile} large />
              <AccountTypeIcon accountType={player.accountType} />
            </div>
          )
        }
      />
      <div className="space-y-6 p-5">
        {!profile ? (
          <p className="text-sm text-fg-muted">
            {player.tectonicUnavailable ? "The clan API is unavailable right now, so clan standing can't be shown." : "No clan profile — this player isn't registered with the clan bot."}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4 sm:grid-cols-5">
              <Stat label="Tier">
                <TierBadge profile={profile} showRank={false} />
              </Stat>
              <Stat label="Clan rank">#{profile.rank}</Stat>
              <Stat label="Records">
                <PlaceBreakdown {...recordPlaces!} />
              </Stat>
              <Stat label="Podiums">
                <PlaceBreakdown {...podiums!} />
              </Stat>
              <Stat label="Bingo wins">{podiums!.bingoWins}</Stat>
            </div>
            {player.womStats && (
              <p className="text-xs text-fg-subtle">
                <span className="num">{Math.round(player.womStats.ehb).toLocaleString()}</span> EHB · <span className="num">{Math.round(player.womStats.ehp).toLocaleString()}</span> EHP on Wise Old Man.
              </p>
            )}

            <Section title={`Records held (${records.length})`} empty="No current clan records.">
              {records.length > 0 && (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-fg-subtle">
                    <tr>
                      <th className="py-1 pr-3 font-medium">Place</th>
                      <th className="py-1 pr-3 font-medium">Boss</th>
                      <th className="py-1 pr-3 font-medium">Time</th>
                      <th className="py-1 pr-3 font-medium">Team</th>
                      <th className="py-1 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {records.map((r, i) => (
                      <tr key={i}>
                        <td className="py-1.5 pr-3">
                          <Medal place={r.position} />
                        </td>
                        <td className="py-1.5 pr-3">
                          <span className="text-fg">{r.displayName}</span>
                          {r.category !== r.displayName && <span className="ml-1.5 text-xs text-fg-subtle">{r.category}</span>}
                        </td>
                        <td className="num py-1.5 pr-3 whitespace-nowrap">{formatRecordValue(r.value, r.valueType)}</td>
                        <td className="py-1.5 pr-3 text-fg-muted">{r.solo ? "Solo" : `${r.teamSize} players`}</td>
                        <td className="num py-1.5 whitespace-nowrap text-fg-muted">{new Date(r.date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

            <Section title={`Event placements (${events.length})`} empty="No scored event placements yet.">
              {events.length > 0 && (
                <ul className="divide-y divide-line text-sm">
                  {events.map((e, i) => (
                    <li key={i} className="flex items-center gap-2 py-1.5">
                      <Medal place={e.placement} className="shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{e.name}</span>
                      {isBingoEvent(e) && <Badge tone="info">Bingo</Badge>}
                      {e.solo && <Badge>Solo</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </>
        )}

        {player.answers && questions.length > 0 && (
          <Section title="Signup answers">
            <dl className="space-y-2 text-sm">
              {questions.map((q) => (
                <div key={q.id}>
                  <dt className="text-xs text-fg-subtle">{q.prompt}</dt>
                  <dd className="text-fg">{answerFor(q.id) || <span className="text-fg-subtle">—</span>}</dd>
                </div>
              ))}
            </dl>
          </Section>
        )}
      </div>
    </>
  );
}

function Section({ title, empty, children }: { title: string; empty?: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{title}</h3>
      {children || <p className="text-sm text-fg-subtle">{empty}</p>}
    </section>
  );
}
