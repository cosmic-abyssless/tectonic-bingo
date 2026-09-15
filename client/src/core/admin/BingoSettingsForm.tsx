import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Bingo, LeftoverMode, SignupMode } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { queryKeys } from "../../api/queries";
import { Markdown } from "../ui/Markdown";
import { Button } from "../ui/Button";
import { Notice } from "../ui/Card";
import { Disclosure } from "../ui/Disclosure";
import { Field, Input, Select, Textarea } from "../ui/Field";
import { Switch } from "../ui/Switch";
import { ChevronDownIcon, ChevronRightIcon } from "../ui/icons";
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
  hasSignups,
}: {
  slug: string;
  bingo: Bingo;
  paidSignupCount: number;
  potTotal: number;
  hasSignups: boolean;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: bingo.name,
    description: bingo.description ?? "",
    theme: bingo.theme,
    signupMode: bingo.signupMode,
    leftoverMode: bingo.leftoverMode,
    warnLeftovers: bingo.warnLeftovers,
    buyinAmount: bingo.buyinAmount?.toString() ?? "",
    bonusPotAmount: bingo.bonusPotAmount.toString(),
    rulesMarkdown: bingo.rulesMarkdown ?? "",
    signupOpensAt: toLocalInput(bingo.signupOpensAt),
    draftScheduledAt: toLocalInput(bingo.draftScheduledAt),
    revealScheduledAt: toLocalInput(bingo.revealScheduledAt),
    startsAt: toLocalInput(bingo.startsAt),
    endsAt: toLocalInput(bingo.endsAt),
    womEnabled: bingo.womEnabled,
    womGroupId: bingo.womGroupId ?? "",
    // Write-only — the server never sends the current code back, so this
    // always starts blank. Left blank on save, the existing code (if any) is
    // kept as-is.
    womGroupVerificationCode: "",
  });
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function exportBoard() {
    setExporting(true);
    setExportError(null);
    try {
      const doc = await adminApi.exportBingo(slug);
      const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slug}-export.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setExportError(e instanceof Error ? e.message : "Failed to export");
    } finally {
      setExporting(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await adminApi.updateBingoSettings(slug, {
        name: form.name,
        description: form.description || null,
        theme: form.theme,
        signupMode: form.signupMode,
        leftoverMode: form.leftoverMode,
        warnLeftovers: form.warnLeftovers,
        buyinAmount: form.buyinAmount ? Number(form.buyinAmount) : null,
        bonusPotAmount: Number(form.bonusPotAmount) || 0,
        rulesMarkdown: form.rulesMarkdown || null,
        signupOpensAt: fromLocalInput(form.signupOpensAt) as never,
        draftScheduledAt: fromLocalInput(form.draftScheduledAt) as never,
        revealScheduledAt: fromLocalInput(form.revealScheduledAt) as never,
        startsAt: fromLocalInput(form.startsAt) as never,
        endsAt: fromLocalInput(form.endsAt) as never,
        womEnabled: form.womEnabled,
        womGroupId: form.womGroupId.trim() || null,
        // Omit entirely when blank so the server keeps the existing code.
        ...(form.womGroupVerificationCode.trim() ? { womGroupVerificationCode: form.womGroupVerificationCode.trim() } : {}),
      });
      setForm((f) => ({ ...f, womGroupVerificationCode: "" }));
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

      <Section title="Signups">
        <Field label="Signup mode" hint={hasSignups ? "Locked — players have already signed up." : "Duo: players pair up during signup and get drafted together."}>
          <Select value={form.signupMode} onChange={(e) => setForm({ ...form, signupMode: e.target.value as SignupMode })} disabled={hasSignups} className="w-auto!">
            <option value="solo">Solo</option>
            <option value="duo">Duo</option>
          </Select>
        </Field>
        <Field
          label="Leftover signups"
          hint="Teams get equal picks. The newest signups that don't fill a full round are either cut or drafted in a final singles round, where the team that picked last picks first."
        >
          <Select value={form.leftoverMode} onChange={(e) => setForm({ ...form, leftoverMode: e.target.value as LeftoverMode })} className="w-auto!">
            <option value="cut">Cut — not drafted</option>
            <option value="singles">Singles round</option>
          </Select>
        </Field>
        <label className="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" checked={form.warnLeftovers} onChange={(e) => setForm({ ...form, warnLeftovers: e.target.checked })} className="size-4 cursor-pointer accent-accent" />
          Warn at-risk signups on their signup page
        </label>
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

      <WomSection enabled={form.womEnabled} onToggle={(womEnabled) => setForm({ ...form, womEnabled })}>
        <Notice tone="info">
          When enabled, a Wise Old Man group competition is created automatically for this bingo's teams once the draft finishes, and kept up to date if a
          captain renames their team.
        </Notice>
        <div className="grid grid-cols-2 gap-4">
          <Field label="WOM group ID">
            <Input value={form.womGroupId} onChange={(e) => setForm({ ...form, womGroupId: e.target.value })} className="num" />
          </Field>
          <Field label="WOM group verification code" hint="For security, the saved code is never shown. Leave blank to keep the current one.">
            <Input
              type="password"
              autoComplete="off"
              placeholder={bingo.womGroupId ? "•••••••• (unchanged)" : ""}
              value={form.womGroupVerificationCode}
              onChange={(e) => setForm({ ...form, womGroupVerificationCode: e.target.value })}
            />
          </Field>
        </div>
        {bingo.womCompetitionId && (
          <Notice tone="ok">
            Competition created —{" "}
            <a href={`https://wiseoldman.net/competitions/${bingo.womCompetitionId}`} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              view on Wise Old Man
            </a>
            .
          </Notice>
        )}
        {bingo.womSyncError && <Notice tone="warn">Last WOM sync failed: {bingo.womSyncError}</Notice>}
      </WomSection>

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

      <Section title="Export">
        <p className="text-sm text-fg-muted">
          Download this bingo's board and settings as a file — categories, tiles, tasks, lines, and signup questions. Tile images and everything
          environment-specific (teams, signups, submissions, moderators) are left out. Import it as a new bingo from the site admin page.
        </p>
        <Button onPress={exportBoard} isDisabled={exporting}>
          {exporting ? "Exporting…" : "Export board & settings"}
        </Button>
        {exportError && <Notice tone="danger">{exportError}</Notice>}
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

// Unlike Section, whether this starts open or collapsed is driven by the
// enable toggle rather than always being open — off means collapsed, on
// means open by default with the usual expand/collapse control from there.
// The toggle and the expand/collapse control are two separate buttons (not
// one nested in the other, which would be invalid HTML and would fire both
// on a single click), so this can't just reuse Disclosure's single-trigger layout.
function WomSection({ enabled, onToggle, children }: { enabled: boolean; onToggle: (value: boolean) => void; children: ReactNode }) {
  const [expanded, setExpanded] = useState(enabled);
  useEffect(() => setExpanded(enabled), [enabled]);

  return (
    <div className="rounded-lg border border-line bg-surface">
      <div className="flex h-12 w-full items-center gap-3 px-4">
        <button type="button" onClick={() => setExpanded((v) => !v)} className="flex flex-1 items-center gap-3 text-left text-sm font-semibold text-fg">
          Wise Old Man
          <span className="text-fg-subtle">{expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}</span>
        </button>
        <Switch isSelected={enabled} onChange={onToggle} aria-label="Enable Wise Old Man integration" />
      </div>
      {expanded && <div className="space-y-4 border-t border-line p-4">{children}</div>}
    </div>
  );
}
