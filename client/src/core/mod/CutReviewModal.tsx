import { useState, type ReactNode } from "react";
import { TIME_ZONE_REGIONS, type ApplyCutReviewResponse, type CutReviewPool, type CutReviewPreview, type CutReviewScore } from "@bingo/shared";
import { useCutReview } from "../../api/queries";
import { useApplyCutReview, useCutReviewScore } from "../../api/adminQueries";
import { useDialogParts } from "../ui/useDialogParts";
import { Button } from "../ui/Button";
import { Notice } from "../ui/Card";
import { Select } from "../ui/Select";
import { SearchableSelect } from "../ui/SearchableSelect";
import { UndoIcon, XIcon } from "../ui/icons";
import {
  appliedChanges,
  partnerChoices,
  restoreConflicts,
  rowsFromPlan,
  scoredChanges,
  setDropped,
  setPartner,
  setSplit,
  setTeamPick,
  splitChoices,
  type CutReviewRow,
} from "./cutReview";

/**
 * The Cut review (CONTEXT.md "Cut review"), Admins only: the plan for cutting as few Players as possible, which the
 * admin edits (a different partner or pair, a Captain for an added Team, which Team to remove, or dropping a change)
 * and applies all at once. Applying with every change dropped is a deliberate "keep these cuts". `onApplied` runs once
 * it has; the move into the Draft continues from there.
 */
export function CutReviewModal({ slug, isOpen, onClose, onApplied }: { slug: string; isOpen: boolean; onClose: () => void; onApplied?: (result: ApplyCutReviewResponse) => void }) {
  const { Dialog, DialogHeader } = useDialogParts();
  return (
    <Dialog isOpen={isOpen} onClose={onClose} size="lg">
      {isOpen && (
        <>
          <DialogHeader title="Cut review" subtitle="The fewest Players the Draft has to cut, and the changes that get there" onClose={onClose} />
          {/* Mounted per opening, so each review starts from the plan as proposed. */}
          <CutReviewBody slug={slug} onClose={onClose} onApplied={onApplied} />
        </>
      )}
    </Dialog>
  );
}

function CutReviewBody({ slug, onClose, onApplied }: { slug: string; onClose: () => void; onApplied?: (result: ApplyCutReviewResponse) => void }) {
  const { data, isLoading, error } = useCutReview(slug);
  if (isLoading) return <p className="p-5 text-sm text-on-surface-subtle">Working out the plan…</p>;
  if (error || !data) {
    return (
      <div className="p-5">
        <Notice tone="danger">Couldn't work out the plan{error ? `: ${error.message}` : "."}</Notice>
      </div>
    );
  }
  return <CutReviewEditor slug={slug} preview={data} onClose={onClose} onApplied={onApplied} />;
}

