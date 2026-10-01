import { useMemo } from "react";
import { useParams } from "react-router-dom";
import type { BuyinEntry } from "@bingo/shared";
import { useBingo, useBuyins, useMarkBuyinOnPage } from "../api/queries";
import { useAuth } from "../context/AuthContext";
import { useBingoHeader, useBingoMenuEntries } from "../headless";
import { useCan, usePageAccess } from "../headless/permissions";
import { AppHeader } from "../core/ui/AppHeader";
import { Badge, Card, Notice } from "../core/ui/Card";
import { formatGp } from "../core/ui/gp";
import { Select } from "../core/ui/Select";
import { Switch } from "../core/ui/Switch";
import { TableSearchInput, matchesSearch, useTableSearch } from "../core/ui/tableSearch";
import { useEscapeBack } from "../core/ui/useEscapeBack";
import { discordName, displayName } from "../core/ui/user";

// The Buy-ins page (CONTEXT.md "Staff"): every signup's RSN, Discord name and Buy-in, who collected it and who recorded
// it, and a switch to mark it. For Staff it's the only page of the bingo they have (view_buyins, while Buy-ins are
// collected); Moderators and Admins can use it too. Losing it while here (removed as Staff, or the bingo went Live)
// sends them on with a toast. Mod surfaces never theme, so neither does this.
export function BuyinsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: shell } = useBingo(slug);
  const mayStay = usePageAccess(slug, (can) => can("view_buyins").allowed, "view_buyins", shell?.bingo.name);
  const canMark = useCan("mark_buyins", slug);
  const { data } = useBuyins(slug, mayStay);
  const markBuyin = useMarkBuyinOnPage(slug ?? "");
  const { user: me } = useAuth();
  const menuEntries = useBingoMenuEntries(slug ?? "", useBingoHeader(slug ?? ""));
  const [search, setSearch] = useTableSearch();

  useEscapeBack(`/b/${slug}`);

  const buyins = data?.buyins;
  const rows = useMemo(() => (buyins ?? []).filter((b) => matchesSearch([b.user.rsn, discordName(b.user)], search)), [buyins, search]);
  // The bingo's Moderators and Staff, and whoever is already recorded, so a row whose collector has since lost the
  // role still shows them.
  const collectorOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const c of data?.collectors ?? []) byId.set(c.id, displayName(c));
    for (const b of buyins ?? []) if (b.collectedBy) byId.set(b.collectedBy.id, displayName(b.collectedBy));
    return [{ value: "", label: "Nobody yet" }, ...[...byId].map(([value, label]) => ({ value, label }))];
  }, [data?.collectors, buyins]);

  if (!shell || !mayStay || !slug) return null;

  const paid = (buyins ?? []).filter((b) => b.receivedAt).length;
  const iCollect = !!me && (data?.collectors ?? []).some((c) => c.id === me.id);
  // Marking it received credits whoever marks it as the collector, when they're one who can be: as Staff, that's them.
  const toggle = (entry: BuyinEntry, received: boolean) =>
    markBuyin.mutate({ signupId: entry.signupId, received, collectedByUserId: received ? (iCollect ? me!.id : null) : undefined });
  const setCollector = (entry: BuyinEntry, userId: string) => markBuyin.mutate({ signupId: entry.signupId, received: true, collectedByUserId: userId || null });

  return (
    <div className="min-h-dvh bg-background text-on-surface">
      <AppHeader title="Buy-ins" subtitle={shell.bingo.name} menuEntries={menuEntries} />
      <main className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-on-surface-muted">
            <span className="num text-on-surface">{paid}</span> of <span className="num text-on-surface">{buyins?.length ?? 0}</span> paid
            {shell.bingo.buyinAmount != null && <> · {formatGp(shell.bingo.buyinAmount)} each</>} · Pot <span className="num text-on-surface">{formatGp(shell.potTotal)}</span>
          </p>
          <TableSearchInput value={search} onChange={setSearch} placeholder="Search RSN or Discord" matchCount={rows.length} totalCount={buyins?.length ?? 0} />
        </div>
        {!canMark.allowed && canMark.reason && <Notice tone="info">{canMark.reason}</Notice>}
        {markBuyin.error && <Notice tone="danger">{markBuyin.error.message}</Notice>}
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-outline text-left text-xs text-on-surface-subtle">
              <tr>
                <th className="px-3 py-2 font-medium">RSN</th>
                <th className="px-3 py-2 font-medium">Discord</th>
                <th className="px-3 py-2 font-medium">Buy-in</th>
                <th className="px-3 py-2 font-medium">Collected by</th>
                <th className="px-3 py-2 font-medium">Recorded by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline">
              {rows.map((entry) => (
                <tr key={entry.signupId}>
                  <td className="px-3 py-2 text-on-surface">{entry.user.rsn}</td>
                  <td className="px-3 py-2 text-on-surface-muted">{discordName(entry.user)}</td>
                  <td className="px-3 py-2">
                    <Switch isSelected={!!entry.receivedAt} isDisabled={!canMark.allowed} onChange={(received) => toggle(entry, received)} aria-label={`Buy-in received from ${entry.user.rsn}`}>
                      {entry.receivedAt ? <Badge tone="ok">Paid</Badge> : <span className="text-on-surface-subtle">Unpaid</span>}
                    </Switch>
                  </td>
                  <td className="min-w-40 px-3 py-2">
                    {entry.receivedAt ? (
                      <Select
                        size="sm"
                        value={entry.collectedBy?.id ?? ""}
                        options={collectorOptions}
                        onChange={(userId) => setCollector(entry, userId)}
                        disabled={!canMark.allowed}
                        aria-label={`Who collected ${entry.user.rsn}'s Buy-in`}
                      />
                    ) : (
                      <span className="text-on-surface-subtle">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-on-surface-muted">{entry.recordedBy ? displayName(entry.recordedBy) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {buyins && rows.length === 0 && <p className="px-3 py-6 text-center text-sm text-on-surface-subtle">{buyins.length === 0 ? "Nobody has signed up yet." : "No signups match."}</p>}
        </Card>
      </main>
    </div>
  );
}
