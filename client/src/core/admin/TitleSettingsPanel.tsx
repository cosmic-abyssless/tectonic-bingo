import { useEffect, useState, type ComponentProps } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { DEFAULT_LUCK_WEIGHTS, TITLES, titleMinimum, type LuckWeights, type TitleDefinition, type TitleId, type TitleSettings } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { adminQueryKeys, useTitleSettings } from "../../api/adminQueries";
import { Button } from "../ui/Button";
import { Notice } from "../ui/Card";
import { Input } from "../ui/Field";
import { Switch } from "../ui/Switch";

// The luck Titles' floor lives in the luck weights: shown on their own row, as "1 in N".
const FLOOR_OF: Partial<Record<TitleId, keyof LuckWeights>> = { spoon: "spoonMinLuck", dry: "dryMinLuck", clutch: "clutchMinLuck" };

// Everything as typed, so a half-typed number doesn't jump around; checked on save.
interface Draft {
  enabled: Record<string, boolean>;
  minimums: Record<string, string>;
  /** "1 in N" floors, by luck weight: N as typed. */
  floors: Record<string, string>;
  spoonDecay: string;
}

const oneInN = (luck: number) => String(Number((10 ** luck).toPrecision(6)));

function draftOf(settings: TitleSettings): Draft {
  return {
    enabled: Object.fromEntries(TITLES.map((t) => [t.id, !settings.disabled.includes(t.id)])),
    minimums: Object.fromEntries(TITLES.filter((t) => t.minimum).map((t) => [t.id, String(titleMinimum(t, settings))])),
    floors: Object.fromEntries(Object.values(FLOOR_OF).map((key) => [key, oneInN(settings.luck[key])])),
    spoonDecay: String(settings.luck.spoonDecay),
  };
}

function settingsOf(draft: Draft): TitleSettings | string {
  const minimums: TitleSettings["minimums"] = {};
  for (const title of TITLES) {
    if (!title.minimum) continue;
    const value = Number(draft.minimums[title.id]);
    if (draft.minimums[title.id]?.trim() === "" || !Number.isFinite(value) || value < 0) return `${title.name}'s minimum must be a number of 0 or more`;
    if (title.minimum.whole && !Number.isInteger(value)) return `${title.name}'s minimum must be a whole number`;
    minimums[title.id] = value;
  }
  const luck = { ...DEFAULT_LUCK_WEIGHTS };
  for (const [id, key] of Object.entries(FLOOR_OF) as [TitleId, keyof LuckWeights][]) {
    const n = Number(draft.floors[key]);
    if (!Number.isFinite(n) || n < 1) return `${TITLES.find((t) => t.id === id)!.name}'s floor must be 1 in 1 or more`;
    luck[key] = Math.log10(n);
  }
  luck.spoonDecay = Number(draft.spoonDecay);
  if (draft.spoonDecay.trim() === "" || !Number.isFinite(luck.spoonDecay)) return "Spoon's decay must be a number";
  return { minimums, disabled: TITLES.filter((t) => !draft.enabled[t.id]).map((t) => t.id), luck };
}

// One number of a Title's row, its label beside it and its default after it, so a row stays one line tall.
function NumberSetting({ label, fallback, unit, ...input }: { label: string; fallback: string; unit?: string } & Omit<ComponentProps<typeof Input>, "type" | "size">) {
  return (
    <label className="flex items-center gap-2 text-xs whitespace-nowrap">
      <span className="text-on-surface-muted">{label}</span>
      <span className="w-20">
        <Input type="number" inputMode="decimal" size="sm" {...input} />
      </span>
      <span className="text-on-surface-subtle">
        {unit && `${unit} · `}Default {fallback}
      </span>
    </label>
  );
}

