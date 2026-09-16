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
import { useEffect, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { CloseButton, NineSlicePanel } from '@domin8/arcade-kit';
import { PanelTitle } from './pixel-text';
import { PX, PxButton, PxPanel, pxLabel } from './px';
import type { ItemKind, ShopItem, ShopState } from './use-shop';
import { ITEM_META, heldLabel } from './item-meta';
import { useT } from '@/i18n/provider';
import { groupDigits } from '@/i18n/format';
import { payStageLine, type PayStage } from './use-usdc-pay';
import { LauncherTab, DANGER, LAMP } from './burrow-chrome';
import { PAY_TOKENS, priceLabel, type PayTokenId } from '@/lib/pay/tokens';
import { LootChest, CHEST_ASPECT } from './loot-chest';

/**
 * The shelf's names, icons and tints — now shared with the burrow's kit row.
 *
 * It lived here as a private const while the shop was the only place an item
 * had a face. The kit row shows the same holdings on the burrow screen, so the
 * registry moved to `item-meta.ts`; a second copy would have drifted on the
 * first retint. See that file for why the icons are what they are.
 */
const ITEMS = ITEM_META;

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
  const t = useT();
  const traps = shop?.traps;
  return (
    <LauncherTab
      // The kit's animated chest, not a flat sprite: its idle highlight sweeps
      // the lid every few seconds, which is what makes it read as an object
      // lying on the tab rather than an icon printed on it.
      art={<LootChest size={52} />}
      spriteSize={52}
      spriteHeight={Math.round(52 * CHEST_ASPECT)}
      label={t.shop.title}
      // The defence state moved to PROTECT BASE, which is the tab that can now
      // act on it. It used to live here because the shed was the only door to
      // the board; two tabs reporting the same "2/8 buried" is one of them
      // repeating the other, and the alarm belongs on the tab that fixes it.
      // What is left is the shed's own business: what is on the shelf.
      sub={traps ? t.shop.inShed(traps.held) : undefined}
      ink={LAMP}
      count={traps?.held}
      onClick={onOpen}
      ariaLabel={t.shop.aria}
    />
  );
}

/* ── The stall's palette, now carried by the pixel frame ──────────────────
   The same tokens `.rr-shop-modal` declares in globals.css, restated here
   because the codex's nine-slice frame bakes its fill on a canvas and cannot
   read a CSS variable. The look is the codex's; the colours are the Shed's. */
export const SOIL = '#2a1810';
export const SOIL_DEEP = '#1d100a';
export const PLANK = '#4a2f1d';
export const PLANK_LIT = '#6b4526';
export const LAMP_INK = '#ffb238';
export const CHALK = '#f5e6d3';
const COIN = '#7fd1ff';

/**
 * The dialogs' frame pixel — THE frame pixel, `PX`. It was chunkier here (4px,
 * 3 on a short screen) on the reasoning that a dialog is a bigger object; side
 * by side with the cards that read as a different material. One stroke at
 * every size now: see `PX`.
 */
export const DIALOG_PX = PX;

/**
 * The carrot price: the lamp-lit gradient it always was, top as the face and
 * foot as the bevel, brown ink. The money price: kept cold — the cyan it wore
 * as a rim and ink, on a dark coin-slate face the kit's outline can sit on.
 */
export const CARROT_BTN = { color: '#ffc45c', shadowColor: '#e8912a', textColor: '#3a1f08' } as const;
/**
 * A carrot price that cannot be paid: the lamp gone out, as a FACE colour.
 * The dead state used to be a grayscale filter over the whole button, and a
 * filter cannot spare a child, so the carrot beside the price went grey with
 * it (Paul, 2026-09-16: the carrot stays in colour, however small). The face
 * says "not now"; the carrot still says what it costs. `.rr-carrot-price`
 * turns the filter off in px-dialogs.css.
 */
export const CARROT_BTN_OFF = { color: '#6b5440', shadowColor: '#4a3828', textColor: '#d8c3ab' } as const;
export const COIN_BTN = { color: '#1f3a4a', shadowColor: '#10222e', textColor: COIN } as const;

/** A price label: the game's pixel face (the kit's bitmap one has no carrot). */
export const priceText: CSSProperties = { ...pxLabel, fontSize: 12, fontVariantNumeric: 'tabular-nums' };

