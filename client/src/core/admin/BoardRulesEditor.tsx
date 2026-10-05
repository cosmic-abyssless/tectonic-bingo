import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ExclusivityRule } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { invalidateBoardDraft } from "../../api/adminQueries";
import { Markdown } from "../ui/Markdown";
import { Button } from "../ui/Button";
import { Notice } from "../ui/Card";
import { Disclosure } from "../ui/Disclosure";
import { Field, Textarea } from "../ui/Field";
import { TextButton } from "../ui/TextButton";
import { ExclusiveItemsSection } from "./ExclusiveItemsSection";

/**
 * The Bingo's Rules text and its Exclusive Item rules, which go through the Draft board with the Board (CONTEXT.md
 * "Draft board"): saved here to the draft, they reach Players, and the scoring, once the board is published. What the
 * draft holds is followed as other Admins change it, until this Admin starts editing.
 */
export function BoardRulesEditor({ slug, rulesMarkdown, exclusivityRules, locked }: { slug: string; rulesMarkdown: string | null; exclusivityRules: ExclusivityRule[]; locked: boolean }) {
  const queryClient = useQueryClient();
  const [markdown, setMarkdown] = useState(rulesMarkdown ?? "");
  const [rules, setRules] = useState(exclusivityRules);
  const [dirty, setDirty] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (dirty) return;
    setMarkdown(rulesMarkdown ?? "");
    setRules(exclusivityRules);
  }, [rulesMarkdown, exclusivityRules, dirty]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await adminApi.updateDraftRules(slug, { rulesMarkdown: markdown || null, exclusivityRules: rules });
      setDirty(false);
      invalidateBoardDraft(queryClient, slug);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <fieldset disabled={locked} className="min-w-0 space-y-4 disabled:opacity-60">
      <Disclosure title={<span className="flex-1 text-sm font-semibold text-on-surface">Rules</span>}>
        <Field
          as="div"
          label={
            <span className="flex items-center justify-between">
              Rules (Markdown)
              <TextButton onPress={() => setShowPreview((p) => !p)} className="text-xs text-on-surface-muted">
                {showPreview ? "Edit" : "Preview"}
              </TextButton>
            </span>
          }
        >
          {showPreview ? (
            <div className="min-h-[120px] rounded-md border border-outline bg-surface px-3 py-2">
              <Markdown>{markdown || "*(nothing yet)*"}</Markdown>
            </div>
          ) : (
            <Textarea
              aria-label="Rules (Markdown)"
              value={markdown}
              onChange={(e) => {
                setMarkdown(e.target.value);
                setDirty(true);
              }}
              rows={6}
              className="font-mono"
            />
          )}
        </Field>
      </Disclosure>
      <Disclosure title={<span className="flex-1 text-sm font-semibold text-on-surface">Exclusive items</span>}>
        <div className="space-y-4">
          <ExclusiveItemsSection
            slug={slug}
            rules={rules}
            onChange={(next) => {
              setRules(next);
              setDirty(true);
            }}
          />
        </div>
      </Disclosure>
      {error && <Notice tone="danger">{error}</Notice>}
      {dirty && (
        <div className="flex items-center gap-3">
          <Button variant="primary" onPress={save} isDisabled={saving}>
            {saving ? "Saving…" : "Save rules to the draft"}
          </Button>
          <Button
            variant="ghost"
            onPress={() => {
              setDirty(false);
              setError(null);
            }}
          >
            Undo
          </Button>
        </div>
      )}
    </fieldset>
  );
}
