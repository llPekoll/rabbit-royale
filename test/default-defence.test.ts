/**
 * The defence a burrow is born with (lib/game/default-defence), and the
 * shield of a burrow with nothing to take (lib/game/raid). Pure — the rules
 * only, no database.
 */
import { describe, expect, it } from 'vitest';
import { RAID, TRAPS } from '@config/tuning';
import { burrowCell, isDoorstep, isTrappable } from '@/game/burrow/board';
import { houseTiles } from '@/game/burrow/buildings';
import { fencePlacementBlocker, type FenceSeg } from '@/lib/game/fences';
import { DEFAULT_DEFENCE, defaultDefence } from '@/lib/game/default-defence';
import { maxRaidHaul, nothingToTake } from '@/lib/game/raid';

const ids = Array.from({ length: 24 }, (_, i) => `guest:test-${i}`);

describe('defaultDefence', () => {
  it('stands only what the owner could have placed by hand', () => {
    for (const id of ids) {
      const { bombs, planks } = defaultDefence(id);
      expect(bombs.length).toBe(DEFAULT_DEFENCE.BOMBS);
      expect(planks.length).toBe(DEFAULT_DEFENCE.PLANKS);
      expect(bombs.length).toBeLessThanOrEqual(TRAPS.MAX_PLACED);
      expect(new Set(bombs).size).toBe(bombs.length);
      for (const t of bombs) {
        expect(isTrappable(id, t)).toBe(true);
        expect(isDoorstep(id, t)).toBe(false);
        expect(burrowCell(id, t)).not.toBe('field');
        expect(houseTiles(id)).not.toContain(t);
      }
      // One by one, the way POST /api/fences takes them: never the last way in.
      const standing: FenceSeg[] = [];
      for (const p of planks) {
        expect(fencePlacementBlocker(id, 1, standing, p.tile, p.side)).toBeNull();
        standing.push(p);
      }
    }
  });

  it('is the same for the same burrow, and not the same for everyone', () => {
    expect(defaultDefence(ids[0])).toEqual(defaultDefence(ids[0]));
    const layouts = new Set(ids.map((id) => {
      const d = defaultDefence(id);
      return [...d.bombs].sort().join(',') + '|' + d.planks.map((p) => p.tile + p.side).sort().join(',');
    }));
    expect(layouts.size).toBeGreaterThan(ids.length * 0.8);
  });
});

describe('nothingToTake', () => {
  it('shields a burrow at the safe floor with an empty garden', () => {
    expect(nothingToTake(0, 0)).toBe(true);
    expect(nothingToTake(RAID.SAFE_FLOOR, 0)).toBe(true);
  });

  it('opens it once the best-case haul reaches the threshold', () => {
    expect(nothingToTake(RAID.SAFE_FLOOR + 10_000, 0)).toBe(false);
    expect(nothingToTake(0, 1_000)).toBe(false);
    let stock = RAID.SAFE_FLOOR;
    while (nothingToTake(stock, 0)) stock++;
    expect(maxRaidHaul(stock, 0)).toBeGreaterThanOrEqual(RAID.NOTHING_TO_TAKE_BELOW);
    expect(maxRaidHaul(stock - 1, 0)).toBeLessThan(RAID.NOTHING_TO_TAKE_BELOW);
  });
});
