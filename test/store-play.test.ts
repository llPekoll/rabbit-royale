import { afterEach, describe, expect, it } from 'vitest';
import { accountTag, judgePlayPurchase } from '@/lib/pay/play';
import { STORE_PRODUCTS, isStoreProductId } from '@config/store';
import { PACK_KINDS } from '@/lib/game/packs';
import { SHOP_KINDS } from '@/lib/game/inventory';
import { SKINS } from '@/lib/game/skins';
import { GOLD_PER_USD, goldPrice, isGoldKind } from '@/lib/game/gold';
import { WEB2_ONLY_ROUTES, WEB3_ONLY_ROUTES } from '@/lib/world';

describe('Play purchases (lib/pay/play.ts)', () => {
  const me = 'acct:1234';

  it('credits only what Play says was paid', () => {
    const paid = judgePlayPurchase({ purchaseState: 0, orderId: 'GPA.1', purchaseTimeMillis: '1761600000000' }, me);
    expect(paid).toEqual({ ok: true, orderId: 'GPA.1', purchasedAt: new Date(1761600000000), test: false });
    expect(judgePlayPurchase({ purchaseState: 1 }, me)).toEqual({ ok: false, reason: 'cancelled' });
    expect(judgePlayPurchase({ purchaseState: 2 }, me)).toEqual({ ok: false, reason: 'pending' });
    expect(judgePlayPurchase({}, me)).toEqual({ ok: false, reason: 'cancelled' });
  });

  it('refuses a purchase bound to another account, accepts an unbound one', () => {
    expect(judgePlayPurchase({ purchaseState: 0, obfuscatedExternalAccountId: accountTag(me) }, me).ok).toBe(true);
    expect(judgePlayPurchase({ purchaseState: 0, obfuscatedExternalAccountId: accountTag('acct:other') }, me))
      .toEqual({ ok: false, reason: 'wrong_account' });
    expect(judgePlayPurchase({ purchaseState: 0 }, me).ok).toBe(true);
  });

  it('marks a license tester purchase as a test', () => {
    const v = judgePlayPurchase({ purchaseState: 0, purchaseType: 0 }, me);
    expect(v.ok && v.test).toBe(true);
  });

  it('binds with a tag Play accepts (64 chars max) and Godot can compute (sha256 hex)', () => {
    expect(accountTag(me)).toMatch(/^[0-9a-f]{64}$/);
    // String.sha256_text() of the same id, in Godot.
    expect(accountTag('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('store catalog (config/store.ts)', () => {
  it('sells sachets of gold only, bigger ones with a bonus, under Play-valid ids', () => {
    let perDollar = 0;
    for (const [id, p] of Object.entries(STORE_PRODUCTS).sort((a, b) => a[1].usdCents - b[1].usdCents)) {
      expect(id).toMatch(/^[a-z0-9][a-z0-9_.]*$/);
      expect(id).not.toMatch(/solana|solflare|usdc|crypto|coin|token/);
      expect(p.kind).toBe('gold');
      expect(p.consumable).toBe(true);
      // The App Store's lowest price point.
      expect(p.usdCents).toBeGreaterThanOrEqual(29);
      // Never less gold per dollar than the sachet below, never under 1 gold = 1 cent.
      const rate = p.qty / p.usdCents;
      expect(rate).toBeGreaterThanOrEqual(Math.max(perDollar, 100 / GOLD_PER_USD));
      perDollar = rate;
    }
    expect(isStoreProductId('gold_550')).toBe(true);
    expect(isStoreProductId('season_pass')).toBe(false);
    expect(isStoreProductId('toString')).toBe(false);
  });

  it('prices everything money buys in gold, at 1 gold = 1 cent', () => {
    expect(goldPrice('bloop')).toBe(10);
    expect(goldPrice('trap', 2)).toBe(50);
    expect(goldPrice('skin_kappa')).toBe(199);
    for (const kind of [...SHOP_KINDS, ...PACK_KINDS]) {
      expect(isGoldKind(kind)).toBe(true);
      expect(goldPrice(kind)).toBeGreaterThan(0);
    }
    for (const skin of SKINS.filter((s) => s.onSale)) expect(goldPrice(skin.kind)).toBe(skin.usdCents);
    expect(isGoldKind('season_pass')).toBe(false);
    expect(isGoldKind('gold')).toBe(false);
  });

  it('keeps the store route out of web3, and the crypto ones out of web2', () => {
    expect(WEB2_ONLY_ROUTES.has('/api/store/play')).toBe(true);
    for (const path of WEB2_ONLY_ROUTES) expect(WEB3_ONLY_ROUTES.has(path)).toBe(false);
  });
});

describe('the route without a Play account', () => {
  const before = process.env.PLAY_SERVICE_ACCOUNT;
  afterEach(() => {
    if (before === undefined) delete process.env.PLAY_SERVICE_ACCOUNT;
    else process.env.PLAY_SERVICE_ACCOUNT = before;
  });

  it('reads the service account the way FCM does', async () => {
    const { parseServiceAccount } = await import('@/lib/notify/fcm');
    const json = JSON.stringify({ client_email: 'a@b.iam.gserviceaccount.com', private_key: 'x\\ny' });
    expect(parseServiceAccount(Buffer.from(json).toString('base64'))?.private_key).toBe('x\ny');
  });
});
