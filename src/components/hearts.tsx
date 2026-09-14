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
 */
import { ENERGY, HEARTS } from '@config/tuning';

export interface HeartsProps {
  energy: number;
  /** How many hearts the row holds. Defaults to a run's starting set. */
  total?: number;
}

export function Hearts({ energy, total = HEARTS }: HeartsProps) {
  const full = Math.max(0, Math.min(total, Math.ceil(energy / ENERGY.BOMB_LOSS)));
  return (
    <div
      className="rr-hearts"
      role="meter"
      aria-valuenow={full}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-label={`${full} of ${total} hearts`}
      title={`${full} / ${total} hearts`}
    >
      {Array.from({ length: total }, (_, i) => (
        <img
          key={i}
          src={i < full ? '/assets/ui/heart.png' : '/assets/ui/heart-empty.png'}
          alt=""
          draggable={false}
        />
      ))}
    </div>
  );
}
