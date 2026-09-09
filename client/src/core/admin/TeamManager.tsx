import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Team, User } from "@bingo/shared";
import { useBingo, queryKeys } from "../../api/queries";
import { adminQueryKeys, useCaptainCandidates } from "../../api/adminQueries";
import * as adminApi from "../../api/adminApi";
import { UserSearchInput } from "./UserSearchInput";
import { displayName } from "../ui/user";
import { Button } from "../ui/Button";
import { Card, Notice } from "../ui/Card";
import { Field, Input, Select } from "../ui/Field";

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

function TeamCard({ slug, team }: { slug: string; team: Team }) {
  const queryClient = useQueryClient();
  const [members, setMembers] = useState<User[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.bingo(slug) });

  async function addMember(user: User) {
    await adminApi.addTeamMember(slug, team.id, user.id);
    setMembers(null);
    invalidate();
  }
  async function update(patch: Partial<Team>) {
    setError(null);
    try {
      await adminApi.updateTeam(slug, team.id, patch);
      invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update team");
    }
  }
  function rename(name: string) {
    if (name.trim() && name.trim() !== team.name) update({ name });
  }
  function setPassword(codeword: string) {
    if (codeword.trim() && codeword.trim() !== team.codeword) update({ codeword });
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${team.name} color`}
          value={team.color ?? "#6366f1"}
          onChange={(e) => update({ color: e.target.value })}
          className="size-7 shrink-0 cursor-pointer rounded-full border-none bg-transparent"
        />
        <input
          aria-label="Team name"
          defaultValue={team.name}
          onBlur={(e) => rename(e.target.value)}
          className="flex-1 border-b border-transparent bg-transparent text-sm font-semibold text-fg outline-none focus:border-line-strong"
        />
      </div>
      <Field label="Password" hint="Must be visible in every screenshot the team submits.">
        <Input key={team.codeword} defaultValue={team.codeword} onBlur={(e) => setPassword(e.target.value)} className="num" />
      </Field>
      {error && <Notice tone="danger">{error}</Notice>}
      <Field label="Add member" as="div">
        <UserSearchInput scope={slug} onSelect={addMember} />
      </Field>
    </Card>
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
          <TeamCard key={team.id} slug={slug} team={team} />
        ))}
      </div>
    </div>
  );
}
