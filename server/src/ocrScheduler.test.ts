import { describe, expect, it } from "vitest";
import { createLimiter, createResultCache } from "./ocrScheduler";

// A task that stays running until released, so a test decides exactly when each one finishes.
function gate() {
  let release!: () => void;
  const opened = new Promise<void>((resolve) => (release = resolve));
  return { opened, release };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createLimiter", () => {
  it("never runs more than the limit at once and starts queued work as slots free up", async () => {
    const limiter = createLimiter(2);
    const gates = [gate(), gate(), gate(), gate()];
    const started: number[] = [];
    const results = gates.map((g, i) =>
      limiter.run(async () => {
        started.push(i);
        await g.opened;
        return i;
      }),
    );
    await tick();
    expect(started).toEqual([0, 1]);
    expect(limiter.stats()).toEqual({ running: 2, queued: 2 });

    gates[0]!.release();
    await tick();
    expect(started).toEqual([0, 1, 2]);
    gates[1]!.release();
    gates[2]!.release();
    gates[3]!.release();
    expect(await Promise.all(results)).toEqual([0, 1, 2, 3]);
    expect(limiter.stats()).toEqual({ running: 0, queued: 0 });
  });

  it("serves interactive work before background work that queued earlier, each in arrival order", async () => {
    const limiter = createLimiter(1);
    const first = gate();
    const order: string[] = [];
    const run = (name: string, priority: "interactive" | "background") =>
      limiter.run(async () => {
        order.push(name);
        if (name === "first") await first.opened;
      }, priority);
    const all = [run("first", "interactive"), run("bg1", "background"), run("bg2", "background"), run("ui1", "interactive"), run("ui2", "interactive")];
    await tick();
    first.release();
    await Promise.all(all);
    expect(order).toEqual(["first", "ui1", "ui2", "bg1", "bg2"]);
  });

  it("frees the slot when a task fails, and passes the failure on to its caller only", async () => {
    const limiter = createLimiter(1);
    const failing = limiter.run(async () => {
      throw new Error("boom");
    });
    const after = limiter.run(async () => "ok");
    await expect(failing).rejects.toThrow("boom");
    await expect(after).resolves.toBe("ok");
    expect(limiter.stats()).toEqual({ running: 0, queued: 0 });
  });

  it("frees the slot when a task throws before returning a promise", async () => {
    const limiter = createLimiter(1);
    const failing = limiter.run(() => {
      throw new Error("sync boom");
    });
    await expect(failing).rejects.toThrow("sync boom");
    await expect(limiter.run(async () => "ok")).resolves.toBe("ok");
  });

  it("reports how long a task waited, only for tasks that had to wait", async () => {
    const waits: { priority: string; queued: number }[] = [];
    const limiter = createLimiter(1, (info) => waits.push({ priority: info.priority, queued: info.queued }));
    const first = gate();
    const a = limiter.run(() => first.opened);
    const b = limiter.run(async () => undefined, "background");
    await tick();
    expect(waits).toEqual([]);
    first.release();
    await Promise.all([a, b]);
    expect(waits).toEqual([{ priority: "background", queued: 0 }]);
  });

  it("treats a limit below 1 as 1", async () => {
    const limiter = createLimiter(0);
    await expect(limiter.run(async () => "ran")).resolves.toBe("ran");
  });
});

describe("createResultCache", () => {
  it("computes a key once and serves it from the cache afterwards", async () => {
    const cache = createResultCache<string>({ ttlMs: 1000, maxEntries: 10 });
    let calls = 0;
    const compute = async () => `value-${++calls}`;
    expect(await cache.getOrCompute("a", compute)).toBe("value-1");
    expect(await cache.getOrCompute("a", compute)).toBe("value-1");
    expect(calls).toBe(1);
  });

  it("makes concurrent requests for the same key share one computation", async () => {
    const cache = createResultCache<string>({ ttlMs: 1000, maxEntries: 10 });
    const g = gate();
    let calls = 0;
    const compute = async () => {
      calls++;
      await g.opened;
      return "shared";
    };
    const results = [cache.getOrCompute("a", compute), cache.getOrCompute("a", compute), cache.getOrCompute("a", compute)];
    g.release();
    expect(await Promise.all(results)).toEqual(["shared", "shared", "shared"]);
    expect(calls).toBe(1);
  });

  it("does not remember a failure, so the next request tries again", async () => {
    const cache = createResultCache<string>({ ttlMs: 1000, maxEntries: 10 });
    let calls = 0;
    const flaky = async () => {
      if (++calls === 1) throw new Error("model not ready");
      return "fine";
    };
    await expect(cache.getOrCompute("a", flaky)).rejects.toThrow("model not ready");
    expect(await cache.getOrCompute("a", flaky)).toBe("fine");
  });

  it("recomputes once an entry has expired", async () => {
    let clock = 0;
    const cache = createResultCache<number>({ ttlMs: 1000, maxEntries: 10, now: () => clock });
    let calls = 0;
    const compute = async () => ++calls;
    expect(await cache.getOrCompute("a", compute)).toBe(1);
    clock = 999;
    expect(await cache.getOrCompute("a", compute)).toBe(1);
    clock = 1000;
    expect(await cache.getOrCompute("a", compute)).toBe(2);
  });

  it("evicts the least recently used entry beyond its size", async () => {
    const cache = createResultCache<string>({ ttlMs: 60_000, maxEntries: 2 });
    const counts: Record<string, number> = {};
    const compute = (key: string) => async () => `${key}${(counts[key] = (counts[key] ?? 0) + 1)}`;
    await cache.getOrCompute("a", compute("a"));
    await cache.getOrCompute("b", compute("b"));
    await cache.getOrCompute("a", compute("a")); // touch a: b is now the oldest
    await cache.getOrCompute("c", compute("c")); // evicts b
    expect(cache.size()).toBe(2);
    expect(await cache.getOrCompute("a", compute("a"))).toBe("a1");
    expect(await cache.getOrCompute("b", compute("b"))).toBe("b2");
  });
});
