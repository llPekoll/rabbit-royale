import { describe, expect, it } from 'vitest';
import { isSkinKey, isSkinKind, skinForKind, skinSaleBlocker } from '@/lib/game/skins';
import { lookOf } from '@/lib/game/look';
import { usdcBaseUnits } from '@config/tuning';

describe('permanent skins', () => {
  it('prices Solana at exactly 99 cents / 990000 USDC base units', () => {
    expect(skinForKind('skin_solana').usdCents).toBe(99);
    expect(usdcBaseUnits(skinForKind('skin_solana').usdCents / 100)).toBe(990000);
  });
  it('prices Carrot at 99 cents and accepts its saved appearance', () => {
    expect(skinForKind('skin_carrot').usdCents).toBe(99);
    expect(lookOf('white', 'carrot')).toBe('carrot');
  });
  it('sells Flary (key solflare) at 99 cents and accepts its saved appearance', () => {
    expect(skinForKind('skin_solflare')).toMatchObject({ key: 'solflare', name: 'Flary', usdCents: 99, onSale: true });
    expect(lookOf('white', 'solflare')).toBe('solflare');
  });
  it('only sells one copy and refuses owned skins', () => {
    expect(skinSaleBlocker(1, false)).toBeNull();
    for (const qty of [0, -1, 2, 1.5, NaN, Infinity]) expect(skinSaleBlocker(qty, false)).toBe('bad_quantity');
    expect(skinSaleBlocker(1, true)).toBe('skin_owned');
    expect(skinSaleBlocker(1, false, false)).toBe('unknown_item');
    expect(skinForKind('skin_noir_violet').onSale).toBe(false);
  });
  it('never accepts an arbitrary atlas or a pass as a paid cosmetic SKU', () => {
    expect(isSkinKind('skin_solana')).toBe(true);
    for (const key of [null, {}, 'solana', 'season_pass', '../../x']) expect(isSkinKind(key)).toBe(false);
    expect(isSkinKey('kuro-violet')).toBe(true);
    expect(lookOf('white', 'solana')).toBe('solana');
    expect(lookOf('white', '../../x')).toBe('white');
    expect(lookOf('white', null)).toBe('white');
  });
});
