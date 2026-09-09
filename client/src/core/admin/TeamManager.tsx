import { useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { BingoShellResponse, Team, TeamWithMembers, User } from "@bingo/shared";
import { useBingo, queryKeys } from "../../api/queries";
import { adminQueryKeys, useCaptainCandidates } from "../../api/adminQueries";
import * as adminApi from "../../api/adminApi";
import { optimisticUpdate } from "../../api/optimistic";
import { UserSearchInput } from "./UserSearchInput";
import { displayName } from "../ui/user";
import { Button, IconButton } from "../ui/Button";
import { Card, Notice } from "../ui/Card";
import { Disclosure } from "../ui/Disclosure";
import { Field, Input, Select } from "../ui/Field";
import { CrownIcon, TrashIcon, XIcon } from "../ui/icons";

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

// Removals drop the row from the cached shell right away and put it back if
// the server refuses, so the UI doesn't wait on the round trip.
function optimisticTeams(queryClient: QueryClient, slug: string, update: (teams: TeamWithMembers[]) => TeamWithMembers[], request: () => Promise<unknown>) {
  return optimisticUpdate<BingoShellResponse>(queryClient, queryKeys.bingo(slug), (shell) => ({ ...shell, teams: update(shell.teams) }), request);
}

function TeamCard({ slug, team, onDelete }: { slug: string; team: TeamWithMembers; onDelete: () => void }) {
  const queryClient = useQueryClient();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    }
  }
  const update = (patch: Partial<Team>) => run(() => adminApi.updateTeam(slug, team.id, patch));
  const addMember = (user: User) => run(() => adminApi.addTeamMember(slug, team.id, user.id));
  const removeMember = (user: User) =>
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
          <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: team.color ?? "var(--color-line-strong)" }} />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{team.name}</span>
          <span className="num text-xs text-fg-subtle">
            {team.members.length} {team.members.length === 1 ? "member" : "members"}
          </span>
        </>
      }
    >
      <div className="space-y-3">
          <div className="flex items-end gap-2">
            <Field label="Name" className="flex-1">
              <Input key={team.name} defaultValue={team.name} onBlur={(e) => rename(e.target.value)} className="font-semibold" />
            </Field>
            <input
              type="color"
              aria-label={`${team.name} color`}
              value={team.color ?? "#6366f1"}
              onChange={(e) => update({ color: e.target.value })}
              className="size-10 shrink-0 cursor-pointer rounded-md border border-line-strong bg-bg p-1"
            />
          </div>
          <Field label="Password" hint="Must be visible in every screenshot the team submits.">
            <Input key={team.codeword} defaultValue={team.codeword} onBlur={(e) => setPassword(e.target.value)} className="num" />
          </Field>
          <Field label={`Members (${team.members.length})`} as="div">
            <ul className="divide-y divide-line rounded-md border border-line">
              {team.members.map(({ user, isCaptain, isDrafted }) => (
                <li key={user.id} className="flex h-9 items-center gap-2 px-3 text-sm">
                  {isCaptain && <CrownIcon size={14} className="shrink-0 text-warn" aria-label="Captain" />}
                  <span className="min-w-0 flex-1 truncate text-fg">{displayName(user)}</span>
                  {isDrafted && <span className="text-xs text-fg-subtle">drafted</span>}
                  {!isCaptain && !isDrafted && (
                    <IconButton label={`Remove ${displayName(user)}`} size="sm" onPress={() => removeMember(user)}>
                      <XIcon size={12} />
                    </IconButton>
                  )}
                </li>
              ))}
            </ul>
          </Field>
          <Field label="Add member" as="div">
            <UserSearchInput scope={slug} onSelect={addMember} />
          </Field>
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
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidates = candidatesData?.candidates ?? [];
  const teamCount = data?.teams.length ?? 0;
  const totalParticipants = teamCount + candidates.length;
  const summary = teamSizeSummary(teamCount, totalParticipants);

  async function createTeam() {
    const candidate = candidates.find((c) => c.user.id === selectedCaptainId);
    if (!candidate) return;
    setCreating(true);
    setError(null);
    try {
      await adminApi.createTeam(slug, { captainUserId: candidate.user.id, name: `${displayName(candidate.user)}'s Team` });
      setSelectedCaptainId("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.bingo(slug) }),
        queryClient.invalidateQueries({ queryKey: adminQueryKeys.captainCandidates(slug) }),
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
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <Card className="space-y-3 p-4">
        <div>
          <p className="text-sm font-medium text-fg">Assign a captain</p>
          {summary && <p className="mt-1 text-sm text-fg-muted">{summary}</p>}
        </div>
        {candidates.length === 0 ? (
          <p className="text-sm text-fg-subtle">No eligible signups — everyone who signed up is already a captain, or no one has signed up yet.</p>
        ) : (
          <div className="flex items-start gap-2">
            <Select aria-label="Assign a captain" value={selectedCaptainId} onChange={(e) => setSelectedCaptainId(e.target.value)} className="flex-1">
              <option value="">Select a signed-up player…</option>
              {candidates.map((c) => (
                <option key={c.user.id} value={c.user.id}>
                  {c.signup.rsn}
                  {c.signup.rsnVerified ? " ✓" : ""} ({displayName(c.user)})
                </option>
              ))}
            </Select>
            <Button variant="primary" onPress={createTeam} isDisabled={!selectedCaptainId || creating} className="shrink-0">
              {creating ? "Creating…" : "Make captain"}
            </Button>
          </div>
        )}
        {error && <Notice tone="danger">{error}</Notice>}
      </Card>

      <div className="space-y-3">
        {data?.teams.map((team) => (
          <TeamCard key={team.id} slug={slug} team={team} onDelete={() => deleteTeam(team)} />
        ))}
      </div>
    </div>
  );
}
