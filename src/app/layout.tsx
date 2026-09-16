import type { Metadata, Viewport } from 'next';
import { PixelFont } from '@/components/pixel-font';
import { RotateGate } from '@/components/rotate-gate';
import { FullscreenOnTap } from '@/components/fullscreen-on-tap';
import { InstallGuideHost } from '@/components/install-guide';
import Script from 'next/script';
import { LocaleProvider } from '@/i18n/provider';
import './globals.css';
// The pixel chrome rollout, one file per surface group so each can be restyled
// without touching the others — after globals.css, so they win at equal
// specificity. See src/components/px.tsx.
import './px-top-floor.css';
import './px-dialogs.css';
import './px-raid.css';

export const metadata: Metadata = {
  title: 'Rabbit Royale: The Cursed Crown',
  description: 'Competitive minesweeper. Dig, hoard, raid, wear the crown.',
  // Added to the home screen, iOS runs the page as an app with no Safari bars
  // — the only way to a full screen on an iPhone. See app/manifest.ts.
  // `black-translucent` draws the page under the status bar, which the
  // safe-area insets (`viewportFit: 'cover'` below) already make room for.
  appleWebApp: {
    capable: true,
    title: 'Rabbit Royale',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    apple: '/icons/apple-touch-icon.png',
  },
  // Next now writes only the standard `mobile-web-app-capable`; iOS before 17
  // still looks for Apple's own name, and without it a home-screen launch
  // opens in Safari with its bars.
  other: {
    'apple-mobile-web-app-capable': 'yes',
  },
};

// The Seeker is the target device: no zooming, no bounce, and the page extends
// INTO the notch. `viewport-fit: cover` is what makes the safe-area-inset
// values in globals.css mean anything — without it the browser reports zero and
// the native shell's under-the-notch drawing has nothing to compensate for.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#0d1117',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /* `lang` starts as English and is rewritten by <LocaleProvider/> once the
       stored choice is read — it cannot be right on the server, which has no
       way of knowing what this player picked last time. It matters beyond the
       screen reader: globals.css hangs the fallback font stack off it, because
       the kit's ASCII face cannot draw three of the four languages. */
    <html lang="en">
      <body>
        {/* Chromium's `beforeinstallprompt`, caught ahead of every app chunk:
            it fires once, early, and can beat the bundle on a slow line. */}
        <Script src="/install-prompt.js" strategy="beforeInteractive" />
        {/* Above everything, including <PixelFont/>, which asks it which face
            this language can actually use. */}
        <LocaleProvider>
          <PixelFont />
          {children}
          <RotateGate />
          <FullscreenOnTap />
          {/* The install steps and the service worker — install-guide.tsx. */}
          <InstallGuideHost />
        </LocaleProvider>
      </body>
    </html>
  );
}
