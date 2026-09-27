import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import type { RewindStandoutModel } from "../../../headless/types";
import { COMIC_FONT } from "../font";
import { burstPoints } from "../ui/Burst";
import { useComic } from "../ui/useComic";
import { sfxWord } from "./sfxWords";

/** A soft, scalloped puff (viewBox 0 0 100 100): `bumps` arcs bulging out from a circle of radius `r`. */
function puffPath(bumps = 10, r = 40): string {
  const at = (i: number) => {
    const a = (2 * Math.PI * i) / bumps - Math.PI / 2;
    return `${(50 + Math.cos(a) * r).toFixed(2)} ${(50 + Math.sin(a) * r).toFixed(2)}`;
  };
  const arc = (r * Math.sin(Math.PI / bumps)).toFixed(2);
  let d = `M ${at(0)}`;
  for (let i = 1; i <= bumps; i++) d += ` A ${arc} ${arc} 0 0 1 ${at(i)}`;
  return `${d} Z`;
}

const PUFF = puffPath();
const BURST = burstPoints(18, 30, 50, 7);

// Kept clear of the viewport's edges, so a bubble over an edge Tile still shows whole.
const EDGE_PX = 8;

/** Where the Tile's cell is on screen (and how wide the screen is), followed every frame: the page scrolls, the books
 * wobble. Null until found. */
function useTileCenter(tileId: string): { x: number; y: number; vw: number } | null {
  const [center, setCenter] = useState<{ x: number; y: number; vw: number } | null>(null);
  useLayoutEffect(() => {
    let frame = 0;
    const track = () => {
      const el = document.querySelector(`[data-tile-id="${CSS.escape(tileId)}"]`);
      if (el) {
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        const vw = document.documentElement.clientWidth;
        setCenter((prev) => (prev && prev.x === x && prev.y === y && prev.vw === vw ? prev : { x, y, vw }));
      }
      frame = requestAnimationFrame(track);
    };
    track();
    return () => cancelAnimationFrame(frame);
  }, [tileId]);
  return center;
}

/**
 * The comic Rewind popup's SFX bubble (#225): the onomatopoeia for what made the Submission stand out, and the value
 * it's calling out, over the Tile it landed on. A notable one is a smaller, softer puff that pops in; a huge one a
 * big jagged burst that punches in with a shake. Decorative: it takes no clicks. Portaled to the page so it sits over
 * the Board while the popup's card stays where the page put it.
 */
export function RewindSfxBubble({ submissionId, tileId, standout, big, rejected }: { submissionId: string; tileId: string; standout: RewindStandoutModel; big: boolean; rejected: boolean }) {
  const { colors } = useComic();
  const reduceMotion = useReducedMotion();
  const center = useTileCenter(tileId);
  if (!center) return null;
  const { vw } = center;

  const phone = vw < 640;
  const size = (big ? 176 : 124) * (phone ? 0.8 : 1);
  const x = Math.min(Math.max(center.x, size / 2 + EDGE_PX), vw - size / 2 - EDGE_PX);
  const y = Math.max(center.y, size / 2 + EDGE_PX);

  const fill = { gp: colors.YELLOW, luck: colors.MAGENTA, reactions: colors.CYAN, tile: colors.ORANGE, line: colors.RED, first: colors.GREEN }[standout.kind];
  const loud = standout.kind === "luck" || standout.kind === "line";
  const ink = loud ? colors.ON_LOUD : colors.INK;
  const tilt = big ? -8 : 5;
  const word = sfxWord(standout.kind, submissionId);

  return createPortal(
    <motion.div
      aria-hidden
      className="pointer-events-none fixed z-[35] select-none"
      style={{ left: x, top: y, width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2, containerType: "inline-size", filter: rejected ? "grayscale(1)" : undefined }}
      initial={reduceMotion ? { opacity: 0 } : big ? { opacity: 0, scale: 0.2, rotate: tilt - 25 } : { opacity: 0, scale: 0.4, rotate: tilt }}
      animate={
        reduceMotion
          ? { opacity: rejected ? 0.7 : 1 }
          : big
            ? { opacity: rejected ? 0.7 : 1, scale: [0.2, 1.3, 0.92, 1.05, 1], rotate: [tilt - 25, tilt + 9, tilt - 6, tilt + 3, tilt] }
            : { opacity: rejected ? 0.7 : 1, scale: 1, rotate: tilt }
      }
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
      transition={
        reduceMotion ? { duration: 0.16 } : big ? { duration: 0.6, times: [0, 0.35, 0.6, 0.8, 1], ease: "easeOut" } : { type: "spring", stiffness: 480, damping: 20 }
      }
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full overflow-visible">
        {/* Huge: a jagged many-spiked burst. Notable: a rounder, softer puff. */}
        {big ? (
          <>
            <polygon points={BURST} fill={colors.LINE} transform="translate(2.5 3)" />
            <polygon points={BURST} fill={fill} stroke={colors.LINE} strokeWidth={3} />
          </>
        ) : (
          <>
            <path d={PUFF} fill={colors.LINE} transform="translate(2.5 3)" />
            <path d={PUFF} fill={fill} stroke={colors.LINE} strokeWidth={2.5} strokeLinejoin="round" />
          </>
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-[22%] text-center leading-none" style={{ fontFamily: COMIC_FONT, color: ink }}>
        <span className="whitespace-nowrap uppercase" style={{ fontSize: `${Math.min(22, 96 / word.length)}cqw`, letterSpacing: "0.02em", WebkitTextStroke: loud ? `0.6px ${colors.LINE}` : undefined }}>
          {word}
        </span>
        {standout.value && (
          <span className="mt-[3cqw] max-w-full truncate" style={{ fontSize: "10cqw" }}>
            {standout.value}
          </span>
        )}
      </div>
    </motion.div>,
    document.body,
  );
}
