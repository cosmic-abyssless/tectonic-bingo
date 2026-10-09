import { createContext, useContext, useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import { useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react";
import * as m from "motion/react-m";
import { useWrappedProgressSource, useWrappedRevealComponent, WRAPPED_SCENE_UNREACHED, type WrappedProgressSource, type WrappedRevealEmphasis, type WrappedSceneState } from "./sceneProgress";

// Wrapped's reveal (CONTEXT.md "Wrapped"): a Scene is one screen of the story, and each Reveal in it fades up at its
// step, in step order. Themes build their Wrapped sections from these. Where the progress comes from is the page's call:
//  - by default (no provider) it is scroll: each Reveal fades up as its Scene scrolls into view, tied to the scroll
//    position. With reduced motion there is no scroll-linked animation: each Reveal simply fades in once it's on screen.
//  - under a WrappedProgressProvider (sceneProgress.tsx) the page supplies it: the Scene registers its step count with
//    the page's source, and each Reveal is shown once the source says its step is reached (instantly with reduced
//    motion). Nothing is measured, so the page needn't scroll.

type SceneContextValue = { mode: "scroll"; progress: MotionValue<number>; steps: number } | { mode: "page"; source: WrappedProgressSource; id: string; steps: number };

const SceneContext = createContext<SceneContextValue | null>(null);

const SCENE_CLASS = "relative flex min-h-dvh flex-col items-center justify-center px-4 py-20 sm:px-8 md:px-24";

/**
 * One screen of the story: at least the viewport's height, its content centred. `steps` is how many Reveal steps it
 * has (the highest step + 1), so with scroll progress the last one is in by the time the Scene's middle reaches the
 * middle of the screen, and a page that supplies the progress reads it as the Scene's step count.
 */
export function WrappedScene({ steps = 1, className = "", children }: { steps?: number; className?: string; children: ReactNode }) {
  const source = useWrappedProgressSource();
  const count = Math.max(1, steps);
  return source ? (
    <PageDrivenScene source={source} steps={count} className={className}>
      {children}
    </PageDrivenScene>
  ) : (
    <ScrollScene steps={count} className={className}>
      {children}
    </ScrollScene>
  );
}

function ScrollScene({ steps, className, children }: { steps: number; className: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "center 0.55"] });
  return (
    <SceneContext.Provider value={{ mode: "scroll", progress: scrollYProgress, steps }}>
      <section ref={ref} className={`${SCENE_CLASS} ${className}`}>
        {children}
      </section>
    </SceneContext.Provider>
  );
}

function PageDrivenScene({ source, steps, className, children }: { source: WrappedProgressSource; steps: number; className: string; children: ReactNode }) {
  const id = useId();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => source.registerScene({ id, steps, element: ref.current }), [source, id, steps]);
  const state = useSceneState(source, id);
  return (
    <SceneContext.Provider value={{ mode: "page", source, id, steps }}>
      <section ref={ref} data-wrapped-scene={id} data-wrapped-scene-current={state.current} className={`${SCENE_CLASS} ${className}`}>
        {children}
      </section>
    </SceneContext.Provider>
  );
}

function useSceneState(source: WrappedProgressSource, id: string): WrappedSceneState {
  return useSyncExternalStore(source.subscribe, () => source.getSceneState(id));
}

const NO_SUBSCRIBE = () => () => {};

/**
 * Inside a Scene whose progress the page supplies: that Scene's step count and state, for a theme that wants more than
 * its Reveals (a caption for the current Scene, say). Null outside such a Scene, including one that follows scrolling.
 */
export function useWrappedSceneState(): (WrappedSceneState & { steps: number }) | null {
  const scene = useContext(SceneContext);
  const page = scene?.mode === "page" ? scene : null;
  // Hooks can't be conditional, so a scrolling Scene (or none) reads a state nobody sets.
  const state = useSyncExternalStore(page?.source.subscribe ?? NO_SUBSCRIBE, () => page?.source.getSceneState(page.id) ?? WRAPPED_SCENE_UNREACHED);
  return page ? { ...state, steps: page.steps } : null;
}

/**
 * A line of a Scene that fades up at its `step` (0 first). Outside a Scene it's shown as it is. `bare` tells a page that
 * draws its Reveals in frames (a comic's panels) that this one brings a frame of its own, so it should add none, and
 * `emphasis` how the line stands in its Scene, for a page that stages them (sceneProgress: WrappedRevealEmphasis).
 */
export function Reveal({ step = 0, bare = false, emphasis, className, children }: { step?: number; bare?: boolean; emphasis?: WrappedRevealEmphasis; className?: string; children: ReactNode }) {
  const scene = useContext(SceneContext);
  if (!scene) return <div className={className}>{children}</div>;
  if (scene.mode === "page") {
    return (
      <PageDrivenReveal source={scene.source} sceneId={scene.id} step={step} bare={bare} emphasis={emphasis} className={className}>
        {children}
      </PageDrivenReveal>
    );
  }
  return (
    <ScrollReveal progress={scene.progress} steps={scene.steps} step={step} className={className}>
      {children}
    </ScrollReveal>
  );
}

function ScrollReveal({ progress, steps, step, className, children }: { progress: MotionValue<number>; steps: number; step: number; className?: string; children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  // Each step gets an equal slice of the Scene's progress, overlapping the next a little.
  const from = (step / steps) * 0.8;
  const to = Math.min(1, from + 0.8 / steps + 0.15);
  const opacity = useTransform(progress, [from, to], [0, 1]);
  const y = useTransform(progress, [from, to], [28, 0]);

  if (reduceMotion) {
    return (
      <m.div className={className} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, amount: 0.4 }} transition={{ duration: 0.4 }}>
        {children}
      </m.div>
    );
  }
  return (
    <m.div className={className} style={{ opacity, y }}>
      {children}
    </m.div>
  );
}

function PageDrivenReveal({
  source,
  sceneId,
  step,
  bare,
  emphasis,
  className,
  children,
}: {
  source: WrappedProgressSource;
  sceneId: string;
  step: number;
  bare: boolean;
  emphasis?: WrappedRevealEmphasis;
  className?: string;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const Custom = useWrappedRevealComponent();
  const revealed = step < useSceneState(source, sceneId).reached;
  if (Custom) {
    return (
      <Custom sceneId={sceneId} step={step} revealed={revealed} bare={bare} emphasis={emphasis} className={className}>
        {children}
      </Custom>
    );
  }
  return (
    <m.div
      className={className}
      data-wrapped-step={step}
      data-revealed={revealed}
      initial={false}
      animate={{ opacity: revealed ? 1 : 0, y: revealed ? 0 : 28 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.4, ease: "easeOut" }}
    >
      {children}
    </m.div>
  );
}
