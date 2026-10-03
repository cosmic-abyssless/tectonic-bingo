import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { STAGE_LABEL, areTilesSealed, isBoardLocked, type Bingo, type CutMode, type ExclusivityRule, type SignupMode } from "@bingo/shared";
import { cutModeOptions } from "../draft/cutModes";
import * as adminApi from "../../api/adminApi";
import { queryKeys } from "../../api/queries";
import { Markdown } from "../ui/Markdown";
import { Button } from "../ui/Button";
import { Notice } from "../ui/Card";
import { Disclosure } from "../ui/Disclosure";
import { Field, Input, Textarea } from "../ui/Field";
import { Checkbox } from "../ui/Checkbox";
import { Select } from "../ui/Select";
import { Switch } from "../ui/Switch";
import { THEME_KEYS } from "../../themes/keys";
import { ExclusiveItemsSection } from "./ExclusiveItemsSection";
import { TextButton } from "../ui/TextButton";
import { ExternalLink } from "../ui/ExternalLink";
import { DiscordSyncPanel } from "./DiscordSyncPanel";
import { useAuth } from "../../context/AuthContext";
import { DiscordChannelsEditor, discordChannelsDeleted } from "./DiscordChannelsEditor";

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
  const { devMode } = useAuth();
  const [form, setForm] = useState({
    name: bingo.name,
    description: bingo.description ?? "",
    theme: bingo.theme,
    signupMode: bingo.signupMode,
    cutMode: bingo.cutMode,
    warnLeftovers: bingo.warnLeftovers,
    buyinAmount: bingo.buyinAmount?.toString() ?? "",
    bonusPotAmount: bingo.bonusPotAmount.toString(),
    rulesMarkdown: bingo.rulesMarkdown ?? "",
    showScreenshotsWhenFinished: bingo.showScreenshotsWhenFinished,
    publishWrappedOnFinish: bingo.publishWrappedOnFinish,
    sealedTiles: bingo.sealedTiles,
    hideRules: bingo.hideRules,
    exclusivityRules: bingo.exclusivityRules as ExclusivityRule[],
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
    discordEnabled: bingo.discordEnabled,
    discordCategoryName: bingo.discordCategoryName ?? "",
    discordGuildId: bingo.discordGuildId ?? "",
    discordCategoryId: bingo.discordCategoryId ?? "",
    discordChannels: bingo.discordChannels,
  });
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [includeImages, setIncludeImages] = useState(true);

  async function exportBoard() {
    setExporting(true);
    setExportError(null);
    try {
      const doc = await adminApi.exportBingo(slug, includeImages);
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
    // Channels taken off the list (or switched between text and voice) are deleted from Discord with their messages.
    const deleted = discordChannelsDeleted(bingo.discordChannels, form.discordChannels);
    if (deleted.length > 0 && bingo.discordEnabled && !confirm(`Saving deletes every team's ${deleted.map((c) => `"${c.name}"`).join(", ")} channel in Discord, with its messages. Save anyway?`)) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await adminApi.updateBingoSettings(slug, {
        name: form.name,
        description: form.description || null,
        theme: form.theme,
        signupMode: form.signupMode,
        cutMode: form.cutMode,
        warnLeftovers: form.warnLeftovers,
        buyinAmount: form.buyinAmount ? Number(form.buyinAmount) : null,
        bonusPotAmount: Number(form.bonusPotAmount) || 0,
        rulesMarkdown: form.rulesMarkdown || null,
        showScreenshotsWhenFinished: form.showScreenshotsWhenFinished,
        publishWrappedOnFinish: form.publishWrappedOnFinish,
        sealedTiles: form.sealedTiles,
        hideRules: form.hideRules,
        exclusivityRules: form.exclusivityRules,
        signupOpensAt: fromLocalInput(form.signupOpensAt) as never,
        draftScheduledAt: fromLocalInput(form.draftScheduledAt) as never,
        revealScheduledAt: fromLocalInput(form.revealScheduledAt) as never,
        startsAt: fromLocalInput(form.startsAt) as never,
        endsAt: fromLocalInput(form.endsAt) as never,
        womEnabled: form.womEnabled,
        womGroupId: form.womGroupId.trim() || null,
        // Omit entirely when blank so the server keeps the existing code.
        ...(form.womGroupVerificationCode.trim() ? { womGroupVerificationCode: form.womGroupVerificationCode.trim() } : {}),
        discordEnabled: form.discordEnabled,
        discordCategoryName: form.discordCategoryName.trim() || null,
        discordCategoryId: form.discordCategoryId.trim() || null,
        // Dev servers only: anywhere else the server refuses it (it's always the clan's Discord there).
        ...(devMode ? { discordGuildId: form.discordGuildId.trim() || null } : {}),
        discordChannels: form.discordChannels,
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
            <Select
              value={form.theme}
              onChange={(theme) => setForm({ ...form, theme })}
              options={[
                ...((THEME_KEYS as readonly string[]).includes(form.theme) ? [] : [{ value: form.theme, label: `${form.theme} (unknown — falls back to default)` }]),
                ...THEME_KEYS.map((key) => ({ value: key, label: key })),
              ]}
            />
          </Field>
        </div>
        <Field label="Description">
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="resize-none" />
        </Field>
      </Section>

      <Section title="Signups">
        <Field label="Signup mode" hint={hasSignups ? "Locked — players have already signed up." : "Duo: players pair up during signup and get drafted together."}>
          <Select
            value={form.signupMode}
            // Pairs only means nothing in a solo bingo (the server drops it back to even too).
            onChange={(signupMode) =>
              setForm({ ...form, signupMode: signupMode as SignupMode, cutMode: signupMode === "solo" && form.cutMode === "pairs_only" ? "even" : form.cutMode })
            }
            disabled={hasSignups}
            className="w-auto!"
            options={[
              { value: "solo", label: "Solo" },
              { value: "duo", label: "Duo" },
            ]}
          />
        </Field>
        {/* The chosen mode's explanation under the picker, so a mod knows who'll be cut before choosing. */}
        <Field
          label="Draft cuts"
          hint={
            <>
              {cutModeOptions(form.signupMode).find((o) => o.value === form.cutMode)?.help} Who will be cut shows on the Signups tab, and is listed
              again before moving into the draft.
            </>
          }
        >
          <Select
            value={form.cutMode}
            onChange={(cutMode) => setForm({ ...form, cutMode: cutMode as CutMode })}
            className="w-auto!"
            options={cutModeOptions(form.signupMode).map(({ value, label }) => ({ value, label }))}
          />
        </Field>
        {form.cutMode !== "none" && (
          <Checkbox checked={form.warnLeftovers} onChange={(warnLeftovers) => setForm({ ...form, warnLeftovers })}>
            Warn signups at risk of being cut, on their signup page
          </Checkbox>
        )}
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
        <p className="text-sm text-on-surface-muted">
          Total pot: <span className="num font-semibold text-on-surface">{potTotal.toLocaleString()} GP</span> — <span className="num">{paidSignupCount}</span> paid signup
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

      <IntegrationSection title="Wise Old Man" switchLabel="Enable Wise Old Man integration" enabled={form.womEnabled} onToggle={(womEnabled) => setForm({ ...form, womEnabled })}>
        <Notice tone="info">
          When enabled, a Wise Old Man group competition is created automatically for this bingo's teams once the draft finishes, then kept up to date:
          the bingo's name, its start and end dates, and every team's name and players.
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
        <WomConnectionCheck slug={slug} groupId={form.womGroupId} verificationCode={form.womGroupVerificationCode} />
        {bingo.womCompetitionId && (
          <Notice tone="ok">
            Competition created —{" "}
            <ExternalLink href={`https://wiseoldman.net/competitions/${bingo.womCompetitionId}`}>view on Wise Old Man</ExternalLink>
            .
          </Notice>
        )}
        {bingo.womSyncError && <Notice tone="warn">Last WOM sync failed: {bingo.womSyncError}</Notice>}
      </IntegrationSection>

      <IntegrationSection title="Discord" switchLabel="Enable Discord team roles and channels" enabled={form.discordEnabled} onToggle={(discordEnabled) => setForm({ ...form, discordEnabled })}>
        <Notice tone="info">
          When enabled, every team gets a Discord role in its color, given to its players, and the channels below, private to that role, in one
          category: one the bot makes for this bingo, or an existing one. They're made when the draft finishes, with the Wise Old Man competition, then
          kept up to date: renames, colors, players removed or signed up late, and changes here. Nothing is deleted when the bingo finishes; remove it
          all below once you're done with it.
        </Notice>
        {devMode && (
          <Field
            label="Discord server ID (dev only)"
            hint="To try the sync on a test Discord server the bot is in, instead of the clan's. Blank: the clan's. In Discord: Developer Mode, then right-click the server > Copy Server ID. Remove this bingo's roles and channels from Discord before changing it."
          >
            <Input value={form.discordGuildId} placeholder="The clan's server" onChange={(e) => setForm({ ...form, discordGuildId: e.target.value })} className="num" />
          </Field>
        )}
        <Field
          label="Existing category ID (optional)"
          hint="Put every team's channels in a category the server already has, after the channels already in it. The bot never renames or deletes it. Blank: the bot makes a category for this bingo. In Discord: Developer Mode, then right-click the category > Copy Channel ID. Changing it moves the channels."
        >
          <Input value={form.discordCategoryId} placeholder="Make one for this bingo" onChange={(e) => setForm({ ...form, discordCategoryId: e.target.value.replace(/[^0-9]/g, "") })} className="num" />
        </Field>
        {!form.discordCategoryId.trim() && (
          <Field label="Category name" hint="The category the bot makes for this bingo. Blank: the bingo's name.">
            <Input value={form.discordCategoryName} placeholder={form.name} onChange={(e) => setForm({ ...form, discordCategoryName: e.target.value })} />
          </Field>
        )}
        <DiscordChannelsEditor channels={form.discordChannels} onChange={(discordChannels) => setForm({ ...form, discordChannels })} />
        <DiscordSyncPanel slug={slug} bingo={bingo} onRemoved={() => setForm((f) => ({ ...f, discordEnabled: false }))} />
      </IntegrationSection>

      {/* What players get during Board revealed (CONTEXT.md "Sealed Tiles"). Both end by themselves at Live, so they're
          offered up to then. */}
      {!isBoardLocked(bingo.stage) && (
        <Section title={STAGE_LABEL.reveal}>
          <p className="text-sm text-on-surface-muted">Only while the bingo is in {STAGE_LABEL.reveal}: both end by themselves when it goes {STAGE_LABEL.live}.</p>
          <div className="space-y-1">
            <Checkbox checked={form.sealedTiles} onChange={(sealedTiles) => setForm({ ...form, sealedTiles })}>
              Seal the Tiles
            </Checkbox>
            <p className="text-sm text-on-surface-muted">
              Players and Captains see each Tile's art, name and Category, but can't open it, see its points or mark interest. Moderators can still open
              everything.
              {bingo.stage === "reveal" && (areTilesSealed(bingo) ? " The Tiles are sealed now." : " The Tiles are open now.")}
            </p>
          </div>
          <div className="space-y-1">
            <Checkbox checked={form.hideRules} onChange={(hideRules) => setForm({ ...form, hideRules })}>
              Hide the rules
            </Checkbox>
            <p className="text-sm text-on-surface-muted">Players and Captains are told the rules come later.</p>
          </div>
        </Section>
      )}

      <Section title="Rules">
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
              <Markdown>{form.rulesMarkdown || "*(nothing yet)*"}</Markdown>
            </div>
          ) : (
            <Textarea aria-label="Rules (Markdown)" value={form.rulesMarkdown} onChange={(e) => setForm({ ...form, rulesMarkdown: e.target.value })} rows={6} className="font-mono" />
          )}
        </Field>
      </Section>

      <Section title="Once Finished">
        <p className="text-sm text-on-surface-muted">
          Once the bingo is finished, every clan member can read it: the board, stats, final teams, and every team's submissions.
        </p>
        <Checkbox checked={form.showScreenshotsWhenFinished} onChange={(showScreenshotsWhenFinished) => setForm({ ...form, showScreenshotsWhenFinished })}>
          Show screenshots once Finished
        </Checkbox>
        <p className="text-sm text-on-surface-muted">Off, other teams' screenshots are hidden from everyone but the mods. Players still see their own team's.</p>
        <Checkbox checked={form.publishWrappedOnFinish} onChange={(publishWrappedOnFinish) => setForm({ ...form, publishWrappedOnFinish })}>
          Publish Wrapped when the bingo finishes
        </Checkbox>
        <p className="text-sm text-on-surface-muted">
          On, Wrapped publishes itself once the bingo is finished and no submission is pending (as the last one is reviewed). Off, it stays hidden until a mod publishes it from the mod panel.
        </p>
      </Section>

      <Section title="Exclusive items">
        <ExclusiveItemsSection slug={slug} rules={form.exclusivityRules} onChange={(exclusivityRules) => setForm({ ...form, exclusivityRules })} />
      </Section>

      <Section title="Export">
        <p className="text-sm text-on-surface-muted">
          Download this bingo's board and settings as a file — categories, tiles, tasks, lines, and signup questions. Everything
          environment-specific (teams, signups, submissions, moderators, dates) is left out. Import it as a new bingo from the site admin page.
        </p>
        <div className="flex items-center gap-3">
          <Switch isSelected={includeImages} onChange={setIncludeImages}>
            Include tile images
          </Switch>
          <span className="text-xs text-on-surface-subtle">(makes the file much larger)</span>
        </div>
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
    <Disclosure defaultExpanded title={<span className="flex-1 text-sm font-semibold text-on-surface">{title}</span>}>
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
// Test connection: checks the group ID and verification code as they are in the form (the saved code when the field is
// blank) against Wise Old Man, without saving or changing anything, so a typo shows up before the draft rather than
// as a competition that failed to be made. A result is cleared once either field changes.
function WomConnectionCheck({ slug, groupId, verificationCode }: { slug: string; groupId: string; verificationCode: string }) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<adminApi.WomGroupCheck | null>(null);
  useEffect(() => setResult(null), [groupId, verificationCode]);

  const check = async () => {
    setChecking(true);
    try {
      setResult(await adminApi.checkWomGroup(slug, { groupId: groupId.trim(), verificationCode: verificationCode.trim() }));
    } catch (e) {
      setResult({ ok: false, problem: "unreachable", message: e instanceof Error ? e.message : "The check failed." });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button onPress={check} isDisabled={checking}>
        {checking ? "Testing…" : "Test connection"}
      </Button>
      {result &&
        (result.ok ? (
          <Notice tone="ok">
            Connected to <strong>{result.groupName || `group ${groupId}`}</strong>, and the verification code is right.
          </Notice>
        ) : (
          <Notice tone="warn">{result.message}</Notice>
        ))}
    </div>
  );
}

function IntegrationSection({ title, switchLabel, enabled, onToggle, children }: { title: string; switchLabel: string; enabled: boolean; onToggle: (value: boolean) => void; children: ReactNode }) {
  const [expanded, setExpanded] = useState(enabled);
  useEffect(() => setExpanded(enabled), [enabled]);

  return (
    <Disclosure
      title={<span className="flex-1 text-sm font-semibold text-on-surface">{title}</span>}
      isExpanded={expanded}
      onExpandedChange={setExpanded}
      action={<Switch isSelected={enabled} onChange={onToggle} aria-label={switchLabel} />}
    >
      <div className="space-y-4">{children}</div>
    </Disclosure>
  );
}
