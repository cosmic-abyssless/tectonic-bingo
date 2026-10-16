import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { effectiveEffortBosses, WOM_BOSS_NAMES, type BoardEffortBossesResponse, type EffortBoss, type WomBossMetric } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { adminQueryKeys, useBoardEffortBosses } from "../../api/adminQueries";
import { Button, IconButton } from "../ui/Button";
import { Notice } from "../ui/Card";
import { Field } from "../ui/Field";
import { SearchCombo } from "../ui/SearchCombo";
import { TextButton } from "../ui/TextButton";
import { PlusIcon, XIcon } from "../ui/icons";

/** A boss's name as a chip shows it: Wise Old Man's, with a capital ("The Gauntlet"). */
function bossName(metric: string): string {
  const name = WOM_BOSS_NAMES[metric as WomBossMetric] ?? metric;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

const ALL_BOSSES = (Object.keys(WOM_BOSS_NAMES) as WomBossMetric[])
  .map((metric) => ({ metric, name: bossName(metric) }))
  .sort((a, b) => a.name.localeCompare(b.name));

/** One chip: a boss on, where it comes from, and what pressing it does. */
interface Chip {
  metric: string;
  /** "from items", "on every Part", "added", "from the Tile", or for a removed one why it's off. */
  note: string;
  removed: boolean;
  /** ✕ on a boss that's on, "restore" on a removed one. Absent when it can't be changed here. */
  action?: { label: string; run: () => Promise<BoardEffortBossesResponse> };
}

/**
 * A Tile's or a Part's Effort bosses (CONTEXT.md "Effort"), in the board editor: the Wise Old Man bosses its Effort is
 * counted at, as chips. Derived ones ("from items", the bosses that drop its Items) come off with ✕, which writes a
 * remove; added ones come off with ✕, which drops the add; a removed derived one stays, struck through, with "restore".
 * "+ Boss" adds any boss Wise Old Man measures. On a Tile, the changes apply to every Part, and each Part's resulting
 * bosses are listed under it. Saved to the Draft board as soon as they change, like Tags, and published with it.
 */
export function EffortBossesField({
  slug,
  owner,
  tileId,
  parts,
  locked,
}: {
  slug: string;
  owner: adminApi.TagOwner;
  /** The Tile the owner is (or is a Part of). */
  tileId: string;
  /** On a Tile: its Parts, to list what each ends up with. */
  parts?: { id: string; label: string | null }[];
  locked: boolean;
}) {
  const queryClient = useQueryClient();
  const { data } = useBoardEffortBosses(slug);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = data?.bosses ?? [];
  const derivedOf = (partId: string) => data?.derived.find((d) => d.partId === partId)?.metrics ?? [];
  const tileRows = rows.filter((r) => r.tileId === tileId);
  const partRows = (partId: string) => rows.filter((r) => r.partId === partId);
  const effectiveOf = (partId: string) => effectiveEffortBosses(derivedOf(partId), tileRows, partRows(partId));

  // Each change answers with the board's Effort bosses; the "Unpublished changes" bar catches up.
  async function run(action: () => Promise<BoardEffortBossesResponse>): Promise<boolean> {
    setError(null);
    setBusy(true);
    try {
      queryClient.setQueryData(adminQueryKeys.boardEffortBosses(slug), await action());
      void queryClient.invalidateQueries({ queryKey: adminQueryKeys.boardDraft(slug) });
      void queryClient.invalidateQueries({ queryKey: adminQueryKeys.boardDraftStatus(slug) });
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
      return false;
    } finally {
      setBusy(false);
    }
  }
  const change = (metric: string, mode: "add" | "remove") => () => adminApi.changeEffortBoss(slug, owner, { metric, mode });
  const reset = (row: EffortBoss) => () => adminApi.resetEffortBoss(slug, row.id);

  let chips: Chip[];
  // Bosses the picker leaves out: those already on, and (on a Part) those its Tile removes, which a Part can't add back.
  let unavailable: Set<string>;
  if ("partId" in owner) {
    const own = partRows(owner.partId);
    const derived = derivedOf(owner.partId);
    const effective = new Set(effectiveOf(owner.partId));
    const tileAdded = tileRows.filter((r) => r.mode === "add").map((r) => r.metric);
    const candidates = [...new Set([...derived, ...tileAdded, ...own.map((r) => r.metric)])].sort((a, b) => bossName(a).localeCompare(bossName(b)));
    chips = candidates.flatMap((metric): Chip[] => {
      const ownRow = own.find((r) => r.metric === metric);
      const tileRow = tileRows.find((r) => r.metric === metric);
      if (effective.has(metric)) {
        if (ownRow?.mode === "add") return [{ metric, note: "added", removed: false, action: { label: `Remove ${bossName(metric)}`, run: reset(ownRow) } }];
        const note = derived.includes(metric) ? "from items" : "from the Tile";
        return [{ metric, note, removed: false, action: { label: `Remove ${bossName(metric)}`, run: change(metric, "remove") } }];
      }
      if (ownRow?.mode === "remove") return [{ metric, note: "removed", removed: true, action: { label: `Restore ${bossName(metric)}`, run: reset(ownRow) } }];
      if (tileRow?.mode === "remove") return [{ metric, note: "removed on the Tile", removed: true }];
      return [];
    });
    unavailable = new Set([...effective, ...tileRows.filter((r) => r.mode === "remove").map((r) => r.metric)]);
  } else {
    const derived = [...new Set((parts ?? []).flatMap((p) => derivedOf(p.id)))];
    const candidates = [...new Set([...derived, ...tileRows.map((r) => r.metric)])].sort((a, b) => bossName(a).localeCompare(bossName(b)));
    chips = candidates.map((metric): Chip => {
      const row = tileRows.find((r) => r.metric === metric);
      if (row?.mode === "add") return { metric, note: "on every Part", removed: false, action: { label: `Remove ${bossName(metric)}`, run: reset(row) } };
      if (row?.mode === "remove")
        return { metric, note: "removed from every Part", removed: true, action: { label: `Restore ${bossName(metric)}`, run: reset(row) } };
      return { metric, note: "from items", removed: false, action: { label: `Remove ${bossName(metric)} from every Part`, run: change(metric, "remove") } };
    });
    unavailable = new Set(chips.filter((c) => !c.removed).map((c) => c.metric));
  }

  // A boss picked that's here struck through comes back by dropping its remove; any other is added.
  async function pick(metric: string) {
    const removedHere = ("partId" in owner ? partRows(owner.partId) : tileRows).find((r) => r.metric === metric && r.mode === "remove");
    if (await run(removedHere ? reset(removedHere) : change(metric, "add"))) setPicking(false);
  }

  const disabled = locked || busy;
  const hint =
    "partId" in owner
      ? "Effort counts time at these bosses while this Part is open."
      : "Effort counts time at these bosses while each Part is open. Changes here apply to every Part of this Tile.";

  return (
    <Field as="div" label="Effort bosses" hint={hint}>
      {chips.length > 0 ? (
        <ul aria-label="Effort bosses" className="mb-2 flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <BossChip key={chip.metric} chip={chip} onPress={() => chip.action && void run(chip.action.run)} disabled={disabled} />
          ))}
        </ul>
      ) : (
        <p className="mb-2 text-sm text-on-surface-subtle">No bosses: Effort isn't counted here.</p>
      )}
      <Button size="md" onPress={() => setPicking((open) => !open)} isDisabled={disabled}>
        <PlusIcon size={14} /> Boss
      </Button>
      {picking && <BossPicker bosses={ALL_BOSSES.filter((b) => !unavailable.has(b.metric))} onPick={(metric) => void pick(metric)} disabled={disabled} />}
      {parts && parts.length > 0 && (
        <ul aria-label="Each Part's Effort bosses" className="mt-2 space-y-0.5 text-xs text-on-surface-muted">
          {parts.map((part) => {
            const bosses = effectiveOf(part.id);
            return (
              <li key={part.id}>
                <span className="font-medium text-on-surface">{part.label?.trim() || "Untitled Part"}:</span>{" "}
                {bosses.length ? bosses.map(bossName).join(", ") : "none"}
              </li>
            );
          })}
        </ul>
      )}
      {error && (
        <Notice tone="danger" className="mt-2">
          {error}
        </Notice>
      )}
    </Field>
  );
}

