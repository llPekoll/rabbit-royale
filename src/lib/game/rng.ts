/**
 * Seeded PRNG. Island generation MUST be reproducible from a seed: the server
 * generates the island, and a bug report ("the island where I died") has to be
 * replayable from its seed alone rather than from a dump of 400 tiles.
 *
 * mulberry32 — 32-bit, fast, good enough for level layout. Not for anything
 * where money rides on the outcome (this game is F2P non-gambling by design;
 * if that ever changes, the draw moves to a commit-reveal service).
 */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash an arbitrary seed string into the 32-bit integer mulberry32 wants. */
export function seedFrom(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const randInt = (rng: Rng, min: number, max: number) =>
  min + Math.floor(rng() * (max - min + 1));

/** Fisher-Yates, in place, driven by `rng` so shuffles are reproducible. */
export function shuffle<T>(rng: Rng, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Weighted pick from `[{weight}]` entries. */
export function pickWeighted<T extends { weight: number }>(rng: Rng, table: readonly T[]): T {
  const total = table.reduce((s, e) => s + e.weight, 0);
  let r = rng() * total;
  for (const e of table) {
    r -= e.weight;
    if (r <= 0) return e;
  }
  return table[table.length - 1];
}
