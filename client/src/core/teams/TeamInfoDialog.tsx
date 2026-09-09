import { useState } from "react";
import type { TeamWithMembers } from "@bingo/shared";
import { useRenameTeam } from "../../api/queries";
import { Button } from "../ui/Button";
import { Dialog, DialogHeader } from "../ui/Dialog";
import { Field, Input } from "../ui/Field";
import { Notice } from "../ui/Card";
import { CrownIcon } from "../ui/icons";
import { avatarUrl, displayName } from "../ui/user";

/** Who's on a team. The captain can also rename it from here. */
export function TeamInfoDialog({ slug, team, isCaptain, onClose }: { slug: string; team: TeamWithMembers | null; isCaptain: boolean; onClose: () => void }) {
  return (
    <Dialog isOpen={team !== null} onClose={onClose}>
      {team && <TeamInfo slug={slug} team={team} isCaptain={isCaptain} onClose={onClose} />}
    </Dialog>
  );
}

function TeamInfo({ slug, team, isCaptain, onClose }: { slug: string; team: TeamWithMembers; isCaptain: boolean; onClose: () => void }) {
  const rename = useRenameTeam(slug);
  const [name, setName] = useState(team.name);
  const trimmed = name.trim();
  const dirty = trimmed !== team.name;

  return (
    <>
      <DialogHeader title={team.name} subtitle={`${team.members.length} ${team.members.length === 1 ? "member" : "members"}`} onClose={onClose} />
      <div className="space-y-5 p-5">
        {isCaptain && (
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (dirty && trimmed) rename.mutate({ teamId: team.id, name: trimmed });
            }}
          >
            <Field label="Team name" className="flex-1">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Button type="submit" variant="primary" isDisabled={!dirty || !trimmed || rename.isPending}>
              {rename.isPending ? "Saving…" : "Rename"}
            </Button>
          </form>
        )}
        {rename.error && <Notice tone="danger">{rename.error.message}</Notice>}
        <ul className="divide-y divide-line rounded-md border border-line">
          {team.members.map(({ user, isCaptain: memberIsCaptain }) => (
            <li key={user.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <img src={avatarUrl(user)} alt="" className="size-6 rounded-full" />
              <span className="truncate text-fg">{displayName(user)}</span>
              {memberIsCaptain && <CrownIcon size={14} className="shrink-0 text-warn" aria-label="Captain" />}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
