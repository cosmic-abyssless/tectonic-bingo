import { useState } from "react";
import type { DraftPick, DraftPoolEntry, DraftTeam, RuneProfileAccountType, SignupQuestion } from "@bingo/shared";
import { useAuth } from "../../context/AuthContext";
import { useBingo, useDraftState, useMakePick, useSignupQuestions, useStartDraft } from "../../api/queries";
import { displayName } from "../ui/user";
import ironmanBadge from "../ui/icons/Ironman_chat_badge.png";
import ultimateBadge from "../ui/icons/Ultimate_ironman_chat_badge.png";
import hardcoreBadge from "../ui/icons/Hardcore_ironman_chat_badge.png";
import groupBadge from "../ui/icons/Group_ironman_chat_badge.png";
import hardcoreGroupBadge from "../ui/icons/Hardcore_group_ironman_chat_badge.png";
import unrankedGroupBadge from "../ui/icons/Unranked_group_ironman_chat_badge.png";

const ACCOUNT_TYPE_LABEL: Record<RuneProfileAccountType, string> = {
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
const ACCOUNT_TYPE_BADGE: Partial<Record<RuneProfileAccountType, string>> = {
  ironman: ironmanBadge,
  ultimate_ironman: ultimateBadge,
  hardcore_ironman: hardcoreBadge,
  group_ironman: groupBadge,
  hardcore_group_ironman: hardcoreGroupBadge,
  unranked_group_ironman: unrankedGroupBadge,
};

function AccountTypeIcon({ accountType }: { accountType: RuneProfileAccountType | null | undefined }) {
  const badge = accountType && ACCOUNT_TYPE_BADGE[accountType];
  if (!badge) return null;
  return <img src={badge} alt={ACCOUNT_TYPE_LABEL[accountType]} title={ACCOUNT_TYPE_LABEL[accountType]} className="inline-block align-[-2px]" />;
}

// One column per team: captain's RSN up top (with an "on the clock"
// indicator above it while it's their turn), that team's picks listed below
// in draft order.
function CaptainColumn({ team, picks, isCurrent }: { team: DraftTeam; picks: DraftPick[]; isCurrent: boolean }) {
  return (
    <div className="flex flex-col items-center text-center gap-1 min-w-0">
      <div className="h-4 text-xs font-bold text-indigo-400 uppercase tracking-wide">{isCurrent && "▼ On the clock"}</div>
      <div
        className={`w-full rounded-lg border px-2 py-2 transition-colors ${
          isCurrent ? "border-indigo-500 bg-indigo-950/40" : "border-slate-700 bg-slate-800"
        }`}
      >
        <div className="flex items-center justify-center gap-1.5 min-w-0">
          {team.color && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: team.color }} />}
          <span className="text-white font-semibold text-sm truncate">{team.captainRsn || "?"}</span>
        </div>
      </div>
      <div className="w-full space-y-1">
        {picks.map((p) => (
          <div key={p.id} className="bg-slate-800/60 rounded px-2 py-1 text-slate-300 text-sm truncate">
            {p.rsn || displayName(p.user)}
          </div>
        ))}
      </div>
    </div>
  );
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
      <th
        onClick={() => toggleSort(sortKeyValue)}
        className={`pb-2 pr-4 whitespace-nowrap cursor-pointer select-none hover:text-slate-300 transition-colors ${active ? "text-slate-300" : ""}`}
      >
        {label} {active && (sortDir === "asc" ? "▲" : "▼")}
      </th>
    );
  }

  if (pool.length === 0) return <p className="text-slate-500 text-sm">No one left to draft.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 text-xs uppercase border-b border-slate-700">
            <SortHeader label="RSN" sortKeyValue="rsn" />
            <SortHeader label="Discord" sortKeyValue="discord" />
            {showWomStats && <SortHeader label="EHB" sortKeyValue="ehb" />}
            {showAnswers && questions.map((q) => <SortHeader key={q.id} label={q.prompt} sortKeyValue={q.id} />)}
            {canPick && <th className="pb-2" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {sorted.map((entry) => {
            const answerByQ = new Map((entry.answers ?? []).map((a) => [a.questionId, a.value]));
            return (
              <tr key={entry.signup.id}>
                <td className="py-2 pr-4 text-white font-medium whitespace-nowrap">
                  <AccountTypeIcon accountType={entry.accountType} /> {entry.signup.rsn}
                </td>
                <td className="py-2 pr-4 text-slate-300 whitespace-nowrap">{displayName(entry.user)}</td>
                {showWomStats && <td className="py-2 pr-4 text-slate-300 whitespace-nowrap">{entry.womStats ? Math.round(entry.womStats.ehb).toLocaleString() : "—"}</td>}
                {showAnswers &&
                  questions.map((q) => (
                    <td key={q.id} className="py-2 pr-4 text-slate-300">
                      {answerByQ.get(q.id) ?? "—"}
                    </td>
                  ))}
                {canPick && (
                  <td className="py-2">
                    <button
                      onClick={() => onPick(entry.user.id)}
                      disabled={picking}
                      className="text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded px-2.5 py-1 cursor-pointer shrink-0"
                    >
                      Draft
                    </button>
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
      <div className="flex flex-col items-center justify-center py-24 gap-2 text-center">
        <p className="text-red-400 font-medium">{stateError instanceof Error ? stateError.message : "Couldn't load the draft"}</p>
      </div>
    );
  }
  if (!shell || !state || !user) {
    return <div className="text-center text-slate-400 py-24">Loading…</div>;
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
    <div className="w-full max-w-5xl mx-auto px-6 py-6 space-y-6">
      {!state.draftStarted && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-white font-semibold">Draft hasn't started</p>
            <p className="text-slate-400 text-sm">
              {state.teams.length} team{state.teams.length === 1 ? "" : "s"} created.{" "}
              {state.teams.length < 2 ? "Create at least 2 teams from the admin panel first." : "Randomize the pick order to begin."}
            </p>
            {startError && <p className="text-red-400 text-sm mt-1">{startError}</p>}
          </div>
          {isMod && (
            <button
              onClick={handleStart}
              disabled={state.teams.length < 2 || startDraft.isPending}
              className="text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded px-4 py-2 transition-colors cursor-pointer shrink-0"
            >
              {startDraft.isPending ? "Starting…" : "Start Draft"}
            </button>
          )}
        </div>
      )}

      {state.draftStarted && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          {state.currentPick ? (
            <>
              <p className="text-xs text-slate-500 uppercase tracking-wide">
                Round {state.currentPick.round} — Pick {state.currentPick.pickNumber}
              </p>
              <p className="text-white font-bold text-lg">{currentTeam?.name ?? "…"}'s turn</p>
            </>
          ) : (
            <p className="text-green-400 font-bold text-lg">
              Draft complete! {isMod && "Advance to the reveal stage when you're ready."}
            </p>
          )}
        </div>
      )}

      {isMyTurn && (
        <div className="bg-indigo-600 border border-indigo-400 rounded-lg px-4 py-3 flex items-center gap-3">
          <span className="text-2xl">🎯</span>
          <p className="text-white font-bold text-lg">It's your turn to pick!</p>
        </div>
      )}

      <div>
        <h3 className="text-white font-semibold mb-3">Teams</h3>
        {/* grid-flow-col + a minimum column width, in a scrollable row —
            handles a handful of teams (spread to fill width) and a large
            number of teams (scrolls instead of squeezing RSNs unreadable). */}
        <div className="overflow-x-auto">
          <div className="grid grid-flow-col auto-cols-[minmax(110px,1fr)] gap-3">
            {state.teams.map((team) => (
              <CaptainColumn
                key={team.id}
                team={team}
                picks={state.picks.filter((p) => p.teamId === team.id)}
                isCurrent={currentTeam?.id === team.id}
              />
            ))}
          </div>
        </div>
        {state.teams.length === 0 && <p className="text-slate-500 text-sm">No teams yet.</p>}
      </div>

      <div>
        <h3 className="text-white font-semibold mb-2">Undrafted players ({state.pool.length})</h3>
        {pickError && <p className="text-red-400 text-sm mb-2">{pickError}</p>}
        <PoolTable pool={state.pool} questions={questionsData?.questions ?? []} canPick={canAct} onPick={handlePick} picking={makePick.isPending} />
      </div>
    </div>
  );
}
