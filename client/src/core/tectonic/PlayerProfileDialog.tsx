import type { ReactNode } from "react";
import type { AccountType, SignupAnswer, SignupQuestion, TectonicProfile, WomPlayerStats } from "@bingo/shared";
import { Dialog, DialogHeader } from "../ui/Dialog";
import { Badge } from "../ui/Card";
import { AccountTypeIcon } from "../ui/AccountTypeIcon";
import { AchievementIcons, TierBadge } from "./ProfileBadges";
import { formatRecordValue, isBingoEvent, podiumSummary } from "./profile";

export interface ProfilePlayer {
  rsn: string;
  discordName: string;
  accountType: AccountType | null;
  womStats: WomPlayerStats | null;
  profile: TectonicProfile | null;
  answers: SignupAnswer[] | null; // null when the viewer may not see them
}

/** Everything the pool table can't fit: full records, event placements, answers. */
export function PlayerProfileDialog({ player, questions, onClose }: { player: ProfilePlayer | null; questions: SignupQuestion[]; onClose: () => void }) {
  return (
    <Dialog isOpen={player !== null} onClose={onClose} size="lg">
      {player && <ProfileBody player={player} questions={questions} onClose={onClose} />}
    </Dialog>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-fg-subtle">{label}</div>
      <div className="num mt-0.5 truncate text-sm font-medium text-fg">{children}</div>
    </div>
  );
}

function ProfileBody({ player, questions, onClose }: { player: ProfilePlayer; questions: SignupQuestion[]; onClose: () => void }) {
  const { profile } = player;
  const podiums = profile ? podiumSummary(profile) : null;
  const records = profile ? [...profile.records].sort((a, b) => b.date.localeCompare(a.date)) : [];
  const events = profile ? [...profile.events].sort((a, b) => a.placement - b.placement) : [];
  const answerFor = (questionId: string) => player.answers?.find((a) => a.questionId === questionId)?.value;

  return (
    <>
      <DialogHeader
        title={player.rsn}
        subtitle={player.discordName}
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
          <p className="text-sm text-fg-muted">No clan profile — this player isn't registered with the clan bot, or the clan API was unavailable.</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
              <Stat label="Tier">
                <TierBadge profile={profile} showRank={false} />
              </Stat>
              <Stat label="Clan rank">#{profile.rank}</Stat>
              <Stat label="Records">{profile.records.length}</Stat>
              <Stat label="Podiums">
                {podiums!.total}
                <span className="ml-1 text-xs font-normal text-fg-subtle">
                  {podiums!.first}/{podiums!.second}/{podiums!.third}
                </span>
              </Stat>
              <Stat label="Bingo wins">{podiums!.bingoWins}</Stat>
              <Stat label="Combat ach.">{profile.combatAchievementCount.toLocaleString()}</Stat>
            </div>
            {player.womStats && <p className="text-xs text-fg-subtle">{Math.round(player.womStats.ehb).toLocaleString()} EHB on Wise Old Man.</p>}

            <Section title={`Records held (${records.length})`} empty="No current clan records.">
              {records.length > 0 && (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-fg-subtle">
                    <tr>
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
                      <span className="num w-8 shrink-0 font-medium text-fg">#{e.placement}</span>
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
