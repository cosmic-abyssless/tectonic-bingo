import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { STALE_PREVIEW_CODE, type BoardChangeKind, type BoardFieldChange, type BoardNodeChange, type ExclusivityRule, type PublishPreview, type RepriceableItem, type TeamScorePreview } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { ApiError } from "../../api/client";
import { adminQueryKeys, invalidateBoardDraft, usePublishPreview } from "../../api/adminQueries";
import { queryKeys } from "../../api/queries";
import { Badge, Notice } from "../ui/Card";
import { Button } from "../ui/Button";
import { Dialog, DialogHeader } from "../ui/Dialog";
import { Disclosure } from "../ui/Disclosure";
import { AlertIcon } from "../ui/icons";
import { toast } from "../ui/Toast";

const CHANGE: Record<BoardChangeKind, { label: string; tone: "ok" | "danger" | "info" }> = {
  added: { label: "Added", tone: "ok" },
  removed: { label: "Removed", tone: "danger" },
  changed: { label: "Changed", tone: "info" },
};

/**
 * The Publish screen (CONTEXT.md "Publish"): everything the Draft board changes, the Claims it stops counting, and every
 * Team's points before and after. Confirm publishes exactly the draft shown here; if it changed in the meantime the
 * server refuses, and the new changes are shown to look over instead.
 */
export function PublishBoardDialog({ slug, isOpen, onClose }: { slug: string; isOpen: boolean; onClose: () => void }) {
  return (
    <Dialog isOpen={isOpen} onClose={onClose} size="lg">
      {/* Mounted only while open, so every opening makes a fresh preview (the last one is dropped on close). */}
      {isOpen && <PublishContent slug={slug} onClose={onClose} />}
    </Dialog>
  );
}

function PublishContent({ slug, onClose }: { slug: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: preview, error: loadError, isFetching, refetch } = usePublishPreview(slug, true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  // Published, with Items whose Valued as changed: the Admin picks whether to re-price what was already priced.
  const [published, setPublished] = useState<PublishPreview | null>(null);

  function close() {
    setError(null);
    setStale(false);
    onClose();
  }

  async function publish(p: PublishPreview) {
    setPublishing(true);
    setError(null);
    try {
      await adminApi.publishBoardDraft(slug, p.revision);
      invalidateBoardDraft(queryClient, slug);
      void queryClient.invalidateQueries({ queryKey: queryKeys.board(slug) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bingo(slug) });
      toast({ title: "Board published", description: p.summary.join(", ") });
      if (p.repriceable.length > 0) setPublished(p);
      else close();
    } catch (e: unknown) {
      if (e instanceof ApiError && e.code === STALE_PREVIEW_CODE) {
        setStale(true);
        await refetch();
      } else {
        setError(e instanceof Error ? e.message : "Failed to publish");
      }
    } finally {
      setPublishing(false);
    }
  }

  if (published) return <RepriceStep slug={slug} items={published.repriceable} onClose={close} />;

  return (
    <>
      <DialogHeader title="Publish the board?" subtitle={preview ? preview.summary.join(" · ") : "What changes for everyone"} onClose={close} />
      <div className="space-y-5 p-5 text-sm">
        {stale && (
          <Notice tone="warn" icon={<AlertIcon size={14} />}>
            <strong>The draft changed while you were looking.</strong> Here is what it changes now: look it over again before publishing.
          </Notice>
        )}
        {loadError && <Notice tone="danger">{loadError instanceof Error ? loadError.message : "Couldn't work out what changes"}</Notice>}
        {!preview && !loadError && <p className="text-on-surface-muted">Working out what changes…</p>}
        {preview && (
          <>
            {preview.removedClaims.claims > 0 && (
              <Notice tone="warn" icon={<AlertIcon size={14} />}>
                <strong>
                  {preview.removedClaims.claims} Claim{preview.removedClaims.claims === 1 ? "" : "s"}
                  {preview.removedClaims.pending > 0 ? ` (${preview.removedClaims.pending} still pending)` : ""} {preview.removedClaims.claims === 1 ? "is" : "are"} on Items this removes
                </strong>{" "}
                ({preview.removedClaims.items.join(", ")}). They stop counting once it's published. The Submissions themselves are kept.
              </Notice>
            )}
            <ScorePreview teams={preview.teams} />
            <DiffView preview={preview} />
          </>
        )}
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="ghost" onPress={close}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" onPress={() => preview && publish(preview)} isDisabled={!preview || publishing || isFetching}>
            {publishing ? "Publishing…" : "Publish"}
          </Button>
        </div>
      </div>
    </>
  );
}

/** After a Publish that changed some Items' Valued as: re-price the Submissions already priced from the old one, or leave them. */
function RepriceStep({ slug, items, onClose }: { slug: string; items: RepriceableItem[]; onClose: () => void }) {
  const [done, setDone] = useState<Record<string, string>>({});
  async function reprice(item: RepriceableItem) {
    try {
      const { repriced } = await adminApi.repriceNodeClaims(slug, item.nodeId);
      setDone((d) => ({ ...d, [item.nodeId]: `Re-priced ${repriced} submission${repriced === 1 ? "" : "s"}` }));
    } catch (e: unknown) {
      setDone((d) => ({ ...d, [item.nodeId]: e instanceof Error ? e.message : "Couldn't re-price" }));
    }
  }
  return (
    <>
      <DialogHeader title="Board published" subtitle="Re-price the submissions already made?" onClose={onClose} />
      <div className="space-y-3 p-5 text-sm text-on-surface-muted">
        <p>
          These Items' Valued as changed. Submissions already made keep the Drop value they were given unless you re-price them, which prices them again with the new value at
          today's prices (only that Item's claims). New submissions get the new value either way.
        </p>
        <ul className="divide-y divide-outline rounded-md border border-outline">
          {items.map((item) => (
            <li key={item.nodeId} className="flex items-center justify-between gap-3 px-3 py-2">
              <span>
                <span className="text-on-surface">{item.name}</span>
                {item.tileName && <span className="text-on-surface-subtle"> · {item.tileName}</span>}
                <span className="text-xs text-on-surface-subtle"> ({item.submissions} priced)</span>
              </span>
              {done[item.nodeId] ? (
                <span className="text-xs">{done[item.nodeId]}</span>
              ) : (
                <Button size="sm" onPress={() => reprice(item)}>
                  Re-price {item.submissions}
                </Button>
              )}
            </li>
          ))}
        </ul>
        <div className="flex justify-end pt-1">
          <Button size="sm" variant="primary" onPress={onClose}>
            Done
          </Button>
        </div>
      </div>
    </>
  );
}

