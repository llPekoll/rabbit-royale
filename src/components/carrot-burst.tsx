'use client';

/**
 * Carrots flying up into the counter when you bank them.
 *
 * A number that simply changes from 138 to 150 is a fact; carrots ARRIVING is
 * an event, and banking a harvest is the one moment on this screen worth
 * celebrating. Every game does this because it works: the eye follows the
 * things travelling, lands on the counter, and reads the new number as the
 * result of what it just watched.
 *
 * The sprites are the game's own carrot (the kit's CARROT_URL — the same one
 * dug out of the ground on the island), not an emoji, so the reward on this
 * screen is the same object as the reward in the run.
 *
 * Each carrot gets its own arc, its own delay and its own spin, because a
 * dozen identical sprites moving in lockstep reads as one shape rather than as
 * a handful of carrots.
 */
import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { CARROT_URL, CARROT_SIZE } from '@domin8/arcade-kit/game';

/** How many sprites fly, at most. Beyond this it reads as noise, not as loot. */
const MAX_CARROTS = 12;
/**
 * Source-pixel scale — a whole multiple, so the sprite stays crisp.
 *
 * 1x, not 2x: the carrot is 13x29 natively and the counter it flies into is
 * 44px tall, so a doubled sprite is nearly as big as the number and hides the
 * very thing the burst is pointing at.
 */
const SCALE = 1;

export interface CarrotBurstProps {
  /** Bumped once per harvest; the burst replays whenever it changes. */
  fireKey: number;
  /** How many carrots were banked — more carrots, more sprites (capped). */
  amount: number;
  /**
   * How wide the fan opens, in pixels. Defaults to the width of the element the
   * burst sits in, so a burst over a narrow counter stays over that counter
   * instead of drifting across its neighbours.
   */
  spread?: number;
}

export function CarrotBurst({ fireKey, amount, spread }: CarrotBurstProps) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // fireKey 0 is the initial render: nothing has been banked yet.
    if (!fireKey || !host.current || amount <= 0) return;

    // A looping burst is exactly the motion that makes some people ill, and
    // this one is decorative — the number changes either way.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const el = host.current;
    // The fan is as wide as the thing it decorates unless told otherwise. The
    // host itself is a zero-height overlay, so the measurement comes from its
    // PARENT — the counter — which is the element the carrots belong to.
    const box = el.parentElement?.getBoundingClientRect();
    // Kept INSIDE the counter, not merely near it: this thing lives in a
    // crowded top bar with a wallet chip beside it and the screen edge just
    // past that, so a fan wider than its own element lands on its neighbours.
    const width = spread ?? Math.min(box?.width ?? 90, 90);
    // More carrots for a bigger haul, but on a curve: 5 and 500 should differ,
    // 500 and 5000 need not.
    const count = Math.max(3, Math.min(MAX_CARROTS, Math.round(Math.sqrt(amount))));
    const sprites: HTMLSpanElement[] = [];

    for (let i = 0; i < count; i++) {
      const s = document.createElement('span');
      s.className = 'rr-carrot-fly';
      s.style.width = `${CARROT_SIZE.width * SCALE}px`;
      s.style.height = `${CARROT_SIZE.height * SCALE}px`;
      s.style.backgroundImage = `url('${CARROT_URL}')`;
      el.appendChild(s);
      sprites.push(s);
    }

    // They set off from a spread along the bottom and converge on the counter,
    // so the burst reads as carrots being GATHERED rather than as an explosion.
    const tl = gsap.timeline({
      onComplete: () => sprites.forEach((s) => s.remove()),
    });

    sprites.forEach((s, i) => {
      // A fan, not a column: each carrot keeps its own lane the whole way up.
      // Converging them on the centre stacked every sprite on top of the digits
      // and hid the number the burst exists to point at.
      // A narrow counter has no room for a fan AROUND it, so the carrots rise
      // from below and pass THROUGH — they are behind the digits (z-index), so
      // the number stays readable the whole way. Trying to straddle a 90px
      // counter just parked the sprites on top of the figure.
      const t = i / Math.max(1, count - 1) - 0.5;
      const lane = t * width + gsap.utils.random(-6, 6);
      tl.fromTo(
        s,
        // Starting already fanned (and lower) keeps every carrot out of the
        // digits' column on the way up: a launch from the centre had the late
        // ones climbing straight through the number.
        { x: lane * 0.6, y: 30, opacity: 0, scale: 0.7, rotate: gsap.utils.random(-30, 30) },
        {
          // Rising and spreading, so they clear the figure instead of covering
          // it — the eye is pulled UP past the number, which is what makes it
          // look at the number.
          x: lane,
          y: -14,
          opacity: 1,
          scale: 1,
          rotate: gsap.utils.random(-18, 18),
          duration: 0.46,
          ease: 'power2.out',
        },
        // Staggered starts, so they arrive as a handful rather than a wall.
        i * 0.05,
      ).to(
        s,
        // They keep going and fade out above, rather than stopping dead.
        { y: -34, opacity: 0, duration: 0.26, ease: 'power1.in' },
        '>-0.06',
      );
    });

    return () => {
      tl.kill();
      sprites.forEach((s) => s.remove());
    };
  }, [fireKey, amount, spread]);

  return <div className="rr-carrot-burst" ref={host} aria-hidden />;
}
