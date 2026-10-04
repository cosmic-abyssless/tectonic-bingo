import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  MAX_WRAPPED_CREDITS,
  MAX_WRAPPED_CREDIT_LENGTH,
  WRAPPED_ART_KEYING_DEFAULTS,
  WRAPPED_ART_SECTIONS,
  isWrappedArtSection,
  maxWrappedArt,
  type WrappedArtGroup,
  type WrappedArtImage,
  type WrappedArtKeying,
  type WrappedArtSection,
  type WrappedCredit,
} from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { adminQueryKeys, useWrappedArt } from "../../api/adminQueries";
import { Button, IconButton } from "../ui/Button";
import { Card, Notice } from "../ui/Card";
import { Input } from "../ui/Field";
import { ArrowLeftIcon, ArrowRightIcon, ChevronDownIcon, ChevronUpIcon, PlusIcon, TrashIcon, XIcon } from "../ui/icons";
import { Tab, TabList, TabPanel, Tabs } from "../ui/Tabs";
import { StickerArt } from "../wrapped/StickerArt";
import { ExternalLink } from "../ui/ExternalLink";
import { FileDropButton } from "../ui/FileDropButton";
import { RangeInput } from "../ui/RangeInput";

const SECTIONS: Record<WrappedArtSection, { label: string; hint: string }> = {
  intro: { label: "Intro", hint: "The opening screen" },
  you: { label: "You", hint: "The Player's own numbers" },
  duo: { label: "Duo", hint: "The Player and their Duo partner: two works well" },
  captain: { label: "Captain", hint: "A Captain's Draft: two works well" },
  moderator: { label: "Moderator", hint: "A Moderator's own reviews: the middle image gets their name" },
  team: { label: "Team", hint: "The Player's Team: three works well" },
  bingo: { label: "The Bingo", hint: "Everyone, together" },
  moderators: { label: "Moderators", hint: "Behind the scenes: credit who moderated the bingo" },
  outro: { label: "Outro", hint: "The closing screen" },
};

/**
 * The mod panel's Wrapped art tab (admins only, #262), in three parts. Category images: any number per section, shown
 * side by side above its heading. Side images: one pool, shown large beside the story's sections in turn (wide screens
 * only). Player card art (#396): a ranked pool for the Player share card, best first, never shown in the story. Each
 * image is a cut-out (a transparent PNG, or a RuneLite Blindfold screenshot the server keys out) an Admin adds,
 * reorders, replaces, re-cuts or removes, watching its two sticker frames boil.
 * Credits (CONTEXT.md) are edited here too: a Category image can credit someone (their name captioned on it), and each
 * category can hold additional credits with no image, listed under its images.
 */
