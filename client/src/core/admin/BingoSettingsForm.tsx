import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Bingo } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { queryKeys } from "../../api/queries";
import { Markdown } from "../ui/Markdown";

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

export function BingoSettingsForm({ slug, bingo }: { slug: string; bingo: Bingo }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: bingo.name,
    description: bingo.description ?? "",
    theme: bingo.theme,
    buyinAmount: bingo.buyinAmount?.toString() ?? "",
    potAmount: bingo.potAmount?.toString() ?? "",
    rulesMarkdown: bingo.rulesMarkdown ?? "",
    aiHint: bingo.aiHint ?? "",
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
        potAmount: form.potAmount ? Number(form.potAmount) : null,
        rulesMarkdown: form.rulesMarkdown || null,
        aiHint: form.aiHint || null,
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
    <div className="space-y-5 max-w-2xl">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full bg-slate-900 border border-slate-600 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Theme</label>
          <input value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value })} className="w-full bg-slate-900 border border-slate-600 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
        <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="w-full bg-slate-900 border border-slate-600 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 resize-none" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Buy-in (GP)</label>
          <input type="number" value={form.buyinAmount} onChange={(e) => setForm({ ...form, buyinAmount: e.target.value })} className="w-full bg-slate-900 border border-slate-600 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Pot (GP)</label>
          <input type="number" value={form.potAmount} onChange={(e) => setForm({ ...form, potAmount: e.target.value })} className="w-full bg-slate-900 border border-slate-600 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {DATE_FIELDS.map(({ key, label }) => (
          <div key={key}>
            <label className="block text-sm font-medium text-slate-300 mb-1">{label}</label>
            <input
              type="datetime-local"
              value={form[key as keyof typeof form] as string}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              className="w-full bg-slate-900 border border-slate-600 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium text-slate-300">Rules (Markdown)</label>
          <button type="button" onClick={() => setShowPreview((p) => !p)} className="text-xs text-indigo-400 hover:text-indigo-300 cursor-pointer">
            {showPreview ? "Edit" : "Preview"}
          </button>
        </div>
        {showPreview ? (
          <div className="bg-slate-900 border border-slate-700 rounded-md px-3 py-2 min-h-[120px]">
            <Markdown>{form.rulesMarkdown || "*(nothing yet)*"}</Markdown>
          </div>
        ) : (
          <textarea value={form.rulesMarkdown} onChange={(e) => setForm({ ...form, rulesMarkdown: e.target.value })} rows={6} className="w-full bg-slate-900 border border-slate-600 text-white rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-indigo-500" />
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">AI screenshot-analysis hint</label>
        <textarea
          value={form.aiHint}
          onChange={(e) => setForm({ ...form, aiHint: e.target.value })}
          rows={2}
          placeholder='e.g. "This is an Old School RuneScape screenshot..."'
          className="w-full bg-slate-900 border border-slate-600 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 resize-none placeholder:text-slate-600"
        />
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-lg px-4 py-2 text-sm transition-colors cursor-pointer">
          {saving ? "Saving…" : "Save Settings"}
        </button>
        {saved && <span className="text-green-400 text-sm">Saved</span>}
      </div>
    </div>
  );
}
