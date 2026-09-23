// A seeded PRNG (mulberry32). Every bit of randomness in the generator goes through one of these, so a run is
// repeatable from its --seed. `fork` gives each phase its own stream, so adding a random call in one phase
// doesn't shift the numbers every later phase sees.
export class Rng {
  private state: number;

  constructor(readonly seed: number) {
    this.state = seed >>> 0;
  }

  /** [0, 1) */
  float(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Whole number in [min, max], both included. */
  int(min: number, max: number): number {
    return min + Math.floor(this.float() * (max - min + 1));
  }

  between(min: number, max: number): number {
    return min + this.float() * (max - min);
  }

  chance(p: number): boolean {
    return this.float() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("pick from an empty list");
    return items[Math.floor(this.float() * items.length)]!;
  }

  /** One of `items`, in proportion to its weight. Zero and negative weights are never chosen. */
  weighted<T>(items: readonly (readonly [T, number])[]): T {
    const total = items.reduce((sum, [, w]) => sum + Math.max(0, w), 0);
    if (total <= 0) throw new Error("weighted pick with no positive weight");
    let roll = this.float() * total;
    let last: T | undefined;
    for (const [item, w] of items) {
      if (w <= 0) continue;
      last = item;
      roll -= w;
      if (roll < 0) return item;
    }
    return last as T;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.float() * (i + 1));
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    }
    return copy;
  }

  /** Normally distributed (Box-Muller). */
  normal(mean: number, sd: number): number {
    const u = Math.max(this.float(), 1e-12);
    const v = this.float();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** An independent stream derived from this seed and a label. */
  fork(label: string): Rng {
    let h = 2166136261 ^ this.seed;
    for (let i = 0; i < label.length; i++) {
      h ^= label.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return new Rng(h >>> 0);
  }
}

export const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));
