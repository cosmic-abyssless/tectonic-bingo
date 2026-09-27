import { useState, type ReactNode } from "react";
import { TIME_ZONE_REGIONS, type ApplyCutReviewResponse, type CutReviewPool, type CutReviewPreview } from "@bingo/shared";
import { useCutReview } from "../../api/queries";
import { useApplyCutReview, useCutReviewScore } from "../../api/adminQueries";
import { useDialogParts } from "../ui/useDialogParts";
import { Button } from "../ui/Button";
import { Notice } from "../ui/Card";
import { Select, type SelectOption } from "../ui/Select";
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

  // As proposed (nothing edited), the plan's own count stands; any edit is scored by the server.
  const scored = scoredChanges(rows);
  const edited = JSON.stringify(scored) !== JSON.stringify(scoredChanges(rowsFromPlan(plan.changes)));
  const score = useCutReviewScore(slug, scored, edited);
  const cutPlayers = edited ? score.query.data?.cutPlayers : plan.cutPlayers;

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
          This plan leaves {cutPlayers === undefined ? "…" : <span className="num">{cutPlayers}</span>} player{cutPlayers === 1 ? "" : "s"} cut
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
            <ChangeRow key={row.id} row={row} rows={rows} pool={pool} onChange={setRows} />
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

const REGION_LABEL = new Map(TIME_ZONE_REGIONS.map((r) => [r.key, r.label]));

function singleLabel(single: CutReviewPool["singles"][number]): string {
  const region = single.region && REGION_LABEL.get(single.region);
  return region ? `${single.rsn} · ${region}` : single.rsn;
}

const pairLabel = (pair: CutReviewPool["pairs"][number]) => pair.members.map((m) => m.rsn).join(" & ");

/** Everyone in the pool, for an added Team's Captain: a pair member brings their partner along as co-captain. */
function captainOptions(pool: CutReviewPool): SelectOption[] {
  return [
    ...pool.singles.map((s) => ({ value: s.userId, label: s.rsn, group: pool.pairs.length ? "Singles" : undefined })),
    ...pool.pairs.flatMap((p) =>
      p.members.map((m) => ({ value: m.userId, label: `${m.rsn} (with ${p.members.find((o) => o.userId !== m.userId)?.rsn ?? "partner"})`, group: "Pairs" })),
    ),
  ];
}

/** One change of the plan, by name, with its picks — or, once dropped, what it was and a way back. */
function ChangeRow({ row, rows, pool, onChange }: { row: CutReviewRow; rows: CutReviewRow[]; pool: CutReviewPool; onChange: (rows: CutReviewRow[]) => void }) {
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
    case "addTeam":
      summary = "Add a Team";
      controls = (
        <Select
          size="sm"
          aria-label="Captain of the new Team"
          placeholder="Pick its Captain…"
          value={row.captainUserId ?? ""}
          options={captainOptions(pool)}
          onChange={(userId) => onChange(setTeamPick(rows, row.id, userId))}
        />
      );
      break;
    case "removeTeam":
      summary = "Remove a Team";
      controls = (
        <Select
          size="sm"
          aria-label="Team to remove"
          placeholder="Pick the Team…"
          value={row.teamId ?? ""}
          options={pool.teams.map((t) => ({ value: t.teamId, label: `${t.name} (Captain ${t.captainRsn})` }))}
          onChange={(teamId) => onChange(setTeamPick(rows, row.id, teamId))}
        />
      );
      break;
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
