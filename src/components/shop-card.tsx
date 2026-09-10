'use client';

/**
 * The shop: a button in the burrow, and a market stall over the whole screen.
 *
 * It has been three things now, and the reasons matter. A card in the column
 * did not fit (380px on the Seeker put the fifth item below the fold). A side
 * drawer fit but read as a settings panel — the same grey chrome as the
 * leaderboard, on the one screen whose job is to make you want to spend.
 *
 * So this is a CENTRED dialog with its own identity: warm soil and lamplight
 * instead of the app's slate, and one coloured tile per item. The palette comes
 * out of the game's own art rather than out of the interface around it, which
 * is what makes the shop feel like a place in the world instead of a menu on
 * top of it.
 *
 * The two prices stay equally weighted — that is the GDD's economy rule and it
 * is not a styling decision — but they are warm for carrots and cold for money,
 * so which world a price comes from is legible before it is read.
 */
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { ItemKind, ShopItem, ShopState } from './use-shop';
import type { PayStage } from './use-usdc-pay';

/**
 * Icons are picked for COVERAGE, not for taste.
 *
 * The interface renders in a monospace stack, and an emoji it has no glyph for
 * comes out as a blank box — a hole and a shopping trolley both did, which is
 * invisible in review and obvious in a screenshot.
 *
 * `tint` is the tile's own colour. Each says what the thing DOES: the trap is
 * buried earth, the bomb is fuse-red, lightning is storm-yellow, the shield is
 * cold steel, energy is carrot. A shelf where every card was the same grey is
 * the version this replaces.
 */
const ITEMS: Record<ItemKind, {
  icon: string; name: string; blurb: string; tint: string;
}> = {
  trap: {
    icon: '🪤',
    name: 'Trap',
    blurb: 'Bury one in your burrow. It drains the raider who steps on it.',
    tint: '#8a5a2b',
  },
  bomb: {
    icon: '💣',
    name: 'Bomb',
    blurb: "Plant one on someone's island mid-run. They see it was you.",
    tint: '#c1442e',
  },
  lightning: {
    icon: '⚡',
    name: 'Lightning',
    blurb: 'Hides ground they already cleared. Chaos, from a distance.',
    tint: '#e0a020',
  },
  shield: {
    icon: '🛡️',
    name: 'Shield',
    blurb: 'Raids bounce off your burrow while it holds.',
    tint: '#4a7fa5',
  },
  energy: {
    icon: '🥕',
    name: 'Energy',
    blurb: 'Fill the bar and dig now, instead of waiting it out.',
    tint: '#e07a2f',
  },
};

/**
 * The way in: a button in the burrow column that also reports your defence.
 *
 * The trap count rides on it rather than living inside the dialog, because
 * "2/8 buried" is the state of your burrow, not a shopping detail — a player
 * has to be able to see the ground is bare without opening anything.
 */
export interface ShopButtonProps {
  shop: ShopState | null;
  onOpen(): void;
}

export function ShopButton({ shop, onOpen }: ShopButtonProps) {
  const traps = shop?.traps;
  const bare = !!traps && traps.placed === 0;
  return (
    <button className="rr-shop-open" onClick={onOpen}>
      <span className="rr-shop-open-name">Shop</span>
      {traps && (
        // An undefended burrow is the one thing worth saying loudly here: it is
        // the state that costs the player carrots while they are not looking.
        <span className={`rr-shop-open-traps${bare ? ' bare' : ''}`}>
          {bare ? 'Burrow undefended' : `${traps.placed}/${traps.maxPlaced} buried`}
        </span>
      )}
    </button>
  );
}

export interface ShopCardProps {
  shop: ShopState | null;
  busy: boolean;
  onBuy(kind: ItemKind): void;
  onPayUsdc?(kind: ItemKind): void;
  payStage?: PayStage;
  note?: string | null;
  error?: string | null;
  /** Enter trap placement on the burrow board. Closes the dialog: the ground
   *  being buried is behind it. */
  onPlaceTraps?(): void;
  onClose(): void;
}

