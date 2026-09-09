'use client';

/**
 * The one action on each screen: down to the island, back up to the burrow.
 *
 * Uses the arcade-kit's own pixel arrow — the same sprite that flanks the hub's
 * cabinet carousel — rather than a text glyph, so this button belongs to the
 * same arcade as everything else the player has already used. The arrow travels
 * along its own axis on a loop: it is the only thing on the screen asking to be
 * pressed, and a still arrow does not ask.
 *
 * The label is the kit's pixel face, so the chrome and the game are drawn in
 * the same alphabet.
 */
import { ARROW_URLS, ARROW_SIZE, type ArrowDir } from '@domin8/arcade-kit';

export interface GoButtonProps {
  dir: Extract<ArrowDir, 'up' | 'down'>;
  label: string;
  onClick(): void;
  disabled?: boolean;
}

/** Integer multiple of the sprite's native size, so the pixels stay square. */
const SCALE = 2;

export function GoButton({ dir, label, onClick, disabled }: GoButtonProps) {
  // The pixel face is loaded once app-wide by <PixelFont/> and reaches this
  // button through the stylesheet — no per-component font loading.
  const size = ARROW_SIZE[dir];
  return (
    <button className={`rr-go rr-go-${dir}`} onClick={onClick} disabled={disabled}>
      {/* The pair stacks and floats together on this wrapper (see
          .rr-go-inner): the arrow sits on the side it points towards — above
          the word going up, below it going down — and the whole thing drifts
          as one object, so the button reads as movement rather than as
          decoration bolted to a word. The <button> itself stays still so its
          hit area does not travel under the thumb. */}
      <span className="rr-go-inner">
        {dir === 'up' && <Arrow dir={dir} size={size} />}
        <span className="rr-go-label">{label}</span>
        {dir === 'down' && <Arrow dir={dir} size={size} />}
      </span>
    </button>
  );
}

function Arrow({ dir, size }: { dir: ArrowDir; size: { w: number; h: number } }) {
  return (
    <img
      className="rr-go-arrow"
      src={ARROW_URLS[dir]}
      alt=""
      aria-hidden
      draggable={false}
      width={size.w * SCALE}
      height={size.h * SCALE}
    />
  );
}
