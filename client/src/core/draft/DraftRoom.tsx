import { useState } from "react";
import type { DraftPoolEntry, AccountType, SignupQuestion } from "@bingo/shared";
import { useAuth } from "../../context/AuthContext";
import { useBingo, useDraftState, useMakePick, useSignupQuestions, useStartDraft } from "../../api/queries";
import { displayName } from "../ui/user";
import { Button } from "../ui/Button";
import { Card, Notice } from "../ui/Card";
import { TeamRoster } from "./TeamRoster";
import ironmanBadge from "../ui/icons/Ironman_chat_badge.png";
import ultimateBadge from "../ui/icons/Ultimate_ironman_chat_badge.png";
import hardcoreBadge from "../ui/icons/Hardcore_ironman_chat_badge.png";
import groupBadge from "../ui/icons/Group_ironman_chat_badge.png";
import hardcoreGroupBadge from "../ui/icons/Hardcore_group_ironman_chat_badge.png";
import unrankedGroupBadge from "../ui/icons/Unranked_group_ironman_chat_badge.png";

const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  normal: "Main",
  ironman: "Ironman",
  ultimate_ironman: "Ultimate Ironman",
  hardcore_ironman: "Hardcore Ironman",
  group_ironman: "Group Ironman",
  hardcore_group_ironman: "Hardcore Group Ironman",
  unranked_group_ironman: "Unranked Group Ironman",
  unknown: "Unranked",
};

// OSRS's own in-game chat badges (client/src/core/ui/icons), from
// RuneProfile — unlike WOM, it distinguishes group ironman variants. No
// icon at all for a main (normal) or unranked account.
const ACCOUNT_TYPE_BADGE: Partial<Record<AccountType, string>> = {
  ironman: ironmanBadge,
  ultimate_ironman: ultimateBadge,
  hardcore_ironman: hardcoreBadge,
  group_ironman: groupBadge,
  hardcore_group_ironman: hardcoreGroupBadge,
  unranked_group_ironman: unrankedGroupBadge,
};

function AccountTypeIcon({ accountType }: { accountType: AccountType | null | undefined }) {
  const badge = accountType && ACCOUNT_TYPE_BADGE[accountType];
  if (!badge) return null;
  return <img src={badge} alt={ACCOUNT_TYPE_LABEL[accountType]} title={ACCOUNT_TYPE_LABEL[accountType]} className="inline-block align-[-2px]" />;
}


// "rsn" | "discord" | "ehb" | a signup question's id — anything the pool table can sort by.
type SortKey = string;

// Numeric columns must sort numerically, not with localeCompare (which
// would put "100" before "9" — string-lexicographic order, not magnitude).
function poolSortValue(entry: DraftPoolEntry, key: SortKey): string | number {
  if (key === "rsn") return entry.signup.rsn.toLowerCase();
  if (key === "discord") return displayName(entry.user).toLowerCase();
  if (key === "ehb") return entry.womStats?.ehb ?? -1;
  return (entry.answers?.find((a) => a.questionId === key)?.value ?? "").toLowerCase();
}