function ScorePreview({ teams }: { teams: TeamScorePreview[] }) {
  return (
    <section className="space-y-2">
      <h3 className="font-semibold text-on-surface">Scores</h3>
      <p className="text-on-surface-muted">
        Publishing rescores every Team from its approved Claims against the new board, so points follow the new points, requirements, gates, line bonuses and Exclusive Item rules
        straight away. Manual adjustments stay as they are. Points share isn't previewed.
      </p>
      {teams.length === 0 ? (
        <p className="text-on-surface-subtle">No Teams yet, so no scores move.</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-on-surface-subtle">
              <th className="pb-1 font-medium">Team</th>
              <th className="pb-1 text-right font-medium">Before</th>
              <th className="pb-1 text-right font-medium">After</th>
              <th className="pb-1 pl-4 font-medium">Complete</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline">
            {teams.map((t) => {
              const delta = t.after - t.before;
              return (
                <tr key={t.teamId} className="align-top">
                  <td className="py-1.5">
                    <span className="inline-flex items-center gap-1.5">
                      {t.color && <span className="size-2.5 rounded-full" style={{ backgroundColor: t.color }} />}
                      {t.teamName}
                    </span>
                  </td>
                  <td className="num py-1.5 text-right">{t.before}</td>
                  <td className="num py-1.5 text-right">
                    {t.after}
                    {delta !== 0 && <span className={`ml-1 text-xs ${delta > 0 ? "text-ok" : "text-danger"}`}>({delta > 0 ? `+${delta}` : delta})</span>}
                  </td>
                  <td className="py-1.5 pl-4 text-xs text-on-surface-muted">
                    {t.gained.length === 0 && t.lost.length === 0 && "No change"}
                    {t.gained.map((c) => (
                      <div key={`g${c.id}`} className="text-ok">
                        + {c.tileName ? `${c.tileName} · ${c.name}` : `${c.name} (whole Tile)`}
                      </div>
                    ))}
                    {t.lost.map((c) => (
                      <div key={`l${c.id}`} className="text-danger">
                        − {c.tileName ? `${c.tileName} · ${c.name}` : `${c.name} (whole Tile)`}
                      </div>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Fields({ fields }: { fields: BoardFieldChange[] }) {
  if (fields.length === 0) return null;
  return (
    <ul className="mt-1 space-y-0.5 text-xs text-on-surface-muted">
      {fields.map((f, i) => (
        <li key={i}>
          <span className="text-on-surface">{f.field}:</span> {f.before ? <span className="line-through decoration-on-surface-subtle">{f.before}</span> : null}
          {f.before && f.after ? " → " : null}
          {f.after ? <span className="text-on-surface">{f.after}</span> : f.before ? " (cleared)" : null}
        </li>
      ))}
    </ul>
  );
}

function NodeRow({ node }: { node: BoardNodeChange }) {
  return (
    <li className="pl-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={CHANGE[node.change].tone}>{CHANGE[node.change].label}</Badge>
        <span className="text-on-surface-subtle">{node.path.length ? `${node.path.join(" › ")} › ` : ""}</span>
        <span className="text-on-surface">{node.name}</span>
        {node.summary && <span className="text-xs text-on-surface-subtle">({node.summary})</span>}
      </div>
      <Fields fields={node.fields} />
    </li>
  );
}

function describeRule(rule: ExclusivityRule): string {
  return `${rule.label} (one ${rule.scope} only): ${rule.itemNames.join(", ")}`;
}

function DiffView({ preview }: { preview: PublishPreview }) {
  const { diff } = preview;
  const nothing = diff.tiles.length + diff.lines.length + diff.categories.length === 0 && !diff.exclusivityRules && !diff.rulesMarkdown;
  return (
    <section className="space-y-3">
      <h3 className="font-semibold text-on-surface">What changes</h3>
      {nothing && <p className="text-on-surface-subtle">Nothing: the draft is the same as the Published board.</p>}
      {diff.tiles.length > 0 && (
        <ul className="space-y-3">
          {diff.tiles.map((tile) => (
            <li key={tile.tileId} className="rounded-md border border-outline p-3">
              <div className="flex items-center gap-2">
                <Badge tone={CHANGE[tile.change].tone}>{CHANGE[tile.change].label}</Badge>
                <span className="font-medium text-on-surface">{tile.name}</span>
              </div>
              <Fields fields={tile.fields} />
              {tile.nodes.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {tile.nodes.map((n) => (
                    <NodeRow key={`${n.change}${n.nodeId}`} node={n} />
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      {diff.lines.length > 0 && (
        <div>
          <p className="font-medium text-on-surface">Lines</p>
          <ul className="space-y-1.5">
            {diff.lines.map((l) => (
              <li key={l.lineId}>
                <Badge tone={CHANGE[l.change].tone}>{CHANGE[l.change].label}</Badge> <span className="text-on-surface">{l.name}</span>
                <Fields fields={l.fields} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {diff.categories.length > 0 && (
        <div>
          <p className="font-medium text-on-surface">Categories</p>
          <ul className="space-y-1.5">
            {diff.categories.map((c) => (
              <li key={c.categoryId}>
                <Badge tone={CHANGE[c.change].tone}>{CHANGE[c.change].label}</Badge> <span className="text-on-surface">{c.name}</span>
                <Fields fields={c.fields} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {diff.exclusivityRules && (
        <Disclosure variant="nested" defaultExpanded title={<span className="flex-1 font-medium text-on-surface">Exclusive Item rules changed</span>}>
          <div className="grid gap-3 text-xs sm:grid-cols-2">
            <RuleList title="Before" rules={diff.exclusivityRules.before} />
            <RuleList title="After" rules={diff.exclusivityRules.after} />
          </div>
        </Disclosure>
      )}
      {diff.rulesMarkdown && (
        <Disclosure variant="nested" title={<span className="flex-1 font-medium text-on-surface">Rules text changed</span>}>
          <div className="grid gap-3 text-xs sm:grid-cols-2">
            <TextBlock title="Before" text={diff.rulesMarkdown.before} />
            <TextBlock title="After" text={diff.rulesMarkdown.after} />
          </div>
        </Disclosure>
      )}
    </section>
  );
}

function RuleList({ title, rules }: { title: string; rules: ExclusivityRule[] }) {
  return (
    <div>
      <p className="mb-1 font-medium text-on-surface-muted">{title}</p>
      {rules.length === 0 ? <p className="text-on-surface-subtle">None</p> : <ul className="space-y-1">{rules.map((r) => <li key={r.id}>{describeRule(r)}</li>)}</ul>}
    </div>
  );
}

function TextBlock({ title, text }: { title: string; text: string | null }) {
  return (
    <div>
      <p className="mb-1 font-medium text-on-surface-muted">{title}</p>
      <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-md border border-outline bg-background p-2 font-mono">{text || "(none)"}</pre>
    </div>
  );
}

/** Asks before throwing the draft away (CONTEXT.md "Discard"), naming who changed it last. */
export function DiscardBoardDialog({ slug, isOpen, lastChangedBy, onClose }: { slug: string; isOpen: boolean; lastChangedBy: string | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [discarding, setDiscarding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function discard() {
    setDiscarding(true);
    setError(null);
    try {
      await adminApi.discardBoardDraft(slug);
      invalidateBoardDraft(queryClient, slug);
      queryClient.removeQueries({ queryKey: adminQueryKeys.publishPreview(slug) });
      toast({ title: "Unpublished changes discarded" });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to discard");
    } finally {
      setDiscarding(false);
    }
  }

  return (
    <Dialog isOpen={isOpen} onClose={onClose}>
      <DialogHeader title="Discard the unpublished changes?" onClose={onClose} />
      <div className="space-y-3 p-5 text-sm">
        <p className="text-on-surface-muted">
          Every board change not yet published{lastChangedBy ? ` (the last by ${lastChangedBy})` : ""} is thrown away, for every Admin, and the editor goes back to the Published board.
          Nothing Players see changes. Pictures uploaded only to the draft are deleted.
        </p>
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="ghost" onPress={onClose}>
            Cancel
          </Button>
          <Button size="sm" variant="danger" onPress={discard} isDisabled={discarding}>
            {discarding ? "Discarding…" : "Discard changes"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
