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
import { useT } from '@/i18n/provider';
import { CarrotMark } from './carrot-mark';
import { PxButton, pxLabel } from './px';
import {
  HubCard, HubRow, RIM, headingText, valueText, subText, SUB_CLASS, groupDigits, cardSize,
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
/* UPGRADE — the burrow's own earth brown, sampled off Paul's mock
   (2026-09-19). The quietest of the three on purpose: spending carrots on the
   burrow is an investment, not a payout, and it should not shout louder than
   CLAIM. It was the same orange as the other two. See quest-card.tsx. */
const BTN = '#635038';
const BTN_LIP = '#92866e';
const BTN_SHADOW = '#37291c';
/* Spent, on parchment — the same warm stone the garden's HARVEST wears, and
   for the same reason: the old near-black slab plus the global
   `button:disabled { opacity: 0.5 }` washed out to an illegible grey on the
   vine banner's cream board. See garden-card.tsx. */
const BTN_OFF = '#b9a288';
const BTN_OFF_SHADOW = '#8a745c';
const BTN_OFF_INK = '#4a3524';
/** The safe line's own ground — a strongbox, darker than the card's face. */
const VAULT = '#43261a';
/** Safe carrots read in the game's lamplight, not in the warning red. */
const SAFE_INK = '#ffd138';


export function BurrowPanel({
  level, stock, yieldPerHour, upgradeCost, canUpgrade, onUpgrade, pending,
}: BurrowPanelProps) {
  const t = useT();
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
      /* 23, from 18, when the vault strip took its second row (the exposed
         count under the safe figure, 2026-09-21) and the card started padding
         for the frame's rail (hub-card.tsx `paddingBlock`): the strip is a
         row taller and the parchment a rail shorter, on every screen. */
      ratio={23}
      // Frame 4 + pad 6, heading 9, strip 20, button 30, their two gaps and
      // the pad and frame again. 94 was "the least that keeps 2px of air on a
      // phone" and had stopped being it: measured on an iPhone under Safari's
      // bar (852x320) the contents centred in a 94px card and the heading's
      // top row went under the frame (Paul, 2026-09-21). 106 puts the air
      // back on both sides; the column scrolls, so the height is not a cost.
      floor={124}
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
          /* The flat face's colours (globals.css, `.rr-hub-btn.nine-btn`).
             Handed over as variables rather than baked into the stylesheet, so
             each card keeps its own tone and the SHAPE lives in one place. The
             `color`/`shadowColor` props above still feed the kit's sprite,
             which the stylesheet hides — they are what the disabled state and
             the kit's own ink still read. */
          style={{
            height: '30cqh',
            minHeight: 32,
            flexShrink: 0,
            width: '100%',
            '--rr-btn-face': canUpgrade && !pending ? BTN : BTN_OFF,
            '--rr-btn-lip': canUpgrade && !pending ? BTN_LIP : BTN_OFF_SHADOW,
            '--rr-btn-shadow': canUpgrade && !pending ? BTN_SHADOW : BTN_OFF_SHADOW,
            '--rr-btn-line': canUpgrade && !pending ? BTN_SHADOW : BTN_OFF_SHADOW,
            '--rr-btn-ink': canUpgrade && !pending ? '#ffffff' : BTN_OFF_INK,
          } as CSSProperties}
        >
          <span style={{ ...pxLabel, fontSize: cardSize(15, 9, 15) }}>{maxed ? t.burrow.maxLevel : t.burrow.upgrade}</span>
        </PxButton>
      }
    >
      <HubRow>
        <span style={headingText}>{t.burrow.level(level)}</span>
        {/* The PRICE, which is what the button is about. At the top of the
            ladder there is no price, and printing a dash there would be a
            blank where a number used to be — the button says MAX instead. */}
        {!maxed && (
          <span style={valueText}>
            {upgradeCost}
            <CarrotMark size={CARROT_MARK_SIZE} />
          </span>
        )}
      </HubRow>

      <p className={SUB_CLASS} style={subText}>{yieldPerHour} carrots/hour</p>

      {/* The vault strip: what a raid cannot reach. Given its own ground
          rather than set as another line of fine print, because it is the one
          number on this card that is about KEEPING things. */}
      {/* The floor AND what stands above it: "safe 1 200" alone said what a
          raid cannot take and left the player to work out what it can. */}
      {/* TWO ROWS, NOT ONE SENTENCE. It read "121 EXPOSED · SAFE ..... 989"
          on one line, and the text column beside the hut is ~105px on a
          phone: the label broke into three lines and spilled over the
          strip's rim (Paul, 2026-09-21). What is safe is the strip's own
          figure and takes the row; what is out is a warning under it, in
          the alarm red, and only there when something is. Each piece is
          `nowrap`, so it fits or it does not — it never half-fits. */}
      <div className="rr-hub-strip" style={vaultStrip}>
        <span style={vaultRow}>
          <span style={vaultLabel}>{t.burrow.safe}</span>
          <span style={vaultValue}>
            {groupDigits(safe)}
            <CarrotMark size={CARROT_MARK_SIZE} />
          </span>
        </span>
        {stock - safe > 0 && (
          <span style={vaultExposed}>{t.burrow.exposed(groupDigits(stock - safe))}</span>
        )}
      </div>
    </HubCard>
  );
}