function PoolTable({
  pool,
  questions,
  canPick,
  onPick,
  picking,
}: {
  pool: DraftPoolEntry[];
  questions: SignupQuestion[];
  canPick: boolean;
  onPick: (userId: string) => void;
  picking: boolean;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("rsn");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  // Answers are only sent to mods/captains (see draftService.getDraftState) —
  // everyone else's pool entries have answers: null, so skip those columns
  // entirely rather than render a table full of "—".
  const showAnswers = pool.some((e) => e.answers !== null);
  // Skip the WOM columns entirely if nobody in the pool has stats (WOM
  // integration effectively unused for this bingo), same reasoning.
  const showWomStats = pool.some((e) => e.womStats !== null);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sorted = [...pool].sort((a, b) => {
    const va = poolSortValue(a, sortKey);
    const vb = poolSortValue(b, sortKey);
    const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
    return sortDir === "asc" ? cmp : -cmp;
  });

  function SortHeader({ label, sortKeyValue }: { label: string; sortKeyValue: SortKey }) {
    const active = sortKey === sortKeyValue;
    return (
      <th className="pb-2 pr-4 whitespace-nowrap font-medium">
        <button
          type="button"
          onClick={() => toggleSort(sortKeyValue)}
          className={`select-none transition-colors hover:text-fg ${active ? "text-fg" : "text-fg-subtle"}`}
        >
          {label} {active && (sortDir === "asc" ? "↑" : "↓")}
        </button>
      </th>
    );
  }

  if (pool.length === 0) return <p className="text-sm text-fg-subtle">No one left to draft.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-fg-subtle">
            <SortHeader label="RSN" sortKeyValue="rsn" />
            <SortHeader label="Discord" sortKeyValue="discord" />
            {showWomStats && <SortHeader label="EHB" sortKeyValue="ehb" />}
            {showAnswers && questions.map((q) => <SortHeader key={q.id} label={q.prompt} sortKeyValue={q.id} />)}
            {canPick && <th className="pb-2" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {sorted.map((entry) => {
            const answerByQ = new Map((entry.answers ?? []).map((a) => [a.questionId, a.value]));
            return (
              <tr key={entry.signup.id}>
                <td className="whitespace-nowrap py-2 pr-4 font-medium text-fg">
                  <AccountTypeIcon accountType={entry.accountType} /> {entry.signup.rsn}
                </td>
                <td className="whitespace-nowrap py-2 pr-4 text-fg-muted">{displayName(entry.user)}</td>
                {showWomStats && <td className="num whitespace-nowrap py-2 pr-4 text-fg-muted">{entry.womStats ? Math.round(entry.womStats.ehb).toLocaleString() : "—"}</td>}
                {showAnswers &&
                  questions.map((q) => (
                    <td key={q.id} className="py-2 pr-4 text-fg-muted">
                      {answerByQ.get(q.id) ?? "—"}
                    </td>
                  ))}
                {canPick && (
                  <td className="py-1 text-right">
                    <Button size="sm" variant="primary" onPress={() => onPick(entry.user.id)} isDisabled={picking}>
                      Draft
                    </Button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function DraftRoom({ slug }: { slug: string }) {
  const { user } = useAuth();
  const { data: shell } = useBingo(slug);
  const { data: state, error: stateError } = useDraftState(slug);
  const { data: questionsData } = useSignupQuestions(slug);
  const startDraft = useStartDraft(slug);
  const makePick = useMakePick(slug);
  const [startError, setStartError] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  if (stateError) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-6">
        <Notice tone="danger">{stateError instanceof Error ? stateError.message : "Couldn't load the draft"}</Notice>
      </div>
    );
  }
  if (!shell || !state || !user) {
    return <div className="py-24 text-center text-fg-muted">Loading…</div>;
  }

  const isMod = shell.isMod;
  // The pick-on-behalf-of override is site-admin only — a regular per-bingo
  // mod who isn't also a site admin doesn't get it, only the acting captain
  // does. Matches the server-side check in draftService.makePick.
  const isAdmin = !!user.isAdmin;
  const myCaptainTeam = state.teams.find((t) => t.captainUserId === user.id) ?? null;
  const currentTeam = state.currentPick ? (state.teams.find((t) => t.id === state.currentPick!.teamId) ?? null) : null;
  const isMyTurn = !!myCaptainTeam && currentTeam?.id === myCaptainTeam.id;
  const canAct = !!state.currentPick && (isAdmin || isMyTurn);

  async function handleStart() {
    setStartError(null);
    try {
      await startDraft.mutateAsync();
    } catch (e: unknown) {
      setStartError(e instanceof Error ? e.message : "Failed to start the draft");
    }
  }

  async function handlePick(pickedUserId: string) {
    setPickError(null);
    try {
      await makePick.mutateAsync(pickedUserId);
    } catch (e: unknown) {
      setPickError(e instanceof Error ? e.message : "Failed to make that pick");
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-6 py-6">
      {!state.draftStarted ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="font-semibold text-fg">The draft hasn't started</p>
            <p className="text-sm text-fg-muted">
              {state.teams.length} team{state.teams.length === 1 ? "" : "s"} ready.{" "}
              {state.teams.length < 2 ? "Create at least 2 teams from the mod panel first." : "Starting randomizes the pick order."}
            </p>
            {startError && <p className="mt-1 text-sm text-danger">{startError}</p>}
          </div>
          {isMod && (
            <Button variant="primary" onPress={handleStart} isDisabled={state.teams.length < 2 || startDraft.isPending}>
              {startDraft.isPending ? "Starting…" : "Start draft"}
            </Button>
          )}
        </Card>
      ) : state.currentPick ? (
        <Card className="p-4">
          <p className="num text-xs uppercase tracking-wide text-fg-subtle">
            Round {state.currentPick.round} · Pick {state.currentPick.pickNumber}
          </p>
          <p className="text-lg font-semibold text-fg">{currentTeam?.name ?? "…"} is on the clock</p>
        </Card>
      ) : (
        <Notice tone="ok">Draft complete. {isMod ? "Advance to the reveal stage from the mod panel when you're ready." : "The board is revealed next."}</Notice>
      )}

      {isMyTurn && <Notice tone="ok">It's your turn to pick.</Notice>}

      <section>
        <h3 className="mb-3 text-sm font-semibold text-fg">Teams</h3>
        {/* grid-flow-col + a minimum column width, in a scrollable row —
            handles a handful of teams (spread to fill width) and a large
            number of teams (scrolls instead of squeezing RSNs unreadable). */}
        <div className="overflow-x-auto">
          <div className="grid auto-cols-[minmax(140px,1fr)] grid-flow-col gap-3">
            {state.teams.map((team) => (
              <TeamRoster key={team.id} team={team} picks={state.picks.filter((p) => p.teamId === team.id)} isCurrent={currentTeam?.id === team.id} />
            ))}
          </div>
        </div>
        {state.teams.length === 0 && <p className="text-sm text-fg-subtle">No teams yet.</p>}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-fg">
          Available players <span className="num font-normal text-fg-subtle">({state.pool.length})</span>
        </h3>
        {pickError && (
          <Notice tone="danger" className="mb-2">
            {pickError}
          </Notice>
        )}
        <PoolTable pool={state.pool} questions={questionsData?.questions ?? []} canPick={canAct} onPick={handlePick} picking={makePick.isPending} />
      </section>
    </div>
  );
}
