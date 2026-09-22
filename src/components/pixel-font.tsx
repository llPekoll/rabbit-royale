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
import { useLocale, usePixelFace } from '@/i18n/provider';

/**
 * FUSION PIXEL FOR EVERY OTHER LANGUAGE (Paul, 2026-09-23). The system stack
 * above was a smooth face in a pixel game; Fusion Pixel 12px (OFL 1.1,
 * github.com/TakWolf/fusion-pixel-font) draws accents AND sinograms as
 * pixels. Two cuts, each subset to the characters of our four dictionaries
 * (~31 KB, tools/subset-fusion-font.sh): the Latin one gives "’" a letter's
 * width, the Chinese one gives it a full em ("aujourd’ hui"). The system
 * stack stays behind it for a player's name or a word from the server.
 * The Godot client wears the same two files (godot/scripts/i18n.gd `face`).
 */
const FUSION = {
  latin: { family: 'Fusion Pixel RR Latin', url: '/assets/fonts/fusion-pixel-12-rr-latin.woff2' },
  zh: { family: 'Fusion Pixel RR ZH', url: '/assets/fonts/fusion-pixel-12-rr-zh.woff2' },
} as const;

async function loadFusion(cut: keyof typeof FUSION): Promise<string> {
  const { family, url } = FUSION[cut];
  if (![...document.fonts].some((f) => f.family.replace(/"/g, '') === family)) {
    const face = new FontFace(family, `url(${url}) format("woff2")`);
    document.fonts.add(await face.load());
  }
  return family;
}

export function PixelFont() {
  const pixelFace = usePixelFace();
  const { locale } = useLocale();

  useEffect(() => {
    const root = document.documentElement;
    // THE RACE THIS GUARDS. The first paint is always English (provider.tsx),
    // so the kit's face starts loading; the stored French lands a frame
    // later and hands the variable back — and then the English load resolved
    // and set "D8 Pixel" over it. Every language wore the ASCII atlas, and
    // the atlas draws a missing letter as "≡": "QU≡TE", "R≡COLTER". Only
    // the effect that is still current may write the variable.
    let current = true;
    if (!pixelFace) {
      root.style.setProperty('--font-pixel', 'var(--font-fallback)');
      root.dataset.face = 'fusion';
      void loadFusion(locale === 'zh' ? 'zh' : 'latin').then((family) => {
        if (current) root.style.setProperty('--font-pixel', `"${family}", var(--font-fallback)`);
      });
    } else {
      delete root.dataset.face;
      void loadPixelWebFont().then(() => {
        // Set only AFTER the face is ready. Pointing the variable at a font
        // that has not loaded makes every label fall back mid-paint, which
        // reads as the whole interface flickering on first load.
        if (current) root.style.setProperty('--font-pixel', `"${PIXEL_FONT_FAMILY}"`);
      });
    }
    return () => { current = false; };
  }, [pixelFace, locale]);

  return null;
}
