'use client';

/**
 * The item a chest paid, flying up with its name — and nothing else stopping.
 *
 * Chests are dug several times a run, and a full-screen `ChestReveal` for each
 * one meant the rabbit stopped, the board went away, and the player tapped a
 * ceremony away to get back to the dig they were in the middle of. A fertiliser
 * is a good thing, not an EVENT: it deserves to be seen and named, not to take
 * the screen. So the drop rises off the board, says what it is, and is gone
 * without ever taking a tap.
 *
 * The one exception stays in `chest-prize`: a Genesis piece IS the event, it
 * happens once in many sessions, and it keeps the full ceremony.
 *
 * ## Why it is not `CarrotBurst`
 *
 * That one fans a DOZEN sprites into a counter to make a number land. Here
 * there is one object and a word, and the point is reading them — a fan would
 * be a handful of fertilisers rather than the one the player won.
 */
import { useEffect, useRef, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import gsap from 'gsap';

export interface LootFlyProps {
  /** Art for the item — the same icon the shed and the bag use. */
  src: string;
  /** What it is called, in the game's own words: FERTILISER, SHIELD... */
  label: string;
  /** How many were won; 1 is left unsaid rather than written "1x". */
  amount: number;
  /** Native width/height ratio, so the sprite is never squashed. */
  aspect: number;
  /**
   * Bumped once per drop. Two fertilisers in a row are two flights, and a
   * remount on the same key would not replay the second.
   */
  fireKey: number;
  /** The flight is over and the drop can be cleared. */
  onDone(): void;
}

/** How tall the sprite is drawn. Big enough to read, small enough to pass. */
const SIZE = 72;

/**
 * The layout lives HERE rather than in globals.css, unlike the rest of the app.
 *
 * This thing portals to `document.body`, and Storybook's preview does not load
 * `globals.css` — a class-styled version renders in the corner of the iframe in
 * a serif face, which is not what ships and makes the story useless as
 * evidence. Inline styles are the same in both, which is the point: the story
 * IS the shipped drop. `chest-prize` sizes its own art inline for the same
 * reason.
 *
 * z-index 39 puts it over the board and HUD but UNDER the full-screen overlays
 * (shed, recap and lore all sit at 40): it never takes input, so it must never
 * be the layer covering something that does.
 */
const HOST: CSSProperties = {
  position: 'fixed',
  // Just above the middle: dead centre lands it on the rabbit, which is the
  // one thing on the board the player is watching.
  top: '38%',
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 39,
  pointerEvents: 'none',
};

/** The half GSAP writes `transform` on. See the two-element note below. */
const MOVER: CSSProperties = {
  display: 'grid',
  justifyItems: 'center',
  gap: 6,
  willChange: 'transform, opacity',
};

const NAME: CSSProperties = {
  fontFamily: 'var(--font-pixel), ui-monospace, monospace',
  fontSize: 13,
  letterSpacing: '0.08em',
  color: '#f4d593',
  // Read against grass, soil and water alike: the board underneath is whatever
  // the island happens to be, so the word carries its own dark edge rather
  // than relying on a backdrop.
  textShadow: '0 2px 0 rgba(0, 0, 0, 0.85), 0 0 8px rgba(0, 0, 0, 0.6)',
  whiteSpace: 'nowrap',
};

export function LootFly({ src, label, amount, aspect, fireKey, onDone }: LootFlyProps) {
  const host = useRef<HTMLDivElement>(null);
  // The timeline must call the LATEST onDone without restarting when the
  // callback identity changes: a parent that re-renders mid-flight would
  // otherwise kill and replay the animation.
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    // Motion this size, rising in the middle of the screen, is exactly what
    // reduced-motion asks not to be shown. The drop is already in the bag
    // either way, so it is held still and simply read.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      const t = gsap.delayedCall(1.1, () => done.current());
      return () => { t.kill(); };
    }

    const tl = gsap.timeline({ onComplete: () => done.current() });
    tl.fromTo(
      el,
      { y: 40, opacity: 0, scale: 0.6 },
      // Overshooting slightly on the way in is what makes it read as POPPING
      // out of the ground rather than fading in over it.
      { y: 0, opacity: 1, scale: 1, duration: 0.34, ease: 'back.out(2)' },
    )
      // A beat at the top, because the label is there to be read.
      .to(el, { y: -18, duration: 0.5, ease: 'none' })
      .to(el, { y: -70, opacity: 0, duration: 0.34, ease: 'power1.in' });

    return () => { tl.kill(); };
  }, [fireKey]);

  // Two elements on purpose: the OUTER one is centred with a transform of its
  // own, and GSAP writes transform on the inner one. Animating the wrapper
  // would overwrite `translateX(-50%)` on the first frame and the drop would
  // fly up the right-hand half of the screen.
  return createPortal(
    <div className="rr-loot-fly" style={HOST} aria-live="polite">
      <div style={MOVER} ref={host}>
        <img
          src={src}
          alt=""
          style={{ width: SIZE, height: SIZE / aspect, imageRendering: 'pixelated' }}
        />
        {/* Plain ASCII only: the pixel face draws an em dash as a blank box.
            See test/pixel-font-glyphs. */}
        <span style={NAME}>
          {amount > 1 ? `${amount}x ${label}` : label}
        </span>
      </div>
    </div>,
    document.body,
  );
}
