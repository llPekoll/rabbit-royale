/**
 * Display names. A wallet address is unreadable above a rabbit's head, so every
 * player gets a generated name derived from their address — stable across
 * devices without a database lookup, and renameable later.
 */
const ADJECTIVES = [
  'Cursed', 'Golden', 'Feral', 'Silent', 'Lucky', 'Grim', 'Velvet', 'Rusty',
  'Hollow', 'Sly', 'Iron', 'Ashen', 'Wild', 'Pale', 'Swift', 'Bitter',
];
const NOUNS = [
  'Warren', 'Paw', 'Thumper', 'Digger', 'Whisker', 'Burrow', 'Hop', 'Fang',
  'Ears', 'Tail', 'Kit', 'Doe', 'Buck', 'Snare', 'Clover', 'Bramble',
];

/** Deterministic from the address: the same wallet always gets the same name. */
export function randomRabbitName(seed: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    // `>>> 0` is load bearing: Math.imul returns a SIGNED 32-bit int, and a
    // negative `h` makes `h % ADJECTIVES.length` negative too — which indexes
    // off the front of the array and names half of all wallets "undefined…".
    h = Math.imul(h, 16777619) >>> 0;
  }
  const a = ADJECTIVES[h % ADJECTIVES.length];
  const n = NOUNS[(h >>> 8) % NOUNS.length];
  return `${a}${n}${(h >>> 16) % 100}`;
}
