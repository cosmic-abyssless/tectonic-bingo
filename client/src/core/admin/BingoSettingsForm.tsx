import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Bingo } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { queryKeys } from "../../api/queries";
import { Markdown } from "../ui/Markdown";
import { Button } from "../ui/Button";
import { Notice } from "../ui/Card";
import { Disclosure } from "../ui/Disclosure";
import { Field, Input, Select, Textarea } from "../ui/Field";
import { THEME_KEYS } from "../../themes/keys";

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60_000).toISOString().slice(0, 16);
}
function fromLocalInput(local: string): string | null {
  return local ? new Date(local).toISOString() : null;
}

const DATE_FIELDS: { key: keyof Bingo; label: string }[] = [
  { key: "signupOpensAt", label: "Signup opens" },
  { key: "draftScheduledAt", label: "Draft scheduled" },
  { key: "revealScheduledAt", label: "Reveal scheduled" },
  { key: "startsAt", label: "Bingo starts" },
  { key: "endsAt", label: "Bingo ends" },
];

export function BingoSettingsForm({
  slug,
  bingo,
  paidSignupCount,
  potTotal,
}: {
  slug: string;
  bingo: Bingo;
  paidSignupCount: number;
  potTotal: number;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: bingo.name,
    description: bingo.description ?? "",
    theme: bingo.theme,
    buyinAmount: bingo.buyinAmount?.toString() ?? "",
    bonusPotAmount: bingo.bonusPotAmount.toString(),
    rulesMarkdown: bingo.rulesMarkdown ?? "",
    signupOpensAt: toLocalInput(bingo.signupOpensAt),
    draftScheduledAt: toLocalInput(bingo.draftScheduledAt),
    revealScheduledAt: toLocalInput(bingo.revealScheduledAt),
    startsAt: toLocalInput(bingo.startsAt),
    endsAt: toLocalInput(bingo.endsAt),
  });
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await adminApi.updateBingoSettings(slug, {
        name: form.name,
        description: form.description || null,
        theme: form.theme,
        buyinAmount: form.buyinAmount ? Number(form.buyinAmount) : null,
        bonusPotAmount: Number(form.bonusPotAmount) || 0,
        rulesMarkdown: form.rulesMarkdown || null,
        signupOpensAt: fromLocalInput(form.signupOpensAt) as never,
        draftScheduledAt: fromLocalInput(form.draftScheduledAt) as never,
        revealScheduledAt: fromLocalInput(form.revealScheduledAt) as never,
        startsAt: fromLocalInput(form.startsAt) as never,
        endsAt: fromLocalInput(form.endsAt) as never,
      });
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
      <Section title="General">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Theme">
            <Select value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value })}>
              {!(THEME_KEYS as readonly string[]).includes(form.theme) && <option value={form.theme}>{form.theme} (unknown — falls back to default)</option>}
              {THEME_KEYS.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Description">
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="resize-none" />
        </Field>
      </Section>

      <Section title="Pot">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Buy-in (GP)">
            <Input type="number" value={form.buyinAmount} onChange={(e) => setForm({ ...form, buyinAmount: e.target.value })} className="num" />
          </Field>
          <Field label="Bonus pot / extra donations (GP)">
            <Input type="number" value={form.bonusPotAmount} onChange={(e) => setForm({ ...form, bonusPotAmount: e.target.value })} className="num" />
          </Field>
        </div>
        <p className="text-sm text-fg-muted">
          Total pot: <span className="num font-semibold text-fg">{potTotal.toLocaleString()} GP</span> — <span className="num">{paidSignupCount}</span> paid signup
          {paidSignupCount === 1 ? "" : "s"} × <span className="num">{(bingo.buyinAmount ?? 0).toLocaleString()}</span> GP buy-in, plus bonus
        </p>
      </Section>

      <Section title="Schedule">
        <div className="grid grid-cols-2 gap-4">
          {DATE_FIELDS.map(({ key, label }) => (
            <Field key={key} label={label}>
              <Input type="datetime-local" value={form[key as keyof typeof form] as string} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="num" />
            </Field>
          ))}
        </div>
      </Section>

      <Section title="Rules">
        <Field
          as="div"
          label={
            <span className="flex items-center justify-between">
              Rules (Markdown)
              <button type="button" onClick={() => setShowPreview((p) => !p)} className="text-xs text-fg-muted underline-offset-2 hover:text-fg hover:underline">
                {showPreview ? "Edit" : "Preview"}
              </button>
            </span>
          }
        >
          {showPreview ? (
            <div className="min-h-[120px] rounded-md border border-line bg-surface px-3 py-2">
              <Markdown>{form.rulesMarkdown || "*(nothing yet)*"}</Markdown>
            </div>
          ) : (
            <Textarea aria-label="Rules (Markdown)" value={form.rulesMarkdown} onChange={(e) => setForm({ ...form, rulesMarkdown: e.target.value })} rows={6} className="font-mono" />
          )}
        </Field>
      </Section>

      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex items-center gap-3">
        <Button variant="primary" onPress={save} isDisabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
        {saved && <span className="text-sm text-ok">Saved</span>}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Disclosure defaultExpanded title={<span className="flex-1 text-sm font-semibold text-fg">{title}</span>}>
      <div className="space-y-4">{children}</div>
    </Disclosure>
  );
}
