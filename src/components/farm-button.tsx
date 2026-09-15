'use client';

/**
 * GO FARM — the one action on the burrow screen.
 *
 * WHAT IT REPLACES. `GoButton` is a text label beside the arcade-kit's pixel
 * arrow, travelling on a loop to say "press me". The mock replaces the arrow
 * with a CARROT and the bare label with a solid orange slab: the button is the
 * only saturated shape on the screen, which is what makes it findable without
 * needing to move.
 *
 * WHY THE ARROW GOES. It was doing two jobs — pointing at the action and
 * asking to be pressed — and the mock's slab does the second better than an
 * animation can. The first job was never really needed: "GO FARM" already says
 * where the button leads, and the arrow pointed DOWN at a screen that is not
 * below anything.
 *
 * IT IS ALSO THE BACK BUTTON. `tone="back"` drops the carrot and takes the
 * soil palette, for the way out of placement — see `tone` on the props. The
 * slab's geometry is the thing worth sharing; the sprite and the hexes are all
 * that ever differed.
 *
 * WHAT IT KEEPS. `away`, which slides the button off the bottom during
 * placement. That is not decoration: the camera pulls back at the same moment,
 * and a control that blinks out mid-pull reads as a glitch in a move that is
 * otherwise continuous. Inert on the way out, so a button sliding off the
 * screen cannot be focused or announced.
 */
import type { CSSProperties } from 'react';
import { CARROT_URL, CARROT_SIZE } from '@domin8/arcade-kit/game';

export interface FarmButtonProps {
  label: string;
  onClick(): void;
  disabled?: boolean;
  /** Send the button off the bottom of the screen — see the header. */
  away?: boolean;
  /**
   * Drop the carrot and wear the second palette — the BACK button.
   *
   * One component rather than two, because the slab IS the shape: 22% of the
   * width, the plinth, the face that sinks 4px, the centring, the slide. A
   * copy would be that whole geometry written twice, and the two would part
   * company the first time either was retuned. What actually differs between
   * GO FARM and BACK is a sprite and five hexes.
   */
  tone?: 'carrot' | 'back';
}

/* ── Sampled from the reference ────────────────────────────────────────── */
const FACE = '#ed7b23';
const FACE_LIT = '#f4913f';
/** The lit bottom edge, where the light catches the slab. */
const LIP = '#ffc48c';
/** The shadow under it, which is what gives the button its thickness. */
const SHADOW = '#652f09';
const OFF = '#6b4a33';
const OFF_SHADOW = '#33210f';
const OFF_INK = '#a99483';

/**
 * BACK's palette: the burrow's own soil, not a second saturated slab.
 *
 * Deliberately quieter than the carrot. GO FARM is orange because it is the
 * one thing to do on a screen full of readouts, and the mock's whole argument
 * is that the saturated shape is the findable one. BACK is the way OUT of a
 * mode the player chose on purpose — they know it is there, and lighting it
 * as loudly as GO FARM would put two "press me" slabs on one floor and make
 * neither of them mean anything. Sampled off `burrow-chrome`'s PLANK and SOIL,
 * so it belongs to the same earth as the panels it sits under.
 */
const BACK_FACE = '#5a3a24';
const BACK_FACE_LIT = '#6d4830';
const BACK_LIP = '#8a5f3d';
const BACK_SHADOW = '#2a1810';