export function WrappedArtManager({ slug }: { slug: string }) {
  const { data, isLoading, error } = useWrappedArt(slug);
  const inGroup = (group: WrappedArtGroup) => (data?.art ?? []).filter((a) => a.group === group);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div className="min-w-0 space-y-4">
        <p className="text-sm text-on-surface-muted">
          Decorative character cut-outs for Wrapped, drawn as stickers on torn paper. A new bingo starts with the previous bingo's art; change what you want. The story looks finished without
          any.
        </p>
        {error && <Notice tone="danger">{error instanceof Error ? error.message : "Couldn't load the Wrapped art"}</Notice>}
        <Tabs defaultSelectedKey="category">
          <TabList>
            <Tab id="category">Category images</Tab>
            <Tab id="side">Side images</Tab>
            <Tab id="playerCard">Player card</Tab>
          </TabList>
          <TabPanel id="category">
            <p className="mb-4 text-sm text-on-surface-muted">
              Shown side by side above each section's heading, in this order. The more there are, the smaller each one. Pick an image to credit someone on it (their name is shown on the art),
              or add credits with no image under a category's images. Credits aren't tied to who's an admin or a mod.
            </p>
            <div className="grid gap-4 xl:grid-cols-2">
              {WRAPPED_ART_SECTIONS.map((section) => (
                <Card key={section} className="space-y-3 p-4">
                  <div>
                    <p className="font-semibold text-on-surface">{SECTIONS[section].label}</p>
                    <p className="text-xs text-on-surface-subtle">{SECTIONS[section].hint}</p>
                  </div>
                  <ArtGroup slug={slug} group={section} images={inGroup(section)} loading={isLoading} />
                  {/* Keyed by what's stored, so a save (or another Admin's, on refetch) starts the list over from it. */}
                  {data && <AdditionalCredits key={JSON.stringify(data.additionalCredits?.[section] ?? [])} slug={slug} section={section} saved={data.additionalCredits?.[section] ?? []} />}
                </Card>
              ))}
            </div>
          </TabPanel>
          <TabPanel id="side">
            <p className="mb-4 text-sm text-on-surface-muted">
              Shown large beside the story, one per section in turn, alternating left and right (wide screens only). Taller, full-body cut-outs suit it best.
            </p>
            <Card className="p-4">
              <ArtGroup slug={slug} group="side" images={inGroup("side")} loading={isLoading} large />
            </Card>
          </TabPanel>
          <TabPanel id="playerCard">
            <p className="mb-4 text-sm text-on-surface-muted">
              Shown on the Player card a Player can share at the end of Wrapped, picked by how they placed. The order is the ranking, <strong>best first</strong>: Players are split by their
              Points share rank in the bingo into as many equal groups as there are images, and the top group gets the first. With none here, the card uses the You section's first image.
            </p>
            <Card className="p-4">
              <ArtGroup slug={slug} group="playerCard" images={inGroup("playerCard")} loading={isLoading} large />
            </Card>
          </TabPanel>
        </Tabs>
      </div>
      <HowToMakeOne />
    </div>
  );
}