/** The carrot beside a figure: the game's own, in colour (`CarrotMark`). */
const CARROT_MARK_SIZE = cardSize(12, 7, 12);

/**
 * The safe line, in a sunken strip.
 *
 * Same trough colour and rim as the energy bar's channel: both are things the
 * card HOLDS rather than things it says, and giving them one treatment is what
 * keeps the column reading as one machine.
 */
const vaultStrip: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  /* The row-to-warning gap: 2px is what two 7-8px lines can spare inside a
     strip that must stay under a quarter of the card. */
  gap: 2,
  /* The tight pad at the sides — the token set names this case exactly. A
     hair of block padding so the warning's second row keeps off the rim: the
     strip's height is a FLOOR now (`minHeight`), not a fixed share, so the
     padding adds to the content instead of fighting the height. One row at
     7-8px plus this still sits inside the floor; two rows meet it exactly. */
  padding: '3px var(--rr-pad-tight)',
  // A hair under a quarter of the card, with a floor that keeps the row legible.
  minHeight: 'max(22cqh, 18px)',
  flexShrink: 0,
  borderRadius: 6,
  border: `2px solid ${RIM}`,
  background: VAULT,
  boxSizing: 'border-box',
};

/** The strip's first row: the label at the left, the safe figure at the right. */
const vaultRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--rr-pad-tight)',
};

const vaultLabel: CSSProperties = {
  fontFamily: 'var(--font-pixel), ui-monospace, monospace',
  fontSize: cardSize(10, 7, 11),
  letterSpacing: '0.08em',
  color: '#b39877',
  lineHeight: 1,
  whiteSpace: 'nowrap',
};

/** What a raid can reach: the label's type in the alarm red, on its own row. */
const vaultExposed: CSSProperties = {
  ...vaultLabel,
  color: '#ff8a7a',
};

const vaultValue: CSSProperties = {
  fontFamily: 'var(--font-pixel), ui-monospace, monospace',
  fontSize: cardSize(11, 8, 12),
  fontVariantNumeric: 'tabular-nums',
  color: SAFE_INK,
  lineHeight: 1,
  whiteSpace: 'nowrap',
  display: 'inline-flex',
  alignItems: 'center',
  // The carrot mark's gap to its figure — the same one `valueText` uses in the
  // heading above, so the two carrot marks on this card sit alike.
  gap: 'var(--rr-pad-tight)',
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
  fontSize: cardSize(15, 9, 15),
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
