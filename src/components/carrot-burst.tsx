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
}

export function CarrotBurst({ fireKey, amount }: CarrotBurstProps) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // fireKey 0 is the initial render: nothing has been banked yet.
    if (!fireKey || !host.current || amount <= 0) return;

    // A looping burst is exactly the motion that makes some people ill, and
    // this one is decorative — the number changes either way.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const el = host.current;
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
      // Lanes are pushed away from the centre (the digits live there), so the
      // fan straddles the number instead of climbing over it.
      const t = i / Math.max(1, count - 1) - 0.5;
      const lane = Math.sign(t) * (34 + Math.abs(t) * 150) + gsap.utils.random(-8, 8);
      tl.fromTo(
        s,
        // Starting already fanned (and lower) keeps every carrot out of the
        // digits' column on the way up: a launch from the centre had the late
        // ones climbing straight through the number.
        { x: lane * 0.82, y: 66, opacity: 0, scale: 0.7, rotate: gsap.utils.random(-40, 40) },
        {
          // Rising and spreading, so they clear the figure instead of covering
          // it — the eye is pulled UP past the number, which is what makes it
          // look at the number.
          x: lane,
          y: -26,
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
        { y: -62, opacity: 0, duration: 0.26, ease: 'power1.in' },
        '>-0.06',
      );
    });

    return () => {
      tl.kill();
      sprites.forEach((s) => s.remove());
    };
  }, [fireKey, amount]);

  return <div className="rr-carrot-burst" ref={host} aria-hidden />;
}
