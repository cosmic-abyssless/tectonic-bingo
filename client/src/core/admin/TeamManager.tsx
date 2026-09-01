import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Team, User } from "@bingo/shared";
import { useBingo, queryKeys } from "../../api/queries";
import { adminQueryKeys, useCaptainCandidates } from "../../api/adminQueries";
import * as adminApi from "../../api/adminApi";
import { UserSearchInput } from "./UserSearchInput";
import { displayName } from "../ui/user";

function TeamCard({ slug, team }: { slug: string; team: Team }) {
  const queryClient = useQueryClient();
  const [members, setMembers] = useState<User[] | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.bingo(slug) });

  async function addMember(user: User) {
    await adminApi.addTeamMember(slug, team.id, user.id);
    setMembers(null);
    invalidate();
  }
  async function recolor(hex: string) {
    await adminApi.updateTeam(slug, team.id, { color: hex });
    invalidate();
  }
  async function rename(name: string) {
    if (name && name !== team.name) await adminApi.updateTeam(slug, team.id, { name });
    invalidate();
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <input type="color" value={team.color ?? "#6366f1"} onChange={(e) => recolor(e.target.value)} className="w-7 h-7 rounded-full border-none cursor-pointer bg-transparent shrink-0" />
        <input defaultValue={team.name} onBlur={(e) => rename(e.target.value)} className="flex-1 bg-transparent text-white font-semibold text-sm focus:outline-none border-b border-transparent focus:border-slate-600" />
        <span className="text-xs text-slate-500 font-mono shrink-0">{team.codeword}</span>
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">Add member</label>
        <UserSearchInput scope={slug} onSelect={addMember} />
      </div>
    </div>
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
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
        <p className="text-sm font-medium text-slate-300 mb-2">Assign a captain</p>
        {candidates.length === 0 ? (
          <p className="text-sm text-slate-500">No eligible signups — everyone who signed up is already a captain, or no one has signed up yet.</p>
        ) : (
          <div className="flex items-start gap-2">
            <select
              value={selectedCaptainId}
              onChange={(e) => setSelectedCaptainId(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-600 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            >
              <option value="">Select a signed-up player…</option>
              {candidates.map((c) => (
                <option key={c.user.id} value={c.user.id}>
                  {c.signup.rsn} ({displayName(c.user)})
                </option>
              ))}
            </select>
            <button
              onClick={createTeam}
              disabled={!selectedCaptainId || creating}
              className="text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-md px-4 py-2 transition-colors cursor-pointer shrink-0"
            >
              {creating ? "Creating…" : "Make captain"}
            </button>
          </div>
        )}
        {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
      </div>

      <div className="space-y-3">
        {data?.teams.map((team) => (
          <TeamCard key={team.id} slug={slug} team={team} />
        ))}
      </div>
    </div>
  );
}
