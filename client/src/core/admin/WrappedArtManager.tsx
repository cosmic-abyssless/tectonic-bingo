import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  WRAPPED_ART_KEYING_DEFAULTS,
  WRAPPED_ART_SECTIONS,
  maxWrappedArt,
  type WrappedArtGroup,
  type WrappedArtImage,
  type WrappedArtKeying,
  type WrappedArtSection,
} from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { adminQueryKeys, useWrappedArt } from "../../api/adminQueries";
import { Button, IconButton } from "../ui/Button";
import { Card, Notice } from "../ui/Card";
import { ArrowLeftIcon, ArrowRightIcon, PlusIcon, TrashIcon } from "../ui/icons";
import { Tab, TabList, TabPanel, Tabs } from "../ui/Tabs";
import { StickerArt } from "../wrapped/StickerArt";

const SECTIONS: Record<WrappedArtSection, { label: string; hint: string }> = {
  intro: { label: "Intro", hint: "The opening screen" },
  you: { label: "You", hint: "The Player's own numbers" },
  duo: { label: "Duo", hint: "The Player and their Duo partner: two works well" },
  captain: { label: "Captain", hint: "A Captain's Draft: two works well" },
  moderator: { label: "Moderator", hint: "A Moderator's reviews" },
  team: { label: "Team", hint: "The Player's Team: three works well" },
  bingo: { label: "The Bingo", hint: "Everyone, together" },
  outro: { label: "Outro", hint: "The closing screen" },
};

/**
 * The mod panel's Wrapped art tab (admins only, #262), in two parts. Category images: any number per section, shown
 * side by side above its heading. Side images: one pool, shown large beside the story's sections in turn (wide screens
 * only). Each image is a cut-out (a transparent PNG, or a RuneLite Blindfold screenshot the server keys out) an Admin
 * adds, reorders, replaces, re-cuts or removes, watching its two sticker frames boil.
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
          </TabList>
          <TabPanel id="category">
            <p className="mb-4 text-sm text-on-surface-muted">Shown side by side above each section's heading, in this order. The more there are, the smaller each one.</p>
            <div className="grid gap-4 xl:grid-cols-2">
              {WRAPPED_ART_SECTIONS.map((section) => (
                <Card key={section} className="space-y-3 p-4">
                  <div>
                    <p className="font-semibold text-on-surface">{SECTIONS[section].label}</p>
                    <p className="text-xs text-on-surface-subtle">{SECTIONS[section].hint}</p>
                  </div>
                  <ArtGroup slug={slug} group={section} images={inGroup(section)} loading={isLoading} />
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
        </Tabs>
      </div>
      <HowToMakeOne />
    </div>
  );
}

/** One group's images in order, each with its controls, and an "Add" tile while there's room. */
function ArtGroup({ slug, group, images, loading, large = false }: { slug: string; group: WrappedArtGroup; images: WrappedArtImage[]; loading: boolean; large?: boolean }) {
  const queryClient = useQueryClient();
  const addInput = useRef<HTMLInputElement>(null);
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
          <button
            type="button"
            onClick={() => addInput.current?.click()}
            disabled={busy !== null}
            className={`${tile} flex flex-col items-center justify-center gap-1 self-start rounded-md border border-dashed border-outline-strong text-xs text-on-surface-subtle transition-colors hover:border-on-surface/60 hover:text-on-surface-muted disabled:cursor-wait`}
          >
            <PlusIcon size={18} />
            {loading ? "…" : busy === "add" ? progress : "Add images"}
          </button>
        )}
      </div>
      <FileInput inputRef={addInput} multiple onFiles={addMany} />

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

/** A hidden file picker for images; `multiple` lets several be picked at once, handed over in the order picked. */
function FileInput({ inputRef, multiple = false, onFiles }: { inputRef: React.RefObject<HTMLInputElement | null>; multiple?: boolean; onFiles: (files: File[]) => void }) {
  return (
    <input
      ref={inputRef}
      type="file"
      multiple={multiple}
      accept="image/png,image/jpeg,image/webp,image/gif"
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
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-on-surface" />
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
          <a href="https://www.photopea.com" target="_blank" rel="noreferrer" className="underline">
            Photopea
          </a>
          : Select → Color Range, click the background, Fuzziness 1. Raise it a little at a time if a fringe of the background colour is left.
        </li>
        <li>Add raster mask (layers panel), then Ctrl + I to invert it, so the character stays.</li>
        <li>File → Export as → PNG (PNG keeps the transparency; JPG doesn't).</li>
      </ol>
      <p>No need to crop tightly, add a border or a shadow: the sticker effect trims, sizes and adds the paper itself. One character per image.</p>
    </Card>
  );
}
