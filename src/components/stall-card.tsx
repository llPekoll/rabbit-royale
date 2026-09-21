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
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { PLANK_URL, PLANK_SIZE } from './plank';
import { LeafBadge } from './leaf-badge';
import { PxButton, pxLabel } from './px';
import { PanelTitle } from './pixel-text';
import { ITEM_META, heldLabel } from './item-meta';
import type { ShopItem } from './use-shop';
import { StallDrag } from './stall-drag';
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
 * ONE card size, ONE stall. There were two for a day — a taller card that
 * wrapped into two rows on a desktop window — and Paul cut it (2026-09-21:
 * "laisse-le toujours sur une ligne, pas de prise de tête à avoir deux
 * systèmes différents"). The stall is the Seeker's stall everywhere: 380px
 * tall, one row that slides. The card is sized for that: 164 + 40px of
 * overhang (name above, price below) is what a 380px frame leaves under its
 * rails, its head row, its scroll bar and its strapline.
 */
export const CARD = { width: 136, height: 164, art: 62 } as const;

export interface StallCardProps {
  item: ShopItem;
  /** The rail chosen for the whole stall — this card only READS it. */
  rail: StallRail;
  /** USD per whole token on that rail, or undefined when the feed had nothing
   *  to say. `priceLabel` falls back to dollars rather than inventing a rate. */
  rate?: number;
  busy: boolean;
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
  item, rail, rate, busy, onBuy, onPayMoney,
}: StallCardProps) {
  const t = useT();
  const meta = ITEM_META[item.kind];
  const name = t.items[item.kind].name;
  const { width, height, art } = CARD;
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
 * phone.
 *
 * SHOWN EVEN WHEN THE MONEY ROUTE IS OFF, which it did not used to be. The
 * first cut hid the switch whenever `tokens` was empty, on the grounds that a
 * switch with one position is furniture. That reads correctly from the code
 * and wrongly from the stall: a player who has been told the shop takes USDC,
 * SOL and SKR sees no switch at all and concludes it is broken, which is
 * exactly what happened. An offer that is temporarily unavailable is not the
 * same thing as an offer that does not exist, and the shelf has to be able to
 * say which.
 *
 * So the unavailable rails are drawn, dimmed and unclickable, and they carry
 * the REASON as their tooltip — `disabledNote`, from whoever knows it (no
 * treasury configured, or a guest with no wallet to send from). What must
 * never happen is a rail that looks live, quotes a price and then fails at
 * signing; `disabled` is what keeps this honest rather than decorative.
 */
export function StallRails({
  tokens, rail, onRail, offered = tokens, disabledNote,
}: {
  tokens: readonly PayTokenId[];
  rail: StallRail;
  onRail(r: StallRail): void;
  /** Every rail worth DRAWING. Defaults to the live ones, so a caller that
   *  does not care about the unavailable ones behaves exactly as before. */
  offered?: readonly PayTokenId[];
  /** Why the drawn-but-dead rails are dead. Absent when none are. */
  disabledNote?: string;
}) {
  const t = useT();
  // Nothing to choose between at all: no money rail is even conceivable on
  // this build. THAT is the case the original guard was right about.
  if (offered.length === 0) return <span />;
  const rails: StallRail[] = ['carrots', ...offered];
  return (
    <span className="rr-stall-rails" role="group" aria-label={t.shop.payWith}>
      {rails.map((r) => {
        const carrots = r === 'carrots';
        // Carrots are always live; a token rail is live only if the server
        // listed it in `tokens`. `offered` may be wider — that is the point.
        const live = carrots || tokens.includes(r as PayTokenId);
        const on = r === rail;
        const face = carrots ? CARROT_BTN : COIN_BTN;
        return (
          <PxButton
            key={r}
            // `nine-btn--pressed` is the kit's sunken state: the chosen rail
            // sits IN the board, the others stand on it.
            className={`rr-stall-rail${on ? ' on nine-btn--pressed' : ''}${live ? '' : ' off'}`}
            color={on ? face.color : PLANK}
            shadowColor={on ? face.shadowColor : SOIL_DEEP}
            textColor={on ? face.textColor : '#b39877'}
            onClick={() => { if (live) onRail(r); }}
            disabled={!live}
            title={live ? undefined : disabledNote}
            aria-pressed={on}
            aria-disabled={!live}
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

/**
 * THE SHELF: the row the cards stand on, and the two ways to slide it.
 *
 * A finger slides it natively (`overflow-x: auto`, `touch-action: pan-x`).
 * A mouse could not: a horizontal row has no wheel gesture most people know,
 * and the first cut hid the scrollbar on the grounds that the card cut by the
 * edge was hint enough. Paul (2026-09-21): "on devrait pouvoir click et drag
 * avec la scroll bar en bas". So, two mouse gestures:
 *
 *   - DRAG THE ROW. Press anywhere on the shelf and pull. The row follows the
 *     pointer, and a press that moved more than a few pixels is NOT a click:
 *     `onClickCapture` swallows it, so dragging across a price button does
 *     not buy the thing under the release.
 *   - DRAG THE BAR. A bar under the row, drawn by us rather than the
 *     browser: the native one is an overlay that hides itself on a Mac, and
 *     "sometimes there is a scrollbar" is not an affordance. Its thumb is the
 *     visible share of the row, its position the row's, and it can be pulled
 *     or the track clicked to page.
 *
 * Mouse only for the row drag (`pointerType`): a touch is already sliding the
 * row natively, and taking the pointer from it would fight the browser.
 */
export function StallShelf({ children }: { children: ReactNode }) {
  const row = useRef<HTMLUListElement | null>(null);
  const track = useRef<HTMLDivElement | null>(null);
  /* The thumb, as shares of the track: how wide, and how far along. */
  const [bar, setBar] = useState({ size: 1, at: 0 });
  /* The gesture lives in `stall-drag.ts`, with no DOM in it — see there for
     why a drag that ends off the row is the case that matters. */
  const drag = useRef(new StallDrag());
  const [dragging, setDragging] = useState(false);

  const measure = useCallback(() => {
    const el = row.current;
    if (!el) return;
    const { scrollWidth, clientWidth, scrollLeft } = el;
    if (scrollWidth <= clientWidth + 1) { setBar({ size: 1, at: 0 }); return; }
    setBar({ size: clientWidth / scrollWidth, at: scrollLeft / scrollWidth });
  }, []);

  useEffect(() => {
    const el = row.current;
    if (!el) return;
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', measure); ro.disconnect(); };
  }, [measure]);

  /* ── Drag the row ── */
  const onRowDown = (e: ReactPointerEvent<HTMLUListElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    drag.current.down(e.clientX, row.current!.scrollLeft);
  };
  const onRowMove = (e: ReactPointerEvent<HTMLUListElement>) => {
    const was = drag.current.dragging;
    const left = drag.current.move(e.clientX);
    if (left === null) return;
    if (!was) {
      /* NOT ON THE PRESS: capturing the pointer at pointerdown makes the row
         the target of the pointerup, and a click is fired at the common
         ancestor of the two targets — so every press on a price button became
         a click on the row, and nothing bought anything. The row takes the
         pointer only once the press has become a drag. */
      row.current!.setPointerCapture(e.pointerId);
      setDragging(true);
    }
    row.current!.scrollLeft = left;
  };
  const onRowUp = () => {
    /* The click that follows a drag is still coming, so the swallow is armed
       here and disarmed a microtask later rather than only by the click.

       A drag that ends off the row — released over the burrow, outside the
       window, or after the browser dropped the capture — fires no click at
       all. Armed-until-clicked therefore stayed armed forever, and every
       later click was swallowed by `onClickCapture` above the buttons,
       before any rail could see it: the shelf stopped buying anything in any
       currency until a reload. The click is dispatched in the same task as
       this release, so the microtask is always late enough to swallow a real
       one and always early enough that nothing survives to the next press. */
    if (drag.current.up()) queueMicrotask(() => drag.current.disarm());
    setDragging(false);
  };
  const onRowClickCapture = (e: React.MouseEvent) => {
    if (drag.current.click()) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  /* ── Drag the bar ── */
  const thumbDrag = useRef<{ x: number; left: number } | null>(null);
  const onThumbDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    thumbDrag.current = { x: e.clientX, left: row.current!.scrollLeft };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onThumbMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = thumbDrag.current;
    const el = row.current;
    const tr = track.current;
    if (!d || !el || !tr) return;
    /* A pixel on the track is scrollWidth / trackWidth pixels of row. */
    el.scrollLeft = d.left + (e.clientX - d.x) * (el.scrollWidth / tr.clientWidth);
  };
  const onThumbUp = () => { thumbDrag.current = null; };
  const onTrackDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = row.current;
    const tr = track.current;
    if (!el || !tr) return;
    /* A click beside the thumb pages toward it. */
    const share = (e.clientX - tr.getBoundingClientRect().left) / tr.clientWidth;
    const dir = share < bar.at ? -1 : 1;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  return (
    <>
      <ul
        ref={row}
        className={`rr-stall-shelf${dragging ? ' dragging' : ''}`}
        onPointerDown={onRowDown}
        onPointerMove={onRowMove}
        onPointerUp={onRowUp}
        onPointerCancel={onRowUp}
        onClickCapture={onRowClickCapture}
      >
        {children}
      </ul>
      <div
        ref={track}
        className="rr-stall-track"
        style={{ visibility: bar.size >= 1 ? 'hidden' : 'visible' }}
        onPointerDown={onTrackDown}
        aria-hidden
      >
        <div
          className="rr-stall-thumb"
          style={{ width: `${bar.size * 100}%`, left: `${bar.at * 100}%` }}
          onPointerDown={onThumbDown}
          onPointerMove={onThumbMove}
          onPointerUp={onThumbUp}
          onPointerCancel={onThumbUp}
        />
      </div>
    </>
  );
}
