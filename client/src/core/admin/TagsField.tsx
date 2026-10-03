import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TAG_MAX_LENGTH, type BoardTagsResponse, type OsrsBossSearchResult, type Tag } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { adminQueryKeys, useBoardTags } from "../../api/adminQueries";
import { useDebouncedValue } from "../../headless/useDebouncedValue";
import { Button, IconButton } from "../ui/Button";
import { Notice } from "../ui/Card";
import { Field, Input } from "../ui/Field";
import { SearchCombo } from "../ui/SearchCombo";
import { TextButton } from "../ui/TextButton";
import { PlusIcon, XIcon } from "../ui/icons";

/**
 * A Tile's or a Part's Tags (CONTEXT.md "Tag"), in the board editor: each a removable chip. Typing and Enter adds a
 * Text tag; "+ Boss" opens a picker over the OSRS Wiki's Bosses category, and the Boss tag picked brings the wiki's
 * names for the boss along, listed under it, each removable on its own. Saved as soon as they change, like the rest of
 * the editor. Never shown to Players.
 */
export function TagsField({ slug, owner, hint, locked }: { slug: string; owner: adminApi.TagOwner; hint: string; locked: boolean }) {
  const queryClient = useQueryClient();
  const { data } = useBoardTags(slug);
  const tags = ("tileId" in owner ? data?.tiles[owner.tileId] : data?.parts[owner.partId]) ?? [];
  const [draft, setDraft] = useState("");
  const [pickingBoss, setPickingBoss] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Each change answers with this Tile's or Part's tags: they go straight into the board's, and the search forgets
  // what it found before.
  function show(next: Tag[]) {
    queryClient.setQueryData<BoardTagsResponse>(adminQueryKeys.boardTags(slug), (all) => {
      const base = all ?? { tiles: {}, parts: {} };
      return "tileId" in owner ? { ...base, tiles: { ...base.tiles, [owner.tileId]: next } } : { ...base, parts: { ...base.parts, [owner.partId]: next } };
    });
    queryClient.invalidateQueries({ queryKey: ["tileTagSearch", slug] });
  }
  async function run(note: string, action: () => Promise<{ tags: Tag[] }>): Promise<boolean> {
    setError(null);
    setBusy(note);
    try {
      show((await action()).tags);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function addText() {
    const text = draft.trim();
    if (!text || busy) return;
    if (await run("Adding…", () => adminApi.addTag(slug, owner, { text }))) setDraft("");
  }
  async function addBoss(boss: OsrsBossSearchResult) {
    if (await run(`Getting the wiki's names for ${boss.name}…`, () => adminApi.addTag(slug, owner, { boss: boss.name }))) setPickingBoss(false);
  }
  const remove = (tag: Tag) => run("Removing…", () => adminApi.removeTag(slug, tag.id));

  const own = tags.filter((t) => t.kind === "text" && !t.bossTagId);
  const bosses = tags.filter((t) => t.kind === "boss");
  const disabled = locked || busy !== null;

  return (
    <Field as="div" label="Tags" hint={hint}>
      {(own.length > 0 || bosses.length > 0) && (
        <div className="mb-2 space-y-2">
          {own.length > 0 && (
            <ul aria-label="Tags" className="flex flex-wrap gap-1.5">
              {own.map((tag) => (
                <TagChip key={tag.id} tag={tag} onRemove={() => remove(tag)} disabled={disabled} />
              ))}
            </ul>
          )}
          {bosses.map((boss) => (
            <BossTag key={boss.id} boss={boss} aliases={tags.filter((t) => t.bossTagId === boss.id)} onRemove={remove} disabled={disabled} />
          ))}
        </div>
      )}

      <div className="flex items-start gap-2">
        <Input
          aria-label="Add a tag"
          placeholder="Add a tag, then Enter"
          value={draft}
          maxLength={TAG_MAX_LENGTH}
          // Not while saving: it keeps focus, so tag after tag can be typed in.
          disabled={locked}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            void addText();
          }}
          className="flex-1"
        />
        <Button size="md" onPress={() => setPickingBoss((open) => !open)} isDisabled={disabled}>
          <PlusIcon size={14} /> Boss
        </Button>
      </div>
      {pickingBoss && <BossPicker slug={slug} onPick={addBoss} disabled={disabled} />}
      {busy && <p className="mt-1.5 text-xs text-on-surface-subtle">{busy}</p>}
      {error && (
        <Notice tone="danger" className="mt-2">
          {error}
        </Notice>
      )}
    </Field>
  );
}

