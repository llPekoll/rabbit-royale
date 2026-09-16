'use client';

/**
 * Loads the arcade-kit's pixel face and points `--font-pixel` at it — for the
 * languages it can actually draw.
 *
 * Mounted once in the root layout rather than per-component: a FontFace is
 * global, and loading it from three different screens would just race. The
 * CSS variable is what the stylesheet uses, so nothing else has to import the
 * kit or know the family name.
 *
 * NOT FOR EVERY LANGUAGE. The kit's face is built from an 8x8 atlas of
 * printable ASCII, so it has no "é", no "ã" and not one sinogram — in French,
 * Portuguese or Chinese most of the interface would render as blanks. Those
 * languages get `--font-fallback` instead (globals.css), and the switch is made
 * HERE rather than in a `[lang]` CSS rule because this component writes the
 * variable as an inline style on the document element, which beats any
 * stylesheet. One place decides; see i18n/locales.ts.
 */
import { useEffect } from 'react';
import { loadPixelWebFont, PIXEL_FONT_FAMILY } from '@domin8/arcade-kit';
import { usePixelFace } from '@/i18n/provider';

export function PixelFont() {
  const pixelFace = usePixelFace();

  useEffect(() => {
    const root = document.documentElement;
    if (!pixelFace) {
      // Hand the language back to the fallback stack. Clearing the property
      // rather than setting the stack literally keeps :root in globals.css the
      // one place the stack is written down.
      root.style.setProperty('--font-pixel', 'var(--font-fallback)');
      return;
    }
    void loadPixelWebFont().then(() => {
      // Set only AFTER the face is ready. Pointing the variable at a font that
      // has not loaded makes every label fall back mid-paint, which reads as
      // the whole interface flickering on first load.
      root.style.setProperty('--font-pixel', `"${PIXEL_FONT_FAMILY}"`);
    });
  }, [pixelFace]);

  return null;
}
