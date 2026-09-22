import { useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { STAGE_LABEL, type Bingo, type BingoExportDocument, type BingoListResponse, type User } from "@bingo/shared";
import { useAuth } from "../context/AuthContext";
import { queryKeys, useBingos } from "../api/queries";
import * as adminApi from "../api/adminApi";
import { optimisticUpdate } from "../api/optimistic";
import { UserSearchInput } from "../core/admin/UserSearchInput";
import { ItemGroupsPanel } from "../core/admin/ItemGroupsPanel";
import { BugReportsPanel } from "../core/admin/BugReportsPanel";
import { SiteAuditLog } from "../core/admin/SiteAuditLog";
import { displayName } from "../core/ui/user";
import { AppHeader } from "../core/ui/AppHeader";
import { Button, IconButton } from "../core/ui/Button";
import { Badge, Notice } from "../core/ui/Card";
import { Field, Input } from "../core/ui/Field";
import { CheckIcon, TrashIcon } from "../core/ui/icons";
import { Disclosure } from "../core/ui/Disclosure";

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
    <div className="max-w-md space-y-4">
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
  );
}

// Always creates a brand-new bingo from a previously exported board+settings
// file (BingoSettingsForm's "Export" section) — never overwrites an
// existing one. Counterpart to CreateBingoForm.
function ImportBingoPanel() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsedDoc, setParsedDoc] = useState<BingoExportDocument | null>(null);
  const [fileName, setFileName] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFileChange(file: File) {
    setError(null);
    setFileName(file.name);
    try {
      const parsed = JSON.parse(await file.text()) as BingoExportDocument;
      setParsedDoc(parsed);
      setName(parsed.bingo?.name ?? "");
      setSlug(slugify(parsed.bingo?.name ?? ""));
    } catch {
      setParsedDoc(null);
      setError("That file isn't valid JSON");
    }
  }

  async function doImport() {
    if (!parsedDoc) return;
    setImporting(true);
    setError(null);
    try {
      const { bingo } = await adminApi.importBingo({ slug, name, document: parsedDoc });
      await queryClient.invalidateQueries({ queryKey: queryKeys.bingos() });
      navigate(`/b/${bingo.slug}/mod`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to import bingo");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="max-w-md space-y-4">
      <p className="text-sm text-on-surface-muted">Create a new bingo from a previously exported board and settings file.</p>
      <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full rounded-md border border-dashed border-outline-strong px-3 py-4 text-center text-sm text-on-surface-muted transition-colors hover:border-on-surface/60 hover:text-on-surface"
        >
          {fileName || "Choose an export file…"}
        </button>
        <input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => e.target.files?.[0] && onFileChange(e.target.files[0])} />

        {parsedDoc && (
          <>
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Slug (used in the URL)">
              <Input value={slug} onChange={(e) => setSlug(slugify(e.target.value))} className="font-mono" />
            </Field>
            <p className="text-xs text-on-surface-subtle">
              {parsedDoc.tiles.length} tile{parsedDoc.tiles.length === 1 ? "" : "s"}, {parsedDoc.categories.length} categor{parsedDoc.categories.length === 1 ? "y" : "ies"},{" "}
              {parsedDoc.signupQuestions.length} signup question{parsedDoc.signupQuestions.length === 1 ? "" : "s"}
              {(() => {
                const images = parsedDoc.tiles.filter((t) => t.image).length;
                return images > 0 ? `, ${images} tile image${images === 1 ? "" : "s"}` : "";
              })()}
            </p>
          </>
        )}
        {error && <Notice tone="danger">{error}</Notice>}
        <Button variant="primary" onPress={doImport} isDisabled={!parsedDoc || !name || !slug || importing} className="w-full">
          {importing ? "Importing…" : "Import as new bingo"}
        </Button>
      </div>
  );
}

