import { DEFAULT_WRAPPED_BOSSES, MAX_WRAPPED_BOSSES, WOM_BOSS_NAMES, isWomBossMetric } from "@bingo/shared";
import { Button } from "../ui/Button";
import { Select } from "../ui/Select";
import { ChevronDownIcon, ChevronUpIcon, TrashIcon } from "../ui/icons";

const nameOf = (metric: string) => (isWomBossMetric(metric) ? WOM_BOSS_NAMES[metric] : metric);
const capitalized = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);

/**
 * The raids and bosses Wrapped's "Who killed it the most" part looks at (CONTEXT.md "Wrapped"), in the order it shows
 * them: Wise Old Man boss metrics, every mode its own entry. A preview shows a change straight away; a published Wrapped
 * only once it's published again.
 */
export function WrappedBossesEditor({ bosses, onChange }: { bosses: string[]; onChange: (bosses: string[]) => void }) {
  const move = (i: number, by: -1 | 1) => {
    const next = [...bosses];
    [next[i], next[i + by]] = [next[i + by]!, next[i]!];
    onChange(next);
  };
  const addable = Object.entries(WOM_BOSS_NAMES)
    .filter(([metric]) => !bosses.includes(metric))
    .map(([value, label]) => ({ value, label: capitalized(label) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const isDefault = bosses.length === DEFAULT_WRAPPED_BOSSES.length && bosses.every((b, i) => b === DEFAULT_WRAPPED_BOSSES[i]);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-on-surface">Wrapped raids and bosses</p>
      <p className="text-sm text-on-surface-muted">
        For each one, Wrapped shows the Team whose Players gained the most kills at it during the bingo (Wise Old Man), and its top Player. A change shows in the preview
        straight away, and in a published Wrapped once it's published again.
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
            <Button variant="ghost" size="sm" aria-label={`Remove ${nameOf(metric)}`} onPress={() => onChange(bosses.filter((_, j) => j !== i))}>
              <TrashIcon size={14} />
            </Button>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        {bosses.length < MAX_WRAPPED_BOSSES && (
          <Select aria-label="Add a raid or boss" value="" placeholder="Add a raid or boss…" onChange={(metric) => onChange([...bosses, metric])} className="w-64!" options={addable} />
        )}
        {!isDefault && (
          <Button size="sm" variant="ghost" onPress={() => onChange([...DEFAULT_WRAPPED_BOSSES])}>
            Reset to the default
          </Button>
        )}
      </div>
    </div>
  );
}
