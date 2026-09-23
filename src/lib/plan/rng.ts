/** Deterministic PRNG (mulberry32) so a given seed always yields the same plan. */
export function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function next() {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), t | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash, used to derive a seed from strings like `${userId}:${weekOf}`. */
export function hashSeed(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Pick one item with probability proportional to its weight. Weights must be >= 0. */
export function weightedPick<T>(items: T[], weights: number[], rng: () => number): T | undefined {
  const total = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
  if (items.length === 0 || total <= 0) return items[0];
  let target = rng() * total;
  for (let i = 0; i < items.length; i++) {
    target -= Math.max(0, weights[i]);
    if (target <= 0) return items[i];
  }
  return items[items.length - 1];
}
