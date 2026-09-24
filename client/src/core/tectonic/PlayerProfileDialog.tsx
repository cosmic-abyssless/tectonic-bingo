import type { Key, ReactNode } from "react";
import { formatSignupAnswer, type PlayerProfile, type SignupQuestion } from "@bingo/shared";
import { useBingo, usePlayerProfile, useSignupQuestions } from "../../api/queries";
import { useDialogParts } from "../ui/useDialogParts";
import { Badge, Notice } from "../ui/Card";
import { SpinnerIcon } from "../ui/icons";
import { AccountTypeIcon } from "../ui/AccountTypeIcon";
import { discordName } from "../ui/user";
import { usePreference } from "../ui/preferences";
import { Tab, TabList, TabPanel, Tabs } from "../ui/Tabs";
import { AchievementIcons, Medal, PlaceBreakdown, TierBadge } from "./ProfileBadges";
import { formatRecordValue, isBingoEvent, podiumSummary, recordSummary } from "./profile";
import { CaCell, WomCell, formatWomStat } from "../signup/caStats";
import { useStatsRefreshingUserIds } from "../../context/WebSocketContext";
import { useAnswerViewer, visibleQuestions } from "../ui/answerVisibility";
import { PointsShareBreakdown } from "../stats/PointsShareBreakdown";
import { usePlayerContribution } from "../stats/usePlayerContribution";

/**
 * One player's card, in tabs: their Points share in this bingo, clan standing (tier, records, event
 * placements, CA, EHB), past bingos and — for mods and team leads — their signup answers. A tab with nothing
 * to show stays, dimmed. Fetches on open so it can be reached from any name on any page.
 */
export function PlayerProfileDialog({ slug, userId, onClose }: { slug: string; userId: string | null; onClose: () => void }) {
  const { Dialog } = useDialogParts();
  return (
    <Dialog isOpen={userId !== null} onClose={onClose} size="lg">
      {userId && <ProfileLoader slug={slug} userId={userId} onClose={onClose} />}
    </Dialog>
  );
}

function ProfileLoader({ slug, userId, onClose }: { slug: string; userId: string; onClose: () => void }) {
  const { DialogHeader } = useDialogParts();
  const { data, error } = usePlayerProfile(slug, userId);
  const { data: questionsData } = useSignupQuestions(slug);
  // Only the questions whose answers this viewer gets, so a hidden one doesn't show up as a blank row.
  const answerViewer = useAnswerViewer(slug);

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
        <div className="flex items-center gap-2 p-5 text-sm text-on-surface-muted">
          <SpinnerIcon /> Loading profile…
        </div>
      </>
    );
  }
  return <ProfileBody slug={slug} player={data.player} questions={visibleQuestions(questionsData?.questions ?? [], answerViewer)} onClose={onClose} />;
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-on-surface-subtle">{label}</div>
      <div className="num mt-0.5 truncate text-sm font-medium text-on-surface">{children}</div>
    </div>
  );
}

