import { describe, expect, it } from 'vitest';
import { androidReturnUrl, isHandoffReturn } from '@/lib/auth/handoff';

describe('back into the Play app after Google (lib/auth/handoff.ts)', () => {
  it('opens the scheme the plugin declares, for this package only', () => {
    expect(androidReturnUrl('pro.gravity5.rabbitroyale'))
      .toBe('intent://signed-in#Intent;scheme=pro.gravity5.rabbitroyale;package=pro.gravity5.rabbitroyale;end');
  });

  it('falls back to the page when Chrome cannot open the app', () => {
    const url = androidReturnUrl('pro.gravity5.rabbitroyale', 'https://ws2.rabbit.rip/api/auth/google/callback?shown=signed_in&app=android');
    expect(url).toContain(';S.browser_fallback_url=https%3A%2F%2Fws2.rabbit.rip%2Fapi%2Fauth%2Fgoogle%2Fcallback%3Fshown%3Dsigned_in%26app%3Dandroid;');
    expect(url.endsWith(';end')).toBe(true);
  });

  it('takes no return the client invents', () => {
    expect(isHandoffReturn('android')).toBe(true);
    expect(isHandoffReturn('https://evil.example')).toBe(false);
    expect(isHandoffReturn(undefined)).toBe(false);
  });
});
