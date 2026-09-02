import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "@bingo/shared";
import { useAuth } from "../context/AuthContext";
import { queryKeys } from "../api/queries";
import * as adminApi from "../api/adminApi";
import { UserSearchInput } from "../core/admin/UserSearchInput";
import { displayName } from "../core/ui/user";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function CreateBingoForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  // Board is always square for now — enforced here client-side, not in the schema.
  const [boardSize, setBoardSize] = useState(7);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setCreating(true);
    setError(null);
    try {
      const { bingo } = await adminApi.createBingo({ slug: slug || slugify(name), name, boardRows: boardSize, boardCols: boardSize });
      await queryClient.invalidateQueries({ queryKey: queryKeys.bingos() });
      navigate(`/b/${bingo.slug}/mod`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create bingo");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-5 space-y-4 max-w-md">
      <h2 className="font-bold text-white">Create a bingo</h2>
      <div>
        <label htmlFor="create-bingo-name" className="block text-xs text-slate-400 mb-1">Name</label>
        <input
          id="create-bingo-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
          className="w-full bg-slate-900 border border-slate-600 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
        />
      </div>
      <div>
        <label htmlFor="create-bingo-slug" className="block text-xs text-slate-400 mb-1">Slug (used in the URL)</label>
        <input
          id="create-bingo-slug"
          value={slug}
          onChange={(e) => {
            setSlug(slugify(e.target.value));
            setSlugTouched(true);
          }}
          className="w-full bg-slate-900 border border-slate-600 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
        />
      </div>
      <div>
        <label htmlFor="create-bingo-size" className="block text-xs text-slate-400 mb-1">Board size (NxN)</label>
        <input
          id="create-bingo-size"
          type="number"
          min={1}
          value={boardSize}
          onChange={(e) => setBoardSize(Number(e.target.value) || 1)}
          className="w-full bg-slate-900 border border-slate-600 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
        />
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button onClick={create} disabled={!name || !slug || creating} className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-lg px-4 py-2 text-sm transition-colors cursor-pointer">
        {creating ? "Creating…" : "Create bingo"}
      </button>
    </div>
  );
}

function GrantAdminPanel() {
  const [granted, setGranted] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function grant(user: User) {
    setError(null);
    try {
      const { user: updated } = await adminApi.setUserAdmin(user.id, true);
      setGranted((prev) => [updated, ...prev.filter((u) => u.id !== updated.id)]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to grant admin");
    }
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-5 space-y-3 max-w-md">
      <h2 className="font-bold text-white">Grant site admin</h2>
      <UserSearchInput scope="site" onSelect={grant} />
      {error && <p className="text-red-400 text-sm">{error}</p>}
      {granted.length > 0 && (
        <ul className="space-y-1">
          {granted.map((u) => (
            <li key={u.id} className="text-sm text-green-400">
              ✓ {displayName(u)} is now a site admin
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SiteAdminPage() {
  const { user } = useAuth();
  if (!user?.isAdmin) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-400">
        Site admin access required. <Link to="/" className="text-indigo-400 ml-1">Back to bingos</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <header className="flex items-center justify-between px-6 py-3 bg-slate-800 border-b border-slate-700">
        <span className="font-bold text-lg tracking-tight">Site Admin</span>
        <Link to="/" className="text-sm text-slate-400 hover:text-white border border-slate-600 hover:border-slate-400 rounded px-3 py-1 transition-colors">
          All bingos
        </Link>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-6 flex flex-wrap gap-6">
        <CreateBingoForm />
        <GrantAdminPanel />
      </main>
    </div>
  );
}
