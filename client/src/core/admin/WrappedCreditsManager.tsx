import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Bingo } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { queryKeys } from "../../api/queries";
import { Button } from "../ui/Button";
import { Notice } from "../ui/Card";
import { WrappedCreditsSection } from "./WrappedCreditsSection";

/**
 * The Wrapped tab's Credits editor (admins only, alongside the Wrapped art it embeds them on): who put the Bingo
 * together (CONTEXT.md "Credits"). Saved on its own, through the same settings update as the Settings tab.
 */
export function WrappedCreditsManager({ slug, bingo }: { slug: string; bingo: Bingo }) {
  const queryClient = useQueryClient();
  const [credits, setCredits] = useState(bingo.wrappedCredits);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await adminApi.updateBingoSettings(slug, { wrappedCredits: credits });
      await queryClient.invalidateQueries({ queryKey: queryKeys.bingo(slug) });
      setSaved(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-4 border-t border-outline pt-8">
      <h3 className="text-sm font-semibold text-on-surface">Credits</h3>
      <WrappedCreditsSection
        credits={credits}
        onChange={(next) => {
          setCredits(next);
          setSaved(false);
        }}
      />
      <div className="flex items-center gap-3">
        <Button variant="primary" onPress={save} isDisabled={saving}>
          {saving ? "Saving…" : "Save credits"}
        </Button>
        {saved && <span className="text-sm text-ok">Saved</span>}
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
    </div>
  );
}
