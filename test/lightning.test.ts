/**
 * The lightning strike: sabotage by area.
 *
 * A planted bomb waits to be stepped on; a strike lands where it is aimed and
 * opens everything around it at once. The properties worth pinning are the
 * ones that fail SILENTLY — a strike that reached off-board, or that re-dug
 * ground and paid its contents twice, would look like a slightly odd flash.
 */
import { describe, expect, it } from 'vitest';
import { LIGHTNING } from '../config/tuning';
import { generateIsland, revealTile } from '../src/lib/game/island';
import { strike, strikeArea } from '../src/lib/game/lightning';
import { farmableTiles, spawnTile } from '../src/lib/game/terrainBoard';
import { toColRow } from '../src/config/gridConfig';

const SEED = 'strike-test';

describe('what a strike covers', () => {
  it('never reaches further than its radius', () => {
    for (const target of farmableTiles(SEED).slice(0, 40)) {
      const centre = toColRow(target);
      for (const tile of strikeArea(SEED, target)) {
        const c = toColRow(tile);
        expect(Math.abs(c.col - centre.col)).toBeLessThanOrEqual(LIGHTNING.RADIUS);
        expect(Math.abs(c.row - centre.row)).toBeLessThanOrEqual(LIGHTNING.RADIUS);
      }
    }
  });

  it('only ever covers playable ground', () => {
    const playable = new Set(farmableTiles(SEED));
    for (const target of farmableTiles(SEED).slice(0, 40)) {
      for (const tile of strikeArea(SEED, target)) {
        expect(playable.has(tile)).toBe(true);
      }
    }
  });

  it('always includes the tile it was aimed at', () => {
    for (const target of farmableTiles(SEED).slice(0, 30)) {
      expect(strikeArea(SEED, target)).toContain(target);
    }
  });

  it('lists the centre first, so the flashes spread outward', () => {
    const target = spawnTile(SEED);
    expect(strikeArea(SEED, target)[0]).toBe(target);
  });

  it('does less at the shore, rather than reaching into the sea', () => {
    // A strike aimed at an edge tile covers fewer cells. That is a fair cost
    // for a bad shot, not a rule anyone has to learn.
    const areas = farmableTiles(SEED).map((t) => strikeArea(SEED, t).length);
    expect(Math.min(...areas)).toBeLessThan(Math.max(...areas));
    expect(Math.max(...areas)).toBeLessThanOrEqual((2 * LIGHTNING.RADIUS + 1) ** 2);
  });
});

describe('what a strike does', () => {
  it('opens every unrevealed tile it covers', () => {
    const island = generateIsland({ seed: SEED });
    const target = spawnTile(SEED);
    // The spawn and its ring start revealed — a run never opens on a blast —
    // so what a strike OPENS is the covered remainder of its area.
    const area = strikeArea(SEED, target).filter((t) => island.tiles.has(t));
    const covered = area.filter((t) => !island.tiles.get(t)!.revealed);

    const out = strike(island, 'attacker', target);
    expect(out.struck.length).toBe(covered.length);
    for (const tile of area) expect(island.tiles.get(tile)!.revealed).toBe(true);
  });

  it('skips ground that was already dug', () => {
    const island = generateIsland({ seed: SEED });
    const target = spawnTile(SEED);
    revealTile(island, target, 'someone');

    const out = strike(island, 'attacker', target);
    expect(out.struck.map((s) => s.tile)).not.toContain(target);
  });

  it('counts the bombs it set off', () => {
    const island = generateIsland({ seed: SEED });
    const target = spawnTile(SEED);
    const out = strike(island, 'attacker', target);
    const actual = out.struck.filter((s) => s.content === 'bomb').length;
    expect(out.bombs).toBe(actual);
  });

  it('names who called it down', () => {
    const island = generateIsland({ seed: SEED });
    expect(strike(island, 'rival-3', spawnTile(SEED)).castBy).toBe('rival-3');
  });

  /**
   * The rule the GDD is explicit about: "board re-covering (breaks minesweeper
   * logic)". A strike takes ground OFF the board by opening it — it never puts
   * a tile back face-down, whatever the shop's old copy promised.
   */
  it('never re-covers anything', () => {
    const island = generateIsland({ seed: SEED });
    for (const tile of island.tiles.keys()) revealTile(island, tile, 'someone');
    strike(island, 'attacker', spawnTile(SEED));
    for (const tile of island.tiles.values()) expect(tile.revealed).toBe(true);
  });

  it('is a no-op on ground that is entirely dug', () => {
    const island = generateIsland({ seed: SEED });
    for (const tile of island.tiles.keys()) revealTile(island, tile, 'someone');
    const out = strike(island, 'attacker', spawnTile(SEED));
    expect(out.struck).toEqual([]);
    expect(out.bombs).toBe(0);
  });
});
