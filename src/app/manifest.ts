import type { MetadataRoute } from 'next';

/**
 * THE GAME AS AN APP, for the home screen.
 *
 * A browser tab cannot take the whole screen on an iPhone: Safari gives web
 * pages no fullscreen call, and its bars only shrink when a page scrolls, which
 * a game board never does — on a landscape phone the address bar ate a fifth of
 * the height. Opened from a home-screen icon, the page runs with no browser
 * chrome at all. This file (with `appleWebApp` in layout.tsx) is what makes
 * "Add to Home Screen" produce that app instead of a bookmark.
 *
 * `fullscreen` where the platform honours it (Android also drops the status
 * bar); iOS reads the Apple tags and runs standalone, which in landscape hides
 * the status bar anyway. Landscape because phones are gated to it
 * (rotate-gate.tsx). The colours are `themeColor`, so the launch splash is the
 * game's own dark rather than a white flash.
 *
 * The icons are cut from the logo for now (public/icons) — placeholder art
 * until the game has an app icon of its own.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Rabbit Royale: The Cursed Crown',
    short_name: 'Rabbit Royale',
    description: 'Competitive minesweeper. Dig, hoard, raid, wear the crown.',
    start_url: '/',
    scope: '/',
    display: 'fullscreen',
    // Tried in order where `fullscreen` is not supported.
    display_override: ['fullscreen', 'standalone', 'minimal-ui'],
    orientation: 'landscape',
    background_color: '#0d1117',
    theme_color: '#0d1117',
    categories: ['games', 'entertainment'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
