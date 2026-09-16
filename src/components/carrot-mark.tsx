'use client';

/**
 * THE CARROT AS A UNIT — the small mark beside a carrot figure.
 *
 * The game's own carrot sprite, in colour, lying at 45° as the pill's big one
 * does. It replaces `carrote_silouhette.png`, a black-and-white silhouette the
 * burrow cards set beside their prices: at 9px it read as a white pencil, and
 * a carrot that is sometimes orange and sometimes not is two different units
 * (Paul, 2026-09-16: the carrot stays in colour at every size).
 *
 * `size` is the side of the square the mark takes in its line — any CSS
 * length, so a card can pass its `cardSize()`. The sprite is drawn taller than
 * that box and rotated into it, which is why the box clips nothing: the
 * diagonal of a 13x29 carrot turned 45° fits a square about 1.4x shorter.
 */
import type { CSSProperties } from 'react';
import { CARROT_URL, CARROT_SIZE } from '@domin8/arcade-kit/game';

export function CarrotMark({ size, style }: { size: number | string; style?: CSSProperties }) {
  const side = typeof size === 'number' ? `${size}px` : size;
  return (
    <span aria-hidden style={{ ...box, width: side, height: side, ...style }}>
      <img
        className="rr-carrot-px"
        src={CARROT_URL}
        alt=""
        draggable={false}
        style={{
          height: `calc(${side} * 1.4)`,
          width: 'auto',
          aspectRatio: `${CARROT_SIZE.width} / ${CARROT_SIZE.height}`,
        }}
      />
    </span>
  );
}

const box: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  lineHeight: 0,
  transform: 'rotate(45deg)',
};
