import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { DEFAULT_WRAPPED_BOSSES, MAX_WRAPPED_BOSSES, WOM_BOSS_NAMES, isWomBossMetric, type Bingo } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { queryKeys } from "../../api/queries";
import { Button } from "../ui/Button";
import { Notice } from "../ui/Card";
import { Select } from "../ui/Select";
import { ChevronDownIcon, ChevronUpIcon, TrashIcon } from "../ui/icons";

const nameOf = (metric: string) => (isWomBossMetric(metric) ? WOM_BOSS_NAMES[metric] : metric);
const capitalized = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);

/**
 * The Wrapped bosses sub-tab of the mod panel's Extras tab (admins only): the raids and bosses Wrapped's "Who killed it
 * the most" part looks at (CONTEXT.md "Wrapped"), in the order it shows them. Wise Old Man boss metrics, every mode its
 * own entry. Saved on its own, through the same settings update as the Settings tab. A preview shows a change straight
 * away; a published Wrapped only once it's published again.
 */
export function WrappedBossesManager({ slug, bingo }: { slug: string; bingo: Bingo }) {
  const queryClient = useQueryClient();
  const [bosses, setBosses] = useState(bingo.wrappedBosses);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const change = (next: string[]) => {
    setBosses(next);
    setSaved(false);
  };
  const move = (i: number, by: -1 | 1) => {
    const next = [...bosses];
    [next[i], next[i + by]] = [next[i + by]!, next[i]!];
    change(next);
  };
  const addable = Object.entries(WOM_BOSS_NAMES)
    .filter(([metric]) => !bosses.includes(metric))
    .map(([value, label]) => ({ value, label: capitalized(label) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const isDefault = bosses.length === DEFAULT_WRAPPED_BOSSES.length && bosses.every((b, i) => b === DEFAULT_WRAPPED_BOSSES[i]);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await adminApi.updateBingoSettings(slug, { wrappedBosses: bosses });
      await queryClient.invalidateQueries({ queryKey: queryKeys.bingo(slug) });
      setSaved(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-on-surface-muted">
        For each raid or boss here, Wrapped shows the Team whose Players gained the most kills at it during the bingo (Wise Old Man), and its top Player. A new bingo starts with the previous
        bingo's list. A change shows in the preview straight away, and in a published Wrapped once it's published again.
      </p>
      {bosses.length === 0 && <p className="text-sm text-on-surface-muted">None: Wrapped leaves this part out.</p>}
      <ol className="space-y-1">
        {bosses.map((metric, i) => (
          <li key={metric} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm">{capitalized(nameOf(metric))}</span>
            <Button variant="ghost" size="sm" aria-label={`Move ${nameOf(metric)} up`} onPress={() => move(i, -1)} isDisabled={i === 0}>
              <ChevronUpIcon size={14} />
            </Button>
            <Button variant="ghost" size="sm" aria-label={`Move ${nameOf(metric)} down`} onPress={() => move(i, 1)} isDisabled={i === bosses.length - 1}>
              <ChevronDownIcon size={14} />
            </Button>
            <Button variant="ghost" size="sm" aria-label={`Remove ${nameOf(metric)}`} onPress={() => change(bosses.filter((_, j) => j !== i))}>
              <TrashIcon size={14} />
            </Button>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        {bosses.length < MAX_WRAPPED_BOSSES && (
          <Select aria-label="Add a raid or boss" value="" placeholder="Add a raid or boss…" onChange={(metric) => change([...bosses, metric])} className="w-64!" options={addable} />
        )}
        {!isDefault && (
          <Button size="sm" variant="ghost" onPress={() => change([...DEFAULT_WRAPPED_BOSSES])}>
            Reset to the default
          </Button>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Button variant="primary" onPress={save} isDisabled={saving}>
          {saving ? "Saving…" : "Save Wrapped bosses"}
        </Button>
        {saved && <span className="text-sm text-ok">Saved</span>}
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
    </div>
  );
}
