'use client';

/**
 * The sky while the island goes under.
 *
 * The scene shakes and sinks the island (`IslandScene.playEruption`); this
 * is the half Pixi cannot do cheaply over the DOM: the light going cold and
 * green, spray thrown UP across the frame as the water takes the ground, and
 * one line that says what is happening in the island's own words. Mounted for
 * the server's beat (ERUPTION.SEQUENCE_MS) and taken down with the recap.
 *
 * The direction is the whole point. Ash fell DOWN from a volcano that no
 * longer exists; the sea comes UP. Each droplet is thrown from below the
 * frame, slows, and falls back — `power2.out` on the way up so it hangs at
 * the top of its arc, which is what reads as water rather than as confetti.
 *
 * The island sinking is the one rule nobody guesses — "the island is the
 * clock" — and this is the only moment the game gets to teach it.
 */
import { useEffect, useRef } from 'react';
import gsap from 'gsap';

const SPRAY_COUNT = 70;

export function EruptionOverlay({ ms }: { ms: number }) {
  const spray = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = spray.current;
    if (!el) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const drops: HTMLSpanElement[] = [];
    const tweens: gsap.core.Tween[] = [];
    const seconds = Math.max(1, ms) / 1000;
    for (let i = 0; i < SPRAY_COUNT; i++) {
      const d = document.createElement('span');
      const size = gsap.utils.random(2, 5, 1);
      // Taller than wide for a third of them: a droplet with some travel in
      // it, rather than a field of identical dots.
      d.style.width = `${size}px`;
      d.style.height = `${size * (Math.random() < 0.3 ? 2 : 1)}px`;
      d.style.left = `${gsap.utils.random(0, 100, 0.1)}%`;
      el.appendChild(d);
      drops.push(d);
      const rise = gsap.utils.random(0.45, 0.9) * window.innerHeight;
      tweens.push(gsap.fromTo(d,
        { y: 0, x: 0, rotation: 0, opacity: 0.9 },
        {
          y: -rise,
          x: gsap.utils.random(-50, 50),
          rotation: gsap.utils.random(-120, 120),
          opacity: 0,
          duration: gsap.utils.random(seconds * 0.5, seconds * 1.1),
          delay: gsap.utils.random(0, seconds * 0.5),
          ease: 'power2.out',
        }));
    }
    return () => {
      tweens.forEach((t) => t.kill());
      drops.forEach((d) => d.remove());
    };
  }, [ms]);

  return (
    <div className="rr-eruption" aria-hidden>
      <div className="rr-eruption-dark" />
      <div className="rr-eruption-ash" ref={spray} />
      <p className="rr-eruption-line">THE ISLAND SINKS</p>
    </div>
  );
}
