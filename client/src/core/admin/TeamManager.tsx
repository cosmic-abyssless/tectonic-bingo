import { useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { TEAM_NAME_MAX, type BingoShellResponse, type PublicUser, type RosterEntry, type Stage, type Team, type TeamWithMembers } from "@bingo/shared";
import { useBingo, queryKeys } from "../../api/queries";
import { adminQueryKeys, useCaptainCandidates } from "../../api/adminQueries";
import * as adminApi from "../../api/adminApi";
import { optimisticUpdate } from "../../api/optimistic";
import { displayName } from "../ui/user";
import { PlayerName } from "../tectonic/PlayerName";
import { Button, IconButton } from "../ui/Button";
import { Badge, Card, Notice } from "../ui/Card";
import { Disclosure } from "../ui/Disclosure";
import { Field, Input } from "../ui/Field";
import { SearchableSelect } from "../ui/SearchableSelect";
import { Select } from "../ui/Select";
import { CaptainEmblem } from "../ui/CaptainEmblem";
import { ColorInput } from "../ui/ColorInput";
import { TrashIcon, XIcon } from "../ui/icons";

// Forward-looking estimate while captains are still being assigned — teams
// don't have their non-captain members yet, so this is just
// totalParticipants / teamCount, not an actual roster count.
function teamSizeSummary(teamCount: number, totalParticipants: number): string | null {
  if (teamCount === 0 || totalParticipants === 0) return null;
  const base = Math.floor(totalParticipants / teamCount);
  const remainder = totalParticipants % teamCount;
  const teamWord = teamCount === 1 ? "team" : "teams";
  const participantWord = totalParticipants === 1 ? "participant" : "participants";
  let summary = `There will be ${teamCount} ${teamWord} of ${base} based on the ${totalParticipants} total ${participantWord}.`;
  if (remainder > 0) {
    const extraTeamWord = remainder === 1 ? "team" : "teams";
    summary += ` ${remainder} ${extraTeamWord} will have an extra player.`;
  }
  return summary;
}

const candidateLabel = (c: RosterEntry) => `${c.signup.rsn}${c.signup.rsnVerified ? " ✓" : ""}`;

// Removals drop the row from the cached shell right away and put it back if
// the server refuses, so the UI doesn't wait on the round trip.
function optimisticTeams(queryClient: QueryClient, slug: string, update: (teams: TeamWithMembers[]) => TeamWithMembers[], request: () => Promise<unknown>) {
  return optimisticUpdate<BingoShellResponse>(queryClient, queryKeys.bingo(slug), (shell) => ({ ...shell, teams: update(shell.teams) }), request);
}

type Member = TeamWithMembers["members"][number];

/**
 * Remove from Team's confirmation (CONTEXT.md "Team"): their Signup is Withdrawn, their Submissions and points stay with
 * the Team. A Captain or co-captain can only go once another member is named to take their role.
 */
function RemovalConfirm({
  team,
  member,
  reason,
  onReason,
  replacementId,
  onReplacement,
  onCancel,
  onConfirm,
}: {
  team: TeamWithMembers;
  member: Member;
  reason: string;
  onReason: (reason: string) => void;
  replacementId: string;
  onReplacement: (id: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const name = displayName(member.user);
  const role = member.isCaptain ? "Captain" : member.isCoCaptain ? "co-captain" : null;
  // A new co-captain can't be the Captain; a new Captain can be anyone else, the co-captain included (which leaves the
  // co-captain role empty).
  const replacements = team.members.filter((m) => m.user.id !== member.user.id && !(member.isCoCaptain && m.isCaptain));
  return (
    <Notice tone="warn">
      <div className="space-y-3">
        <p>
          Remove <strong>{name}</strong> from {team.name}? Their signup is withdrawn and they&apos;re told they were removed. Their submissions and
          points stay with the team.
        </p>
        {role && (
          <Field label={`New ${role}`} hint={member.isCaptain ? "Picking the co-captain leaves the co-captain role empty." : undefined} as="div">
            {replacements.length ? (
              <Select
                aria-label={`New ${role}`}
                value={replacementId}
                onChange={onReplacement}
                placeholder="Pick a member…"
                options={replacements.map((m) => ({ value: m.user.id, label: displayName(m.user) }))}
              />
            ) : (
              <p className="text-sm">Nobody else is on the team to take over, so {name} can&apos;t be removed yet.</p>
            )}
          </Field>
        )}
        <Field label="Reason (optional)" hint="Goes in the audit log.">
          <Input value={reason} onChange={(e) => onReason(e.target.value)} maxLength={500} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onPress={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" onPress={onConfirm} isDisabled={!!role && !replacementId}>
            Remove from team
          </Button>
        </div>
      </div>
    </Notice>
  );
}

function TeamCard({
  slug,
  team,
  stage,
  candidates,
  notLedByPair,
  onDelete,
}: {
  slug: string;
  team: TeamWithMembers;
  stage: Stage | undefined;
  candidates: RosterEntry[];
  notLedByPair: boolean;
  onDelete: () => void;
}) {
  const queryClient = useQueryClient();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Remove from Team (from Board revealed on) asks first: who's going, an optional reason, and for a Captain or
  // co-captain who takes over.
  const [removing, setRemoving] = useState<Member | null>(null);
  const [reason, setReason] = useState("");
  const [replacementId, setReplacementId] = useState("");
  // What's typed in the name field, for its character count, until the saved name changes (and the field with it).
  const [nameDraft, setNameDraft] = useState<{ of: string; value: string } | null>(null);
  const nameLength = (nameDraft?.of === team.name ? nameDraft.value : team.name).trim().length;
  const locked = stage === "complete";
  const teamsSet = stage === "reveal" || stage === "live";
  // Before Board revealed only a membership can be undone (no Captain, co-captain or drafted Player); from then on
  // Remove from Team takes anyone. Nothing changes once the bingo is Finished.
  const canRemove = (m: Member) => !locked && (teamsSet || (!m.isCaptain && !m.isCoCaptain && !m.isDrafted));

  // Every mutation here funnels through this so a failure (409 already on a
  // team, 400 empty password, ...) lands in the card instead of the console.
  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      // Membership changes also change who is free to captain a new team.
      queryClient.invalidateQueries({ queryKey: queryKeys.bingo(slug) });
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.captainCandidates(slug) });
      // And who the draft cuts (a Team is a share of the pool), with the Cut review worked out from it.
      queryClient.invalidateQueries({ queryKey: queryKeys.signupRoster(slug) });
    }
  }
  const update = (patch: Partial<Team>) => run(() => adminApi.updateTeam(slug, team.id, patch));
  const addMember = (userId: string) => run(() => adminApi.addTeamMember(slug, team.id, userId));
  function startRemoving(member: Member) {
    if (!teamsSet) {
      removeMember(member.user);
      return;
    }
    setRemoving(member);
    setReason("");
    setReplacementId("");
  }
  async function confirmRemoval() {
    if (!removing) return;
    const member = removing;
    setRemoving(null);
    await run(() => adminApi.removeTeamMember(slug, team.id, member.user.id, { reason: reason.trim() || null, replacementUserId: replacementId || null }));
  }
  const removeMember = (user: PublicUser) =>
    run(() =>
      optimisticTeams(
        queryClient,
        slug,
        (teams) => teams.map((t) => (t.id === team.id ? { ...t, members: t.members.filter((m) => m.user.id !== user.id) } : t)),
        () => adminApi.removeTeamMember(slug, team.id, user.id),
      ),
    );
  function rename(name: string) {
    if (name.trim() && name.trim() !== team.name) update({ name });
  }
  function setPassword(codeword: string) {
    if (codeword.trim() && codeword.trim() !== team.codeword) update({ codeword });
  }

  return (
    <Disclosure
      title={
        <>
          <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: team.color ?? "var(--color-outline-strong)" }} />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-on-surface">{team.name}</span>
          {notLedByPair && <Badge tone="warn">Not led by a pair</Badge>}
          <span className="num text-xs text-on-surface-subtle">
            {team.members.length} {team.members.length === 1 ? "member" : "members"}
          </span>
        </>
      }
    >
      <div className="space-y-3">
          {notLedByPair && (
            <Notice tone="warn">
              In a duo bingo a Team is led by a pair: its Captain and their duo partner. Delete this Team and create it again
              with a paired Captain. The Draft can't start until then.
            </Notice>
          )}
          <div className="flex items-end gap-2">
            <Field
              label={
                <span className="flex justify-between">
                  Name
                  <span className={`num ${nameLength > TEAM_NAME_MAX ? "text-danger" : "text-on-surface-subtle"}`}>
                    {nameLength}/{TEAM_NAME_MAX}
                  </span>
                </span>
              }
              className="flex-1"
            >
              <Input
                key={team.name}
                defaultValue={team.name}
                onChange={(e) => setNameDraft({ of: team.name, value: e.target.value })}
                onBlur={(e) => rename(e.target.value)}
                maxLength={TEAM_NAME_MAX}
                className="font-semibold"
              />
            </Field>
            <ColorInput
              aria-label={`${team.name} color`}
              value={team.color ?? "#6366f1"}
              onCommit={(color) => update({ color })}
              className="size-10 shrink-0 cursor-pointer rounded-md border border-outline-strong bg-background p-1"
            />
          </div>
          <Field label="Password" hint="Must be visible in every screenshot the team submits.">
            <Input key={team.codeword} defaultValue={team.codeword} onBlur={(e) => setPassword(e.target.value)} className="num" />
          </Field>
          <Field label={`Members (${team.members.length})`} as="div">
            <ul className="divide-y divide-outline rounded-md border border-outline">
              {team.members.map(({ user, isCaptain, isCoCaptain, isDrafted }) => (
                <li key={user.id} className="flex h-9 items-center gap-2 px-3 text-sm">
                  {isCaptain && <CaptainEmblem />}
                  {isCoCaptain && <CaptainEmblem co />}
                  <PlayerName userId={user.id} className="min-w-0 flex-1 truncate text-on-surface">
                    {displayName(user)}
                  </PlayerName>
                  {isDrafted && <span className="text-xs text-on-surface-subtle">drafted</span>}
                  {canRemove({ user, isCaptain, isCoCaptain, isDrafted }) && (
                    <IconButton label={`Remove ${displayName(user)}`} size="sm" onPress={() => startRemoving({ user, isCaptain, isCoCaptain, isDrafted })}>
                      <XIcon size={12} />
                    </IconButton>
                  )}
                </li>
              ))}
            </ul>
          </Field>
          {removing && <RemovalConfirm team={team} member={removing} reason={reason} onReason={setReason} replacementId={replacementId} onReplacement={setReplacementId} onCancel={() => setRemoving(null)} onConfirm={confirmRemoval} />}
          {!locked && (
            <Field label="Add member" hint="Someone signed up who isn't on a Team. Anyone else joins as a late signup, from the Signups tab." as="div">
              <SearchableSelect
                value=""
                onChange={(id) => id && addMember(id)}
                placeholder={candidates.length ? "Search signed-up players…" : "Everyone signed up is on a Team"}
                readOnly={candidates.length === 0}
                options={candidates.map((c) => ({ id: c.user.id, label: candidateLabel(c) }))}
              />
            </Field>
          )}
          {error && <Notice tone="danger">{error}</Notice>}
          {confirmingDelete ? (
            <Notice tone="danger">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>Delete {team.name}? Its members go back to the captain pool.</span>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onPress={() => setConfirmingDelete(false)}>
                    Cancel
                  </Button>
                  <Button variant="danger" size="sm" onPress={onDelete}>
                    Delete team
                  </Button>
                </div>
              </div>
            </Notice>
          ) : (
            <Button variant="ghost" size="sm" className="text-danger" onPress={() => setConfirmingDelete(true)}>
              <TrashIcon size={14} /> Delete team
            </Button>
          )}
      </div>
    </Disclosure>
  );
}

