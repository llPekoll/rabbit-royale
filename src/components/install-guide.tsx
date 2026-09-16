'use client';

/**
 * PUT THE GAME ON THE HOME SCREEN — everything that turns the site into an app,
 * per platform. Ported from the Domin8 hub (insertcoin.cc,
 * `ton-domin8-hub/src/app/install-banner.tsx`), where it shipped first; the
 * platform findings recorded there hold here and are kept short below.
 *
 * WHY IT MATTERS MORE HERE. A landscape phone browser gives this game a fifth
 * less height than the screen has, and Safari on iPhone offers a page no way
 * to take it back — no fullscreen call, and bars that only shrink when a page
 * scrolls, which a board never does. The installed app has no bars at all
 * (app/manifest.ts, `appleWebApp` in layout.tsx).
 *
 * Two shapes, and which one a player gets is the browser's call:
 *
 * THE POPUP — Chromium (desktop, and Android, where it installs a real WebAPK)
 * fires `beforeinstallprompt`; it is held, and INSTALL fires the browser's own
 * install sheet. Single-use per page load, and never fired in incognito or a
 * fresh automation profile. public/install-prompt.js catches it before this
 * chunk loads, because on a slow connection the event beats the app bundle.
 *
 * THE STEPS — a written dialog where no prompt exists: iOS / iPadOS (Share >
 * Add to Home Screen), macOS Safari 17+ (File > Add to Dock), and any Chromium
 * whose prompt never came or was already spent (the menu path).
 *
 * The pieces:
 *  - `detectInstallTarget()` — which story applies, or null (already the app,
 *    the Android shell or another WebView, an iframe, Firefox).
 *  - `openInstallGuide()` — the one door every INSTALL affordance uses: the
 *    popup when there is one, the steps otherwise.
 *  - `InstallGuideHost` — mounted once in layout.tsx: the steps dialog, and
 *    the service worker's registration.
 *  - `InstallNudge` — the one-time toast on the burrow. WHEN is the page's
 *    call: after the player's second run home (`burrow.runs >= 2`) — someone
 *    who has not played twice has no reason yet to keep the game — and never
 *    over a crossing, a dialog or another toast. It comes back until answered.
 *  - `InstallRow` — the standing door, in the sound panel, there the whole time
 *    on any browser with an install path. The nudge only points at it.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { CloseButton, NineSlicePanel } from '@domin8/arcade-kit';
import { useT } from '@/i18n/provider';
import { PixelText as BitmapText, PixelTitle } from './pixel-text';
import { PxButton, pxLabel } from './px';
import { CARROT_BTN, CHALK, DIALOG_PX, SOIL } from './shop-card';
import { isNative } from './native-bridge';

/** Platforms with an install path — a native popup, or steps we can teach. */
export type InstallTarget = 'ios' | 'macSafari' | 'chromiumDesktop' | 'androidChromium';

/** Same-window event that opens the steps from anywhere. */
const OPEN_EVENT = 'rr:show-install-guide';

/**
 * Which install story applies to this browser, or null when none does.
 * Pure UA and feature sniffing; client-only.
 */
export function detectInstallTarget(): InstallTarget | null {
  if (typeof window === 'undefined') return null;
  try {
    if (installedHere) return null;
    const ua = navigator.userAgent;
    const nav = navigator as Navigator & { standalone?: boolean };

    // Already the installed app. `display-mode: fullscreen` also matches a TAB
    // that went fullscreen through the API (fullscreen-on-tap.tsx does that on
    // Android), which is not an install — so it only counts with no element
    // holding the fullscreen.
    const apiFullscreen = Boolean(
      document.fullscreenElement
      || (document as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement,
    );
    if (
      nav.standalone === true
      || matchMedia('(display-mode: standalone)').matches
      || (matchMedia('(display-mode: fullscreen)').matches && !apiFullscreen)
    ) return null;
    // The Seeker shell is an app already, and so is any in-app browser; an
    // iframe cannot add itself to a home screen.
    if (isNative() || /; wv\)/i.test(ua) || window.top !== window.self) return null;

    // Android Chromium installs a WebAPK from its popup (or its menu). Firefox
    // Android has nothing worth teaching.
    if (/Android/i.test(ua)) return /Chrome\/|Chromium\//i.test(ua) ? 'androidChromium' : null;

    // iPadOS 13+ Safari claims to be a Mac; a Mac reports no touch points.
    const isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 0);
    if (isIOS) return 'ios';

    const isChromium = /Chrome\/|Chromium\/|CriOS\//i.test(ua);
    const isSafari = /Safari\//i.test(ua) && !isChromium && !/Firefox|FxiOS/i.test(ua);
    if (/Macintosh/i.test(ua) && isSafari) return 'macSafari';
    if (isChromium && !/Mobile/i.test(ua)) return 'chromiumDesktop';
    return null;
  } catch {
    return null;
  }
}

