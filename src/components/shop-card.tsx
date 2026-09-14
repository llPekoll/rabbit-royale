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
import { LauncherTab, DANGER, LAMP } from './burrow-chrome';
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
  onClose(): void;
}

export function ShopPanel({
  shop, busy, onBuy, onPayUsdc, payStage = 'idle', note, error,
  payToken, onPayTokenChange, onClose,
}: ShopCardProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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

        {/* THREE reasons there may be no card button, not two.
            The shelf offers money when the deployment can take it AND this
            player has a wallet to send it from, and those fail differently:

              - no treasury configured  → the rail is off for everybody
              - a GUEST                 → the rail is on, they have no wallet
              - both available          → the two prices are equally weighted

            The middle case used to fall through to "Carrots you dig, or card.
            Same goods either way", on a shelf with no card button anywhere on
            it — the footer describing a choice the player could not see. (And a
            guest on a server with no treasury was told card payments "are not
            switched on yet", which is true of the server and not the reason
            they are looking at one price.) `onPayUsdc` is the only thing that
            knows whether a button was actually rendered, so it is what decides
            the sentence. */}
        <footer className="rr-shop-foot">
          {status ? (
            <span className={error ? 'bad' : 'good'}>{status}</span>
          ) : shop && !shop.usdcEnabled ? (
            <span>Card payments are not switched on yet. Carrots only for now.</span>
          ) : shop && !onPayUsdc ? (
            <span>Connect a wallet to pay by card. Everything here is diggable anyway.</span>
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

  /**
   * What the carrot price means right now, in one sentence.
   *
   * Ordered by which refusal the player can do something about: a full shelf is
   * finished business, a short purse is a reason to go and dig.
   */
  const price = `${item.price.toLocaleString()} carrots`;
  const reason = full
    ? `${meta.name}: ${price}. You are holding as many as you can.`
    : item.canBuy
      ? `Buy ${meta.name} for ${price}`
      : `${meta.name}: ${price}. Not enough carrots yet. Dig for more.`;

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
        <button
          className="rr-pay-carrot"
          onClick={onBuy}
          disabled={busy || !item.canBuy}
          /* WHY it is dead, when it is dead.
             `canBuy` folds two refusals into one grey slab — the shelf is full,
             or the purse is short — and the face of the button says neither: it
             reads "180 🥕" whether the answer is "you have 12" or "you already
             hold all twelve of these". A player with an empty stock met seven
             identical grey prices and no sentence anywhere explaining them.
             The cap case has the tile's own `full` styling behind it; the
             shortfall had nothing at all, and it is the one a new player is
             always in. Carried as the accessible name and the tooltip rather
             than printed on the face, so the shelf stays a shelf of prices. */
          title={reason}
          aria-label={reason}
        >
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
 * NEVER DEAD. It used to be: with nothing in the ground and nothing in the
 * shed, `onClick` was `undefined` and the tap did nothing at all — no board, no
 * note, no sound. And that is the state a brand-new player is in, under a
 * sub-line reading NOTHING BURIED in the danger colour, which is the strongest
 * invitation to press anything on the screen. The game's loudest warning
 * answered with silence.
 *
 * It is the same dead end the GO FARM arrow already had, and it gets the same
 * answer: the press is ALWAYS answered — with the board when there is something
 * to arrange, and with the shed when the honest reply is "you have no traps".
 * `onNone` is that second door.
 */
export interface ProtectButtonProps {
  shop: ShopState | null;
  onPlace(): void;
  /**
   * Where the tap goes when there is nothing to arrange: the Shed, which is
   * where a trap comes from. Optional — without it the tab falls back to the
   * board, because opening a grid you can only look at still beats silence.
   */
  onNone?(): void;
}

export function ProtectButton({ shop, onPlace, onNone }: ProtectButtonProps) {
  const traps = shop?.traps;
  // Undefended RIGHT NOW — nothing standing, whether or not traps are on their
  // way back. That is the fact the alarm colour is about: a raider arriving
  // this minute meets open ground either way.
  const bare = !!traps && traps.armed === 0;
  // ...but a burrow mid-rearm is not the same story as an empty one, and it is
  // told differently below. The owner did not lose those traps and has nothing
  // to do about them; saying "NOTHING BURIED" would send them to a board where
  // there is nothing to fix.
  const healing = !!traps && traps.armed === 0 && traps.rearming > 0;
  const canEdit = !!traps
    && (traps.placed > 0 || (traps.held > 0 && traps.placed < traps.maxPlaced));
  // Nothing buried and nothing to bury. Distinguished from `!canEdit` because
  // the shelf being full (maxPlaced reached) is a different sentence.
  const empty = !!traps && traps.placed === 0 && traps.held === 0;

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
          // Says what the tap will DO, not just what the ground is like. "NO
          // TRAPS - GET ONE" is the whole state in four words: the burrow is
          // open, you cannot fix it from here, and this is still the way to.
          : healing ? `REARMING - ${traps.rearming} COMING BACK`
            : empty ? 'NO TRAPS - GET ONE'
              : bare ? 'NOTHING BURIED'
                : traps.rearming > 0
                  ? `${traps.armed} UP - ${traps.rearming} REARMING`
                  : `${traps.armed}/${traps.maxPlaced} IN THE GROUND`
      }
      // Still alarmed on a bare burrow — that is the fact worth alarming about,
      // and it is true whether or not the player can act on it from here. Only
      // a burrow that is BOTH bare and unfixable used to be dimmed, which read
      // as "nothing to see" on the one state that most needs pressing.
      ink={bare ? DANGER : LAMP}
      onClick={canEdit ? onPlace : (onNone ?? onPlace)}
      ariaLabel={empty ? 'Protect your base - buy a trap' : 'Protect your base'}
    />
  );
}

const BOMB_SRC = '/assets/misc/RR-Bomb-Small.webp';
