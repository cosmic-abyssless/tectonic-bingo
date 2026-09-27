import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { WRAPPED_ART_KEYING_DEFAULTS, WRAPPED_ART_SECTIONS, type WrappedArtKeying, type WrappedArtSection, type WrappedArtSlot } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { adminQueryKeys, useWrappedArt } from "../../api/adminQueries";
import { Button } from "../ui/Button";
import { Card, Notice } from "../ui/Card";
import { ImageIcon } from "../ui/icons";
import { StickerArt } from "../wrapped/StickerArt";

const SECTIONS: Record<WrappedArtSection, { label: string; hint: string; unused?: boolean }> = {
  intro: { label: "Intro", hint: "The opening screen" },
  you: { label: "You", hint: "The Player's own numbers" },
  duo: { label: "Duo", hint: "The Player and their Duo partner", unused: true },
  captain: { label: "Captain", hint: "A Captain's Draft", unused: true },
  moderator: { label: "Moderator", hint: "A Moderator's reviews" },
  team: { label: "Team", hint: "The Player's Team" },
  bingo: { label: "The Bingo", hint: "Everyone, together" },
  outro: { label: "Outro", hint: "The closing screen" },
};

/**
 * The mod panel's Wrapped art tab (admins only, #262): one slot per Wrapped section, where an Admin uploads a
 * cut-out (a transparent PNG, or a RuneLite Blindfold screenshot the server keys out), watches its two sticker frames
 * boil, replaces or removes it, and re-cuts a keyed screenshot with other settings when the keying left a fringe.
 */
export function WrappedArtManager({ slug }: { slug: string }) {
  const { data, isLoading, error } = useWrappedArt(slug);
  const bySection = new Map((data?.art ?? []).map((a) => [a.section, a]));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div className="space-y-4">
        <p className="text-sm text-on-surface-muted">
          A decorative character cut-out for each section of Wrapped, drawn as a sticker on torn paper. A new bingo starts with the previous bingo's art; replace what you want. A section
          without art still looks finished.
        </p>
        {error && <Notice tone="danger">{error instanceof Error ? error.message : "Couldn't load the Wrapped art"}</Notice>}
        <div className="grid gap-4 sm:grid-cols-2">
          {WRAPPED_ART_SECTIONS.map((section) => (
            <ArtSlot key={section} slug={slug} section={section} slot={bySection.get(section) ?? null} loading={isLoading} />
          ))}
        </div>
      </div>
      <HowToMakeOne />
    </div>
  );
}

function ArtSlot({ slug, section, slot, loading }: { slug: string; section: WrappedArtSection; slot: WrappedArtSlot | null; loading: boolean }) {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"upload" | "recut" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keying, setKeying] = useState<WrappedArtKeying | null>(null);
  const current = slot?.keying ?? null;
  const draft = keying ?? current ?? WRAPPED_ART_KEYING_DEFAULTS;
  const { label, hint, unused } = SECTIONS[section];

  async function run(kind: "upload" | "recut" | "remove", action: () => Promise<unknown>) {
    setBusy(kind);
    setError(null);
    try {
      await action();
      setKeying(null);
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.wrappedArt(slug) });
      await queryClient.invalidateQueries({ queryKey: ["wrapped"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  const upload = (file: File) => run("upload", () => adminApi.uploadWrappedArt(slug, section, file, keying ?? undefined));
  const changed = current !== null && (draft.tolerance !== current.tolerance || draft.softness !== current.softness);

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div>
        <p className="font-semibold text-on-surface">{label}</p>
        <p className="text-xs text-on-surface-subtle">
          {hint}
          {unused && " · not in the story yet, kept for when it is"}
        </p>
      </div>

      <div className="flex h-56 items-center justify-center rounded-md border border-outline bg-surface-raised p-3">
        {slot ? (
          <StickerArt frames={slot.frames} className="size-full" alt={`${label} art`} />
        ) : (
          <span className="flex flex-col items-center gap-1 text-xs text-on-surface-subtle">
            <ImageIcon size={20} />
            {loading ? "…" : busy === "upload" ? "Cutting it out…" : "No art"}
          </span>
        )}
      </div>

      {slot?.keying && (
        <div className="space-y-2 text-xs text-on-surface-muted">
          <p className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm border border-outline" style={{ backgroundColor: slot.keyColor ?? undefined }} />
            Background {slot.keyColor} keyed out. A fringe left around the outline? Raise the tolerance or softness and re-cut.
          </p>
          <KeyingSlider label="Tolerance" hint="what counts as background" min={0} max={200} value={draft.tolerance} onChange={(tolerance) => setKeying({ ...draft, tolerance })} />
          <KeyingSlider label="Softness" hint="how wide the soft edge is" min={1} max={300} value={draft.softness} onChange={(softness) => setKeying({ ...draft, softness })} />
        </div>
      )}

      {error && <Notice tone="danger">{error}</Notice>}

      <div className="mt-auto flex flex-wrap gap-2">
        <Button size="sm" variant={slot ? "secondary" : "primary"} onPress={() => fileInput.current?.click()} isDisabled={busy !== null}>
          {busy === "upload" ? "Uploading…" : slot ? "Replace" : "Upload"}
        </Button>
        {slot?.keying && (
          <Button size="sm" onPress={() => run("recut", () => adminApi.recutWrappedArt(slug, section, draft))} isDisabled={busy !== null || !changed}>
            {busy === "recut" ? "Re-cutting…" : "Re-cut"}
          </Button>
        )}
        {slot && (
          <Button size="sm" variant="ghost" onPress={() => run("remove", () => adminApi.removeWrappedArt(slug, section))} isDisabled={busy !== null}>
            {busy === "remove" ? "Removing…" : "Remove"}
          </Button>
        )}
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) upload(file);
        }}
      />
    </Card>
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
      <p>No need to crop tightly, add a border or a shadow: the sticker effect trims, sizes and adds the paper itself.</p>
    </Card>
  );
}