/**
 * ENERGY LEADS THE SHELF (Paul, 2026-09-16). It is the refill players buy most,
 * and the "Out of energy" dialog sends them here for it — so it must be the
 * first tile they see, not the fifth under the fold on a phone. Sorted here
 * rather than in `SHOP_KINDS`: that list is the server's, and this is only
 * the order the stall displays; the rest keep the server's order.
 */
function shelfOrder(items: ShopItem[]): ShopItem[] {
  return [...items].sort((a, b) => Number(b.kind === 'energy') - Number(a.kind === 'energy'));
}

/** `a` over `b` at `mix` — hex only, because the frame's colour is baked on a canvas. */
function mixHex(a: string, b: string, mix: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x.map((v, i) => Math.round(v * mix + y[i] * (1 - mix)).toString(16).padStart(2, '0')).join('')}`;
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
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const busyNow = busy || payStage !== 'idle';
  const status = error
    // One table for both surfaces, in the dictionary: the shop and this popup
    // each carried their own copy of the same three lines.
    ?? (payStage !== 'idle' && payStage !== 'done' ? payStageLine(t, payStage) : note);

  return createPortal(
    <div className="rr-shop-scrim" onClick={onClose}>
      {/* The dialog swallows its own clicks so tapping inside does not dismiss
          it — the scrim above is the tap-away, and a dialog whose only exit is
          its [x] is a trap. */}
      <NineSlicePanel
        color={SOIL}
        pixelScale={DIALOG_PX}
        className="rr-shop-modal rr-px-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t.shop.aria}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="rr-shop-top">
          <h2><PanelTitle>{t.shop.shed}</PanelTitle></h2>
          {/* The purse, in the header. Every price below is read against it, and
              making the player close the shop to check it is the one thing a
              shop must never do. */}
          <span className="rr-shop-purse">{groupDigits(shop?.stock ?? 0)} 🥕</span>
          {/* THE CURRENCY, once for the whole shop.
              Per-item currency buttons would be six items times three rails on
              a phone. Switching it re-prices every tile below, since a rail the
              player cannot read a price in is a rail they will not pick.
              Hidden below two rails: a "switch" with one option is furniture. */}
          {(shop?.tokens?.length ?? 0) > 1 && (
            <span className="rr-shop-rails" role="group" aria-label={t.shop.payWith}>
              {shop!.tokens.map((t) => {
                const on = t === payToken;
                return (
                  <PxButton
                    key={t}
                    // `nine-btn--pressed` is the kit's sunken state: the chosen
                    // rail sits IN the board, the others stand on it.
                    className={`rr-shop-rail${on ? ' on nine-btn--pressed' : ''}`}
                    color={on ? COIN_BTN.color : PLANK}
                    shadowColor={on ? COIN_BTN.shadowColor : SOIL_DEEP}
                    textColor={on ? COIN : '#8b949e'}
                    onClick={() => onPayTokenChange(t)}
                    aria-pressed={on}
                  >
                    <span style={{ ...pxLabel, fontSize: 10 }}>{PAY_TOKENS[t].symbol}</span>
                  </PxButton>
                );
              })}
            </span>
          )}
          {/* minWidth inline: the kit's own inline 32px beats any stylesheet
              floor, and this is the way out of a full-screen dialog. */}
          <CloseButton inline className="rr-shop-x" onClick={onClose} aria-label="Close" style={{ minWidth: 44 }} />
        </header>

        <ul className="rr-shop-grid">
          {shop && shelfOrder(shop.items).map((item) => (
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
          {/* The strapline on its own board — a nested panel in the plank the
              footer band always was. */}
          <PxPanel color={PLANK} className="rr-px-note">
            {status ? (
              <span className={error ? 'bad' : 'good'}>{status}</span>
            ) : shop && !shop.usdcEnabled ? (
              <span>{t.shop.cardsOff}</span>
            ) : shop && !onPayUsdc ? (
              <span>{t.shop.connectForCard}</span>
            ) : (
              <span>{t.shop.eitherWay}</span>
            )}
          </PxPanel>
        </footer>
      </NineSlicePanel>
    </div>,
    document.body,
  );
}

/** What the player is told during a USDC payment. Named per step, because
 *  "loading" over a wallet transaction is where people start clicking twice. */
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
  const t = useT();
  const meta = ITEMS[item.kind];
  const full = !item.hasRoom;
  // Three different things to report, because three different things are being
  // sold — a count, refills left, days of cover. Which one this kind gets is
  // `ITEM_META[kind].counts`; see `heldLabel`.
  const held = heldLabel(t, item.kind, item.held, item.cap);

  /**
   * What the carrot price means right now, in one sentence.
   *
   * Ordered by which refusal the player can do something about: a full shelf is
   * finished business, a short purse is a reason to go and dig.
   */
  // Grouped by hand, never `toLocaleString()`: the separator has to be the
  // same on the server and in the browser or the tree is thrown away. See
  // i18n/format.ts.
  const price = t.shop.priceLabel(groupDigits(item.price));
  const name = t.items[item.kind].name;
  const reason = full
    ? t.shop.capped(name, price)
    : item.canBuy
      ? t.shop.buy(name, price)
      : t.shop.tooPoor(name, price);

  return (
    <li
      className={`rr-shop-tile${full ? ' full' : ''}`}
      style={{ '--tile': meta.tint } as React.CSSProperties}
    >
      {/* A nested panel in the tile's own colour: its tint washed into the
          stall's deep soil, which is the tone the old gradient read as. */}
      <PxPanel color={mixHex(meta.tint, SOIL_DEEP, 0.2)} className="rr-shop-tile-face">
      <div className="rr-shop-tile-head">
        <span className="rr-shop-tile-icon" aria-hidden>
          {/* The kind's pixel art where it has some, as the kit row shows it;
              the emoji otherwise. */}
          {meta.art ? <img src={meta.art} alt="" draggable={false} /> : meta.icon}
        </span>
        <h3>{name}</h3>
        <span className="rr-shop-tile-held">{held}</span>
      </div>
      <p className="rr-shop-tile-blurb">{t.items[item.kind].blurb}</p>
      <div className="rr-shop-tile-buy">
        <PxButton
          className="rr-pay-carrot rr-carrot-price"
          {...(busy || !item.canBuy ? CARROT_BTN_OFF : CARROT_BTN)}
          // Buying is the loud action on this screen — the one that wiggles.
          wiggle
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
          <span style={priceText}>{groupDigits(item.price)} 🥕</span>
        </PxButton>
        {onPayUsdc && (
          <PxButton
            className="rr-pay-usdc"
            {...COIN_BTN}
            wiggle
            onClick={onPayUsdc}
            disabled={busy || full}
            /* The dollar price, always, on hover: the shop's prices ARE dollars
               and the rail is a conversion, so the figure the game actually
               charges in stays one hover away however it is displayed. */
            title={`$${item.usdc.toFixed(2)}`}
          >
            <span style={priceText}>{priceLabel(item.usdc, payToken, rate)}</span>
          </PxButton>
        )}
      </div>
      </PxPanel>
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
  const t = useT();
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
      // 27x36 source, so the height is the larger side and the bleed geometry
      // needs telling, exactly as the chest does.
      sprite={BOMB_SRC}
      spriteSize={34}
      spriteHeight={Math.round(34 * (36 / 27))}
      label={t.shop.protect}
      sub={
        !traps ? undefined
          // Says what the tap will DO, not just what the ground is like. "NO
          // TRAPS - GET ONE" is the whole state in four words: the burrow is
          // open, you cannot fix it from here, and this is still the way to.
          : healing ? t.shop.rearming(traps.rearming)
            : empty ? t.shop.noTraps
              : bare ? t.shop.nothingBuried
                : traps.rearming > 0
                  ? t.shop.upAndRearming(traps.armed, traps.rearming)
                  : t.shop.inGround(traps.armed, traps.maxPlaced)
      }
      // Still alarmed on a bare burrow — that is the fact worth alarming about,
      // and it is true whether or not the player can act on it from here. Only
      // a burrow that is BOTH bare and unfixable used to be dimmed, which read
      // as "nothing to see" on the one state that most needs pressing.
      ink={bare ? DANGER : LAMP}
      onClick={canEdit ? onPlace : (onNone ?? onPlace)}
      ariaLabel={empty ? t.shop.protectBuyAria : t.shop.protectAria}
    />
  );
}

/** The buried bomb — unlit, as it waits in the ground. */
const BOMB_SRC = '/assets/ui/icons/bomb.png';
