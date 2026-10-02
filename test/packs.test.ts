/**
 * The shop's packs (lib/game/packs) and the starting bloops. Pure — a bag built
 * by hand, no database.
 */
import { describe, expect, it } from 'vitest';
import { BLOOP, PACK_DISCOUNT, SHOP } from '@config/tuning';
import { ITEM_KINDS, type Holdings } from '@/lib/game/inventory';
import {
  PACK_KINDS, isPackKind, packBlocker, packFullPrice, packFullUsdc, packPrice, packShelf, packUsdc,
} from '@/lib/game/packs';
import { itemCap } from '@/lib/tuning/tables';

const empty = (): Holdings =>
  Object.fromEntries(ITEM_KINDS.map((k) => [k, 0])) as Holdings;

describe('the packs', () => {
  it('are the two validated ones, priced from what is inside', () => {
    expect(PACK_KINDS).toEqual(['shiro_stash', 'kuro_tantrum']);
    // 2 bombs + 2 planks + a shield; 2 bolts + 3 bloops — at the shelf.
    expect(packFullPrice('shiro_stash')).toBe(2 * SHOP.PRICES.trap + 2 * SHOP.PRICES.fence + SHOP.PRICES.shield);
    expect(packFullPrice('kuro_tantrum')).toBe(2 * SHOP.PRICES.lightning + 3 * SHOP.PRICES.bloop);
    expect(packPrice('shiro_stash')).toBe(1_200);
    expect(packPrice('kuro_tantrum')).toBe(1_040);
    expect(packUsdc('shiro_stash')).toBe(1.76);
    expect(packUsdc('kuro_tantrum')).toBe(1.2);
  });

  it('take the same cut on both packs and both rails', () => {
    for (const k of PACK_KINDS) {
      expect(packPrice(k) / packFullPrice(k)).toBeCloseTo(1 - PACK_DISCOUNT, 1);
      expect(packUsdc(k) / packFullUsdc(k)).toBeCloseTo(1 - PACK_DISCOUNT, 1);
    }
  });

  it('are packs, not items on the shelf', () => {
    expect(isPackKind('shiro_stash')).toBe(true);
    expect(isPackKind('bloop')).toBe(false);
    expect(Object.keys(SHOP.PRICES)).not.toContain('shiro_stash');
  });

  it('sell to an empty bag with enough carrots', () => {
    expect(packBlocker('shiro_stash', 1, empty(), 1_200)).toBeNull();
    expect(packBlocker('kuro_tantrum', 1, empty(), 1_039)).toBe('insufficient_carrots');
    // The money rail checks no carrots.
    expect(packBlocker('kuro_tantrum', 1, empty())).toBeNull();
  });

  it('are refused whole when ANY item would overflow its own ceiling', () => {
    const bag = empty();
    bag.bloop = itemCap('bloop') - 2; // 3 more would be one too many
    expect(packBlocker('kuro_tantrum', 1, bag, 10_000)).toBe('bag_full');
    bag.bloop = itemCap('bloop') - 3;
    expect(packBlocker('kuro_tantrum', 1, bag, 10_000)).toBeNull();
    // Traps have their own tighter ceiling.
    const traps = empty();
    traps.trap = itemCap('trap') - 1;
    expect(packBlocker('shiro_stash', 1, traps, 10_000)).toBe('bag_full');
  });

  it('are one per purchase', () => {
    expect(packBlocker('shiro_stash', 2, empty(), 10_000)).toBe('bad_quantity');
  });

  it('show on the shelf with what is inside and whether they fit', () => {
    const bag = empty();
    bag.lightning = itemCap('lightning');
    const shelf = packShelf(bag, 1_100);
    const shiro = shelf.find((p) => p.kind === 'shiro_stash')!;
    const kuro = shelf.find((p) => p.kind === 'kuro_tantrum')!;
    expect(shiro.items).toEqual([
      { kind: 'trap', qty: 2 }, { kind: 'fence', qty: 2 }, { kind: 'shield', qty: 1 },
    ]);
    expect(shiro.canBuy).toBe(false); // 1 100 < 1 200
    expect(shiro.hasRoom).toBe(true);
    expect(kuro.hasRoom).toBe(false); // bolts already at the ceiling
    expect(kuro.canBuy).toBe(false);
    expect(kuro.side).toBe('attack');
  });
});

describe('the starting kit', () => {
  it('holds three bloops', () => {
    expect(BLOOP.STARTING).toBe(3);
  });
});
