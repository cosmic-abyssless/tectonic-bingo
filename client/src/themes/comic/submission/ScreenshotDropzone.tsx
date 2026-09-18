import { MAX_UPLOAD_MB } from "@bingo/shared";
import type { SubmissionFlowModel } from "../../../headless/types";
import { ImageIcon } from "../../../core/ui/icons";
import { COMIC_FONT } from "../font";
import { useComic } from "../ui/useComic";
import { Stamp } from "../ui/Stamp";
import { ComicField } from "./ComicField";

/**
 * The evidence photo. An empty comic panel with a dashed "paste photo here"
 * frame; once a screenshot is chosen it becomes a taped-in polaroid.
 */
export function ScreenshotDropzone({ screenshot }: { screenshot: SubmissionFlowModel["screenshot"] }) {
  const { colors } = useComic();
  const has = !!screenshot.previewUrl;
  return (
    <ComicField label="Exhibit A" as="div">
      <button
        type="button"
        onClick={screenshot.openFilePicker}
        className={`comic-press relative block w-full border-[3px] transition-[transform,background-color] ${has ? "h-56" : "h-40"}`}
        style={{
          borderColor: colors.INK,
          borderStyle: has ? "solid" : "dashed",
          background: screenshot.dragOver ? colors.YELLOW_TINT : has ? colors.PAPER_RAISED : colors.PAPER_ALT,
          boxShadow: `4px 4px 0 ${colors.INK}`,
        }}
      >
        {has ? (
          <>
            <img src={screenshot.previewUrl!} alt="Preview" className="absolute inset-0 h-full w-full object-contain p-3" />
            {/* tape strips */}
            <span aria-hidden className="absolute -top-2 left-6 h-4 w-14 -rotate-6" style={{ background: colors.YELLOW, opacity: 0.85, border: `2px solid ${colors.INK}` }} />
            <span aria-hidden className="absolute -top-2 right-6 h-4 w-14 rotate-6" style={{ background: colors.YELLOW, opacity: 0.85, border: `2px solid ${colors.INK}` }} />
            <span
              className="absolute bottom-2 right-2 border-[2px] px-2 py-0.5 text-sm uppercase leading-none"
              style={{ fontFamily: COMIC_FONT, borderColor: colors.INK, background: colors.PAPER, color: colors.INK }}
            >
              Click to swap
            </span>
          </>
        ) : (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5" style={{ color: colors.INK_SUBTLE }}>
            <ImageIcon size={30} />
            <span className="text-2xl uppercase leading-none tracking-wide" style={{ fontFamily: COMIC_FONT, color: colors.INK }}>
              {screenshot.dragOver ? "Drop it!" : "Paste photo here"}
            </span>
            <span className="text-xs">Drag & drop or click · PNG, JPG, WebP · max {MAX_UPLOAD_MB} MB</span>
          </span>
        )}
        {screenshot.error && (
          <Stamp kind="rejected" size="sm" rotate={-8} className="absolute left-2 top-2">
            {screenshot.error}
          </Stamp>
        )}
      </button>
      <input {...screenshot.inputProps} className="hidden" />
    </ComicField>
  );
}
