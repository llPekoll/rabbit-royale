'use client';

/**
 * The run's life, as hearts.
 *
 * The bar it replaces measured a number nobody could price: 30 points, minus
 * one a dig, minus eight a bomb, plus three a carrot. Since digging is free
 * and a carrot heals nothing, the only thing that moves the bar is a bomb, and
 * a bomb is exactly one heart (ENERGY.BOMB_LOSS). So the bar is drawn as the
 * thing it now is — Zelda's row of hearts — and the rule reads itself: three
 * bombs and the run is over.
 *
 * Energy is still the number under the hood, on the server and in the socket
 * events; this only ROUNDS it into hearts. Rounding UP, so a heart is full
 * until its last point is gone: with whole-heart tuning that never matters,
 * but a stray odd value must not draw a dead heart while the run is alive.
 *
 * Pixel art at a whole multiple — the sprite is 19×16, drawn at 2× — because a
 * heart scaled by a fraction is a soft heart, and this is the one thing on the
 * strip that must read from across the room.
 *
 * LOSING ONE IS AN EVENT. The image used to swap to grey in a single frame,
 * while the blast played somewhere off to the side of the board. The heart
 * that goes now breaks (a flash, a jolt), the edges of the screen flush red
 * for half a second, and the LAST heart beats for as long as it is the last.
 */
import { useEffect, useRef, useState } from 'react';
import { useT } from '@/i18n/provider';
import { createPortal } from 'react-dom';
import { ENERGY, HEARTS } from '@config/tuning';

export interface HeartsProps {
  energy: number;
  /** How many hearts the row holds. Defaults to a run's starting set. */
  total?: number;
}

export function Hearts({ energy, total = HEARTS }: HeartsProps) {
  const t = useT();
  const full = Math.max(0, Math.min(total, Math.ceil(energy / ENERGY.BOMB_LOSS)));

  // Which heart just broke, keyed so two losses in a row are two breaks. Only
  // a DROP counts: a respawn or a golden carrot refilling the row is not hurt.
  const prev = useRef(full);
  const [broke, setBroke] = useState<{ index: number; key: number } | null>(null);
  useEffect(() => {
    if (full < prev.current) setBroke((b) => ({ index: full, key: (b?.key ?? 0) + 1 }));
    prev.current = full;
  }, [full]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div
      className="rr-hearts"
      role="meter"
      aria-valuenow={full}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-label={t.run.hearts(full, total)}
      title={t.run.heartsShort(full, total)}
    >
      {Array.from({ length: total }, (_, i) => (
        <img
          key={broke?.index === i ? `broke-${broke.key}` : i}
          className={
            broke?.index === i ? 'rr-heart-break'
              : full === 1 && i === 0 ? 'rr-heart-last'
                : undefined
          }
          src={i < full ? '/assets/ui/heart.png' : '/assets/ui/heart-empty.png'}
          alt=""
          draggable={false}
        />
      ))}
      {/* Portalled: the HUD strip is frosted glass, and a backdrop-filter
          makes it the containing block for anything `fixed` inside it — the
          flush would have been the size of the strip, not of the screen. */}
      {mounted && broke && createPortal(<div key={broke.key} className="rr-hurt" aria-hidden />, document.body)}
    </div>
  );
}
