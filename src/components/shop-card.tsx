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
 *
 * The money price is written in the RAIL the player chose, converted at the
 * server's Jupiter rate. It used to always read `$0.25`, which is the number
 * the game charges but not the number that leaves the wallet: a player paying
 * in SOL was left to do the arithmetic themselves, on a phone, before deciding.
 * The dollar figure is still what everything is priced in, and it is one hover
 * away on every button.
 */
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { ItemKind, ShopItem, ShopState } from './use-shop';
import type { PayStage } from './use-usdc-pay';
import { LauncherTab, CHALK_DIM, DANGER, LAMP } from './burrow-chrome';
import { PAY_TOKENS, priceLabel, type PayTokenId } from '@/lib/pay/tokens';
import { LootChest, CHEST_ASPECT } from './loot-chest';

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
    blurb: 'Calls a strike on a rival\u2019s island. It opens the ground around it.',
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
  smoke: {
    icon: '🌫️',
    name: 'Smoke screen',
    blurb: 'Hides your burrow\u2019s numbers for a day. Raiders cross it blind.',
    tint: '#6b7a8f',
  },
  mirage: {
    icon: '🌀',
    name: 'Mirage',
    blurb: 'Makes a few of a rival\u2019s numbers lie, mid-run. They can spot it.',
    tint: '#9a6bd6',
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
  return (
    <LauncherTab
      // The kit's animated chest, not a flat sprite: its idle highlight sweeps
      // the lid every few seconds, which is what makes it read as an object
      // lying on the tab rather than an icon printed on it.
      art={<LootChest size={52} />}
      spriteSize={52}
      spriteHeight={Math.round(52 * CHEST_ASPECT)}
      label="SHOP"
      // The defence state moved to PROTECT BASE, which is the tab that can now
      // act on it. It used to live here because the shed was the only door to
      // the board; two tabs reporting the same "2/8 buried" is one of them
      // repeating the other, and the alarm belongs on the tab that fixes it.
      // What is left is the shed's own business: what is on the shelf.
      sub={traps ? `${traps.held} IN THE SHED` : undefined}
      ink={LAMP}
      count={traps?.held}
      onClick={onOpen}
      ariaLabel="Shop"
    />
  );
}

