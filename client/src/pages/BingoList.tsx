import { Link } from "react-router-dom";
import { useBingos } from "../api/queries";
import { useAuth } from "../context/AuthContext";
import { displayName, avatarUrl } from "../core/ui/user";

const STAGE_LABEL: Record<string, string> = {
  planning: "Planning",
  signup: "Signup open",
  draft: "Draft in progress",
  reveal: "Board revealed",
  live: "Live",
  complete: "Complete",
};

export function BingoList() {
  const { user, logout } = useAuth();
  const { data, isLoading, error } = useBingos();

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <header className="flex items-center justify-between px-6 py-3 bg-slate-800 border-b border-slate-700">
        <span className="font-bold text-lg tracking-tight">Bingo Platform</span>
        {user && (
          <div className="flex items-center gap-3">
            <img src={avatarUrl(user)} alt="avatar" className="w-8 h-8 rounded-full border-2 border-indigo-500" />
            <span className="text-sm text-slate-300">{displayName(user)}</span>
            <button
              onClick={logout}
              className="text-sm text-slate-400 hover:text-white border border-slate-600 hover:border-slate-400 rounded px-3 py-1 transition-colors cursor-pointer"
            >
              Log out
            </button>
          </div>
        )}
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Bingos</h1>
        {isLoading && <p className="text-slate-400">Loading…</p>}
        {error && <p className="text-red-400">{error instanceof Error ? error.message : "Failed to load bingos"}</p>}
        {data?.bingos.length === 0 && <p className="text-slate-400">No bingos yet.</p>}
        <ul className="space-y-2">
          {data?.bingos.map((bingo) => (
            <li key={bingo.id}>
              <Link
                to={`/b/${bingo.slug}`}
                className="flex items-center justify-between gap-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg px-4 py-3 transition-colors"
              >
                <div>
                  <p className="font-semibold">{bingo.name}</p>
                  {bingo.description && <p className="text-sm text-slate-400 mt-0.5">{bingo.description}</p>}
                </div>
                <span className="text-xs text-slate-400 bg-slate-900 rounded-full px-2.5 py-1 shrink-0">{STAGE_LABEL[bingo.stage] ?? bingo.stage}</span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
