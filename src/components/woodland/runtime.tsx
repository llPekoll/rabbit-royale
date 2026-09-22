'use client';

import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes } from 'react';
import './woodland.css';

export type SurfaceKind = 'parchment' | 'wood' | 'well' | 'badge' | 'track' | 'notice' | 'caption';
export interface WoodlandSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  color?: string;
  pixelScale?: string;
  scale?: number;
  variant?: string;
  surface?: SurfaceKind;
}

/** Keep existing layout/ARIA contracts while replacing the old kit renderer. */
export const WoodlandSurface = forwardRef<HTMLDivElement, WoodlandSurfaceProps>(function WoodlandSurface(
  { color, pixelScale: _pixelScale, scale: _scale, variant: _variant, surface, className = '', style, children, ...rest }, ref,
) {
  const kind = surface ?? (
    /energy-track/.test(className) ? 'track'
      : /field-box|shop-tile-face/.test(className) ? 'well'
      /* A LINE THE GAME SAYS IS A CAPTION, wherever it is said. The burrow's
         toasts and the reconnect notice used to take the painted `notice`
         plank; on a screen that already carries planks (the carrot pill, the
         trophy rings, the bomb rail) two more gold boards read as furniture
         rather than as news, and the red one shouted (Paul, 2026-09-20). The
         dark translucent pill is the island's own narration surface, and it
         stays the same on the burrow, on a dig and on a raid. */
      : /caption|toast|reconnecting/.test(className) ? 'caption'
      /* `chip` CATCHES THE SMALL COUNTERS BY NAME, because the height test
         below cannot: a chip sizes itself by `minWidth` and padding, so it
         arrives with no numeric height and falls through to `parchment` — a
         16px leaf-frame border that inflates a 9px counter past 48px. See
         `rr-hub-badge` (hub-icon-button.tsx) for what that looked like. */
      : /chip|hub-badge/.test(className) || (typeof style?.height === 'number' && style.height <= 30) ? 'badge'
      : /hud-plate|raid-hud|go-label|haul-plate|px-note|guest-note|shop-foot|energy-state|lb-me-frame|raid-row/.test(className) ? 'wood'
      : 'parchment'
  );
  const danger = /refused/.test(className) || color === 'rgba(40, 14, 14, 0.9)';
  return <div {...rest} ref={ref} className={`wl-runtime-surface wl-runtime-${kind}${danger ? ' wl-runtime-danger' : ''} ${className}`} style={style}>{children}</div>;
});

export interface WoodlandActionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  color?: string; shadowColor?: string; textColor?: string; highlightColor?: string;
  pixelScale?: string; scale?: number; pressed?: boolean; height?: string; labelPixel?: string;
  skin?: 'wood' | 'gold' | 'green' | 'danger' | 'slot' | 'tab';
}

export const WoodlandAction = forwardRef<HTMLButtonElement, WoodlandActionProps>(function WoodlandAction(
  { color, shadowColor: _shadowColor, textColor: _textColor, highlightColor: _highlightColor,
    pixelScale: _pixelScale, scale: _scale, pressed, height, labelPixel: _labelPixel,
    skin, className = '', style, children, ...rest }, ref,
) {
  const kind = skin ?? (
    /item-slot|avatar-pick/.test(className) ? 'slot'
      : rest.role === 'tab' || /shop-rail/.test(className) ? 'tab'
      // MARK A BOMB takes the RED plank, armed or not. It is the one control
      // on the board that places a bet, and the wood plank made it read like
      // HOME — one more of the run's furniture. Paul, 2026-09-20: "pour ca
      // utilise la rouge".
      : /rr-mark-btn/.test(className) ? 'danger'
      // THE DOORSTEP'S FRONT DOOR TAKES THE GOLD BOARD. It is the first and
      // most important button in the game, and on the wood plank it was the
      // same brown as the guest door under it -- two identical slabs, neither
      // saying which one to press. The `color` prop cannot say this: this
      // component ignores the pixel-bevel colours entirely (see the discarded
      // `color`/`shadowColor` above), so a gold passed there paints nothing.
      : /rr-play/.test(className) ? 'gold'
      : /hub-btn/.test(className) ? (/garden|harvest/.test(className) || color === '#87bd3a' ? 'green' : 'gold')
      : 'wood'
  );
  return <button type="button" {...rest} ref={ref}
    data-pressed={pressed || rest['aria-pressed'] === true || undefined}
    className={`wl-runtime-action wl-runtime-action-${kind} rr-px-btn ${className}`}
    style={{ ...(height ? { height } : {}), ...style }}>
    <span className="nine-btn__content wl-runtime-content">{children}</span>
  </button>;
});

/**
 * The [x]. It rides the panel's TOP-RIGHT CORNER, hanging off the frame —
 * `.wl-runtime-close` in runtime.css places it, so a dialog does not restate
 * the offsets and they stay the same on all of them. `inline` opts out, for
 * the rare [x] that really is a cell in a header row.
 *
 * It used to pin itself here with an inline `top: 12; right: 14`, which no
 * stylesheet could reach: every panel that wanted the corner had to pass its
 * own `style`, and they drifted. The position lives in CSS now.
 */
export function WoodlandClose({ inline = false, className = '', style, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { inline?: boolean }) {
  return <button type="button" aria-label="Close" {...rest}
    className={`wl-runtime-close${inline ? ' wl-runtime-close-inline' : ''} ${className}`}
    style={style} />;
}