export function TeamManager({ slug }: { slug: string }) {
  const { data } = useBingo(slug);
  const { data: candidatesData } = useCaptainCandidates(slug);
  const queryClient = useQueryClient();
  const [selectedCaptainId, setSelectedCaptainId] = useState("");
  const [selectedCoCaptainId, setSelectedCoCaptainId] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidates = candidatesData?.candidates ?? [];
  const isDuo = data?.bingo.signupMode === "duo";
  const notLedByPairs = new Set(candidatesData?.teamsNotLedByPairs ?? []);
  // In a duo bingo a Team is led by a pair, so only a paired player can captain (their partner comes along).
  const captainOptions = isDuo ? candidates.filter((c) => c.pairing) : candidates;
  const teamCount = data?.teams.length ?? 0;
  const totalParticipants = teamCount + candidates.length;
  const summary = teamSizeSummary(teamCount, totalParticipants);

  const captain = candidates.find((c) => c.user.id === selectedCaptainId);
  // A paired captain's partner joins as co-captain — the server refuses any
  // other choice, so lock the select to them.
  const partner = captain?.pairing ? candidates.find((c) => c.user.id !== captain.user.id && c.pairing?.id === captain.pairing?.id) : undefined;
  const coCaptainId = partner?.user.id ?? selectedCoCaptainId;
  // Unpaired co-captain candidates only: a paired player can only lead the
  // team their partner captains.
  const coCaptainOptions = candidates.filter((c) => c.user.id !== selectedCaptainId && !c.pairing);

  function selectCaptain(id: string) {
    setSelectedCaptainId(id);
    if (id === selectedCoCaptainId) setSelectedCoCaptainId("");
  }

  async function createTeam() {
    if (!captain) return;
    setCreating(true);
    setError(null);
    try {
      await adminApi.createTeam(slug, { captainUserId: captain.user.id, coCaptainUserId: coCaptainId || null, name: `${displayName(captain.user)}'s Team` });
      setSelectedCaptainId("");
      setSelectedCoCaptainId("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.bingo(slug) }),
        queryClient.invalidateQueries({ queryKey: adminQueryKeys.captainCandidates(slug) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.signupRoster(slug) }),
      ]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create team");
    } finally {
      setCreating(false);
    }
  }
  // Deleting unmounts the card, so its error has to surface up here.
  async function deleteTeam(team: TeamWithMembers) {
    setError(null);
    try {
      await optimisticTeams(
        queryClient,
        slug,
        (teams) => teams.filter((t) => t.id !== team.id),
        () => adminApi.deleteTeam(slug, team.id),
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : `Failed to delete ${team.name}`);
    } finally {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.captainCandidates(slug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.signupRoster(slug) });
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      {data?.bingo.stage === "complete" && <Notice tone="info">This bingo is finished, so its Teams are locked. Move it back to Live to change them.</Notice>}
      <Card className="space-y-3 p-4">
        <div>
          <p className="text-sm font-medium text-on-surface">Create a team</p>
          {summary && <p className="mt-1 text-sm text-on-surface-muted">{summary}</p>}
        </div>
        {candidates.length === 0 ? (
          <p className="text-sm text-on-surface-subtle">No eligible signups — everyone who signed up is already on a team, or no one has signed up yet.</p>
        ) : captainOptions.length === 0 ? (
          <p className="text-sm text-on-surface-subtle">Nobody is paired yet. In a duo bingo a Team is led by a pair: pair players up on the Signups tab first.</p>
        ) : (
          <div className="space-y-3">
            <Field label="Captain" hint={isDuo ? "Only paired players: a Team is led by a pair, so their duo partner becomes co-captain." : undefined}>
              <SearchableSelect
                value={selectedCaptainId}
                onChange={selectCaptain}
                placeholder="Search signed-up players…"
                options={captainOptions.map((c) => ({ id: c.user.id, label: candidateLabel(c) }))}
              />
            </Field>
            <Field label="Co-captain" hint={isDuo ? "The Captain's duo partner. Shares the captain's draft and rename powers." : "Optional. Shares the captain's draft and rename powers."}>
              {/* Locked to a paired Captain's partner (always, in a duo bingo); otherwise optional, and "None" clears a pick. */}
              <SearchableSelect
                value={coCaptainId}
                onChange={setSelectedCoCaptainId}
                readOnly={!!partner || isDuo}
                placeholder={isDuo ? "Pick a Captain first" : "None — search to add one…"}
                options={
                  partner
                    ? [{ id: partner.user.id, label: candidateLabel(partner) }]
                    : isDuo
                      ? []
                      : [{ id: "", label: "None" }, ...coCaptainOptions.map((c) => ({ id: c.user.id, label: candidateLabel(c) }))]
                }
              />
            </Field>
            <Button variant="primary" onPress={createTeam} isDisabled={!selectedCaptainId || creating}>
              {creating ? "Creating…" : "Create team"}
            </Button>
          </div>
        )}
        {error && <Notice tone="danger">{error}</Notice>}
      </Card>

      <div className="space-y-3">
        {data?.teams.map((team) => (
          <TeamCard
            key={team.id}
            slug={slug}
            team={team}
            stage={data?.bingo.stage}
            candidates={candidates}
            notLedByPair={notLedByPairs.has(team.id)}
            onDelete={() => deleteTeam(team)}
          />
        ))}
      </div>
    </div>
  );
}
