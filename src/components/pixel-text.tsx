'use client';

/**
 * THE KIT'S BITMAP FACES, FOR A LANGUAGE THEY CAN DRAW — and a plain span for
 * the three they cannot.
 *
 * `BitmapText`, `TitleText` and `PanelTitle` from `@domin8/arcade-kit` are not
 * fonts: each glyph is a slice of a PNG atlas, positioned by the character's
 * index in a charset. That charset is printable ASCII. A character outside it
 * is not "missing" in the way a web font's is — the kit renders an EMPTY SPAN
 * OF THE RIGHT WIDTH, so a Chinese label comes out as a row of blanks that
 * takes up space and says nothing, and a French one silently loses its
 * accented letters mid-word.
 *
 * So these three wrappers choose. English gets the atlas, exactly as before.
 * Every other language gets an ordinary styled span in the fallback stack
 * (`--font-pixel`, pointed at `--font-fallback` by components/pixel-font.tsx),
 * upper-cased only where the original was shouting BECAUSE of the atlas.
 *
 * IMPORT THESE, NOT THE KIT'S, in anything that renders player-facing copy.
 * The kit's own are still correct for a fixed ASCII string that is not a
 * translation — a chapter numeral, a "3/20" — and those keep using them.
 */
import type { CSSProperties } from 'react';
import {
  BitmapText as KitBitmapText,
  TitleText as KitTitleText,
  PanelTitle as KitPanelTitle,
} from '@domin8/arcade-kit';
import { usePixelFace } from '@/i18n/provider';

interface PixelProps {
  /**
   * A string or a number, never arbitrary nodes — the kit's faces lay out one
   * character at a time and cannot render an element. Keeping the same
   * constraint here means swapping an import cannot silently start dropping
   * children on the fallback path.
   */
  children: string | number;
  scale?: number;
  style?: CSSProperties;
  className?: string;
}

/**
 * The size one atlas cell renders at, in CSS pixels, for a given `scale`.
 *
 * The kit draws its 8px glyphs at `8 * scale`, so the fallback face is asked
 * for the same height. It is a different typeface with different metrics, so
 * the match is close rather than exact — but a label that is a pixel or two
 * off is a different thing entirely from a label that is not drawn.
 */
const CELL = 8;

/**
 * Fusion Pixel (every language but English, pixel-font.tsx) is a 12px bitmap
 * face: it is sharp at 12 and at its whole multiples, and loses rows of
 * pixels in between — a sinogram at 10px is unreadable. The kit's scales
 * (10, 16, 20px) are snapped onto that grid, the way the Godot client does.
 */
const FUSION_CELL = 12;
const onFusionGrid = (px: number) => Math.max(FUSION_CELL, Math.round(px / FUSION_CELL) * FUSION_CELL);

function fallbackStyle(scale: number, style?: CSSProperties): CSSProperties {
  return {
    fontFamily: 'var(--font-pixel)',
    fontSize: onFusionGrid(CELL * scale),
    // The atlas is drawn at whole-pixel sizes and has no descender overhang;
    // a rasterised face at the same size sits differently in its line box, so
    // the line height is pinned to the cell rather than inherited.
    lineHeight: 1.15,
    ...style,
  };
}

/** A body label — the kit's ASCII face, or the fallback stack. */
export function PixelText({ children, scale = 2, style, className }: PixelProps) {
  const atlas = usePixelFace();
  if (atlas) {
    return (
      <KitBitmapText scale={scale} style={style} className={className}>
        {children}
      </KitBitmapText>
    );
  }
  return <span className={className} style={fallbackStyle(scale, style)}>{children}</span>;
}

/**
 * A display heading — the kit's outlined face, or the fallback stack in bold.
 *
 * The kit's `TitleText` upper-cases its input, because its atlas has caps
 * only. The fallback does not: a heading in French is a heading, not a shout,
 * and the language that needs the fallback is exactly the language where
 * upper-casing was never a design choice in the first place.
 */
export function PixelTitle({ children, scale = 4, style, className }: PixelProps) {
  const atlas = usePixelFace();
  if (atlas) {
    return (
      <KitTitleText scale={scale} style={style} className={className}>
        {children}
      </KitTitleText>
    );
  }
  return (
    <span
      className={className}
      style={{ ...fallbackStyle(scale, style), fontWeight: 700, letterSpacing: '0.04em' }}
    >
      {children}
    </span>
  );
}

/** A panel's own title bar — the kit's, or the fallback stack at its size. */
export function PanelTitle({ children, style, className }: Omit<PixelProps, 'scale'>) {
  const atlas = usePixelFace();
  if (atlas) {
    return <KitPanelTitle style={style} className={className}>{children}</KitPanelTitle>;
  }
  // `PanelTitle` picks its own scale inside the kit; 2.5 is what it renders at
  // in this game's panels, measured against the codex's header.
  return (
    <span
      className={className}
      style={{ ...fallbackStyle(2.5, style), fontWeight: 700, letterSpacing: '0.04em' }}
    >
      {children}
    </span>
  );
}
