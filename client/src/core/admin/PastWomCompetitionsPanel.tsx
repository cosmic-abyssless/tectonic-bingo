import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { WomPastCompetition } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { optimisticUpdate } from "../../api/optimistic";
import { adminQueryKeys, usePastWomCompetitions } from "../../api/adminQueries";
import { Button } from "../ui/Button";
import { Notice } from "../ui/Card";
import { Input } from "../ui/Field";

function AddCompetitionForm() {
  const queryClient = useQueryClient();
  const [womId, setWomId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    const parsed = Number(womId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setError("Enter a valid WOM competition id");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await adminApi.addPastWomCompetition(parsed);
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.pastWomCompetitions });
      setWomId("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to add the competition");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input aria-label="WOM competition id" placeholder="WOM competition id" value={womId} onChange={(e) => setWomId(e.target.value)} size="sm" className="max-w-xs" />
        <Button variant="primary" size="sm" onPress={add} isDisabled={!womId.trim() || saving}>
          {saving ? "Fetching…" : "Fetch & store"}
        </Button>
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
    </div>
  );
}

function RenameCompetitionForm({ competition, onDone }: { competition: WomPastCompetition; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(competition.title);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!title.trim()) {
      setError("Title must not be empty");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await optimisticUpdate<{ competitions: WomPastCompetition[] }>(
        queryClient,
        adminQueryKeys.pastWomCompetitions,
        (d) => ({ competitions: d.competitions.map((c) => (c.id === competition.id ? { ...c, title: title.trim() } : c)) }),
        () => adminApi.renamePastWomCompetition(competition.id, title.trim()),
      );
      onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to rename the competition");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input aria-label="Competition title" value={title} onChange={(e) => setTitle(e.target.value)} size="sm" className="min-w-0 flex-1" />
        <Button variant="primary" size="sm" onPress={save} isDisabled={!title.trim() || saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button variant="ghost" size="sm" onPress={onDone} isDisabled={saving}>
          Cancel
        </Button>
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
    </div>
  );
}

function CompetitionRow({ competition }: { competition: WomPastCompetition }) {
  const queryClient = useQueryClient();
  const [renaming, setRenaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!confirm(`Delete stored competition "${competition.title}"?`)) return;
    setError(null);
    try {
      await optimisticUpdate<{ competitions: WomPastCompetition[] }>(
        queryClient,
        adminQueryKeys.pastWomCompetitions,
        (d) => ({ competitions: d.competitions.filter((c) => c.id !== competition.id) }),
        () => adminApi.deletePastWomCompetition(competition.id),
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete the competition");
    }
  }

  const dateRange = `${new Date(competition.startsAt).toLocaleDateString()} – ${new Date(competition.endsAt).toLocaleDateString()}`;

  if (renaming) {
    return (
      <li className="px-4 py-3">
        <RenameCompetitionForm competition={competition} onDone={() => setRenaming(false)} />
      </li>
    );
  }

  return (
    <li className="space-y-1 px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-on-surface">
            {competition.womId > 0 ? (
              <a href={`https://wiseoldman.net/competitions/${competition.womId}`} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-on-surface">
                {competition.title}
              </a>
            ) : (
              competition.title
            )}
          </div>
          <div className="text-xs text-on-surface-muted">
            WOM #{competition.womId} · {competition.metric} · {dateRange} · {competition.participantCount} participants
            {competition.bingoId ? " · archived from a bingo" : " · added manually"}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="sm" onPress={() => setRenaming(true)}>
            Rename
          </Button>
          <Button variant="ghost" size="sm" className="text-danger" onPress={remove}>
            Delete
          </Button>
        </div>
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
    </li>
  );
}

export function PastWomCompetitionsPanel() {
  const { data, isLoading } = usePastWomCompetitions();
  const competitions = data?.competitions ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-on-surface-muted">
        Snapshots of Wise Old Man competitions — a bingo's own competition is archived automatically once it reaches Complete, or paste a competition id here for one that predates the platform.
      </p>
      <AddCompetitionForm />
      {isLoading ? (
        <p className="text-sm text-on-surface-muted">Loading…</p>
      ) : competitions.length === 0 ? (
        <p className="text-sm text-on-surface-subtle">No past competitions stored yet.</p>
      ) : (
        <ul className="divide-y divide-outline rounded-md border border-outline">
          {competitions.map((c) => (
            <CompetitionRow key={c.id} competition={c} />
          ))}
        </ul>
      )}
    </div>
  );
}
