import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys, useBingo } from "../../api/queries";
import { adminQueryKeys, useLateSignupMembers, useLateSignupRsns } from "../../api/adminQueries";
import * as adminApi from "../../api/adminApi";
import { Dialog, DialogHeader } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { Notice } from "../ui/Card";
import { Field, Input } from "../ui/Field";
import { SearchableSelect } from "../ui/SearchableSelect";
import { Select } from "../ui/Select";

/**
 * A Late signup (CONTEXT.md "Signup"), Admins only, from Signups closed until Finished: the clan member (the same
 * picker as a Member pick question), their RSN (their first clan RSN unless changed), and once the Draft has begun the
 * Team they join. While Signups are closed they go into the draft pool instead.
 */
export function LateSignupDialog({ slug, isOpen, onClose }: { slug: string; isOpen: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: bingoData } = useBingo(slug);
  const { data: membersData, isLoading: membersLoading } = useLateSignupMembers(slug, isOpen);
  const [userId, setUserId] = useState("");
  const [rsn, setRsn] = useState("");
  const [teamId, setTeamId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: rsnsData, isFetching: rsnsLoading } = useLateSignupRsns(slug, userId);

  const stage = bingoData?.bingo.stage;
  const needsTeam = stage !== "captains";
  const teams = bingoData?.teams ?? [];
  const members = membersData?.members ?? [];
  const member = members.find((m) => m.userId === userId);

  // The RSN starts as their first clan RSN (or the name they're known by, if the clan has none on file) each time a
  // different member is picked.
  useEffect(() => {
    if (!member || rsnsLoading) return;
    setRsn(rsnsData?.rsns[0] ?? (member.name !== member.discordName ? member.name : ""));
  }, [member, rsnsData, rsnsLoading]);

  function close() {
    setUserId("");
    setRsn("");
    setTeamId("");
    setError(null);
    onClose();
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await adminApi.createLateSignup(slug, { userId, rsn: rsn.trim(), teamId: needsTeam ? teamId : null });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.signupRoster(slug) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.bingo(slug) }),
        queryClient.invalidateQueries({ queryKey: adminQueryKeys.captainCandidates(slug) }),
      ]);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add the late signup");
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = !!userId && !!rsn.trim() && (!needsTeam || !!teamId) && !saving;

  return (
    <Dialog isOpen={isOpen} onClose={close}>
      <DialogHeader
        title="Add a late signup"
        subtitle={needsTeam ? "They join the Team you pick, outside the pick order." : "They go into the draft pool, drafted like anyone else."}
        onClose={close}
      />
      <div className="space-y-4 p-5">
        <Field label="Clan member" as="div">
          <SearchableSelect
            value={userId}
            onChange={setUserId}
            placeholder={membersLoading ? "Loading members…" : "Search by RSN or Discord name…"}
            readOnly={membersLoading}
            options={members.map((m) => ({ id: m.userId, label: m.name === m.discordName ? m.name : `${m.name} (${m.discordName})` }))}
          />
        </Field>
        <Field label="RSN" hint="Their first clan RSN. They're named by it everywhere in this bingo.">
          <Input value={rsn} onChange={(e) => setRsn(e.target.value)} maxLength={12} placeholder={rsnsLoading ? "Looking up their RSNs…" : undefined} />
        </Field>
        {needsTeam && (
          <Field label="Team" as="div">
            <Select aria-label="Team" value={teamId} onChange={setTeamId} placeholder="Pick a Team…" options={teams.map((t) => ({ value: t.id, label: t.name }))} />
          </Field>
        )}
        <p className="text-sm text-on-surface-muted">Their signup questions stay unanswered and their buy-in shows as not yet received.</p>
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onPress={close}>
            Cancel
          </Button>
          <Button variant="primary" onPress={submit} isDisabled={!canSubmit}>
            {saving ? "Adding…" : "Add late signup"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
