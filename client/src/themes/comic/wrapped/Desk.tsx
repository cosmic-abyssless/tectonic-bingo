import { AnimatePresence, motion } from "motion/react";
import type { WrappedArtFrames } from "@bingo/shared";
import { StickerArt } from "../../../core/wrapped/StickerArt";
import { overviewCamera, WRAPPED_PAGE_WIDTH, type Insets, type Size } from "./camera";

/** The least room (px) beside the book that a sticker is drawn in. */
const MIN_ROOM = 150;
/** The most a sticker takes of it, and how far it tucks in under the book's edge. */
const MAX_WIDTH = 380;
const TUCK = 14;
const GAP = 12;

/**
 * The side images, as stickers slapped on the desk around the open book: one per page, changing as the pages turn, on the
 * left of the book for one page and the right for the next. Wide screens only (the page says when): a phone has no desk.
 * Where the book leaves too little room beside it, there is none.
 */
export function DeskStickers({ art, page, stage, insets, bookHeight, reduceMotion }: { art: WrappedArtFrames[]; page: number; stage: Size; insets: Insets; bookHeight: number; reduceMotion: boolean }) {
  if (art.length === 0 || stage.w === 0) return null;
  const camera = overviewCamera(stage, { w: WRAPPED_PAGE_WIDTH, h: bookHeight }, insets);
  const left = camera.x;
  const right = camera.x + WRAPPED_PAGE_WIDTH * camera.scale;
  const side: "left" | "right" = page % 2 === 0 ? "left" : "right";
  const room = side === "left" ? left - GAP + TUCK : stage.w - right - GAP + TUCK;
  if (room < MIN_ROOM) return null;
  const width = Math.min(room, MAX_WIDTH);
  const height = Math.min(stage.h * 0.72, width * 1.45);
  const tilt = side === "left" ? -5 : 5;
  const x = side === "left" ? left + TUCK - width : right - TUCK;
  const y = Math.max(insets.top, stage.h - insets.bottom - height - 4);
  const frames = art[page % art.length]!;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <AnimatePresence mode="popLayout">
        <motion.div
          key={page}
          className="absolute"
          style={{ left: x, top: y, width, height }}
          initial={reduceMotion ? false : { opacity: 0, y: 36, rotate: tilt * 2.2, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, rotate: tilt, scale: 1 }}
          exit={reduceMotion ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -24, rotate: tilt * 2.2, scale: 0.94, transition: { duration: 0.25 } }}
          transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 240, damping: 22, delay: 0.25 }}
        >
          <StickerArt frames={frames} className="size-full" phase={side === "left" ? 0 : 0.5} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
