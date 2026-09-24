import { useState } from "react";
import { useRenameTeam } from "../../../api/queries";
import { useTeamActivityModel } from "../../../headless/useTeamActivity";
import type { TeamModel } from "../../../headless/types";
import { Input } from "../../../core/ui/Field";
import { CaptainEmblem } from "../../../core/ui/CaptainEmblem";
import { PlayerName } from "../../../core/tectonic/PlayerName";
import { COMIC_FONT } from "../font";
import { ComicDialog, ComicDialogHeader } from "../ui/ComicDialog";
import { ComicButton } from "../ui/ComicButton";
import { CaptionBox, InkTag } from "../ui/CaptionBox";
import { useComic } from "../ui/useComic";
import { ComicField } from "../submission/ComicField";

/** The team roster and recent activity, plus the captain's rename field. */
export function TeamInfoDialog({ slug, team, onClose }: { slug: string; team: TeamModel | null; onClose: () => void }) {
  return (
    <ComicDialog isOpen={team !== null} onClose={onClose}>
      {team && <TeamDetails slug={slug} team={team} onClose={onClose} />}
    </ComicDialog>
  );
}

function TeamDetails({ slug, team, onClose }: { slug: string; team: TeamModel; onClose: () => void }) {
  const { colors } = useComic();
  const rename = useRenameTeam(slug);
  const [name, setName] = useState(team.name);
  const trimmed = name.trim();
  const dirty = trimmed !== team.name;
  const { entries: activity } = useTeamActivityModel(slug, team.id);

  return (
    <>
      <ComicDialogHeader title={team.name} subtitle={`Team · ${team.members.length} ${team.members.length === 1 ? "member" : "members"}`} onClose={onClose} />
      <div className="space-y-5 p-5">
        {team.canRename && (
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (dirty && trimmed) rename.mutate({ teamId: team.id, name: trimmed });
            }}
          >
            <ComicField label="Team name" className="flex-1">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </ComicField>
            <ComicButton type="submit" variant="primary" isDisabled={!dirty || !trimmed || rename.isPending}>
              {rename.isPending ? "Saving…" : "Rename"}
            </ComicButton>
          </form>
        )}
        {team.isLead && !team.canRename && (
          <p className="text-sm italic" style={{ color: colors.INK_SUBTLE }}>
            Team names are locked once the bingo is live.
          </p>
        )}
        {rename.error && (
          <CaptionBox tone="red" title="Rename failed">
            <p className="text-sm">{rename.error.message}</p>
          </CaptionBox>
        )}

        <ul className="grid gap-2 sm:grid-cols-2">
          {team.members.map((member, i) => (
            <li
              key={member.id}
              className="flex items-center gap-3 border-[3px] px-3 py-2"
              style={{
                borderColor: colors.LINE,
                background: colors.PAPER_RAISED,
                boxShadow: `3px 3px 0 ${colors.LINE}`,
                transform: `rotate(${i % 2 === 0 ? -0.6 : 0.6}deg)`,
              }}
            >
              <img src={member.avatarUrl} alt="" className="size-9 shrink-0 border-[2px] object-cover" style={{ borderColor: colors.LINE, background: colors.PAPER_ALT }} />
              <div className="min-w-0 flex-1">
                <span className="block truncate text-lg leading-none" style={{ fontFamily: COMIC_FONT, color: colors.INK }}>
                  <PlayerName userId={member.id}>{member.displayName}</PlayerName>
                </span>
                <span className="text-xs" style={{ color: colors.INK_SUBTLE }}>
                  {member.isCaptain ? "Captain" : member.isCoCaptain ? "Co-captain" : "Member"}
                </span>
              </div>
              {member.isCaptain && <CaptainEmblem scale={2} />}
              {member.isCoCaptain && <CaptainEmblem co scale={2} />}
            </li>
          ))}
        </ul>

        {activity.length > 0 && (
          <CaptionBox tone="paper" title="Recent activity">
            <ul className="space-y-1.5">
              {activity.map((entry) => (
                <li key={entry.id} className="flex items-start justify-between gap-3 text-sm">
                  <span style={{ color: colors.INK_BODY }}>
                    {/* Labels are server-built sentences that begin with the
                        actor's name — link that name to their profile. */}
                    {entry.actorId && entry.actorName && entry.label.startsWith(entry.actorName) ? (
                      <>
                        <PlayerName userId={entry.actorId}>{entry.actorName}</PlayerName>
                        {entry.label.slice(entry.actorName.length)}
                      </>
                    ) : (
                      entry.label
                    )}
                  </span>
                  <InkTag className="shrink-0">{entry.timeAgo}</InkTag>
                </li>
              ))}
            </ul>
          </CaptionBox>
        )}
      </div>
    </>
  );
}
