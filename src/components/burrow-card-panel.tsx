'use client';

/**
 * THE BURROW CARD — your house, what it makes, and what a raid cannot take.
 *
 * WHAT IT REPLACES, AND WHY. The card here used to read "DIG DEEPER - LVL 5"
 * over a price. That named an ACTION (digging) for a thing that is not an
 * action: the level is a PLACE — the house standing on your island, which the
 * player can see from this very screen. A card whose heading describes a verb
 * the game does not have, beside a picture of a building it does not show, is
 * the upgrade's least legible surface. So the card is now the building: its
 * art, its level, what that level produces, and what it keeps safe.
 *
 * THE ART IS THE BOARD'S ART. `burrowBuildingArt` is the same ladder the scene
 * draws from (`game/burrow/buildings.ts`), so the hut on the card is the hut on
 * the island, and an upgrade changes both at once. Copying a sprite path here
 * would have let the two drift the first time the ladder was retuned.
 *
 * THE SAFE FIGURE IS A FLOOR, NOT A FEATURE. There is no warehouse in the game
 * yet. What there IS is a loot rule that already takes only a fraction of a
 * stock under a hard cap, so a guaranteed remainder exists whether or not
 * anything is built to hold it — `safeStock` computes it from the raid
 * resolver's own formula, worst case, crown included. This card makes that
 * visible. When a real vault arrives, this line is where it lands.
 */
import type { CSSProperties } from 'react';
import { PxButton, pxLabel } from './px';
import {
  HubCard, HubRow, RIM, headingText, valueText, subText, SUB_CLASS, groupDigits,
} from './hub-card';
import { burrowBuildingArt } from '@/game/burrow/buildings';
import { safeStock } from '@/lib/game/raid';

export interface BurrowPanelProps {
  /** The burrow's level — picks the building, and names the card. */
  level: number;
  /** Carrots banked. The part of them that is safe is derived, not passed. */
  stock: number;
  /** What the garden makes per hour at this level. */
  yieldPerHour: number;
  /** Price of the next level, or null at the top of the ladder. */
  upgradeCost: number | null;
  canUpgrade: boolean;
  onUpgrade?(): void;
  /** A request is in flight; the button must not be pressed twice. */
  pending?: boolean;
}

/* ── Sampled from the reference ────────────────────────────────────────── */
const BTN = '#e4762b';
const BTN_LIP = '#ffd6ae';
const BTN_SHADOW = '#9a4810';
const BTN_OFF = '#5a3320';
const BTN_OFF_SHADOW = '#2f1a10';
const BTN_OFF_INK = '#9a8270';
/** The safe line's own ground — a strongbox, darker than the card's face. */
const VAULT = '#43261a';
/** Safe carrots read in the game's lamplight, not in the warning red. */
const SAFE_INK = '#ffd138';

const CARROT_MARK = '/assets/misc/carrote_silouhette.png';

export function BurrowPanel({
  level, stock, yieldPerHour, upgradeCost, canUpgrade, onUpgrade, pending,
}: BurrowPanelProps) {
  const art = burrowBuildingArt(level);
  const maxed = upgradeCost === null;
  const safe = safeStock(stock);

  return (
    /* 18svh — the tallest card, and the extra is earned rather than
       decorative: this one has a THIRD row the garden does not, the SAFE
       strip. Two smaller values were tried and both CLIPPED TEXT, which is
       worse than a card a few pixels taller than the mock's: at 14.5 the
       contents summed to 118px inside a 107px box (the button lost its
       bottom edge at every size, desktop included), and at 16.5 the heading
       lost its top row on the Seeker. */
    <HubCard
      ratio={18}
      art={art.url}
      // The buildings are tall sprites (128x192, the castle 320x256) where the
      // bolt and the plant are small marks. Height is capped well under theirs
      // so the house sits in the card's margin at the same weight as the other
      // two, rather than becoming the card.
      artHeight="62cqh"
      artAlign="start"
      // A plinth plus a face, so a press sinks the slab into its own base —
      // see `.rr-slab-btn` in globals.css and the garden card's twin.
      footer={
        <PxButton
          type="button"
          className="rr-hub-btn"
          onClick={onUpgrade}
          disabled={!canUpgrade || pending}
          color={canUpgrade && !pending ? BTN : BTN_OFF}
          shadowColor={canUpgrade && !pending ? BTN_SHADOW : BTN_OFF_SHADOW}
          textColor={canUpgrade && !pending ? '#ffffff' : BTN_OFF_INK}
          wiggle
          style={{ height: '34cqh', minHeight: 32, flexShrink: 0, width: '100%' }}
        >
          <span style={{ ...pxLabel, fontSize: 'clamp(9px, 15cqh, 15px)' }}>{maxed ? 'MAX LEVEL' : 'UPGRADE'}</span>
        </PxButton>
      }
    >
      <HubRow>
        <span style={headingText}>BURROW - LVL {level}</span>
        {/* The PRICE, which is what the button is about. At the top of the
            ladder there is no price, and printing a dash there would be a
            blank where a number used to be — the button says MAX instead. */}
        {!maxed && (
          <span style={valueText}>
            {upgradeCost}
            <img className="pixelated" src={CARROT_MARK} alt="" aria-hidden style={carrotMark} />
          </span>
        )}
      </HubRow>

      <p className={SUB_CLASS} style={subText}>{yieldPerHour} carrots/hour</p>

      {/* The vault strip: what a raid cannot reach. Given its own ground
          rather than set as another line of fine print, because it is the one
          number on this card that is about KEEPING things. */}
      {/* The floor AND what stands above it: "safe 1 200" alone said what a
          raid cannot take and left the player to work out what it can. */}
      <div className="rr-hub-strip" style={vaultStrip}>
        <span style={vaultLabel}>
          {stock - safe > 0 ? <><span style={{ color: '#ff8a7a' }}>{groupDigits(stock - safe)} EXPOSED</span> &middot; SAFE</> : 'SAFE'}
        </span>
        <span style={vaultValue}>
          {groupDigits(safe)}
          <img className="pixelated" src={CARROT_MARK} alt="" aria-hidden style={carrotMark} />
        </span>
      </div>
    </HubCard>
  );
}