function CutReviewEditor({ slug, preview, onClose, onApplied }: { slug: string; preview: CutReviewPreview; onClose: () => void; onApplied?: (result: ApplyCutReviewResponse) => void }) {
  const { plan, pool } = preview;
  const apply = useApplyCutReview(slug);
  // The rows start over whenever the plan itself changes (the roster moved, or a rejected apply refetched it): edits
  // made against the old roster can't be trusted.
  const planKey = JSON.stringify([plan.changes, pool]);
  const [state, setState] = useState(() => ({ key: planKey, rows: rowsFromPlan(plan.changes) }));
  if (state.key !== planKey) setState({ key: planKey, rows: rowsFromPlan(plan.changes) });
  const rows = state.key === planKey ? state.rows : rowsFromPlan(plan.changes);
  const setRows = (next: CutReviewRow[]) => setState({ key: planKey, rows: next });

  // As proposed (nothing edited), the plan's own count stands; any edit is scored by the server. Not while applying:
  // the roster is changing under the edits, and the plan (and with it the rows) is about to be refetched.
  const scored = scoredChanges(rows);
  const edited = JSON.stringify(scored) !== JSON.stringify(scoredChanges(rowsFromPlan(plan.changes)));
  const score = useCutReviewScore(slug, scored, edited && !apply.isPending);
  const counts: CutReviewScore | undefined = edited ? score.query.data : plan;
  const pickOptions = counts?.pickOptions ?? null;
  const openPick = rows.some((r) => !r.dropped && r.kind === "addTeam") ? "addTeam" : "removeTeam";

  const toApply = appliedChanges(rows);
  const keepCuts = rows.every((r) => r.dropped);

  async function submit() {
    if (!toApply) return;
    try {
      const result = await apply.mutateAsync(toApply);
      onApplied?.(result);
      onClose();
    } catch {
      // Shown below from apply.error; the plan refetches (useApplyCutReview), and the rows start over with it.
    }
  }

  return (
    <div className="space-y-4 p-5 text-sm">
      <div>
        <p className={`text-base font-semibold text-on-surface transition-opacity ${score.updating ? "opacity-50" : ""}`} aria-live="polite">
          <PlanCount counts={counts} openPick={openPick} />
        </p>
        <p className="text-on-surface-muted">
          <span className="num">{plan.cutPlayersNow}</span> cut as things stand. A pair counts as two.
        </p>
      </div>
      {edited && score.query.error && <Notice tone="danger">{score.query.error.message}</Notice>}

      {rows.length === 0 ? (
        <Notice tone="neutral">Nothing to change: every cut left is Unavoidable.</Notice>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <ChangeRow key={row.id} row={row} rows={rows} pool={pool} pickOptions={pickOptions} onChange={setRows} />
          ))}
        </ul>
      )}

      {apply.error && <Notice tone="danger">{apply.error.message} The plan has been refreshed against the current roster.</Notice>}
      {!toApply && <p className="text-on-surface-muted">Pick the Captain for an added Team, or which Team to remove, before applying.</p>}

      <div className="flex justify-end gap-2 pt-1">
        <Button size="sm" variant="ghost" onPress={onClose}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" onPress={submit} isDisabled={!toApply || apply.isPending}>
          {keepCuts ? "Keep these cuts" : "Apply"}
        </Button>
      </div>
    </div>
  );
}

/**
 * "This plan leaves N players cut" — or, while a Team change's pick is open and the picks don't all leave the same
 * number, the range, so it never promises a count only one pick delivers.
 */
function PlanCount({ counts, openPick }: { counts: CutReviewScore | undefined; openPick: "addTeam" | "removeTeam" }) {
  if (!counts) return <>This plan leaves … players cut</>;
  const { cutPlayers, cutPlayersMax } = counts;
  if (cutPlayersMax === cutPlayers) {
    return (
      <>
        This plan leaves <span className="num">{cutPlayers}</span> player{cutPlayers === 1 ? "" : "s"} cut
      </>
    );
  }
  return (
    <>
      This plan leaves <span className="num">{cutPlayers}</span>–<span className="num">{cutPlayersMax}</span> players cut, depending on{" "}
      {openPick === "addTeam" ? "who captains the new Team" : "which Team is removed"}
    </>
  );
}

// A Team pick's option, with how many players the plan leaves cut if it's the one picked.
const withCount = (label: string, cut: number | undefined) => (cut === undefined ? label : `${label} · leaves ${cut} cut`);

const REGION_LABEL = new Map(TIME_ZONE_REGIONS.map((r) => [r.key, r.label]));

function singleLabel(single: CutReviewPool["singles"][number]): string {
  const region = single.region && REGION_LABEL.get(single.region);
  return region ? `${single.rsn} · ${region}` : single.rsn;
}

const pairLabel = (pair: CutReviewPool["pairs"][number]) => pair.members.map((m) => m.rsn).join(" & ");

// Team names aren't unique (every new Team starts as "New Team"), so the Captain tells them apart.
const teamLabel = (team: CutReviewPool["teams"][number]) => `${team.name} (Captain ${team.captainRsn})`;

/**
 * Everyone in the pool, for an added Team's Captain (searched by name, it's the whole pool): a pair member brings
 * their partner along as co-captain.
 */
function captainOptions(pool: CutReviewPool, pickOptions: Record<string, number> | null = null): { id: string; label: string; group?: string }[] {
  return [
    ...pool.singles.map((s) => ({ id: s.userId, label: withCount(s.rsn, pickOptions?.[s.userId]), group: pool.pairs.length ? "Singles" : undefined })),
    ...pool.pairs.flatMap((p) =>
      p.members.map((m) => ({
        id: m.userId,
        label: withCount(`${m.rsn} (with ${p.members.find((o) => o.userId !== m.userId)?.rsn ?? "partner"})`, pickOptions?.[m.userId]),
        group: "Pairs",
      })),
    ),
  ];
}

