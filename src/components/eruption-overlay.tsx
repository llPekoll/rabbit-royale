'use client';

/**
 * The sky during the eruption.
 *
 * The scene shakes and sinks the island (`IslandScene.playEruption`); this
 * is the half Pixi cannot do cheaply over the DOM: the sky darkening, ash
 * falling across the whole frame, and one line that says what is happening
 * in the island's own words. Mounted for the server's beat
 * (ERUPTION.SEQUENCE_MS) and taken down with the recap.
 *
 * The island sinking is the one rule nobody guesses — "the island is the
 * clock" — and this is the only moment the game gets to teach it. It used to
 * be four seconds of a still board.
 */
import { useEffect, useRef } from 'react';
import gsap from 'gsap';

const ASH_COUNT = 70;

export function EruptionOverlay({ ms }: { ms: number }) {
  const ash = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ash.current;
    if (!el) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const flakes: HTMLSpanElement[] = [];
    const tweens: gsap.core.Tween[] = [];
    const seconds = Math.max(1, ms) / 1000;
    for (let i = 0; i < ASH_COUNT; i++) {
      const f = document.createElement('span');
      const size = gsap.utils.random(2, 6, 1);
      f.style.width = `${size}px`;
      f.style.height = `${size * (Math.random() < 0.3 ? 2 : 1)}px`;
      f.style.left = `${gsap.utils.random(0, 100, 0.1)}%`;
      el.appendChild(f);
      flakes.push(f);
      tweens.push(gsap.fromTo(f,
        { y: 0, x: 0, rotation: 0, opacity: 0 },
        {
          y: window.innerHeight * 1.1,
          x: gsap.utils.random(-60, 60),
          rotation: gsap.utils.random(-180, 180),
          opacity: 0.9,
          duration: gsap.utils.random(seconds * 0.5, seconds * 1.1),
          delay: gsap.utils.random(0, seconds * 0.5),
          ease: 'power1.in',
        }));
    }
    return () => {
      tweens.forEach((t) => t.kill());
      flakes.forEach((f) => f.remove());
    };
  }, [ms]);

  return (
    <div className="rr-eruption" aria-hidden>
      <div className="rr-eruption-dark" />
      <div className="rr-eruption-ash" ref={ash} />
      <p className="rr-eruption-line">THE ISLAND SINKS</p>
    </div>
  );
}
