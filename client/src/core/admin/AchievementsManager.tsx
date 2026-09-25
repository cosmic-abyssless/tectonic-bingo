import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AchievementKey, Bingo } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { useAchievementSettings } from "../../api/adminQueries";
import { queryKeys } from "../../api/queries";
import { Button } from "../ui/Button";
import { Badge, Notice } from "../ui/Card";
import { WikiIcon } from "../ui/ItemIcon";
import { Switch } from "../ui/Switch";

/**
 * The mod panel's Achievements tab (admins only): the Bingo's master switch and one switch per Achievement
 * (CONTEXT.md "Achievement"). Saved on its own, through the same settings update as the Settings tab.
 */
export function AchievementsManager({ slug, bingo }: { slug: string; bingo: Bingo }) {
  const queryClient = useQueryClient();
  const { data } = useAchievementSettings(slug);
  const [enabled, setEnabled] = useState(bingo.achievementsEnabled);
  // Per-Achievement switches the admin has touched here, over the fetched state — only these are sent, so someone
  // else's concurrent change to a switch nobody touched here survives.
  const [edits, setEdits] = useState<Partial<Record<AchievementKey, boolean>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await adminApi.updateBingoSettings(slug, { achievementsEnabled: enabled, ...(Object.keys(edits).length > 0 ? { achievements: edits } : {}) });
      setEdits({});
      await queryClient.invalidateQueries({ queryKey: queryKeys.bingo(slug) });
      await queryClient.invalidateQueries({ queryKey: ["adminAchievements", slug] });
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
        A just-for-fun layer for players that never touches points, scoring or the board. Switching one off only hides it: earning continues in the background, and switching it back on restores
        everything players had. One added to the site later starts switched off here.
      </p>
      <Switch isSelected={enabled} onChange={setEnabled}>
        Achievements
      </Switch>
      <div className={`divide-y divide-outline rounded-md border border-outline bg-surface ${enabled ? "" : "opacity-50"}`}>
        {(data?.achievements ?? []).map((a) => (
          <div key={a.key} className="flex items-center gap-3 px-3 py-2.5">
            <WikiIcon name={a.itemName} className="size-6 shrink-0 rounded-sm bg-icon-backdrop p-0.5 [image-rendering:pixelated]" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-sm font-medium text-on-surface">
                {a.name}
                {a.hidden && <Badge>Hidden</Badge>}
              </div>
              <div className="text-xs text-on-surface-muted">{a.description}</div>
            </div>
            <Switch
              isSelected={edits[a.key] ?? a.enabled}
              isDisabled={!enabled}
              onChange={(on) => setEdits((prev) => ({ ...prev, [a.key]: on }))}
              aria-label={`Switch ${a.name} on or off`}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button variant="primary" onPress={save} isDisabled={saving}>
          {saving ? "Saving…" : "Save achievements"}
        </Button>
        {saved && <span className="text-sm text-ok">Saved</span>}
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
    </div>
  );
}