/** One change of the plan, by name, with its picks — or, once dropped, what it was and a way back. */
function ChangeRow({
  row,
  rows,
  pool,
  pickOptions,
  onChange,
}: {
  row: CutReviewRow;
  rows: CutReviewRow[];
  pool: CutReviewPool;
  pickOptions: Record<string, number> | null;
  onChange: (rows: CutReviewRow[]) => void;
}) {
  const single = (userId: string) => pool.singles.find((s) => s.userId === userId);
  const conflict = restoreConflicts(rows, row.id);

  let summary: string;
  let controls: ReactNode;
  switch (row.kind) {
    case "pair": {
      const [a, b] = row.userIds.map((id) => single(id)?.rsn ?? "someone");
      summary = `Pair ${a} & ${b}`;
      const picker = (slot: 0 | 1) => (
        <Select
          size="sm"
          aria-label={slot === 0 ? "First partner" : "Second partner"}
          value={row.userIds[slot]}
          options={partnerChoices(rows, row.id, slot, pool).map((s) => ({ value: s.userId, label: singleLabel(s) }))}
          onChange={(userId) => onChange(setPartner(rows, row.id, slot, userId))}
        />
      );
      controls = (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          {picker(0)}
          <span className="text-on-surface-subtle">&</span>
          {picker(1)}
        </div>
      );
      break;
    }
    case "split": {
      const pair = pool.pairs.find((p) => p.pairingId === row.pairingId);
      summary = `Split ${pair ? pairLabel(pair) : "a pair"}`;
      controls = (
        <Select
          size="sm"
          aria-label="Pair to split"
          value={row.pairingId}
          options={splitChoices(rows, row.id, pool).map((p) => ({ value: p.pairingId, label: pairLabel(p) }))}
          onChange={(pairingId) => onChange(setSplit(rows, row.id, pairingId))}
        />
      );
      break;
    }
    case "addTeam": {
      const captain = captainOptions(pool).find((o) => o.id === row.captainUserId);
      summary = captain ? `Add a Team, Captain ${captain.label}` : "Add a Team";
      controls = (
        <SearchableSelect
          placeholder="Search for its Captain…"
          value={row.captainUserId ?? ""}
          options={captainOptions(pool, pickOptions)}
          onChange={(userId) => onChange(setTeamPick(rows, row.id, userId))}
        />
      );
      break;
    }
    case "removeTeam": {
      const team = pool.teams.find((t) => t.teamId === row.teamId);
      summary = team ? `Remove ${teamLabel(team)}` : "Remove a Team";
      controls = (
        <Select
          size="sm"
          aria-label="Team to remove"
          placeholder="Pick the Team…"
          value={row.teamId ?? ""}
          options={pool.teams.map((t) => ({ value: t.teamId, label: withCount(teamLabel(t), pickOptions?.[t.teamId]) }))}
          onChange={(teamId) => onChange(setTeamPick(rows, row.id, teamId))}
        />
      );
      break;
    }
  }

  const heading = { pair: "Pair two singles", split: "Split a pair", addTeam: "Add a Team", removeTeam: "Remove a Team" }[row.kind];
  return (
    <li className={`flex items-start gap-3 rounded-md border border-outline p-3 ${row.dropped ? "bg-surface-raised" : ""}`}>
      <div className="min-w-0 flex-1 space-y-1.5">
        {row.dropped ? (
          <>
            <p className="text-on-surface-subtle line-through">{summary}</p>
            {conflict && <p className="text-xs text-on-surface-subtle">Another change uses these players now.</p>}
          </>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-muted">{heading}</p>
            {controls}
          </>
        )}
      </div>
      {row.dropped ? (
        <Button size="sm" variant="ghost" onPress={() => onChange(setDropped(rows, row.id, false))} isDisabled={conflict}>
          <UndoIcon />
          Restore
        </Button>
      ) : (
        <Button size="sm" variant="ghost" onPress={() => onChange(setDropped(rows, row.id, true))} aria-label={`Drop: ${summary}`}>
          <XIcon />
          Drop
        </Button>
      )}
    </li>
  );
}
