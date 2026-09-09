'use client';

/**
 * Loads the arcade-kit's pixel face and points `--font-pixel` at it.
 *
 * Mounted once in the root layout rather than per-component: a FontFace is
 * global, and loading it from three different screens would just race. The
 * CSS variable is what the stylesheet uses, so nothing else has to import the
 * kit or know the family name.
 */
import { useEffect } from 'react';
import { loadPixelWebFont, PIXEL_FONT_FAMILY } from '@domin8/arcade-kit';

export function PixelFont() {
  useEffect(() => {
    void loadPixelWebFont().then(() => {
      // Set only AFTER the face is ready. Pointing the variable at a font that
      // has not loaded makes every label fall back mid-paint, which reads as
      // the whole interface flickering on first load.
      document.documentElement.style.setProperty('--font-pixel', `"${PIXEL_FONT_FAMILY}"`);
    });
  }, []);
  return null;
}