export function FarmButton({
  label, onClick, disabled, away, tone = 'carrot',
}: FarmButtonProps) {
  const live = !disabled;
  const back = tone === 'back';
  const lip = back ? BACK_LIP : LIP;
  const faceTop = back ? BACK_FACE_LIT : FACE_LIT;
  const faceBottom = back ? BACK_FACE : FACE;
  const faceShadow = back ? BACK_SHADOW : SHADOW;
  /* The carrot is 81% of the button's height in the mock (65px of 80), not the
     37% the first cut used — it is half of what makes this button findable,
     and a small one beside a large label read as a bullet point. Width follows
     the sprite's own aspect so it is never squashed; the mock's own carrot is
     a wide reclining drawing where the game's is tall and narrow, and the
     GAME's shape is the one that wins (this is the carrot the player digs). */
  const carrotH = 44;
  const carrotW = Math.round((CARROT_SIZE.width / CARROT_SIZE.height) * carrotH);

  return (
    <button
      type="button"
      className="rr-farm-btn"
      onClick={onClick}
      disabled={disabled}
      aria-hidden={away || undefined}
      // `inert` keeps a button that has slid away off the tab order entirely.
      {...(away ? { inert: '' as unknown as boolean } : {})}
      style={{
        ...button,
        // The PLINTH: the salmon band the face sinks into. It is the button's
        // own background and it never moves — that is the whole trick.
        background: live ? lip : OFF_SHADOW,
        /* Travels with the camera's pull-back rather than blinking out.
           The X half is the CENTRING (globals.css pins this button to the
           middle of the floor): a bare `translateY` here would replace that
           transform outright and snap the button to the left edge mid-slide. */
        transform: away
          ? 'translateX(-50%) translateY(160%)'
          : 'translateX(-50%) translateY(0)',
        opacity: away ? 0 : 1,
      }}
    >
      {/* THE FACE, which is the part that moves.
          
          A pressed button used to be `translateY(1px)` on the whole element —
          band, shadow and all — which slides the object down the screen rather
          than pushing it into anything. Here the plinth above stays put and
          only this sinks, so the salmon lip is swallowed and reappears. That
          is what reads as depth: something has to stay still for something
          else to move against it. */}
      <span
        className="rr-farm-face"
        style={{
          ...face,
          background: live
            ? `linear-gradient(180deg, ${faceTop} 0%, ${faceBottom} 100%)`
            : OFF,
          color: live ? '#ffffff' : OFF_INK,
          boxShadow: `inset 0 -3px 0 ${live ? faceShadow : OFF_SHADOW}`,
        }}
      >
        {/* Turned 45° clockwise, matching the carrot in the count above — the
            two are the same object and should be held the same way.
            BACK carries no sprite: the carrot means "go and dig", and putting
            it on the button that ENDS a job would be one picture saying two
            opposite things. The label is the whole content there. */}
        {!back && (
          <img
            className="rr-carrot-px"
            src={CARROT_URL}
            alt=""
            aria-hidden
            draggable={false}
            width={carrotW}
            height={carrotH}
            style={{ display: 'block', flexShrink: 0, transform: 'rotate(45deg)' }}
          />
        )}
        <span style={labelText}>{label}</span>
      </span>
    </button>
  );
}

/**
 * 296x80 in the mock, at a 1376-wide window — but stated in viewport units for
 * the same reason the cards are: the Seeker is 890x400, and a button fixed at
 * 80px tall would be a fifth of that screen.
 */
const button: CSSProperties = {
  display: 'block',
  // The plinth shows only along the bottom: the face covers the rest of it.
  padding: 0,
  /* 22% of the width, which is the share the mock holds (296px of 1376) — not
     a flat 296px. The fixed value was right at the window the mock was drawn
     for and wrong everywhere else: on the Seeker's 560px playfield it came to
     53%, which left no floor for the launcher row and the mute beside it. The
     floor keeps the label readable on a narrow phone. */
  width: 'max(22vw, 150px)',
  height: 'clamp(44px, 10.4svh, 80px)',
  /* NO `position` here. The stylesheet pins this button to the floor with
     `position: fixed` (`.rr-farm-btn`), and an inline `relative` beats that
     outright — the button jumped back into the column's flow and took the
     whole layout with it. `fixed` is itself a positioning context, so the
     face inside still has something to be absolute against. */
  boxSizing: 'border-box',
  border: 'none',
  borderRadius: 14,
  overflow: 'hidden',
  pointerEvents: 'auto',
  // The slide is the only thing that eases: the press itself is instant.
  transition: 'transform 320ms cubic-bezier(0.4, 0, 0.2, 1), opacity 240ms linear',
};

/**
 * The face: everything the player sees except the band at the foot.
 *
 * 4px shorter than the button, sitting at the top — that 4px gap IS the
 * salmon plinth. On press it drops by exactly that much and the plinth
 * disappears under it, which is what a real button does.
 */
const face: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 12,
  width: '100%',
  height: 'calc(100% - 4px)',
  /* Pinned to the TOP of the plinth, so the band shows only along the bottom
     — a slab resting on a base. Left to centre itself (a button's contents
     are centred by default) the face floated with 2px above AND below, which
     draws a frame rather than a foot. */
  position: 'absolute',
  top: 0,
  left: 0,
  padding: '0 18px',
  boxSizing: 'border-box',
  borderRadius: 14,
  // Short and hard: a press is an event, not a transition. 90ms is about as
  // long as a tap feels before the delay becomes the thing you notice.
  transition: 'transform 90ms ease-out',
};

const labelText: CSSProperties = {
  fontFamily: 'var(--font-pixel), ui-monospace, monospace',
  fontSize: 'clamp(13px, 3.4svh, 22px)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  lineHeight: 1,
  whiteSpace: 'nowrap',
};