/** Hydration-safe read of the target (server: null), live across `appinstalled`. */
export function useInstallTarget(): InstallTarget | null {
  return useSyncExternalStore(subscribePrompt, detectInstallTarget, () => null);
}

/* ── the answer: dismissed once, remembered per browser ─────────────────── */

const DISMISS_KEY = 'rr_install_nudge_dismissed';
const CHANGED_EVENT = 'rr:install-nudge-changed';

function nudgeDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissInstallNudge() {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    /* private mode: it just does not stay dismissed */
  }
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

function subscribeDismiss(cb: () => void) {
  window.addEventListener(CHANGED_EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(CHANGED_EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}

/** Server snapshot says dismissed, so nothing renders before hydration. */
function useNudgeDismissed(): boolean {
  return useSyncExternalStore(subscribeDismiss, nudgeDismissed, () => true);
}

/* ── Chromium's install popup ──────────────────────────────────────────── */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const PROMPT_EVENT = 'rr:install-prompt-changed';

// Module scope, and seeded from public/install-prompt.js: the event fires once,
// early, and usually before anything here mounts.
let deferredPrompt: BeforeInstallPromptEvent | null =
  typeof window !== 'undefined'
    ? ((window as Window & { __rrInstallPrompt?: BeforeInstallPromptEvent }).__rrInstallPrompt ?? null)
    : null;
/** Installed from this tab: every install affordance retires. */
let installedHere = false;

function setDeferredPrompt(next: BeforeInstallPromptEvent | null) {
  deferredPrompt = next;
  window.dispatchEvent(new Event(PROMPT_EVENT));
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // Chromium's own mini-infobar stays out of the way
    setDeferredPrompt(e as BeforeInstallPromptEvent);
  });
  window.addEventListener('appinstalled', () => {
    installedHere = true;
    setDeferredPrompt(null);
  });
}

function hasInstallPrompt(): boolean {
  return deferredPrompt !== null;
}

function subscribePrompt(cb: () => void) {
  window.addEventListener(PROMPT_EVENT, cb);
  return () => window.removeEventListener(PROMPT_EVENT, cb);
}

function useInstallPromptReady(): boolean {
  return useSyncExternalStore(subscribePrompt, hasInstallPrompt, () => false);
}

/** Fire the browser's popup. `unavailable` means the steps are the fallback. */
async function triggerInstallPrompt(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const p = deferredPrompt;
  if (!p) return 'unavailable';
  setDeferredPrompt(null); // single-use, whichever way it is answered
  try {
    await p.prompt();
    return (await p.userChoice).outcome;
  } catch {
    return 'unavailable';
  }
}

/**
 * The single door. From a click handler only: `prompt()` needs the user
 * activation, and both branches below keep it (the dispatch is synchronous).
 */
