import { useState } from "react";
import type { DraftPoolEntry, SignupQuestion, Team } from "@bingo/shared";
import { useAuth } from "../../context/AuthContext";
import { useBingo, useDraftState, useMakePick, useRenameTeam, useSignupQuestions, useStartDraft } from "../../api/queries";
import { displayName } from "../ui/user";

function TeamRow({ slug, team, isCurrent, isMine }: { slug: string; team: Team; isCurrent: boolean; isMine: boolean }) {
  const renameTeam = useRenameTeam(slug);

  async function rename(name: string) {
    if (name.trim() && name.trim() !== team.name) await renameTeam.mutateAsync({ teamId: team.id, name: name.trim() });
  }

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
        isCurrent ? "border-indigo-500 bg-indigo-950/40" : "border-slate-700 bg-slate-800"
      }`}
    >
      {team.color && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: team.color }} />}
      {isMine ? (
        <input
          defaultValue={team.name}
          onBlur={(e) => rename(e.target.value)}
          className="flex-1 min-w-0 bg-transparent text-white font-medium text-sm focus:outline-none border-b border-transparent focus:border-slate-600"
        />
      ) : (
        <span className="flex-1 min-w-0 text-white font-medium text-sm truncate">{team.name}</span>
      )}
      <span className="text-xs text-slate-500 shrink-0">#{team.draftOrder}</span>
      {isCurrent && <span className="text-xs text-indigo-400 font-semibold shrink-0">on the clock</span>}
    </div>
  );
}

function PoolRow({
  entry,
  questions,
  canPick,
  onPick,
  picking,
}: {
  entry: DraftPoolEntry;
  questions: SignupQuestion[];
  canPick: boolean;
  onPick: () => void;
  picking: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const answerByQ = new Map((entry.answers ?? []).map((a) => [a.questionId, a.value]));

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium truncate">{entry.signup.rsn}</p>
          <p className="text-slate-500 text-xs truncate">{displayName(entry.user)}</p>
        </div>
        {entry.answers && questions.length > 0 && (
          <button onClick={() => setExpanded((e) => !e)} className="text-xs text-slate-400 hover:text-white cursor-pointer shrink-0">
            {expanded ? "Hide" : "Info"}
          </button>
        )}
        {canPick && (
          <button
            onClick={onPick}
            disabled={picking}
            className="text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded px-2.5 py-1 cursor-pointer shrink-0"
          >
            Draft
          </button>
        )}
      </div>
      {expanded && entry.answers && (
        <dl className="mt-2 pt-2 border-t border-slate-700 space-y-1">
          {questions.map((q) => (
            <div key={q.id} className="text-xs">
              <dt className="text-slate-500">{q.prompt}</dt>
              <dd className="text-slate-300">{answerByQ.get(q.id) ?? "—"}</dd>
            </div>
          ))}
        </dl>
      )}
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
  const myCaptainTeam = state.teams.find((t) => t.captainUserId === user.id) ?? null;
  const currentTeam = state.currentPick ? (state.teams.find((t) => t.id === state.currentPick!.teamId) ?? null) : null;
  const canAct = !!state.currentPick && (isMod || (!!myCaptainTeam && currentTeam?.id === myCaptainTeam.id));

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
              <p className="text-white font-bold text-lg">
                {currentTeam?.name ?? "…"}'s turn{canAct ? " — you're up!" : ""}
              </p>
            </>
          ) : (
            <p className="text-green-400 font-bold text-lg">
              Draft complete! {isMod && "Advance to the reveal stage when you're ready."}
            </p>
          )}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-white font-semibold mb-2">Teams</h3>
          <div className="space-y-2">
            {state.teams.map((team) => (
              <TeamRow key={team.id} slug={slug} team={team} isCurrent={currentTeam?.id === team.id} isMine={team.captainUserId === user.id} />
            ))}
            {state.teams.length === 0 && <p className="text-slate-500 text-sm">No teams yet.</p>}
          </div>

          {state.picks.length > 0 && (
            <>
              <h3 className="text-white font-semibold mt-6 mb-2">Picks</h3>
              <ol className="space-y-1 text-sm">
                {state.picks.map((p) => {
                  const team = state.teams.find((t) => t.id === p.teamId);
                  return (
                    <li key={p.id} className="text-slate-300">
                      <span className="text-slate-500">#{p.pickNumber}</span> {team?.name ?? "?"} picked{" "}
                      <span className="text-white">{displayName(p.user)}</span>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </div>

        <div>
          <h3 className="text-white font-semibold mb-2">Undrafted players ({state.pool.length})</h3>
          {pickError && <p className="text-red-400 text-sm mb-2">{pickError}</p>}
          <div className="space-y-2">
            {state.pool.map((entry) => (
              <PoolRow
                key={entry.signup.id}
                entry={entry}
                questions={questionsData?.questions ?? []}
                canPick={canAct}
                onPick={() => handlePick(entry.user.id)}
                picking={makePick.isPending}
              />
            ))}
            {state.pool.length === 0 && <p className="text-slate-500 text-sm">No one left to draft.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
