'use client';

/**
 * THE GAME'S PIXEL CHROME — every panel and every button, cut from the codex.
 *
 * The codex ("THE CURSED CROWN") is the one surface built on the arcade kit:
 * a nine-slice pixel frame with a pale top-left light and a dark outline, and
 * the kit's bevelled pixel button. Everything else was a smooth rounded slab
 * with a thin rim, so the burrow read as a web page wearing a game. Paul's
 * call: every panel, nested panels included, and every button take the
 * codex's construction — each keeping the COLOUR it has today, so a carrot
 * button stays carrot and a soil card stays soil.
 *
 * `PxPanel` and `PxButton` are the only two ways in, so the look is decided
 * here once: the pixel size, and the juice on a press.
 */
import {
  forwardRef,
  useCallback,
  useRef,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { NineSliceButton, NineSlicePanel, type NineSliceButtonProps } from '@domin8/arcade-kit';

/**
 * ONE SOURCE PIXEL OF CHROME, EVERYWHERE: 2 CSS px.
 *
 * The frame and the bevel are drawn in source pixels, so their thickness is
 * whatever each surface asks for — and the rollout ended up with three
 * answers: 2-3px on the cards and buttons (a clamp on viewport height), 4px on
 * the dialogs, 5 in the codex. Side by side that reads as three different
 * materials rather than one game: a thicker line on a bigger panel looks like
 * a different border, not a bigger panel. Paul's call is one line at every
 * size, on every screen, and the number is 2 — which is also what the kit's
 * own [X] is baked at, so it matches without being told.
 *
 * Fixed, not responsive: a stroke that thins on a short screen is the same
 * inconsistency measured a different way.
 */
export const PX = '2px';

export interface PxPanelProps {
  /** The panel's fill — the colour it had before it wore the frame. */
  color: string;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/** A panel in the codex's frame, in its own colour. */
export const PxPanel = forwardRef<HTMLDivElement, PxPanelProps>(function PxPanel(
  { color, children, className, style },
  ref,
) {
  return (
    <NineSlicePanel ref={ref} color={color} pixelScale={PX} className={className} style={style}>
      {children}
    </NineSlicePanel>
  );
});

/**
 * Everything the kit's button takes (`pressed` for a toggle, `highlightColor`
 * for the gloss, `height`, `labelPixel`…), with the face colour REQUIRED —
 * every PxButton keeps the colour its button had — and a wiggle on top.
 */
export interface PxButtonProps extends Omit<NineSliceButtonProps, 'color'> {
  /** The face — the colour the button had before. */
  color: string;
  /**
   * A little shake after the press, for the loud actions (claim, harvest,
   * upgrade, buy). Not for every button: a toolbar that wiggles on every tap
   * is noise, and a wiggle is worth something because it is rare.
   */
  wiggle?: boolean;
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined'
    && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * A button in the codex's pixel bevel, in its own colour, with juice.
 *
 * Children that are not a plain string are rendered as given, so a label can
 * keep the game's web pixel face (and its emoji) instead of the kit's bitmap
 * font, which has no glyph for a carrot.
 */
export const PxButton = forwardRef<HTMLButtonElement, PxButtonProps>(function PxButton(
  { color, shadowColor, textColor = '#ffffff', wiggle = false, pixelScale = PX, className, onClick, ...rest },
  ref,
) {
  const local = useRef<HTMLButtonElement | null>(null);
  const setRef = useCallback((el: HTMLButtonElement | null) => {
    local.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  }, [ref]);

  const handleClick = useCallback((e: MouseEvent<HTMLButtonElement>) => {
    // After the press, not during it: the squash is the press (CSS, on
    // :active), the wiggle is the answer. Web Animations so a second press
    // replays it.
    if (wiggle && local.current && !reducedMotion()) {
      local.current.animate(
        [
          { transform: 'rotate(0deg) scale(1)' },
          { transform: 'rotate(-5deg) scale(1.08)' },
          { transform: 'rotate(4deg) scale(1.05)' },
          { transform: 'rotate(-2deg) scale(1.02)' },
          { transform: 'rotate(0deg) scale(1)' },
        ],
        { duration: 420, easing: 'ease-out' },
      );
    }
    onClick?.(e);
  }, [wiggle, onClick]);

  return (
    <NineSliceButton
      ref={setRef}
      color={color}
      shadowColor={shadowColor}
      textColor={textColor}
      pixelScale={pixelScale}
      className={`rr-px-btn${className ? ` ${className}` : ''}`}
      onClick={handleClick}
      {...rest}
    />
  );
});

/** The label inside a PxButton: the game's pixel web face, sized with its card. */
export const pxLabel: CSSProperties = {
  fontFamily: 'var(--font-pixel), ui-monospace, monospace',
  letterSpacing: '0.08em',
  lineHeight: 1,
  whiteSpace: 'nowrap',
};
