import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Burst } from "../ui/Burst";
import { useComic } from "../ui/useComic";

interface Sfx {
  id: number;
  x: number;
  y: number;
  text: string;
  fill?: string;
  rotate: number;
  size: number;
}

const WORDS = ["POW!", "BANG!", "WHAM!", "ZAP!", "BOOM!", "KRAK!", "THWIP!", "SMASH!", "BIFF!", "KAPOW!"];
const LIFE_MS = 900;

let nextId = 1;
const listeners = new Set<(s: Sfx) => void>();

/**
 * Fire a sound-effect burst at a viewport point. Components call this on
 * click; <SfxLayer> (mounted once per page) renders and expires them.
 */
export function sfx(x: number, y: number, opts: { text?: string; fill?: string; size?: number } = {}) {
  if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const s: Sfx = {
    id: nextId++,
    x,
    y,
    text: opts.text ?? WORDS[Math.floor(Math.random() * WORDS.length)],
    fill: opts.fill,
    rotate: Math.random() * 30 - 15,
    size: opts.size ?? 120,
  };
  listeners.forEach((l) => l(s));
}

/** Convenience: fire from a pointer/press event's client position or an element's center. */
export function sfxAt(target: { clientX: number; clientY: number } | Element, opts?: { text?: string; fill?: string; size?: number }) {
  if ("clientX" in target) return sfx(target.clientX, target.clientY, opts);
  const r = target.getBoundingClientRect();
  sfx(r.left + r.width / 2, r.top + r.height / 2, opts);
}

export function SfxLayer() {
  const [items, setItems] = useState<Sfx[]>([]);
  const { colors, vars } = useComic();
  useEffect(() => {
    const add = (s: Sfx) => {
      setItems((prev) => [...prev.slice(-5), s]);
      window.setTimeout(() => setItems((prev) => prev.filter((p) => p.id !== s.id)), LIFE_MS);
    };
    listeners.add(add);
    return () => {
      listeners.delete(add);
    };
  }, []);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[70]" style={vars}>
      <AnimatePresence>
        {items.map((s) => (
          <motion.div
            key={s.id}
            className="absolute"
            style={{ left: s.x, top: s.y, width: s.size, x: "-50%" }}
            // Pop in, hang for a beat, then drift up and fade. One keyframed
            // animate (no exit) so it plays out even if the item is dropped
            // early by the cap on concurrent bursts.
            initial={{ y: "-50%", scale: 0.3, rotate: -20, opacity: 0 }}
            animate={{ y: ["-50%", "-50%", "-60%", "-110%"], scale: [0.3, 1.15, 1, 0.85], rotate: [-20, 6, -3, 3], opacity: [0, 1, 1, 0] }}
            transition={{ duration: LIFE_MS / 1000, times: [0, 0.25, 0.55, 1], ease: [0.2, 0.9, 0.3, 1] }}
          >
            <Burst fill={s.fill ?? [colors.YELLOW, colors.RED, colors.CYAN, colors.MAGENTA][s.id % 4]} color={s.id % 4 === 1 || s.id % 4 === 3 ? "#fffaf0" : colors.INK} rotate={s.rotate} spikes={12 + (s.id % 4) * 2}>
              {s.text}
            </Burst>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