export function ShopPanel({
  shop, busy, onBuy, onPayUsdc, payStage = 'idle', note, error, onPlaceTraps, onClose,
}: ShopCardProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const traps = shop?.traps;
  const canPlace = !!traps && traps.held > 0 && traps.placed < traps.maxPlaced;
  const busyNow = busy || payStage !== 'idle';
  const status = error
    ?? (payStage !== 'idle' && payStage !== 'done' ? PAY_STAGE[payStage] : note);

  return createPortal(
    <div className="rr-shop-scrim" onClick={onClose}>
      {/* The dialog swallows its own clicks so tapping inside does not dismiss
          it — the scrim above is the tap-away, and a dialog whose only exit is
          its [x] is a trap. */}
      <section
        className="rr-shop-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Shop"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="rr-shop-top">
          <h2>The Shed</h2>
          {/* The purse, in the header. Every price below is read against it, and
              making the player close the shop to check it is the one thing a
              shop must never do. */}
          <span className="rr-shop-purse">{(shop?.stock ?? 0).toLocaleString()} 🥕</span>
          <button className="rr-shop-x" onClick={onClose} aria-label="Close">&times;</button>
        </header>

        {traps && (
          <div className={`rr-shop-defence${traps.placed === 0 ? ' bare' : ''}`}>
            <span className="rr-shop-defence-count">
              {traps.placed}<i>/{traps.maxPlaced}</i>
            </span>
            <span className="rr-shop-defence-say">
              {traps.placed === 0
                ? 'Nothing buried. Any raider walks straight in.'
                : `Traps in the ground. ${traps.held} left in the shed.`}
            </span>
            {onPlaceTraps && (
              <button className="rr-shop-place" onClick={onPlaceTraps} disabled={!canPlace}>
                Bury one
              </button>
            )}
          </div>
        )}

        <ul className="rr-shop-grid">
          {shop?.items.map((item) => (
            <Row
              key={item.kind}
              item={item}
              busy={busyNow}
              onBuy={() => onBuy(item.kind)}
              onPayUsdc={shop.usdcEnabled && onPayUsdc ? () => onPayUsdc(item.kind) : undefined}
            />
          ))}
        </ul>

        <footer className="rr-shop-foot">
          {status ? (
            <span className={error ? 'bad' : 'good'}>{status}</span>
          ) : shop && !shop.usdcEnabled ? (
            <span>Card payments are not switched on yet. Carrots only for now.</span>
          ) : (
            <span>Carrots you dig, or card. Same goods either way.</span>
          )}
        </footer>
      </section>
    </div>,
    document.body,
  );
}

/** What the player is told during a USDC payment. Named per step, because
 *  "loading" over a wallet transaction is where people start clicking twice. */
const PAY_STAGE: Record<string, string> = {
  quoting: 'Pricing...',
  signing: 'Approve it in your wallet...',
  confirming: 'Confirming on chain...',
};

function Row({
  item, busy, onBuy, onPayUsdc,
}: {
  item: ShopItem;
  busy: boolean;
  onBuy(): void;
  onPayUsdc?(): void;
}) {
  const meta = ITEMS[item.kind];
  const full = !item.hasRoom;
  // Energy counts DOWN (refills left today), everything else counts up.
  const held = item.kind === 'energy'
    ? `${item.cap - item.held} today`
    : `${item.held}/${item.cap}`;

  return (
    <li
      className={`rr-shop-tile${full ? ' full' : ''}`}
      style={{ '--tile': meta.tint } as React.CSSProperties}
    >
      <div className="rr-shop-tile-head">
        <span className="rr-shop-tile-icon" aria-hidden>{meta.icon}</span>
        <h3>{meta.name}</h3>
        <span className="rr-shop-tile-held">{held}</span>
      </div>
      <p className="rr-shop-tile-blurb">{meta.blurb}</p>
      <div className="rr-shop-tile-buy">
        <button className="rr-pay-carrot" onClick={onBuy} disabled={busy || !item.canBuy}>
          {item.price.toLocaleString()} 🥕
        </button>
        {onPayUsdc && (
          <button className="rr-pay-usdc" onClick={onPayUsdc} disabled={busy || full}>
            ${item.usdc.toFixed(2)}
          </button>
        )}
      </div>
    </li>
  );
}
