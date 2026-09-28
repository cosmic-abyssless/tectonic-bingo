import { createContext, useContext, useRef, type ReactNode } from "react";
import { motion, useMotionValue, useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react";

// Wrapped's scroll-driven reveal (CONTEXT.md "Wrapped"): a Scene is one screen of the story, and each Reveal in it
// fades up as the Scene scrolls into view, in step order, tied to the scroll position. With reduced motion there is no
// scroll-linked animation: each Reveal simply fades in once it's on screen. Themes build their Wrapped sections from these.

const SceneContext = createContext<{ progress: MotionValue<number>; steps: number } | null>(null);

/**
 * One screen of the story: at least the viewport's height, its content centred. `steps` is how many Reveal steps it
 * has (the highest step + 1), so the last one is in by the time the Scene's middle reaches the middle of the screen.
 */
export function WrappedScene({ steps = 1, className = "", children }: { steps?: number; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "center 0.55"] });
  return (
    <SceneContext.Provider value={{ progress: scrollYProgress, steps: Math.max(1, steps) }}>
      <section ref={ref} className={`relative flex min-h-dvh flex-col items-center justify-center px-4 py-20 sm:px-8 md:px-24 ${className}`}>
        {children}
      </section>
    </SceneContext.Provider>
  );
}

/** A line of a Scene that fades up at its `step` (0 first). Outside a Scene it's shown as it is. */
export function Reveal({ step = 0, className, children }: { step?: number; className?: string; children: ReactNode }) {
  const scene = useContext(SceneContext);
  const reduceMotion = useReducedMotion();
  const steps = scene?.steps ?? 1;
  // Each step gets an equal slice of the Scene's progress, overlapping the next a little.
  const from = (step / steps) * 0.8;
  const to = Math.min(1, from + 0.8 / steps + 0.15);
  const done = useMotionValue(1);
  const progress = scene?.progress ?? done;
  const opacity = useTransform(progress, [from, to], [0, 1]);
  const y = useTransform(progress, [from, to], [28, 0]);

  if (!scene) return <div className={className}>{children}</div>;
  if (reduceMotion) {
    return (
      <motion.div className={className} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, amount: 0.4 }} transition={{ duration: 0.4 }}>
        {children}
      </motion.div>
    );
  }
  return (
    <motion.div className={className} style={{ opacity, y }}>
      {children}
    </motion.div>
  );
}