/** One group's images in order, each with its controls, and an "Add" tile while there's room. */
function ArtGroup({ slug, group, images, loading, large = false }: { slug: string; group: WrappedArtGroup; images: WrappedArtImage[]; loading: boolean; large?: boolean }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = images.find((a) => a.id === selectedId) ?? null;
  const max = maxWrappedArt(group);

  async function run(what: string, action: () => Promise<unknown>) {
    setBusy(what);
    setError(null);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.wrappedArt(slug) });
      await queryClient.invalidateQueries({ queryKey: ["wrapped"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  // Several files at once: uploaded one at a time, in the order picked (each is keyed and rendered on its own, and
  // shows up as it lands), as many as the group has room for. One that fails is named; the rest still go.
  const [progress, setProgress] = useState<string | null>(null);
  async function addMany(files: File[]) {
    const room = Math.max(0, max - images.length);
    const taken = files.slice(0, room);
    const problems: string[] = [];
    setBusy("add");
    setError(null);
    try {
      for (const [i, file] of taken.entries()) {
        setProgress(taken.length > 1 ? `Cutting out ${i + 1} of ${taken.length}…` : "Cutting it out…");
        try {
          await adminApi.addWrappedArt(slug, group, file);
        } catch (e) {
          problems.push(`${file.name}: ${e instanceof Error ? e.message : "couldn't be added"}`);
        }
        await queryClient.invalidateQueries({ queryKey: adminQueryKeys.wrappedArt(slug) });
      }
      await queryClient.invalidateQueries({ queryKey: ["wrapped"] });
    } finally {
      setBusy(null);
      setProgress(null);
    }
    const left = files.length - taken.length;
    if (left > 0) problems.push(`${left === 1 ? "1 file wasn't" : `${left} files weren't`} added: this holds at most ${max}.`);
    if (problems.length > 0) setError(problems.join("\n"));
  }

  const move = (index: number, by: -1 | 1) => {
    const ids = images.map((a) => a.id);
    [ids[index], ids[index + by]] = [ids[index + by]!, ids[index]!];
    return run("order", () => adminApi.reorderWrappedArt(slug, group, ids));
  };
  const tile = large ? "h-56 w-40" : "h-28 w-20";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {images.map((a, i) => (
          <div key={a.id} className={`flex flex-col items-center gap-1 rounded-md border p-2 ${selectedId === a.id ? "border-on-surface" : "border-outline"}`}>
            <button type="button" onClick={() => setSelectedId(selectedId === a.id ? null : a.id)} className={`${tile} rounded bg-surface-raised p-1`} aria-label={`Image ${i + 1}: show its details`}>
              <StickerArt frames={a.frames} className="size-full" phase={i / Math.max(1, images.length)} />
            </button>
            {a.credit && <span className="max-w-20 truncate text-xs text-on-surface-muted">{a.credit.name}</span>}
            <div className="flex items-center">
              <IconButton size="sm" label="Move earlier" onPress={() => move(i, -1)} isDisabled={busy !== null || i === 0}>
                <ArrowLeftIcon size={14} />
              </IconButton>
              <IconButton size="sm" label="Move later" onPress={() => move(i, 1)} isDisabled={busy !== null || i === images.length - 1}>
                <ArrowRightIcon size={14} />
              </IconButton>
              <IconButton size="sm" label="Remove" onPress={() => run(`remove:${a.id}`, () => adminApi.removeWrappedArt(slug, a.id))} isDisabled={busy !== null}>
                <TrashIcon size={14} />
              </IconButton>
            </div>
          </div>
        ))}
        {images.length < max && (
          <FileDropButton
            accept={IMAGE_TYPES}
            multiple
            onFiles={addMany}
            isDisabled={busy !== null}
            className={`${tile} flex flex-col items-center justify-center gap-1 self-start text-xs disabled:cursor-wait`}
          >
            <PlusIcon size={18} />
            {loading ? "…" : busy === "add" ? progress : "Add images"}
          </FileDropButton>
        )}
      </div>

      {selected && <ImageDetails key={selected.id} slug={slug} image={selected} busy={busy} run={run} />}
      {error && (
        <Notice tone="danger">
          <span className="whitespace-pre-line">{error}</span>
        </Notice>
      )}
      {images.length >= max && <p className="text-xs text-on-surface-subtle">That's the most this holds ({max}).</p>}
    </div>
  );
}

/** The selected image: replace it, and for a keyed screenshot, re-cut it with other settings. */
function ImageDetails({ slug, image, busy, run }: { slug: string; image: WrappedArtImage; busy: string | null; run: (what: string, action: () => Promise<unknown>) => Promise<void> }) {
  const replaceInput = useRef<HTMLInputElement>(null);
  const [keying, setKeying] = useState<WrappedArtKeying>(image.keying ?? WRAPPED_ART_KEYING_DEFAULTS);
  const changed = image.keying !== null && (keying.tolerance !== image.keying.tolerance || keying.softness !== image.keying.softness);

  return (
    <div className="space-y-2 rounded-md bg-surface-raised p-3 text-xs text-on-surface-muted">
      {isWrappedArtSection(image.group) && <ImageCredit slug={slug} image={image} busy={busy} run={run} />}
      {image.keying ? (
        <>
          <p className="flex items-center gap-1.5">
            <span className="size-3 shrink-0 rounded-sm border border-outline" style={{ backgroundColor: image.keyColor ?? undefined }} />
            Background {image.keyColor} keyed out. A fringe left around the outline? Raise the tolerance or softness and re-cut.
          </p>
          <KeyingSlider label="Tolerance" hint="what counts as background" min={0} max={200} value={keying.tolerance} onChange={(tolerance) => setKeying({ ...keying, tolerance })} />
          <KeyingSlider label="Softness" hint="how wide the soft edge is" min={1} max={300} value={keying.softness} onChange={(softness) => setKeying({ ...keying, softness })} />
        </>
      ) : (
        <p>Uploaded already cut out (a transparent PNG).</p>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" onPress={() => replaceInput.current?.click()} isDisabled={busy !== null}>
          {busy === `replace:${image.id}` ? "Replacing…" : "Replace"}
        </Button>
        {image.keying && (
          <Button size="sm" onPress={() => run(`recut:${image.id}`, () => adminApi.recutWrappedArt(slug, image.id, keying))} isDisabled={busy !== null || !changed}>
            {busy === `recut:${image.id}` ? "Re-cutting…" : "Re-cut"}
          </Button>
        )}
      </div>
      <FileInput inputRef={replaceInput} onFiles={([file]) => file && run(`replace:${image.id}`, () => adminApi.replaceWrappedArt(slug, image.id, file))} />
    </div>
  );
}

/** The selected Category image's credit: a name captioned on the art, and an optional role. */
function ImageCredit({ slug, image, busy, run }: { slug: string; image: WrappedArtImage; busy: string | null; run: (what: string, action: () => Promise<unknown>) => Promise<void> }) {
  const [name, setName] = useState(image.credit?.name ?? "");
  const [role, setRole] = useState(image.credit?.role ?? "");
  const changed = name.trim() !== (image.credit?.name ?? "") || role.trim() !== (image.credit?.role ?? "");
  const credit = name.trim() ? { name: name.trim(), role: role.trim() || null } : null;

  return (
    <div className="space-y-2 border-b border-outline pb-3">
      <p>Credit: who this image credits. Their name is shown on the art.</p>
      <div className="flex flex-wrap items-center gap-2">
        <Input size="sm" aria-label="Credited name" placeholder="Name" value={name} maxLength={MAX_WRAPPED_CREDIT_LENGTH} onChange={(e) => setName(e.target.value)} className="min-w-0 flex-1" />
        <Input size="sm" aria-label="Credited role" placeholder="Role (optional)" value={role} maxLength={MAX_WRAPPED_CREDIT_LENGTH} onChange={(e) => setRole(e.target.value)} className="min-w-0 flex-1" />
        <Button size="sm" onPress={() => run(`credit:${image.id}`, () => adminApi.setWrappedArtCredit(slug, image.id, credit))} isDisabled={busy !== null || !changed || (!name.trim() && !!role.trim())}>
          {busy === `credit:${image.id}` ? "Saving…" : credit || !image.credit ? "Save credit" : "Clear credit"}
        </Button>
      </div>
    </div>
  );
}

/**
 * A category's additional credits (CONTEXT.md "Credits"): names with no image, each with an optional role, in order,
 * listed under the category's images. Saved as a whole list.
 */
function AdditionalCredits({ slug, section, saved }: { slug: string; section: WrappedArtSection; saved: WrappedCredit[] }) {
  const queryClient = useQueryClient();
  const [credits, setCredits] = useState(saved);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = JSON.stringify(credits) !== JSON.stringify(saved);

  // Rows have no id of their own, so each keeps a local key through moves and removals (inputs keep focus).
  const nextKey = useRef(0);
  const keys = useRef<number[]>([]);
  while (keys.current.length < credits.length) keys.current.push(nextKey.current++);

  const update = (i: number, patch: Partial<WrappedCredit>) => setCredits(credits.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const remove = (i: number) => {
    keys.current.splice(i, 1);
    setCredits(credits.filter((_, j) => j !== i));
  };
  const move = (i: number, dir: -1 | 1) => {
    const swap = <T,>(list: T[]) => {
      const next = [...list];
      [next[i], next[i + dir]] = [next[i + dir]!, next[i]!];
      return next;
    };
    keys.current = swap(keys.current);
    setCredits(swap(credits));
  };

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await adminApi.setWrappedArtCredits(slug, section, credits);
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.wrappedArt(slug) });
      await queryClient.invalidateQueries({ queryKey: ["wrapped"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2 border-t border-outline pt-3">
      <p className="text-xs text-on-surface-subtle">Additional credits: names with no image, listed under the images.</p>
      {credits.length > 0 && (
        <div role="list" aria-label={`${SECTIONS[section].label} additional credits`} className="space-y-2">
          {credits.map((c, i) => (
            <div key={keys.current[i]} role="listitem" className="flex items-center gap-2">
              <div className="flex shrink-0 flex-col">
                <IconButton label="Move up" size="sm" isDisabled={i === 0} onPress={() => move(i, -1)} className="size-5">
                  <ChevronUpIcon size={12} />
                </IconButton>
                <IconButton label="Move down" size="sm" isDisabled={i === credits.length - 1} onPress={() => move(i, 1)} className="size-5">
                  <ChevronDownIcon size={12} />
                </IconButton>
              </div>
              <Input size="sm" aria-label="Name" placeholder="Name" value={c.name} maxLength={MAX_WRAPPED_CREDIT_LENGTH} onChange={(e) => update(i, { name: e.target.value })} className="min-w-0 flex-1" />
              <Input
                size="sm"
                aria-label="Role"
                placeholder="Role (optional)"
                value={c.role ?? ""}
                maxLength={MAX_WRAPPED_CREDIT_LENGTH}
                onChange={(e) => update(i, { role: e.target.value || null })}
                className="min-w-0 flex-1"
              />
              <IconButton label="Remove from credits" size="sm" onPress={() => remove(i)} className="hover:text-danger">
                <XIcon size={12} />
              </IconButton>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onPress={() => setCredits([...credits, { name: "", role: null }])} isDisabled={credits.length >= MAX_WRAPPED_CREDITS}>
          <PlusIcon />
          Add a name
        </Button>
        {changed && (
          <Button size="sm" variant="primary" onPress={save} isDisabled={saving}>
            {saving ? "Saving…" : "Save credits"}
          </Button>
        )}
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
    </div>
  );
}

const IMAGE_TYPES = "image/png,image/jpeg,image/webp,image/gif";

/** A hidden file picker for images; `multiple` lets several be picked at once, handed over in the order picked. */
function FileInput({ inputRef, multiple = false, onFiles }: { inputRef: React.RefObject<HTMLInputElement | null>; multiple?: boolean; onFiles: (files: File[]) => void }) {
  return (
    <input
      ref={inputRef}
      type="file"
      multiple={multiple}
      accept={IMAGE_TYPES}
      className="hidden"
      onChange={(e) => {
        const files = [...(e.target.files ?? [])];
        e.target.value = "";
        if (files.length > 0) onFiles(files);
      }}
    />
  );
}

function KeyingSlider({ label, hint, min, max, value, onChange }: { label: string; hint: string; min: number; max: number; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="flex justify-between">
        <span>
          {label} <span className="text-on-surface-subtle">({hint})</span>
        </span>
        <span className="num text-on-surface">{value}</span>
      </span>
      <RangeInput min={min} max={max} value={value} onChange={onChange} className="w-full accent-on-surface" />
    </label>
  );
}

function HowToMakeOne() {
  return (
    <Card className="h-fit space-y-3 p-4 text-sm text-on-surface-muted">
      <p className="font-semibold text-on-surface">How to make one</p>
      <p>
        <strong className="text-on-surface">A RuneLite Blindfold screenshot works as it is.</strong> Turn on the Blindfold plugin (it hides the game world behind one solid colour), pick a colour
        the character isn't wearing (a bright green or magenta), and screenshot the character. Upload it here: the background is keyed out for you.
      </p>
      <p>If the keying leaves something behind, or the art wasn't shot on one colour, cut it out by hand:</p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>
          Open it in{" "}
          <ExternalLink href="https://www.photopea.com">Photopea</ExternalLink>
          : Select → Color Range, click the background, Fuzziness 1. Raise it a little at a time if a fringe of the background colour is left.
        </li>
        <li>Add raster mask (layers panel), then Ctrl + I to invert it, so the character stays.</li>
        <li>File → Export as → PNG (PNG keeps the transparency; JPG doesn't).</li>
      </ol>
      <p>No need to crop tightly, add a border or a shadow: the sticker effect trims, sizes and adds the paper itself. One character per image.</p>
    </Card>
  );
}
