import { afterEach, describe, expect, it } from 'vitest';
import { isWeb2, world, WEB3_ONLY_ROUTES } from '@/lib/world';

describe('world (lib/world.ts)', () => {
  const before = process.env.RR_WORLD;
  afterEach(() => {
    if (before === undefined) delete process.env.RR_WORLD;
    else process.env.RR_WORLD = before;
  });

  it('is web3 unless told web2, so the servers that run today are unchanged', () => {
    delete process.env.RR_WORLD;
    expect(world()).toBe('web3');
    process.env.RR_WORLD = 'WEB2';
    expect(world()).toBe('web3');
    process.env.RR_WORLD = 'web2';
    expect(world()).toBe('web2');
    expect(isWeb2()).toBe(true);
  });

  it('keeps every wallet and payment route out of web2', () => {
    for (const path of ['/api/auth/challenge', '/api/auth/verify', '/api/auth/link', '/api/shop/pay', '/api/shop/claim', '/api/webhooks/alchemy']) {
      expect(WEB3_ONLY_ROUTES.has(path)).toBe(true);
    }
    expect(WEB3_ONLY_ROUTES.has('/api/auth/guest')).toBe(false);
  });
});
