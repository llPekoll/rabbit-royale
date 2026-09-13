'use client';

/**
 * Publishes how far down the screen the top chrome reaches, as
 * `--rr-chrome-top`, so the island's `.rr-overlay` can start its HUD under it.
 *
 * MEASURED, because no constant holds. The bar's height depends on the wallet
 * chip (63px with an avatar and a GUEST tag, 44px without), and the carrot pill
 * is `position: fixed` — out of the bar's flow — and grows a row when the rank
 * line arrives. A pinned 56px left the run's HUD 15px into the wallet chip on a
 * phone and 4px into the pill on every screen, desktop included.
 *
 * The figure is the lower of the two BOTTOM edges, measured from the viewport
 * top, so it already includes the safe-area inset the bar sits under.
 */
import { useEffect } from 'react';

const SOURCES = ['.rr-topbar', '.rr-carrot-pill'];

export function TopbarReserve() {
  useEffect(() => {
    const root = document.documentElement;
    const els = SOURCES
      .map((s) => document.querySelector(s))
      .filter((e): e is Element => e !== null);
    if (els.length === 0) return;

    const update = () => {
      const bottom = Math.max(...els.map((e) => e.getBoundingClientRect().bottom));
      // A few px of air, so the HUD strip reads as under the bar, not welded to it.
      root.style.setProperty('--rr-chrome-top', `${Math.ceil(bottom) + 4}px`);
    };

    const ro = new ResizeObserver(update);
    els.forEach((e) => ro.observe(e));
    window.addEventListener('resize', update);
    update();
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
      root.style.removeProperty('--rr-chrome-top');
    };
  }, []);

  return null;
}
