/**
 * THE BURIED CONTENTS OF A FEW ISLANDS, AS THE SERVER DEALS THEM — for Godot.
 *
 *   bun tools/export-godot-deal-fixture.ts
 *
 * Writes godot/tools/deal_fixture.json, which `godot/tools/verify_deal.gd`
 * compares cell by cell against the GDScript port of `generateIsland`
 * (island_board.gd `deal_generated`). Offline islands (the dig sandbox) are
 * only worth playing if they are the islands the server would deal from the
 * same two seeds; this pins that.
 *
 * Per tile: content letter (E empty, C carrot, G golden, B bomb, K chest),
 * the chest tier's first letter, `d` dug / `h` hinted, then the bomb count.
 * And what every chest pays, rolled the way `server/index.ts` + `resolveMove`
 * roll it: one rng per (island seed, tile), loot then the crown's NFT draw.
 * And the island as a CLIENT sees it (`publicView`), for the online board.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CHEST_LOOT, CHEST_LOOT_BY_TIER, CHEST_NFT_ODDS, levelRow } from '../config/tuning';
import { seedLevel } from '../src/lib/game/first-island';
import { generateIsland, publicView } from '../src/lib/game/island';
import { mulberry32, pickWeighted, randInt, seedFrom } from '../src/lib/game/rng';
import { spawnTile, terrainFor } from '../src/lib/game/terrainBoard';

const CASES: ReadonlyArray<readonly [string, string, number]> = [
  ['default', 'abc', 0],
  ['island:7', 'xyz', 0],
  ['sandbox-42', 'k', 50000],
  ['moon', '', 10000],
  ['reef', 'r', 25000],
  // Ladder islands: the seed carries the level, which sizes the island and
  // counts its chests (RABBIT_LEVELS).
  ['lv1:abc', 'q', 0],
  ['lv6:zz', 'w', 0],
];

const LETTER = { empty: 'E', carrot: 'C', golden: 'G', bomb: 'B', chest: 'K' } as const;

const out = CASES.map(([seed, contentSeed, life]) => {
  const level = seedLevel(seed);
  const island = generateIsland({ seed, contentSeed: contentSeed || undefined, lifetimeCarrots: life,
                                  ...(level !== undefined ? { level: levelRow(level) } : {}) });
  const tiles: Record<number, string> = {};
  const loot: Record<number, string> = {};
  for (const [i, t] of island.tiles) {
    if (t.content === 'chest') {
      const rng = mulberry32(seedFrom(`${seed}:${i}`));
      const table = t.chestTier ? CHEST_LOOT_BY_TIER[t.chestTier] : CHEST_LOOT;
      const roll = pickWeighted(rng, table);
      const amount = randInt(rng, roll.min, roll.max);
      const nft = t.chestTier === 'crown' && rng() < CHEST_NFT_ODDS.inCrown;
      loot[i] = `${roll.kind}:${amount}${nft ? ':nft' : ''}`;
    }
    tiles[i] = LETTER[t.content] + (t.chestTier ? t.chestTier[0] : '')
      + (t.revealed ? 'd' : t.hinted ? 'h' : '') + t.adjacent;
  }
  return { seed, contentSeed, lifetime: life, spawn: spawnTile(seed),
           placements: terrainFor(seed).placements.length, tiles, loot,
           view: publicView(island) };
});

const file = join(import.meta.dir, '..', 'godot', 'tools', 'deal_fixture.json');
writeFileSync(file, JSON.stringify(out) + '\n');
console.log(`wrote ${out.length} islands -> ${file}`);
