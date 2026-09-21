'use client';

/**
 * THE STALL — the shop's cards, its sign and its rails.
 *
 * WHERE IT COMES FROM. Paul's reference (2026-09-21): a row of tall cards
 * under a hanging SHOP sign. Each card is ONE object — a name on a board, a
 * big drawing, one price, one BUY — and the purse sits in the corner of the
 * screen. It replaced a shelf of text: two prices per tile, a blurb, a count,
 * a rail chooser and a strapline, with the art the size of a thumbnail. It
 * was mocked in a story first (the same day) and the composition held; what
 * the mockup also showed is that the item art is not yet drawn for this size,
 * which is a sprite job and not a layout one.
 *
 * ONE PRICE PER CARD, AND ONE RAIL FOR THE WHOLE STALL. The GDD's rule is
 * that carrots and money weigh the same. They weigh the same at the level of
 * the shop rather than the tile: the rails in the head row — carrots, then
 * every token the deployment takes — re-price every card in one tap, and the
 * card's single button pays in whichever is up. A guest, or a deployment with
 * no treasury, sees no money rails at all and the stall is carrots only.
 *
 * THE CARD'S BODY IS DARK ON PURPOSE. The kit's panel is parchment, and on
 * the parchment frame that was the same colour twice (Paul: "ça fait blanc
 * sur blanc"). The reference gets its punch from a bright drawing in a dark
 * well, so the body is soil in the item's own tint, rounded like every painted
 * frame in the kit ("les bords carrés c'est pas ouf").
 */
import type { CSSProperties, ReactNode } from 'react';
import { PLANK_URL, PLANK_SIZE } from './plank';
import { LeafBadge } from './leaf-badge';
import { PxButton, pxLabel } from './px';
import { PanelTitle } from './pixel-text';
import { ITEM_META, heldLabel } from './item-meta';
import type { ShopItem } from './use-shop';
import { useT } from '@/i18n/provider';
import { groupDigits } from '@/i18n/format';
import { PAY_TOKENS, priceLabel, type PayTokenId } from '@/lib/pay/tokens';
import {
  CARROT_BTN, CARROT_BTN_OFF, COIN_BTN, PLANK, PLANK_LIT, SOIL, SOIL_DEEP, mixHex,
} from './shop-palette';

/* The plank's caps, in source pixels — the leaf clusters at each end. */
const PLANK_CAP = 30;

/**
 * The wood board at ANY scale. `plank.tsx` draws it at the chrome's 2x, which
 * is 90px tall: right for the pill, three times too tall for a name over a
 * 150px card. The art is a 3-slice with a fixed height, so the only knob is
 * the scale it is drawn at; 1x makes a 45px board.
 */
