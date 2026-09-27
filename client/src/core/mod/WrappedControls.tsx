import { useState } from "react";
import { playerName, type MyWrappedResponse } from "@bingo/shared";
import { useMyWrapped, usePublishWrapped, useWrappedState } from "../../api/queries";
import { useDialogParts } from "../ui/useDialogParts";
import { Button } from "../ui/Button";
import { Card, Notice } from "../ui/Card";
import { formatGp } from "../ui/gp";

const minutes = (ms: number | null) => (ms === null ? "—" : ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${Math.round(ms / 60_000)} min`);

/**
 * Wrapped (CONTEXT.md) for a Finished Bingo: whether it's published, Publish / Re-publish (every Player's is computed
 * then and stored), and a preview of what it would say now. The story itself is its own page.
 */
export function WrappedControls({ slug }: { slug: string }) {
  const { Dialog, DialogHeader } = useDialogParts();
  const state = useWrappedState(slug);
  const publish = usePublishWrapped(slug);
  const [confirming, setConfirming] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const preview = useMyWrapped(slug, previewing);
  const [error, setError] = useState<string | null>(null);

  const published = state.data?.published ?? false;

  async function go() {
    setError(null);
    try {
      await publish.mutateAsync();
      setConfirming(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't publish Wrapped");
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-on-surface-subtle">Wrapped</p>
          <p className="text-lg font-semibold text-on-surface">
            {state.isLoading ? "…" : published ? `Published ${new Date(state.data!.publishedAt!).toLocaleString()}` : "Not published"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onPress={() => setPreviewing(true)}>
            Preview
          </Button>
          <Button size="sm" variant="primary" onPress={() => setConfirming(true)}>
            {published ? "Re-publish" : "Publish"}
          </Button>
        </div>
      </div>
      <p className="text-sm text-on-surface-muted">
        {published
          ? "Everyone who can see the bingo can read it. Its numbers stay as they were when published: re-publish to pick up late changes (a review undone, a point adjustment, late Wise Old Man updates)."
          : "Only mods can see it until it's published."}
        {state.data?.publishOnFinish && !published && " This bingo is set to publish it when it finishes."}
      </p>
      {error && !confirming && <Notice tone="danger">{error}</Notice>}

      <Dialog isOpen={confirming} onClose={() => setConfirming(false)}>
        <DialogHeader title={published ? "Re-publish Wrapped?" : "Publish Wrapped?"} onClose={() => setConfirming(false)} />
        <div className="space-y-3 p-5 text-sm">
          <p className="text-on-surface-muted">
            {published
              ? "Every Player's Wrapped is worked out again from the bingo as it is now, replacing what they see."
              : "Every Player's Wrapped is worked out from the bingo as it is now, and everyone who can see the bingo can read it."}
          </p>
          {error && <Notice tone="danger">{error}</Notice>}
          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" onPress={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" onPress={go} isDisabled={publish.isPending}>
              {publish.isPending ? "Working it out…" : published ? "Re-publish" : "Publish"}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog isOpen={previewing} onClose={() => setPreviewing(false)} size="lg">
        <DialogHeader title="Wrapped preview" subtitle={published ? "What's published" : "What it would say if published now"} onClose={() => setPreviewing(false)} />
        <div className="p-5 text-sm">
          {preview.isLoading ? (
            <p className="text-on-surface-subtle">Working it out…</p>
          ) : preview.error || !preview.data ? (
            <Notice tone="danger">Couldn't load Wrapped.</Notice>
          ) : (
            <PreviewSummary data={preview.data} />
          )}
        </div>
      </Dialog>
    </Card>
  );
}

function PreviewSummary({ data }: { data: MyWrappedResponse }) {
  const b = data.bingo;
  const m = b.moderation;
  const rows: [string, string][] = [
    ["Approved submissions", b.totalSubmissions.toLocaleString()],
    ["GP value", formatGp(b.totalGp)],
    ["Rarest drop", b.rarestDrop ? `${b.rarestDrop.itemName} (1 in ${Math.round(b.rarestDrop.luckOneIn!).toLocaleString()})` : "—"],
    ["Most reacted", b.mostReacted ? `${b.mostReacted.drop.itemName} (${b.mostReacted.reactions})` : "—"],
    ["Biggest steal", b.biggestSteal ? `${playerName(b.biggestSteal.player)}: picked ${b.biggestSteal.position}, finished ${b.biggestSteal.rank}` : "—"],
    ["Reviews", `${m.reviewed} · median ${minutes(m.medianReviewMs)} · fastest ${minutes(m.fastestReviewMs)}`],
  ];
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-on-surface-subtle">{k}</dt>
            <dd className="text-on-surface">{v}</dd>
          </div>
        ))}
      </dl>
      <ol className="space-y-1">
        {b.teams.map((t) => (
          <li key={t.teamId} className="flex items-center gap-2">
            <span className="num w-5 text-on-surface-subtle">{t.placement}</span>
            <span className="min-w-0 flex-1 truncate">{t.name}</span>
            <span className="num text-on-surface-muted">{t.points} pts</span>
            <span className="truncate text-xs text-on-surface-subtle">MVP {t.mvp ? playerName(t.mvp.player) : "—"}</span>
          </li>
        ))}
      </ol>
      <details>
        <summary className="cursor-pointer text-on-surface-subtle">Raw data</summary>
        <pre className="mt-2 max-h-80 overflow-auto rounded bg-background p-2 text-[11px]">{JSON.stringify(data, null, 2)}</pre>
      </details>
    </div>
  );
}
