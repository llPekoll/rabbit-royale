import { afterEach, describe, expect, it } from 'vitest';
import { accountTag, judgePlayPurchase } from '@/lib/pay/play';
import { STORE_PRODUCTS, isStoreProductId } from '@config/store';
import { isPackKind } from '@/lib/game/packs';
import { SKINS, isSkinKind } from '@/lib/game/skins';
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
  it('sells packs and skins on sale, with Play-valid ids and no crypto words', () => {
    for (const [id, p] of Object.entries(STORE_PRODUCTS)) {
      expect(id).toMatch(/^[a-z0-9][a-z0-9_.]*$/);
      expect(id).not.toMatch(/solana|solflare|usdc|crypto/);
      expect(isPackKind(p.kind) || isSkinKind(p.kind)).toBe(true);
      expect(p.consumable).toBe(isPackKind(p.kind));
      if (isSkinKind(p.kind)) expect(SKINS.find((s) => s.kind === p.kind)!.onSale).toBe(true);
    }
    expect(isStoreProductId('pack_refill_3')).toBe(true);
    expect(isStoreProductId('season_pass')).toBe(false);
    expect(isStoreProductId('toString')).toBe(false);
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