function TitleRow({ title, draft, setDraft }: { title: TitleDefinition; draft: Draft; setDraft: (update: (d: Draft) => Draft) => void }) {
  const floor = FLOOR_OF[title.id];
  const enabled = draft.enabled[title.id]!;
  return (
    <li className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2">
      <div className="flex min-w-60 flex-1 items-baseline gap-3">
        <Switch isSelected={enabled} onChange={(on) => setDraft((d) => ({ ...d, enabled: { ...d.enabled, [title.id]: on } }))}>
          <span className="font-semibold text-on-surface">{title.name}</span>
          {title.hidden && <span className="text-xs text-on-surface-subtle">hidden</span>}
        </Switch>
        <span className="min-w-0 truncate text-xs text-on-surface-muted italic" title={title.flavour}>
          {title.flavour}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-2">
        {floor && (
          <NumberSetting
            label={title.id === "clutch" ? "Drop's luck, at least 1 in" : "Luck, at least 1 in"}
            fallback={`1 in ${oneInN(DEFAULT_LUCK_WEIGHTS[floor])}`}
            min={1}
            step="any"
            disabled={!enabled}
            value={draft.floors[floor]}
            onChange={(e) => setDraft((d) => ({ ...d, floors: { ...d.floors, [floor]: e.target.value } }))}
          />
        )}
        {title.id === "spoon" && (
          <NumberSetting
            label="Each further drop counts"
            unit="of the one before"
            fallback={String(DEFAULT_LUCK_WEIGHTS.spoonDecay)}
            min={0}
            max={0.95}
            step={0.05}
            disabled={!enabled}
            value={draft.spoonDecay}
            onChange={(e) => setDraft((d) => ({ ...d, spoonDecay: e.target.value }))}
          />
        )}
        {title.minimum && (
          <NumberSetting
            label={title.minimum.label}
            fallback={String(title.minimum.default)}
            min={0}
            step={title.minimum.whole ? 1 : "any"}
            disabled={!enabled}
            value={draft.minimums[title.id]}
            onChange={(e) => setDraft((d) => ({ ...d, minimums: { ...d.minimums, [title.id]: e.target.value } }))}
          />
        )}
      </div>
    </li>
  );
}

/** Site admin > Titles: turn Titles on and off and tune their minimums, for every Bingo that isn't Finished. */
export function TitleSettingsPanel() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useTitleSettings();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data && !draft) setDraft(draftOf(data.settings));
  }, [data, draft]);

  if (isLoading || !draft) return <p className="text-sm text-on-surface-muted">Loading…</p>;

  const update = (fn: (d: Draft) => Draft) => {
    setSaved(false);
    setDraft((d) => (d ? fn(d) : d));
  };

  async function save(settings: TitleSettings | string) {
    setError(null);
    if (typeof settings === "string") return setError(settings);
    setSaving(true);
    try {
      const { settings: next } = await adminApi.updateTitleSettings(settings);
      queryClient.setQueryData(adminQueryKeys.titleSettings, { settings: next });
      setDraft(draftOf(next));
      setSaved(true);
      // Every Stats page picks its Titles with these.
      await queryClient.invalidateQueries({ queryKey: ["stats"] });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save the Title settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-on-surface-muted">
        Titles are worked out afresh every time a Stats page loads, so a change here applies straight away to every bingo that isn't finished yet. A finished
        bingo keeps the settings and Titles it finished with, and takes a fresh copy if it's reopened and finished again. A Title turned off disappears from those
        bingos' Stats pages and profiles. The luck Titles' floors are "1 in N": 10 means only 1 in 10 players would be that lucky (or that dry).
      </p>
      <ul className="divide-y divide-outline rounded-md border border-outline">
        {TITLES.map((title) => (
          <TitleRow key={title.id} title={title} draft={draft} setDraft={update} />
        ))}
      </ul>
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" isDisabled={saving} onPress={() => save(settingsOf(draft))}>
          Save
        </Button>
        <Button
          variant="ghost"
          isDisabled={saving}
          onPress={() => {
            if (confirm("Put every Title back on, at its default minimum?")) void save({ minimums: {}, disabled: [], luck: DEFAULT_LUCK_WEIGHTS });
          }}
        >
          Reset to defaults
        </Button>
        {saved && <span className="text-sm text-on-surface-muted">Saved.</span>}
      </div>
    </div>
  );
}
