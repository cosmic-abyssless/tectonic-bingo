import { useAuth } from "../context/AuthContext";
import { avatarUrl } from "../types";
import { BingoBoard } from "../components/BingoBoard";

export function Home() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Nav */}
      <header className="flex items-center justify-between px-6 py-3 bg-slate-800 border-b border-slate-700">
        <span className="font-bold text-lg tracking-tight">Tectonic Bingo</span>
        <div className="flex items-center gap-3">
          <img src={avatarUrl(user)} alt="avatar" className="w-8 h-8 rounded-full border-2 border-indigo-500" />
          <span className="text-sm text-slate-300">{user.global_name ?? user.username}</span>
          <button
            onClick={logout}
            className="text-sm text-slate-400 hover:text-white border border-slate-600 hover:border-slate-400 rounded px-3 py-1 transition-colors cursor-pointer"
          >
            Log out
          </button>
        </div>
      </header>

      {/* Board */}
      <main className="px-6 py-8">
        <BingoBoard />
      </main>
    </div>
  );
}