function BossChip({ chip, onPress, disabled }: { chip: Chip; onPress: () => void; disabled: boolean }) {
  return (
    <li
      className={`flex items-center gap-1.5 rounded-full border border-outline py-0.5 pl-2.5 text-sm ${chip.action ? "pr-1" : "pr-2.5"} ${chip.removed ? "bg-background text-on-surface-subtle" : "bg-surface-raised text-on-surface"}`}
    >
      <span className={chip.removed ? "line-through" : undefined}>{bossName(chip.metric)}</span>
      <span className="text-[10px] uppercase tracking-wide text-on-surface-subtle">{chip.note}</span>
      {chip.action &&
        (chip.removed ? (
          <TextButton onPress={onPress} isDisabled={disabled} aria-label={chip.action.label} className="pr-1.5 text-xs">
            restore
          </TextButton>
        ) : (
          <IconButton size="xs" label={chip.action.label} onPress={onPress} isDisabled={disabled} className="rounded-full hover:text-danger">
            <XIcon size={12} />
          </IconButton>
        ))}
    </li>
  );
}

// Searches the bosses Wise Old Man measures, in the browser: the list is the app's own (WOM_BOSS_NAMES).
function BossPicker({ bosses, onPick, disabled }: { bosses: { metric: string; name: string }[]; onPick: (metric: string) => void; disabled: boolean }) {
  const [text, setText] = useState("");
  // Opened to be typed in.
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);
  const q = text.trim().toLowerCase();
  return (
    <div className="mt-2">
      <SearchCombo
        items={q ? bosses.filter((b) => b.name.toLowerCase().includes(q)) : bosses}
        itemKey={(b) => b.metric}
        itemText={(b) => b.name}
        onPick={(b) => onPick(b.metric)}
        inputValue={text}
        onInputChange={setText}
        clearOnPick
        emptyText="No boss Wise Old Man measures by that name"
        placeholder="Search Wise Old Man's bosses and raids…"
        aria-label="Effort boss"
        inputRef={inputRef}
        readOnly={disabled}
      />
    </div>
  );
}
