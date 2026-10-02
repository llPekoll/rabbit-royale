/**
 * The shop's packs (lib/game/packs) and the starting bloops. Pure — a bag built
 * by hand, no database.
 */
import { describe, expect, it } from 'vitest';
import { BLOOP, SHOP_PACKS, SHOP } from '@config/tuning';
import { ITEM_KINDS, type Holdings } from '@/lib/game/inventory';
import { PACK_KINDS, isPackKind, packBlocker, packShelf } from '@/lib/game/packs';
import { itemCap } from '@/lib/tuning/tables';

const empty = (): Holdings =>
  Object.fromEntries(ITEM_KINDS.map((k) => [k, 0])) as Holdings;

describe('the packs', () => {
  it('are the two validated ones, at their prices', () => {
    expect(PACK_KINDS).toEqual(['shiro_stash', 'kuro_tantrum']);
    expect(SHOP_PACKS.shiro_stash.price).toBe(1_200);
    expect(SHOP_PACKS.shiro_stash.usdc).toBe(1.99);
    expect(SHOP_PACKS.kuro_tantrum.price).toBe(1_000);
    expect(SHOP_PACKS.kuro_tantrum.usdc).toBe(1.19);
  });

  it('are packs, not items on the shelf', () => {
    expect(isPackKind('shiro_stash')).toBe(true);
    expect(isPackKind('bloop')).toBe(false);
    expect(Object.keys(SHOP.PRICES)).not.toContain('shiro_stash');
  });

  it('sell to an empty bag with enough carrots', () => {
    expect(packBlocker('shiro_stash', 1, empty(), 1_200)).toBeNull();
    expect(packBlocker('kuro_tantrum', 1, empty(), 999)).toBe('insufficient_carrots');
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
