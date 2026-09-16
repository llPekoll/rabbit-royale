/**
 * WHICH FACE THE CANVAS DRAWS WITH — the Pixi half of the language switch.
 *
 * The scenes label themselves with `BitmapText` over the kit's two bitmap
 * fonts (`d8-basic`, `d8-outline`). A bitmap font is an ATLAS: a glyph exists
 * or it does not, and one that does not is dropped silently. Those atlases are
 * printable ASCII, so in Chinese a HUD label draws as nothing at all, and in
 * French every accented word loses its accents mid-glyph.
 *
 * So the canvas does what the DOM does (see components/pixel-font.tsx): it
 * keeps the bitmap face for the language the atlas covers, and falls back to
 * an ordinary Pixi `Text` — a real font, rasterised per string — for the rest.
 * `Text` is the more expensive object, which is exactly why it is not the
 * default: English, the atlas language, never pays for it.
 *
 * THIS MODULE IS NOT REACTIVE, on purpose. Pixi objects are built once and
 * live in a scene graph; a context would not reach them. The language is
 * pushed in from React (`setCanvasLocale`, called by the canvas host) and read
 * at construction. Changing language rebuilds the scenes, which is what the
 * carrot iris is already for.
 */
import { BitmapText, Text, type TextStyleOptions } from 'pixi.js';
import { DEFAULT_LOCALE, LOCALE_META, type Locale } from '@/i18n/locales';

/**
 * The fallback stack, mirroring `--font-fallback` in globals.css.
 *
 * Written out rather than read from CSS because Pixi rasterises on a canvas of
 * its own and never sees the stylesheet. If one changes, change both — the
 * point is that the HUD and the chrome around it wear the same face.
 */
export const FALLBACK_FAMILY =
  '"DotGothic16", "Silkscreen", "Zpix", ui-monospace, "SF Mono", Menlo, '
  + '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", monospace';

let current: Locale = DEFAULT_LOCALE;

/** Set by the canvas host before the scenes are built. */
export function setCanvasLocale(locale: Locale): void {
  current = locale;
}

export function canvasLocale(): Locale {
  return current;
}

/** True while the kit's atlases can draw the current language. */
export function usingBitmapFace(): boolean {
  return LOCALE_META[current].pixelFace;
}

/**
 * The label object for a string, in whichever face the language needs.
 *
 * Returns the Pixi union rather than one class: every caller already treats
 * these as "a thing with `.text`, `.tint`, `.anchor` and a transform", which
 * both classes are. The few places that genuinely need a `BitmapText` (none,
 * today) would have to narrow.
 */
export type Label = BitmapText | Text;

export function makeLabel(
  text: string,
  bitmapFamily: string,
  fontSize: number,
  fill = 0xffffff,
): Label {
  if (usingBitmapFace()) {
    return new BitmapText({ text, style: { fontFamily: bitmapFamily, fontSize, fill } });
  }
  const style: TextStyleOptions = { fontFamily: FALLBACK_FAMILY, fontSize, fill };
  // RESOLUTION IS ON THE TEXT, NOT THE STYLE. The atlases are drawn at their
  // native cell height and scaled up by whole numbers, so they stay crisp. A
  // rasterised face asked for 8px and then scaled 3x on the scene graph would
  // be mush, so it is rasterised at 3x the device pixels and drawn into the
  // same 8px box — the label keeps the SAME layout size as the bitmap one it
  // replaces, which is what lets every layout around it stay untouched.
  return new Text({ text, style, resolution: FALLBACK_RESOLUTION });
}

/** How many device pixels a fallback glyph is drawn per layout pixel. */
export const FALLBACK_RESOLUTION = 3;

/**
 * Upper-casing, where it is a style rather than a mutation.
 *
 * The canvas has always shouted: the kit's basic atlas HAS no lowercase, so
 * `pixelText` upper-cased everything on the way in. That is right for English
 * and wrong everywhere else — `toUpperCase()` on Chinese is a no-op that costs
 * nothing, but on French and Portuguese it strips nothing and SHOUTS THE WHOLE
 * INTERFACE in languages whose players did not opt into an arcade cabinet.
 * Worse, in Turkish-like locales it is lossy. So it applies only where the
 * atlas made it necessary.
 */
export function arcadeCase(text: string): string {
  return usingBitmapFace() ? text.toUpperCase() : text;
}

/**
 * Is this scene-graph child one of our labels?
 *
 * `instanceof BitmapText` was the test before there were two classes, and it
 * silently stopped finding the label in every language that falls back — the
 * button's own label is a `Text` then, so the nudge that centres it was
 * applied to nothing. Anything reaching into `children` for a label wants
 * this, not either class by itself.
 */
export function isLabel(child: unknown): child is Label {
  return child instanceof BitmapText || child instanceof Text;
}