function ProfileBody({ slug, player, questions, onClose }: { slug: string; player: PlayerProfile; questions: SignupQuestion[]; onClose: () => void }) {
  const { DialogHeader } = useDialogParts();
  const statsRefreshing = useStatsRefreshingUserIds();
  const caLoading = statsRefreshing.has(player.user.id);
  const { data: shell } = useBingo(slug);
  // This bingo only exists once it has started; the answers only for mods, and for captains while scouting and
  // drafting (the server sends null otherwise). A tab that's there but has nothing to show is dimmed instead.
  const stage = shell?.bingo.stage;
  const showBingoTab = stage === "live" || stage === "complete";
  const showSignupTab = !!shell?.isMod || player.answers !== null;
  // The tab last picked, in any profile: flicking through players stays on the same one, unless it isn't here.
  const [savedTab, setTab] = usePreference("profileTab");
  const tab = (savedTab === "bingo" && !showBingoTab) || (savedTab === "signup" && !showSignupTab) ? "clan" : savedTab;
  const bingoContribution = usePlayerContribution(slug, player.user.id);
  const { profile } = player;
  const name = discordName(player.user);
  const podiums = profile ? podiumSummary(profile) : null;
  const recordPlaces = profile ? recordSummary(profile) : null;
  const records = profile ? [...profile.records].sort((a, b) => a.position - b.position || b.date.localeCompare(a.date)) : [];
  const events = profile ? [...profile.events].sort((a, b) => a.placement - b.placement) : [];
  const answerFor = (questionId: string) => player.answers?.find((a) => a.questionId === questionId)?.value;
  const hasAnswers = !!player.answers && questions.length > 0;

  return (
    <>
      <DialogHeader
        title={
          <>
            {/* Account type leads the name, like the in-game chat badge. */}
            <AccountTypeIcon accountType={player.accountType} size={26} className="mr-1 shrink-0" />
            <span className="truncate pr-2">{player.rsn ?? name}</span>
          </>
        }
        subtitle={
          player.rsn ? (
            <>
              Discord: {name} ·{" "}
              <a className="underline hover:opacity-70" href={`https://wiseoldman.net/players/${encodeURIComponent(player.rsn)}`} target="_blank" rel="noreferrer noopener">
                Wise Old Man
              </a>{" "}
              ·{" "}
              <a
                className="underline hover:opacity-70"
                href={`https://secure.runescape.com/m=hiscore_oldschool/hiscorepersonal?user1=${encodeURIComponent(player.rsn)}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                OSRS hiscores
              </a>
            </>
          ) : (
            "Not signed up for this bingo"
          )
        }
        onClose={onClose}
        action={profile && <AchievementIcons profile={profile} large />}
      />
      <div className="p-5">
        <Tabs selectedKey={tab} onSelectionChange={(key: Key) => setTab(String(key) as typeof savedTab)}>
          {/* One row that scrolls sideways on a phone, rather than wrapping to two. */}
          <TabList className="flex-nowrap! overflow-x-auto">
            {showBingoTab && (
              <Tab id="bingo" dimmed={!bingoContribution}>
                This bingo
              </Tab>
            )}
            <Tab id="clan" dimmed={!profile}>
              Clan
            </Tab>
            <Tab id="past" dimmed={player.pastBingoStats.length === 0}>
              Past bingos
            </Tab>
            {showSignupTab && (
              <Tab id="signup" dimmed={!hasAnswers}>
                Signup
              </Tab>
            )}
          </TabList>
          {showBingoTab && (
            <TabPanel id="bingo">
              {bingoContribution ? (
                <PointsShareBreakdown {...bingoContribution} />
              ) : (
                <Empty>While the bingo is live, stats only show for your own team.</Empty>
              )}
            </TabPanel>
          )}
          <TabPanel id="clan">
            <div className="space-y-6">
              {(player.caCurrent || player.caPeak || player.rsn || caLoading) && (
                <div className="grid grid-cols-2 gap-4">
                  <Stat label="Current CA">
                    <CaCell stats={player.caCurrent} loading={caLoading} />
                  </Stat>
                  <Stat label="Peak CA">
                    <CaCell stats={player.caPeak} loading={caLoading} />
                  </Stat>
                </div>
              )}
              {!profile ? (
                <p className="text-sm text-on-surface-muted">
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
                  {(player.womStats || caLoading) && (
                    <p className="text-xs text-on-surface-subtle">
                      <WomCell stats={player.womStats} field="ehb" loading={caLoading} /> EHB · <WomCell stats={player.womStats} field="ehp" loading={caLoading} /> EHP on Wise Old Man.
                    </p>
                  )}

                  <Section title={`Records held (${records.length})`} empty="No current clan records.">
                    {records.length > 0 && (
                      <table className="w-full text-sm">
                        <thead className="text-left text-xs text-on-surface-subtle">
                          <tr>
                            <th className="py-1 pr-3 font-medium">Place</th>
                            <th className="py-1 pr-3 font-medium">Boss</th>
                            <th className="py-1 pr-3 font-medium">Time</th>
                            <th className="py-1 pr-3 font-medium">Team</th>
                            <th className="py-1 font-medium">Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline">
                          {records.map((r, i) => (
                            <tr key={i}>
                              <td className="py-1.5 pr-3">
                                <Medal place={r.position} />
                              </td>
                              <td className="py-1.5 pr-3">
                                <span className="text-on-surface">{r.displayName}</span>
                                {r.category !== r.displayName && <span className="ml-1.5 text-xs text-on-surface-subtle">{r.category}</span>}
                              </td>
                              <td className="num py-1.5 pr-3 whitespace-nowrap">{formatRecordValue(r.value, r.valueType)}</td>
                              <td className="py-1.5 pr-3 text-on-surface-muted">{r.solo ? "Solo" : `${r.teamSize} players`}</td>
                              <td className="num py-1.5 whitespace-nowrap text-on-surface-muted">{new Date(r.date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </Section>

                  <Section title={`Event placements (${events.length})`} empty="No scored event placements yet.">
                    {events.length > 0 && (
                      <ul className="divide-y divide-outline text-sm">
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

            </div>
          </TabPanel>
          <TabPanel id="past">
            {player.pastBingoStats.length > 0 ? (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-on-surface-subtle">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Bingo</th>
                    <th className="py-1 pr-3 font-medium">Gained</th>
                    <th className="py-1 pr-3 font-medium">Team</th>
                    <th className="py-1 pr-3 font-medium">Total</th>
                    <th className="py-1 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline">
                  {player.pastBingoStats.map((p) => (
                    <tr key={p.competitionId}>
                      <td className="py-1.5 pr-3 text-on-surface">
                        {p.womId > 0 ? (
                          <a
                            href={`https://wiseoldman.net/competitions/${p.womId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="underline underline-offset-2 hover:text-on-surface"
                          >
                            {p.title}
                          </a>
                        ) : (
                          p.title
                        )}
                      </td>
                      <td className="num py-1.5 pr-3 whitespace-nowrap">
                        {formatWomStat(p.gained)} <span className="text-on-surface-subtle uppercase">{p.metric}</span>
                      </td>
                      <td className="num py-1.5 pr-3 whitespace-nowrap">{p.teamRank !== null ? `#${p.teamRank}` : <span className="text-on-surface-subtle">—</span>}</td>
                      <td className="num py-1.5 pr-3 whitespace-nowrap">#{p.totalRank}</td>
                      <td className="num py-1.5 whitespace-nowrap text-on-surface-muted">{new Date(p.startsAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty>No past bingos on record for this player.</Empty>
            )}
          </TabPanel>
          {showSignupTab && (
            <TabPanel id="signup">
              {hasAnswers ? (
                <dl className="space-y-2 text-sm">
                  {questions.map((q) => (
                    <div key={q.id}>
                      <dt className="text-xs text-on-surface-subtle">{q.prompt}</dt>
                      <dd className="text-on-surface">{formatSignupAnswer(q.type, answerFor(q.id)) || <span className="text-on-surface-subtle">—</span>}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <Empty>No signup answers to show.</Empty>
              )}
            </TabPanel>
          )}
        </Tabs>
      </div>
    </>
  );
}

function Empty({ children }: { children: string }) {
  return <p className="text-sm text-on-surface-subtle">{children}</p>;
}

function Section({ title, empty, children }: { title: string; empty?: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-on-surface-subtle">{title}</h3>
      {children || <p className="text-sm text-on-surface-subtle">{empty}</p>}
    </section>
  );
}
