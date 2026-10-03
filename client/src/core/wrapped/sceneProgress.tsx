import { createContext, useContext, useMemo, useSyncExternalStore, type ComponentType, type ReactNode } from "react";

// Where a Wrapped Scene's progress comes from (see Scene.tsx). By default a Scene measures its own scroll progress.
// A theme's WrappedPage that doesn't scroll (a guided view that steps through panels) supplies the progress itself:
// it wraps its sections in a WrappedProgressProvider holding a WrappedProgressSource, and every WrappedScene /
// Reveal underneath follows that source instead of the scroll position.
//
// The source is a two-way channel. Each Scene tells it that it exists and how many steps it has (so the page can plan
// its stops); the page tells each Scene how many of its steps are reached and whether it is the current Scene.
// createWrappedProgressStore() is the ready-made source: the page holds one, reads its scenes with
// useWrappedScenes(store) and drives them with store.setSceneState(id, ...).

/** What a Scene tells the source about itself, while it is mounted. */
export interface WrappedSceneInfo {
  /** Identifies the Scene to the source. Stable for as long as the Scene is mounted. */
  id: string;
  /** How many Reveal steps the Scene has (its `steps` prop, at least 1). */
  steps: number;
  /** The Scene's element, for a page that places a camera on it. Null until it is in the DOM. */
  element: HTMLElement | null;
}

/** What the page tells a Scene. */
export interface WrappedSceneState {
  /** How many of the Scene's steps are reached: its Reveals at steps `0 .. reached - 1` are shown, the rest hidden. */
  reached: number;
  /** Whether this is the Scene the page is on now. */
  current: boolean;
}

/** A Scene the page hasn't said anything about is on no step yet. */
export const WRAPPED_SCENE_UNREACHED: WrappedSceneState = { reached: 0, current: false };

/** The contract between a page and its Scenes. Implement it yourself, or use createWrappedProgressStore(). */
export interface WrappedProgressSource {
  /** A Scene mounted or its step count changed. Registering the same `id` again replaces it. Returns the unregister. */
  registerScene(scene: WrappedSceneInfo): () => void;
  /** The Scene's state now. Must return the same object until it changes (it feeds useSyncExternalStore). */
  getSceneState(id: string): WrappedSceneState;
  /** Calls `listener` when any Scene's state changes. Returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
}

/** The ready-made source: it remembers the Scenes that registered and the state the page gave each. */
export interface WrappedProgressStore extends WrappedProgressSource {
  /** The Scenes now mounted, in document order. A new array whenever one registers, changes or leaves. */
  getScenes(): readonly WrappedSceneInfo[];
  /** Calls `listener` when a Scene registers, changes its step count or leaves. Returns the unsubscribe. */
  subscribeScenes(listener: () => void): () => void;
  /** Sets (part of) a Scene's state. A Scene that hasn't registered yet takes it on arrival. */
  setSceneState(id: string, state: Partial<WrappedSceneState>): void;
}

export function createWrappedProgressStore(): WrappedProgressStore {
  const infos = new Map<string, WrappedSceneInfo>();
  const states = new Map<string, WrappedSceneState>();
  let scenes: readonly WrappedSceneInfo[] = [];
  const stateListeners = new Set<() => void>();
  const sceneListeners = new Set<() => void>();

  const publishScenes = () => {
    scenes = [...infos.values()].sort((a, b) => {
      if (!a.element || !b.element) return 0;
      return a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
    sceneListeners.forEach((l) => l());
  };

  return {
    registerScene(scene) {
      infos.set(scene.id, scene);
      publishScenes();
      return () => {
        // Only the registration that is still current leaves: a replaced one's cleanup must not drop its successor.
        if (infos.get(scene.id) !== scene) return;
        infos.delete(scene.id);
        publishScenes();
      };
    },
    getSceneState: (id) => states.get(id) ?? WRAPPED_SCENE_UNREACHED,
    subscribe(listener) {
      stateListeners.add(listener);
      return () => void stateListeners.delete(listener);
    },
    getScenes: () => scenes,
    subscribeScenes(listener) {
      sceneListeners.add(listener);
      return () => void sceneListeners.delete(listener);
    },
    setSceneState(id, state) {
      const before = states.get(id) ?? WRAPPED_SCENE_UNREACHED;
      const after = { ...before, ...state };
      if (after.reached === before.reached && after.current === before.current) return;
      states.set(id, after);
      stateListeners.forEach((l) => l());
    },
  };
}

/** The Scenes now mounted under a store's provider, in document order, with their step counts. Re-renders as they change. */
export function useWrappedScenes(store: WrappedProgressStore): readonly WrappedSceneInfo[] {
  return useSyncExternalStore(store.subscribeScenes, store.getScenes);
}

/**
 * How a Reveal stands in its Scene, for a page that stages them: the `splash` is the Scene's big opening line, a
 * `highlight` a line worth a moment of its own (the Team's top scorer), and `narration` a line that only says more about
 * the one before it. A page that doesn't stage its Reveals ignores it.
 */
export type WrappedRevealEmphasis = "splash" | "highlight" | "narration";

/** What a page-supplied Reveal is given to draw itself with (see WrappedProgressProvider's `reveal`). */
export interface WrappedRevealProps {
  /** The Scene the Reveal is in (a WrappedSceneInfo's `id`) and the step it belongs to. */
  sceneId: string;
  step: number;
  /** Whether the page has reached the Reveal's step. */
  revealed: boolean;
  /** The Reveal's `bare` prop: the section draws its own frame, so the page adds none. */
  bare: boolean;
  /** The Reveal's `emphasis` prop, for a page that stages its Reveals (a comic's splash, or a caption set in as an inset). */
  emphasis?: WrappedRevealEmphasis;
  /** The classes the section gave the Reveal: how it lays itself out in its Scene. */
  className?: string;
  children: ReactNode;
}

interface ProgressContextValue {
  source: WrappedProgressSource;
  reveal: ComponentType<WrappedRevealProps> | null;
}

const ProgressSourceContext = createContext<ProgressContextValue | null>(null);

/**
 * Makes every WrappedScene and Reveal inside follow `source` instead of the scroll position. `reveal` is how the page
 * wants a Reveal drawn: by default a Reveal fades up when its step is reached. A page with its own look for an
 * unreached step (a comic's empty panel, say) gives a component that draws the Reveal's frame, content and reveal
 * itself; it must put the layout classes the section gave the Reveal on the element it draws.
 */
export function WrappedProgressProvider({ source, reveal = null, children }: { source: WrappedProgressSource; reveal?: ComponentType<WrappedRevealProps> | null; children: ReactNode }) {
  const value = useMemo(() => ({ source, reveal }), [source, reveal]);
  return <ProgressSourceContext.Provider value={value}>{children}</ProgressSourceContext.Provider>;
}

/** The page-supplied source, or null when Scenes measure scroll progress. */
export function useWrappedProgressSource(): WrappedProgressSource | null {
  return useContext(ProgressSourceContext)?.source ?? null;
}

/** The page's own Reveal component, if it gave one. */
export function useWrappedRevealComponent(): ComponentType<WrappedRevealProps> | null {
  return useContext(ProgressSourceContext)?.reveal ?? null;
}
