'use client';

/**
 * Take the whole screen on the first tap, where the browser allows it.
 *
 * A phone browser's bars cost a landscape game a fifth of its height. Android
 * Chrome and iPad Safari let a page go fullscreen — but only from inside a
 * user gesture, so this waits for the first tap anywhere (the doorstep's
 * buttons for a new player, the board for a returning one) and asks then.
 * Once per page load: a player who swipes back out of fullscreen has chosen
 * to, and pulling them back in on their next tap would be a fight.
 *
 * NOT ON AN iPHONE. Safari there has no element fullscreen at all
 * (`fullscreenEnabled` is false), so nothing is listened for; the way to a
 * full screen on iPhone is the home-screen app (app/manifest.ts, and the tip
 * on the doorstep). Not on a mouse either: a desktop window going fullscreen
 * because someone clicked "Play" is a surprise, not a feature. And not when it
 * is already an app — standalone, fullscreen, or the Android shell.
 *
 * On Android the orientation is locked to landscape once fullscreen, which a
 * browser only permits in that state; phones are landscape-only anyway
 * (rotate-gate.tsx), so this saves a turn of the wrist rather than a layout.
 */
import { useEffect } from 'react';
import { isNative } from './native-bridge';

type WebkitDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
};
type WebkitElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};
type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: 'landscape') => Promise<void>;
};

/** Already running without browser chrome: nothing to take. */
const APP_QUERY = '(display-mode: fullscreen), (display-mode: standalone)';

export function FullscreenOnTap() {
  useEffect(() => {
    const doc = document as WebkitDocument;
    const canFullscreen = doc.fullscreenEnabled || doc.webkitFullscreenEnabled;
    if (!canFullscreen) return;
    if (!matchMedia('(pointer: coarse)').matches) return;
    if (matchMedia(APP_QUERY).matches || isNative()) return;

    const onTap = () => {
      if (doc.fullscreenElement || doc.webkitFullscreenElement) return;
      const root = document.documentElement as WebkitElement;
      const asked = root.requestFullscreen
        ? root.requestFullscreen({ navigationUI: 'hide' })
        : root.webkitRequestFullscreen?.();
      // Refused (no gesture credit left, a policy, a user setting) is fine:
      // the game plays the same in a tab, just smaller.
      Promise.resolve(asked)
        .then(() => (screen.orientation as LockableOrientation | undefined)?.lock?.('landscape'))
        .catch(() => {});
    };
    // `pointerup`, not `pointerdown`: for touch, only the lift counts as the
    // user activation a fullscreen request needs.
    window.addEventListener('pointerup', onTap, { once: true });
    return () => window.removeEventListener('pointerup', onTap);
  }, []);

  return null;
}
