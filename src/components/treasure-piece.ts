/**
 * A piece of loot for a shower: a gold coin or a cut jewel, as an <img>.
 *
 * The art is the arcade kit's (`GOLDEN_COIN_URLS`, `JEWEL_URLS`) — the same
 * files the island's coin spray already uses, so a win in the burrow throws
 * the same treasure the board does. Native pixel art (10-16px), scaled up by a
 * whole number and never smoothed; each jewel keeps its own aspect.
 *
 * Coins are the common piece and jewels the seasoning: a shower that is all
 * jewels reads as a jeweller's window, one with none reads as a till.
 */
import { GOLDEN_COIN_URLS, JEWEL_URLS, TREASURE_SIZES, type JewelName } from '@domin8/arcade-kit';

const JEWELS = Object.keys(JEWEL_URLS) as JewelName[];
/** One piece in this many is a jewel; the rest are coins. */
const JEWEL_EVERY = 3;

export function treasurePiece(index: number, scale: number): HTMLImageElement {
  const img = document.createElement('img');
  img.alt = '';
  img.draggable = false;
  if (index % JEWEL_EVERY === 0) {
    const name = JEWELS[Math.floor(Math.random() * JEWELS.length)];
    const size = TREASURE_SIZES[name];
    img.src = JEWEL_URLS[name];
    img.width = size.width * scale;
    img.height = size.height * scale;
  } else {
    // A random frame of the six-frame spin: a shower of coins caught at
    // different angles, which is what the kit's frames are for in a rain.
    img.src = GOLDEN_COIN_URLS[Math.floor(Math.random() * GOLDEN_COIN_URLS.length)];
    img.width = 16 * scale;
    img.height = 16 * scale;
  }
  img.style.imageRendering = 'pixelated';
  return img;
}