export function WoodSign({
  scale = 1, children, className, style,
}: { scale?: number; children?: ReactNode; className?: string; style?: CSSProperties }) {
  const cap = PLANK_CAP * scale;
  return (
    <div
      className={className}
      style={{
        borderImageSource: `url(${PLANK_URL})`,
        borderImageSlice: `0 ${PLANK_CAP} 0 ${PLANK_CAP} fill`,
        borderImageWidth: `0 ${cap}px`,
        borderImageRepeat: 'stretch',
        borderStyle: 'solid',
        borderColor: 'transparent',
        borderWidth: `0 ${cap}px`,
        height: PLANK_SIZE.height * scale,
        imageRendering: 'pixelated',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** What the stall is priced in: what you dug, or one of the wallet's tokens. */
export type StallRail = 'carrots' | PayTokenId;

/**
 * Two sizes of card, because the stall lives on two very different screens:
 * the Seeker's 400px-tall landscape, where the frame's rails already take a
 * third of the height and the cards are one sliding row, and a desktop window
 * where they wrap into two rows of four and three (shop-card.tsx). The art
 * height is the number that matters; the rest keeps the card's proportions.
 * `tall` is sized so two rows fit a 660px dialog: 2 x (172 + 40 of overhang).
 */
export const CARD_SIZES = {
  short: { width: 136, height: 168, art: 64 },
  tall: { width: 150, height: 172, art: 70 },
} as const;
export type CardSize = keyof typeof CARD_SIZES;

export interface StallCardProps {
  item: ShopItem;
  /** The rail chosen for the whole stall — this card only READS it. */
  rail: StallRail;
  /** USD per whole token on that rail, or undefined when the feed had nothing
   *  to say. `priceLabel` falls back to dollars rather than inventing a rate. */
  rate?: number;
  busy: boolean;
  size?: CardSize;
  /** Pay in carrots. */
  onBuy(): void;
  /** Pay on the money rail. Absent when there is no money rail to pay on. */
  onPayMoney?(): void;
}

/**
 * One card: name on a board hung over the top edge, the held count on a badge
 * in the corner, the art as the whole middle, and the price — which IS the
 * button — hung off the bottom edge. The overhangs are what make it read as an
 * object standing on the shelf rather than a box drawn on it.
 */
export function StallCard({
  item, rail, rate, busy, size = 'short', onBuy, onPayMoney,
}: StallCardProps) {
  const t = useT();
  const meta = ITEM_META[item.kind];
  const name = t.items[item.kind].name;
  const { width, height, art } = CARD_SIZES[size];
  const full = !item.hasRoom;
  const money = rail !== 'carrots' && !!onPayMoney;

  // Three different things to report, because three different things are being
  // sold — a count, refills left, days of cover. See `heldLabel`.
  const held = heldLabel(t, item.kind, item.held, item.cap);

  /**
   * What the carrot price means right now, in one sentence — carried as the
   * accessible name and the tooltip rather than printed on the face, so the
   * shelf stays a shelf of prices. Ordered by which refusal the player can do
   * something about: a full shelf is finished business, a short purse is a
   * reason to go and dig.
   */
  const carrotPrice = t.shop.priceLabel(groupDigits(item.price));
  const reason = full
    ? t.shop.capped(name, carrotPrice)
    : item.canBuy
      ? t.shop.buy(name, carrotPrice)
      : t.shop.tooPoor(name, carrotPrice);

  const dead = busy || (money ? full : !item.canBuy);
  const face = money ? COIN_BTN : dead ? CARROT_BTN_OFF : CARROT_BTN;
  const label = money ? priceLabel(item.usdc, rail, rate) : `${groupDigits(item.price)} 🥕`;

  return (
    <li
      className={`rr-stall-card${full ? ' full' : ''}`}
      style={{ width, height }}
    >
      <div
        className="rr-stall-body"
        style={{
          background: `linear-gradient(180deg, ${mixHex(meta.tint, SOIL, 0.35)} 0%, ${mixHex(meta.tint, SOIL_DEEP, 0.2)} 100%)`,
          border: `3px solid ${PLANK_LIT}`,
          boxShadow: `0 0 0 2px ${SOIL_DEEP}, inset 0 0 0 2px ${PLANK}, inset 0 0 28px rgba(0,0,0,0.45)`,
        }}
      >
        {/* THE ART. The whole middle of the card, nothing beside it. A
            non-integer scale on purpose: at the Seeker's DPR 3 a 1.6x sprite
            is still drawn on ~5 device pixels per source pixel, below what
            the eye picks up. The emoji is what the kinds without a sprite
            fall back to, and it shows — those kinds want a drawing. */}
        <div className="rr-stall-art" aria-hidden>
          {meta.art ? (
            <img src={meta.art} alt="" draggable={false} style={{ height: art }} />
          ) : (
            <span style={{ fontSize: art * 0.8 }}>{meta.icon}</span>
          )}
        </div>
      </div>

      {/* THE NAME, on a board hung over the top edge. */}
      <WoodSign scale={1} className="rr-stall-name" style={{ width: Math.min(width - 4, 140) }}>
        <span className="rr-stall-name-text" style={pxLabel}>{name}</span>
      </WoodSign>

      {/* THE HELD COUNT, in the corner, like the reference's 13/50. */}
      <LeafBadge height={20} className="rr-stall-held">{held}</LeafBadge>

      {/* THE ONE BUTTON: the price IS the button, as it was on the shelf, but
          there is one of it and it is where a thumb lands. */}
      <PxButton
        wiggle
        {...face}
        disabled={dead}
        onClick={money ? onPayMoney : onBuy}
        className="rr-stall-buy rr-carrot-price"
        style={{ minWidth: Math.min(width - 24, 120) }}
        /* The dollar price on hover for a money rail: the shop's prices ARE
           dollars and the rail is a conversion. The sentence for carrots. */
        title={money ? `$${item.usdc.toFixed(2)}` : reason}
        aria-label={money ? `${name} ${label}` : reason}
      >
        <span style={{ ...pxLabel, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{label}</span>
      </PxButton>
    </li>
  );
}

/**
 * The SHOP sign, hung over the frame's top rail. Positioned by the caller,
 * because only the caller knows how thick its frame is.
 */
export function StallSign({ style }: { style?: CSSProperties }) {
  const t = useT();
  return (
    <div className="rr-stall-sign" style={style}>
      <WoodSign scale={1.5} style={{ width: 200, filter: 'drop-shadow(0 4px 0 rgba(0,0,0,0.45))' }}>
        <PanelTitle>{t.shop.title}</PanelTitle>
      </WoodSign>
    </div>
  );
}

/**
 * The rails: carrots, then every token the deployment takes. One choice for
 * the whole stall — per-card rails would be seven cards times four rails on a
 * phone. Hidden entirely when there is no money route: a switch with one
 * position is furniture.
 */
export function StallRails({
  tokens, rail, onRail,
}: { tokens: readonly PayTokenId[]; rail: StallRail; onRail(r: StallRail): void }) {
  const t = useT();
  if (tokens.length === 0) return <span />;
  const rails: StallRail[] = ['carrots', ...tokens];
  return (
    <span className="rr-stall-rails" role="group" aria-label={t.shop.payWith}>
      {rails.map((r) => {
        const on = r === rail;
        const carrots = r === 'carrots';
        const face = carrots ? CARROT_BTN : COIN_BTN;
        return (
          <PxButton
            key={r}
            // `nine-btn--pressed` is the kit's sunken state: the chosen rail
            // sits IN the board, the others stand on it.
            className={`rr-stall-rail${on ? ' on nine-btn--pressed' : ''}`}
            color={on ? face.color : PLANK}
            shadowColor={on ? face.shadowColor : SOIL_DEEP}
            textColor={on ? face.textColor : '#b39877'}
            onClick={() => onRail(r)}
            aria-pressed={on}
          >
            <span style={{ ...pxLabel, fontSize: 10 }}>{carrots ? '🥕' : PAY_TOKENS[r].symbol}</span>
          </PxButton>
        );
      })}
    </span>
  );
}

/** The purse, on its own board: every price below is read against it. */
export function StallPurse({ stock }: { stock: number }) {
  return (
    <WoodSign scale={1} className="rr-stall-purse">
      <span style={{ ...pxLabel, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
        {groupDigits(stock)} 🥕
      </span>
    </WoodSign>
  );
}
