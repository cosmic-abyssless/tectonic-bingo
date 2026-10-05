import { ArrowLeftIcon, ArrowRightIcon, ListIcon } from "../../../core/ui/icons";
import { COMIC_FONT } from "../font";
import { ComicButton, ComicIconButton } from "../ui/ComicButton";
import { useComic } from "../ui/useComic";
import { pageInSection, panelPlace, type GuidePage, type Stop } from "./guide";
import { LETTERED } from "../../lettering";

/** What the reader is on, in words: "Page 3 · Your Team", "Front cover". */
export function whereLabel(pages: readonly GuidePage[], pos: Stop): string {
  const page = pages[pos.page];
  if (!page) return "";
  if (page.kind === "cover") return "Front cover";
  if (page.kind === "back") return "Back cover";
  const within = pageInSection(pages, pos.page);
  return `Page ${page.no} · ${page.role}${within ? ` (${within.n} of ${within.of})` : ""}`;
}

/** What a screen reader is told as the reader moves: where, and which panel of how many. */
export function announcement(pages: readonly GuidePage[], pos: Stop): string {
  const page = pages[pos.page];
  if (!page) return "";
  const where = whereLabel(pages, pos);
  const { index, of } = panelPlace(pages, pos);
  return of > 1 ? `${where}, panel ${index + 1} of ${of}` : where;
}

/**
 * The controls along the foot of the stage: the contents button, where the reader is (with a pip for each panel of the
 * page), and back and forward for those without a scroll wheel, keys or a finger.
 */
export function Hud({
  pages,
  pos,
  atStart,
  atEnd,
  onContents,
  onPrev,
  onNext,
}: {
  pages: readonly GuidePage[];
  pos: Stop;
  atStart: boolean;
  atEnd: boolean;
  onContents: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const { colors } = useComic();
  const page = pages[pos.page];
  const { index } = panelPlace(pages, pos);
  return (
    <div data-hud className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex items-end justify-between gap-2 px-3 pb-3">
      <ComicButton size="sm" variant="secondary" sfx={false} onPress={onContents} aria-label="Contents: in this issue" className="pointer-events-auto">
        <ListIcon />
        <span className="max-sm:hidden">In this issue</span>
      </ComicButton>
      <div
        className={`${LETTERED} pointer-events-none flex min-w-0 flex-col items-center gap-1 border-[3px] px-2.5 py-1 text-center uppercase leading-none`}
        style={{ fontFamily: COMIC_FONT, letterSpacing: "0.04em", background: colors.PAPER_RAISED, borderColor: colors.LINE, boxShadow: `3px 3px 0 ${colors.SHADOW}`, color: colors.INK, fontSize: "0.95rem" }}
      >
        <span className="max-w-[54vw] truncate sm:max-w-none">{whereLabel(pages, pos)}</span>
        {page && page.panels.length > 1 && (
          <span aria-hidden className="flex gap-1">
            {page.panels.map((_, i) => (
              <span key={i} className="block size-1.5 border" style={{ background: i <= index ? colors.LINE : "transparent", borderColor: colors.LINE }} />
            ))}
          </span>
        )}
      </div>
      <div className="pointer-events-auto flex gap-2">
        <ComicIconButton label="Previous panel" sfx={false} onPress={onPrev} isDisabled={atStart} className="size-9">
          <ArrowLeftIcon />
        </ComicIconButton>
        <ComicIconButton label="Next panel" sfx={false} onPress={onNext} isDisabled={atEnd} className="size-9">
          <ArrowRightIcon />
        </ComicIconButton>
      </div>
    </div>
  );
}