const carrotMark: CSSProperties = {
  // Tied to the card like the type beside it, so a 49px card does not carry a
  // mark drawn for a 95px one.
  width: 'clamp(7px, 12cqh, 12px)',
  height: 'auto',
  display: 'block',
};

/**
 * The safe line, in a sunken strip.
 *
 * Same trough colour and rim as the energy bar's channel: both are things the
 * card HOLDS rather than things it says, and giving them one treatment is what
 * keeps the column reading as one machine.
 */
const vaultStrip: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  paddingInline: 8,
  // A hair under a quarter of the card, with a floor that keeps its two labels
  // on one line.
  height: '22cqh',
  minHeight: 18,
  flexShrink: 0,
  borderRadius: 6,
  border: `2px solid ${RIM}`,
  background: VAULT,
  boxSizing: 'border-box',
};

const vaultLabel: CSSProperties = {
  fontFamily: 'var(--font-pixel), ui-monospace, monospace',
  fontSize: 'clamp(7px, 10cqh, 11px)',
  letterSpacing: '0.08em',
  color: '#b39877',
  lineHeight: 1,
};

const vaultValue: CSSProperties = {
  fontFamily: 'var(--font-pixel), ui-monospace, monospace',
  fontSize: 'clamp(8px, 11cqh, 12px)',
  fontVariantNumeric: 'tabular-nums',
  color: SAFE_INK,
  lineHeight: 1,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
};

/** The face — see `harvestFace` in garden-card.tsx, which it mirrors. */
const upgradeFace: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  height: 'calc(100% - 3px)',
  /* Pinned to the TOP of the plinth — see the note in farm-button.tsx. */
  position: 'absolute',
  top: 0,
  left: 0,
  borderRadius: 8,
  fontFamily: 'var(--font-pixel), ui-monospace, monospace',
  fontSize: 'clamp(9px, 15cqh, 15px)',
  letterSpacing: '0.08em',
  transition: 'transform 90ms ease-out',
};

/** The plinth. The same slab as HARVEST — see garden-card.tsx for sizing. */
const upgradeButton: CSSProperties = {
  /* 34cqh, not the garden's 50: this card carries a SAFE strip the garden does
     not, and the three rows (heading, strip, button) have to share the same
     height. The floor is the same 32px — below that the label stops fitting. */
  height: '34cqh',
  minHeight: 32,
  flexShrink: 0,
  width: '100%',
  border: 'none',
  borderRadius: 8,
  lineHeight: 1,
  // No implicit line padding: the height above is the whole of it.
  padding: 0,
  /* The face is absolutely positioned against this box, and clipped by it —
     without both, `calc(100% - 3px)` resolved against the CARD instead and the
     face came out 310px tall inside a 24px button. */
  position: 'relative',
  overflow: 'hidden',
  /* NO bottom margin. The slab's cast shadow used to hang below the button on
     a 3-4px margin, and that margin is the one length in the card that does
     not scale with it — a constant inside a box whose every other part is a
     `cqh` share. It was the last few pixels of overflow at every viewport, and
     raising the card's height never fixed it because the contents grew too.
     The shadow is drawn INSIDE the button's box instead (an inset bottom
     border plus a box-shadow that does not extend the layout box), so the
     button occupies exactly the height it is given. */
};
