import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "@bingo/shared";
import { useAuth } from "../context/AuthContext";
import { queryKeys } from "../api/queries";
import * as adminApi from "../api/adminApi";
import { UserSearchInput } from "../core/admin/UserSearchInput";
import { ItemGroupsPanel } from "../core/admin/ItemGroupsPanel";
import { displayName } from "../core/ui/user";
import { AppHeader } from "../core/ui/AppHeader";
import { Button } from "../core/ui/Button";
import { Card, CardHeader, Notice } from "../core/ui/Card";
import { Field, Input } from "../core/ui/Field";
import { CheckIcon } from "../core/ui/icons";

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
    <Card className="w-full max-w-md">
      <CardHeader title="Create a bingo" />
      <div className="space-y-4 p-5">
        <Field label="Name">
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
          />
        </Field>
        <Field label="Slug (used in the URL)">
          <Input
            value={slug}
            onChange={(e) => {
              setSlug(slugify(e.target.value));
              setSlugTouched(true);
            }}
            className="font-mono"
          />
        </Field>
        <Field label="Board size (N×N)">
          <Input type="number" min={1} value={boardSize} onChange={(e) => setBoardSize(Number(e.target.value) || 1)} className="num" />
        </Field>
        {error && <Notice tone="danger">{error}</Notice>}
        <Button variant="primary" onPress={create} isDisabled={!name || !slug || creating} className="w-full">
          {creating ? "Creating…" : "Create bingo"}
        </Button>
      </div>
    </Card>
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
    <Card className="w-full max-w-md">
      <CardHeader title="Grant site admin" description="Site admins can create bingos and edit any board." />
      <div className="space-y-3 p-5">
        <UserSearchInput scope="site" onSelect={grant} />
        {error && <Notice tone="danger">{error}</Notice>}
        {granted.length > 0 && (
          <ul className="space-y-1">
            {granted.map((u) => (
              <li key={u.id} className="flex items-center gap-2 text-sm text-ok">
                <CheckIcon size={14} />
                {displayName(u)} is now a site admin
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

export function SiteAdminPage() {
  const { user } = useAuth();
  if (!user?.isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-1 bg-bg text-sm text-fg-muted">
        Site admin access required.
        <Link to="/" className="text-fg underline underline-offset-2">
          Back to bingos
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-fg">
      <AppHeader back={{ to: "/", label: "All bingos" }} title="Site admin" />
      <main className="mx-auto flex w-full max-w-6xl flex-wrap items-start gap-6 px-6 py-6">
        <CreateBingoForm />
        <GrantAdminPanel />
        <ItemGroupsPanel />
      </main>
    </div>
  );
}
