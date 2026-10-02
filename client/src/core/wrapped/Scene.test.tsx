// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { Reveal, useWrappedSceneState, WrappedScene } from "./Scene";
import { createWrappedProgressStore, useWrappedScenes, WrappedProgressProvider, type WrappedProgressStore } from "./sceneProgress";

afterEach(cleanup);

/** A guided page's Scene: three steps, then two, with a Reveal per step. */
function Sections() {
  return (
    <>
      <WrappedScene steps={3}>
        <Reveal step={0}>first-0</Reveal>
        <Reveal step={1}>first-1</Reveal>
        <Reveal step={2}>first-2</Reveal>
      </WrappedScene>
      <WrappedScene steps={2}>
        <Reveal step={0}>second-0</Reveal>
        <Reveal step={1}>second-1</Reveal>
        <StateProbe />
      </WrappedScene>
    </>
  );
}

function StateProbe() {
  const state = useWrappedSceneState();
  return <p data-testid="probe">{state ? `${state.reached}/${state.steps}${state.current ? " current" : ""}` : "none"}</p>;
}

/** A page that doesn't scroll: it holds the store, reads the Scenes' step counts and renders them. */
function GuidedPage({ store, onScenes }: { store: WrappedProgressStore; onScenes?: (steps: number[]) => void }) {
  const scenes = useWrappedScenes(store);
  onScenes?.(scenes.map((s) => s.steps));
  return (
    <WrappedProgressProvider source={store}>
      <Sections />
    </WrappedProgressProvider>
  );
}

const revealed = (text: string) => screen.getByText(text).closest("[data-revealed]")?.getAttribute("data-revealed");

describe("a page-supplied progress source", () => {
  it("tells the page how many steps each Scene has, in document order", () => {
    const store = createWrappedProgressStore();
    const seen: number[][] = [];
    render(<GuidedPage store={store} onScenes={(steps) => seen.push(steps)} />);
    expect(store.getScenes().map((s) => s.steps)).toEqual([3, 2]);
    expect(seen.at(-1)).toEqual([3, 2]);
    expect(store.getScenes().every((s) => s.element instanceof HTMLElement)).toBe(true);
  });

  it("reveals a Scene's Reveals one step at a time, with no scrolling", () => {
    const store = createWrappedProgressStore();
    render(<GuidedPage store={store} />);
    const [first, second] = store.getScenes();

    // Nothing is shown until the page says so, wherever the Scenes happen to sit on screen.
    for (const t of ["first-0", "first-1", "first-2", "second-0", "second-1"]) expect(revealed(t)).toBe("false");

    act(() => store.setSceneState(first!.id, { reached: 1, current: true }));
    expect([revealed("first-0"), revealed("first-1"), revealed("first-2")]).toEqual(["true", "false", "false"]);
    expect(revealed("second-0")).toBe("false");

    act(() => store.setSceneState(first!.id, { reached: 2 }));
    expect([revealed("first-0"), revealed("first-1"), revealed("first-2")]).toEqual(["true", "true", "false"]);

    act(() => store.setSceneState(first!.id, { reached: 3 }));
    expect(revealed("first-2")).toBe("true");

    // The next Scene starts from its own first step, and can be stepped back.
    act(() => {
      store.setSceneState(first!.id, { current: false });
      store.setSceneState(second!.id, { reached: 1, current: true });
    });
    expect([revealed("second-0"), revealed("second-1")]).toEqual(["true", "false"]);
    act(() => store.setSceneState(second!.id, { reached: 0 }));
    expect(revealed("second-0")).toBe("false");
  });

  it("marks the current Scene and lets a Scene's content read its state", () => {
    const store = createWrappedProgressStore();
    const { container } = render(<GuidedPage store={store} />);
    const [, second] = store.getScenes();
    expect(screen.getByTestId("probe").textContent).toBe("0/2");
    act(() => store.setSceneState(second!.id, { reached: 2, current: true }));
    expect(screen.getByTestId("probe").textContent).toBe("2/2 current");
    const flags = [...container.querySelectorAll("section")].map((s) => s.getAttribute("data-wrapped-scene-current"));
    expect(flags).toEqual(["false", "true"]);
  });

  it("forgets a Scene that leaves", () => {
    const store = createWrappedProgressStore();
    const { unmount } = render(<GuidedPage store={store} />);
    expect(store.getScenes()).toHaveLength(2);
    unmount();
    expect(store.getScenes()).toHaveLength(0);
  });
});

describe("with no page-supplied progress", () => {
  it("shows a Reveal outside a Scene as it is", () => {
    render(<Reveal step={4}>plain</Reveal>);
    expect(screen.getByText("plain").hasAttribute("data-revealed")).toBe(false);
  });

  it("has no page state to read, and measures scroll for its Reveals", () => {
    render(
      <WrappedScene steps={2}>
        <Reveal step={1}>scrolled</Reveal>
        <StateProbe />
      </WrappedScene>,
    );
    expect(screen.getByTestId("probe").textContent).toBe("none");
    // Scroll-linked: no page-supplied reveal state, the opacity is a motion value tied to the Scene.
    expect(screen.getByText("scrolled").closest("[data-revealed]")).toBeNull();
  });
});