function TagChip({ tag, onRemove, disabled, from }: { tag: Tag; onRemove: () => void; disabled: boolean; from?: string }) {
  return (
    <li
      title={from ? `From the boss tag ${from}` : undefined}
      className={`flex items-center gap-1 rounded-full border border-outline py-0.5 pr-1 pl-2.5 ${from ? "bg-background text-xs text-on-surface-muted" : "bg-surface-raised text-sm text-on-surface"}`}
    >
      {tag.text}
      <IconButton size="xs" label={`Remove ${tag.text}`} onPress={onRemove} isDisabled={disabled} className="rounded-full hover:text-danger">
        <XIcon size={12} />
      </IconButton>
    </li>
  );
}

// A Boss tag and, under it, the names the wiki gave for the boss (folded away: a boss can have over a hundred).
// Removing the Boss tag removes them all.
function BossTag({ boss, aliases, onRemove, disabled }: { boss: Tag; aliases: Tag[]; onRemove: (tag: Tag) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const names = `${aliases.length} name${aliases.length === 1 ? "" : "s"} from the wiki`;
  return (
    <div className="rounded-md border border-outline bg-background p-2">
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 rounded-full border border-outline-strong bg-surface-raised py-0.5 pr-1 pl-2.5 text-sm font-medium text-on-surface">
          <span className="rounded border border-outline px-1 text-[10px] font-normal uppercase tracking-wide text-on-surface-subtle">boss</span>
          {boss.text}
          <IconButton
            size="xs"
            label={aliases.length ? `Remove ${boss.text} and its ${names}` : `Remove ${boss.text}`}
            onPress={() => onRemove(boss)}
            isDisabled={disabled}
            className="rounded-full hover:text-danger"
          >
            <XIcon size={12} />
          </IconButton>
        </span>
        {aliases.length > 0 && (
          <TextButton onPress={() => setOpen((o) => !o)} aria-expanded={open} className="text-xs text-on-surface-subtle">
            {open ? `Hide the ${names}` : names}
          </TextButton>
        )}
      </div>
      {open && aliases.length > 0 && (
        <ul aria-label={`Names for ${boss.text}`} className="mt-2 flex flex-wrap gap-1">
          {aliases.map((alias) => (
            <TagChip key={alias.id} tag={alias} from={boss.text} onRemove={() => onRemove(alias)} disabled={disabled} />
          ))}
        </ul>
      )}
    </div>
  );
}

// Searches the OSRS Wiki's Bosses category as the admin types (the server keeps the category's list).
function BossPicker({ slug, onPick, disabled }: { slug: string; onPick: (boss: OsrsBossSearchResult) => void; disabled: boolean }) {
  const [text, setText] = useState("");
  // Opened to be typed in.
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);
  const q = useDebouncedValue(text.trim(), 250);
  const { data, error, isFetching } = useQuery({
    queryKey: ["adminBossSearch", slug, q],
    queryFn: () => adminApi.searchBosses(slug, q),
    enabled: q.length >= 2,
    staleTime: 10 * 60_000,
    retry: false,
  });
  const searching = text.trim().length >= 2;
  const fresh = q === text.trim();
  return (
    <div className="mt-2">
      <SearchCombo
        items={searching && fresh ? (data?.bosses ?? []) : []}
        itemKey={(b) => b.name}
        itemText={(b) => b.name}
        onPick={onPick}
        inputValue={text}
        onInputChange={setText}
        clearOnPick
        loading={searching && (!fresh || isFetching)}
        emptyText={error ? "Couldn't reach the OSRS Wiki" : "No boss by that name"}
        placeholder="Search the wiki's bosses, raids and minigames…"
        aria-label="Boss"
        inputRef={inputRef}
        readOnly={disabled}
      />
    </div>
  );
}