export function openInstallGuide() {
  if (typeof window === 'undefined') return;
  if (deferredPrompt) {
    void triggerInstallPrompt();
    return;
  }
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/* ── the host (layout.tsx) ─────────────────────────────────────────────── */

export function InstallGuideHost() {
  const target = useInstallTarget();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  // The worker is a navigation-only offline fallback (public/sw.js) — part of
  // Chromium's installability criteria on some versions. Production only: in
  // development a worker between the page and the dev server is a stale page
  // waiting to happen, and Chromium installs without one on current desktop.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator) || isNative()) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  if (!target || !open) return null;
  return (
    <InstallGuideDialog
      target={target}
      onClose={() => {
        setOpen(false);
        // Reading the steps is an answer: the nudge stops.
        dismissInstallNudge();
      }}
    />
  );
}

function InstallGuideDialog({ target, onClose }: { target: InstallTarget; onClose: () => void }) {
  const t = useT();
  const [installing, setInstalling] = useState(false);
  // Live: a slow `beforeinstallprompt` can still land while this is open.
  const canPrompt = useInstallPromptReady();
  const hasPopup = canPrompt && (target === 'chromiumDesktop' || target === 'androidChromium');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const runPrompt = async () => {
    setInstalling(true);
    const outcome = await triggerInstallPrompt();
    setInstalling(false);
    // Declined or spent: stay open; `canPrompt` is false now, so the steps
    // below switch themselves to the menu path.
    if (outcome === 'accepted') onClose();
  };

  const steps = hasPopup ? t.install.steps.prompt : t.install.steps[target];

  return createPortal(
    <div className="rr-shop-scrim" onClick={onClose}>
      <NineSlicePanel
        color={SOIL}
        pixelScale={DIALOG_PX}
        className="rr-shop-modal rr-install-modal rr-px-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t.install.title[target]}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="rr-shop-top">
          <img className="rr-install-icon" src="/icons/icon-192.png" alt="" width={40} height={40} />
          {/* The title face at 2, not the panel title's 2.5: "ADD TO HOME
              SCREEN" is the longest heading in the game, and at the larger
              size it ran under the close button on a phone. */}
          <h2 className="rr-install-title"><PixelTitle scale={2}>{t.install.title[target]}</PixelTitle></h2>
          <CloseButton inline className="rr-shop-x" onClick={onClose} aria-label={t.install.close} style={{ minWidth: 44 }} />
        </header>
        <div className="rr-install-body">
          <p className="rr-install-line">{t.install.line[target]}</p>
          <ol className="rr-install-steps">
            {steps.map((step) => <li key={step}>{step}</li>)}
          </ol>
        </div>
        <footer className="rr-shop-foot rr-install-foot">
          <PxButton {...CARROT_BTN} onClick={hasPopup ? runPrompt : onClose} disabled={installing}>
            <span style={{ ...pxLabel, fontSize: 12 }}>
              {hasPopup ? (installing ? t.install.installing : t.install.install) : t.install.gotIt}
            </span>
          </PxButton>
        </footer>
      </NineSlicePanel>
    </div>,
    document.body,
  );
}

/* ── the nudge, and the standing door ──────────────────────────────────── */

/**
 * The toast. Its button says what a tap does: INSTALL where the browser has a
 * popup to fire, SHOW ME where all there is to offer is the steps.
 */
export function InstallNudge() {
  const t = useT();
  const target = useInstallTarget();
  const dismissed = useNudgeDismissed();
  const canPrompt = useInstallPromptReady();
  if (!target || dismissed) return null;

  return (
    <div className="rr-install-nudge">
      <NineSlicePanel color={SOIL} pixelScale={DIALOG_PX} role="status" className="rr-install-nudge-panel">
        <div className="rr-install-nudge-head">
          <PixelTitle scale={2}>{t.install.title[target]}</PixelTitle>
          <CloseButton inline onClick={dismissInstallNudge} aria-label={t.install.close} style={{ minWidth: 44 }} />
        </div>
        <p className="rr-install-line">{t.install.line[target]}</p>
        <div className="rr-install-nudge-act">
          <PxButton
            {...CARROT_BTN}
            onClick={() => {
              // Answered either way; stamped before the dialog so the toast
              // does not linger under it.
              dismissInstallNudge();
              openInstallGuide();
            }}
          >
            <span style={{ ...pxLabel, fontSize: 12 }}>
              {canPrompt ? t.install.install : t.install.showMe}
            </span>
          </PxButton>
        </div>
      </NineSlicePanel>
    </div>
  );
}

/**
 * The door that is always there: a row in the sound panel, beside the other
 * settings, on any browser with an install path. Nothing on one without.
 */
export function InstallRow() {
  const t = useT();
  const target = useInstallTarget();
  if (!target) return null;
  return (
    <div className="rr-sound-row">
      {/* The same label face and size as the Music and Effects rows. */}
      <BitmapText scale={1.25} style={{ color: CHALK }}>{t.install.app}</BitmapText>
      <PxButton {...CARROT_BTN} className="rr-px-btn" onClick={openInstallGuide} aria-label={t.install.title[target]}>
        <span style={{ ...pxLabel, fontSize: 11 }}>{t.install.install}</span>
      </PxButton>
    </div>
  );
}
