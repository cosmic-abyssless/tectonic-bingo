import { useState } from "react";
import { useRenameTeam } from "../../api/queries";
import type { TeamModel } from "../../headless/types";
import { Button } from "../ui/Button";
import { Notice } from "../ui/Card";
import { Dialog, DialogHeader } from "../ui/Dialog";
import { Field, Input } from "../ui/Field";
import { CrownIcon } from "../ui/icons";

/** Who's on a team. The captain can also rename it from here. */
export function TeamInfoDialog({ slug, team, onClose }: { slug: string; team: TeamModel | null; onClose: () => void }) {
  return (
    <Dialog isOpen={team !== null} onClose={onClose}>
      {team && <TeamInfo slug={slug} team={team} onClose={onClose} />}
    </Dialog>
  );
}

function TeamInfo({ slug, team, onClose }: { slug: string; team: TeamModel; onClose: () => void }) {
  const rename = useRenameTeam(slug);
  const [name, setName] = useState(team.name);
  const trimmed = name.trim();
  const dirty = trimmed !== team.name;

  return (
    <>
      <DialogHeader title={team.name} subtitle={`${team.members.length} ${team.members.length === 1 ? "member" : "members"}`} onClose={onClose} />
      <div className="space-y-5 p-5">
        {team.canRename && (
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
          {team.members.map((member) => (
            <li key={member.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <img src={member.avatarUrl} alt="" className="size-6 rounded-full" />
              <span className="truncate text-fg">{member.displayName}</span>
              {member.isCaptain && <CrownIcon size={14} className="shrink-0 text-warn" aria-label="Captain" />}
              {member.isCoCaptain && <CrownIcon size={14} className="shrink-0 text-fg-subtle" aria-label="Co-captain" />}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
