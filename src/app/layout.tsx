import type { Metadata, Viewport } from 'next';
import { PixelFont } from '@/components/pixel-font';
import { RotateGate } from '@/components/rotate-gate';
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
    <html lang="en">
      <body>
        <PixelFont />
        {children}
        <RotateGate />
      </body>
    </html>
  );
}