// Deleting a bingo takes its signups, teams, board and submissions with it,
// so the admin has to type the slug back before the button arms.
function DeleteBingoConfirm({ bingo, onConfirm, onCancel }: { bingo: Bingo; onConfirm: () => void; onCancel: () => void }) {
  const [typed, setTyped] = useState("");
  return (
    <Notice tone="danger" className="space-y-3">
      <p>
        Delete <span className="font-semibold">{bingo.name}</span> and everything in it? This can't be undone.
      </p>
      <Field label={`Type ${bingo.slug} to confirm`}>
        <Input size="sm" value={typed} onChange={(e) => setTyped(e.target.value)} className="font-mono" autoFocus />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onPress={onCancel}>
          Cancel
        </Button>
        <Button variant="danger" size="sm" isDisabled={typed !== bingo.slug} onPress={onConfirm}>
          Delete bingo
        </Button>
      </div>
    </Notice>
  );
}

function BingosPanel() {
  const queryClient = useQueryClient();
  const { data } = useBingos();
  const [confirming, setConfirming] = useState<Bingo | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(bingo: Bingo) {
    setConfirming(null);
    setError(null);
    try {
      await optimisticUpdate<BingoListResponse>(
        queryClient,
        queryKeys.bingos(),
        (prev) => ({ ...prev, bingos: prev.bingos.filter((b) => b.id !== bingo.id) }),
        () => adminApi.deleteBingo(bingo.id),
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete bingo");
    }
  }

  const bingos = data?.bingos ?? [];
  return (
    <div className="space-y-3">
      <p className="text-sm text-on-surface-muted">Every bingo on this site. Deleting one removes its board, signups, teams and submissions.</p>
        {error && <Notice tone="danger">{error}</Notice>}
        {bingos.length === 0 ? (
          <p className="text-sm text-on-surface-subtle">No bingos yet.</p>
        ) : (
          <ul className="divide-y divide-outline rounded-md border border-outline">
            {bingos.map((bingo) => (
              <li key={bingo.id} className="space-y-3 px-3 py-2">
                <div className="flex items-center gap-3">
                  <Link to={`/b/${bingo.slug}/mod`} className="min-w-0 flex-1 truncate text-sm text-on-surface hover:underline">
                    {bingo.name}
                  </Link>
                  <Badge tone={bingo.stage === "live" ? "ok" : "neutral"}>{STAGE_LABEL[bingo.stage]}</Badge>
                  <IconButton label={`Delete ${bingo.name}`} size="sm" onPress={() => setConfirming(bingo)}>
                    <TrashIcon size={14} />
                  </IconButton>
                </div>
                {confirming?.id === bingo.id && <DeleteBingoConfirm bingo={bingo} onConfirm={() => remove(bingo)} onCancel={() => setConfirming(null)} />}
              </li>
            ))}
          </ul>
        )}
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
    <div className="max-w-md space-y-3">
      <p className="text-sm text-on-surface-muted">Site admins can create bingos and edit any board.</p>
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
  );
}

function Section({ title, defaultExpanded = false, children }: { title: string; defaultExpanded?: boolean; children: ReactNode }) {
  return (
    <Disclosure defaultExpanded={defaultExpanded} title={<span className="flex-1 text-sm font-semibold text-on-surface">{title}</span>}>
      {children}
    </Disclosure>
  );
}

export function SiteAdminPage() {
  const { user, canGrantAdmin } = useAuth();
  if (!user?.isAdmin) {
    return (
      <div className="flex min-h-dvh items-center justify-center gap-1 bg-background text-sm text-on-surface-muted">
        Site admin access required.
        <Link to="/" className="text-on-surface underline underline-offset-2">
          Back to bingos
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background text-on-surface">
      <AppHeader back={{ to: "/", label: "All bingos" }} title="Site admin" />
      <main className="mx-auto w-full max-w-6xl space-y-3 px-6 py-6">
        <Section title="Bug reports" defaultExpanded>
          <BugReportsPanel />
        </Section>
        <Section title="Bingos" defaultExpanded>
          <BingosPanel />
        </Section>
        <Section title="Site-wide audit log" defaultExpanded>
          <p className="mb-4 text-sm text-on-surface-muted">Every site-level action, across every bingo.</p>
          <SiteAuditLog />
        </Section>
        <Section title="Create a bingo">
          <CreateBingoForm />
        </Section>
        <Section title="Import a bingo">
          <ImportBingoPanel />
        </Section>
        <Section title="Item groups">
          <ItemGroupsPanel />
        </Section>
        {canGrantAdmin && (
          <Section title="Grant site admin">
            <GrantAdminPanel />
          </Section>
        )}
      </main>
    </div>
  );
}