export interface ShopCardProps {
  shop: ShopState | null;
  /** The rail every purchase in this shop settles on. */
  payToken: PayTokenId;
  onPayTokenChange(t: PayTokenId): void;
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
  shop, busy, onBuy, onPayUsdc, payStage = 'idle', note, error,
  payToken, onPayTokenChange, onPlaceTraps, onClose,
}: ShopCardProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const traps = shop?.traps;
  /**
   * Can the board be opened at all?
   *
   * Not "can I bury one". This used to be `held > 0 && placed < maxPlaced`,
   * and it locked a defender out of their own map at the exact moment they
   * most wanted it: three bombs down, none left in the shed, and the only way
   * to move one was to buy a fourth. Editing has to be possible whenever there
   * is something TO edit — a bomb to lift and re-bury is a decision the shed's
   * stock has no business vetoing.
   *
   * So: anything already in the ground, or room and stock to add one. Only a
   * player with an empty board and an empty shed has nothing to do there, and
   * for them the button is honestly dead.
   */
  const canEditBoard = !!traps
    && (traps.placed > 0 || (traps.held > 0 && traps.placed < traps.maxPlaced));
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
          {/* THE CURRENCY, once for the whole shop.
              Per-item currency buttons would be six items times three rails on
              a phone. Switching it re-prices every tile below, since a rail the
              player cannot read a price in is a rail they will not pick.
              Hidden below two rails: a "switch" with one option is furniture. */}
          {(shop?.tokens?.length ?? 0) > 1 && (
            <span className="rr-shop-rails" role="group" aria-label="Pay with">
              {shop!.tokens.map((t) => (
                <button
                  key={t}
                  className={`rr-shop-rail${t === payToken ? ' on' : ''}`}
                  onClick={() => onPayTokenChange(t)}
                  aria-pressed={t === payToken}
                >
                  {PAY_TOKENS[t].symbol}
                </button>
              ))}
            </span>
          )}
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
              <button className="rr-shop-place" onClick={onPlaceTraps} disabled={!canEditBoard}>
                {/* The label follows what the tap will actually get you. With
                    an empty shed there is nothing to bury, and "Bury one" on a
                    button that opens a board you can only REARRANGE is a
                    promise it cannot keep. */}
                {traps.held > 0 && traps.placed < traps.maxPlaced ? 'Bury one' : 'Move them'}
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
              payToken={payToken}
              rate={shop.rates?.[payToken]}
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
  item, busy, payToken, rate, onBuy, onPayUsdc,
}: {
  item: ShopItem;
  busy: boolean;
  /** The rail chosen for the whole shop — this tile only READS it. */
  payToken: PayTokenId;
  /** USD per whole token on that rail, or undefined when the feed had nothing
   *  to say. `priceLabel` falls back to dollars rather than inventing a rate. */
  rate: number | undefined;
  onBuy(): void;
  onPayUsdc?(): void;
}) {
  const meta = ITEMS[item.kind];
  const full = !item.hasRoom;
  // Three different things to report, because three different things are being
  // sold: a count for carried items, refills LEFT for energy, and days of cover
  // remaining for smoke, which is time rather than a thing at all.
  const held = item.kind === 'energy'
    ? `${item.cap - item.held} today`
    : item.kind === 'smoke'
      ? (item.held > 0 ? `${item.held}d left` : 'off')
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
          <button
            className="rr-pay-usdc"
            onClick={onPayUsdc}
            disabled={busy || full}
            /* The dollar price, always, on hover: the shop's prices ARE dollars
               and the rail is a conversion, so the figure the game actually
               charges in stays one hover away however it is displayed. */
            title={`$${item.usdc.toFixed(2)}`}
          >
            {priceLabel(item.usdc, payToken, rate)}
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * PROTECT BASE — the way to the board, without the shop in between.
 *
 * Burying a bomb and buying one are two different errands, and only one of
 * them was reachable: editing the ground meant opening the shed, finding the
 * defence strip, and tapping "Move them" — a shopping dialog standing between
 * the player and their own map. A defender rearranging their burrow is not
 * shopping, so this tab calls placement directly and the shed's button stays
 * as the path for someone who has just bought a trap and wants to bury it
 * while they are already in there.
 *
 * The sub-line carries the same state the SHOP tab used to carry alone, and
 * `ink` alarms on a bare burrow for the same reason it does there: an
 * undefended ground is what costs the player carrots while they are not
 * looking.
 *
 * Dead only when there is genuinely nothing to do — nothing in the ground AND
 * nothing in the shed — which is the same test the shed's own button makes.
 */
export interface ProtectButtonProps {
  shop: ShopState | null;
  onPlace(): void;
}

export function ProtectButton({ shop, onPlace }: ProtectButtonProps) {
  const traps = shop?.traps;
  const bare = !!traps && traps.placed === 0;
  const canEdit = !!traps
    && (traps.placed > 0 || (traps.held > 0 && traps.placed < traps.maxPlaced));

  return (
    <LauncherTab
      // The bomb itself, at the tab's own pixel — the object the tap buries.
      // 20x23 source, so the height is the larger side and the bleed geometry
      // needs telling, exactly as the chest does.
      sprite={BOMB_SRC}
      spriteSize={34}
      spriteHeight={Math.round(34 * (23 / 20))}
      label="PROTECT BASE"
      sub={
        !traps ? undefined
          : bare ? 'NOTHING BURIED'
            : `${traps.placed}/${traps.maxPlaced} IN THE GROUND`
      }
      ink={!canEdit ? CHALK_DIM : bare ? DANGER : LAMP}
      onClick={canEdit ? onPlace : undefined}
      ariaLabel="Protect your base"
    />
  );
}

const BOMB_SRC = '/assets/misc/RR-Bomb-Small.webp';
