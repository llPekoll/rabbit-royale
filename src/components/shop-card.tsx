'use client';

/**
 * The shop: a button in the burrow, and a market stall over the whole screen.
 *
 * It has been three things now, and the reasons matter. A card in the column
 * did not fit (380px on the Seeker put the fifth item below the fold). A side
 * drawer fit but read as a settings panel — the same grey chrome as the
 * leaderboard, on the one screen whose job is to make you want to spend.
 *
 * So this is a CENTRED dialog with its own identity — and since 2026-09-21 it
 * is a STALL: a row of tall cards under a hung SHOP sign, one drawing, one
 * price, one button per card (stall-card.tsx has the reference and the
 * reasons). It replaced a two-column grid of text tiles that carried two
 * prices, a blurb and a count each, with the art the size of a thumbnail.
 *
 * The two prices stay equally weighted — that is the GDD's economy rule and it
 * is not a styling decision — but they now weigh the same at the level of the
 * STALL rather than the tile: the rails in the head row (carrots, then every
 * token the deployment takes) re-price every card in one tap, warm for
 * carrots and cold for money.
 *
 * The money price is written in the RAIL the player chose, converted at the
 * server's Jupiter rate. It used to always read `$0.25`, which is the number
 * the game charges but not the number that leaves the wallet: a player paying
 * in SOL was left to do the arithmetic themselves, on a phone, before deciding.
 * The dollar figure is still what everything is priced in, and it is one hover
 * away on every button.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { LeafFrame, LEAF_FRAME_SLICE } from './leaf-frame';
import { LeafClose } from './leaf-badge';
import type { ItemKind, ShopItem, ShopState } from './use-shop';
import { useT } from '@/i18n/provider';
import { payStageLine, type PayStage } from './use-usdc-pay';
import { LauncherTab, DANGER, LAMP } from './burrow-chrome';
import type { PayTokenId } from '@/lib/pay/tokens';
import { StallCard, StallPurse, StallRails, StallSign, type StallRail } from './stall-card';
import { LootChest, CHEST_ASPECT } from './loot-chest';

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

/* ── The stall's palette ──────────────────────────────────────────────────
   Lives in shop-palette.ts now (the card needs it and this file needs the
   card); re-exported here so the dialogs that borrow it keep their import. */
export {
  SOIL, SOIL_DEEP, PLANK, PLANK_LIT, LAMP_INK, CHALK, DIALOG_PX,
  CARROT_BTN, CARROT_BTN_OFF, COIN_BTN, priceText,
} from './shop-palette';

/**
 * ENERGY LEADS THE SHELF (Paul, 2026-09-16). It is the refill players buy most,
 * and the "Out of energy" dialog sends them here for it — so it must be the
 * first card they see, not the fifth off the edge of the shelf. Sorted here
 * rather than in `SHOP_KINDS`: that list is the server's, and this is only
 * the order the stall displays; the rest keep the server's order.
 */
function shelfOrder(items: ShopItem[]): ShopItem[] {
  return [...items].sort((a, b) => Number(b.kind === 'energy') - Number(a.kind === 'energy'));
}

/**
 * TWO STALLS, BY THE SCREEN'S HEIGHT.
 *
 * SHORT (the Seeker, 400px): one row that slides sideways, the frame's
 * leaves drawn as a sprig. The leaf frame's art is drawn for a 90px corner,
 * and at that size its top and bottom rails take 195 of the 400 — leaving a
 * row of cards 185px, which is not a row of cards. The fifth card is cut by
 * the edge on purpose: that is what says there is more.
 *
 * TALL (a desktop window): the shelf WRAPS, four cards and three, so all
 * seven are on the board at once. The first cut showed four cards that fit
 * the width exactly, no scrollbar, and three more the eye had no reason to
 * suspect (Paul, 2026-09-21: "y avait plus de trucs dans le shop avant").
 * Two rows of cards need 424px, which is why the threshold is where it is
 * and why the corner is 65 rather than the art's 90: at 90 the rails take
 * 195 of a 660px dialog and the second row does not fit. Below the threshold
 * the stall is also SHORTER (`.rr-stall.short`), so a mid-sized window gets
 * the Seeker's stall centred rather than one row adrift in a tall frame.
 */
const SHORT_SCREEN = '(max-height: 679px)';
const SHORT_CORNER = 50;
const TALL_CORNER = 65;

function useShortScreen(): boolean {
  const [short, setShort] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(SHORT_SCREEN).matches);
  useEffect(() => {
    const mq = window.matchMedia(SHORT_SCREEN);
    const on = () => setShort(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return short;
}

export interface ShopCardProps {
  shop: ShopState | null;
  /** The money rail every paid purchase in this shop settles on. */
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

  const short = useShortScreen();
  const corner = short ? SHORT_CORNER : TALL_CORNER;
  /* The frame's rails, in CSS px at this corner: what the sign and the [x]
     hang over. The slice is in source pixels; the corner is the left inset. */
  const railTop = Math.round(LEAF_FRAME_SLICE.top * (corner / LEAF_FRAME_SLICE.left));

  /**
   * THE STALL OPENS ON CARROTS, whatever rail the app remembers. `payToken`
   * is the money rail — which token a paid purchase settles on — and it
   * stays the app's, because the energy popup quotes on it too. Whether the
   * stall is currently showing carrots or money is this dialog's own state,
   * and it starts on carrots because that is the price everyone can pay.
   */
  const [onMoney, setOnMoney] = useState(false);
  /* THREE reasons there may be no money rail, not two: no treasury configured
     (off for everybody), a GUEST (on, but no wallet to send from), or both
     available. `onPayUsdc` is the only thing that knows whether a paid button
     could be rendered, so it is what decides whether there is a rail to pick. */
  const tokens = onPayUsdc && shop?.usdcEnabled ? shop.tokens : [];
  const rail: StallRail = onMoney && tokens.includes(payToken) ? payToken : 'carrots';
  const pickRail = (r: StallRail) => {
    if (r === 'carrots') { setOnMoney(false); return; }
    setOnMoney(true);
    onPayTokenChange(r);
  };

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
      <LeafFrame
        corner={corner}
        className={`rr-shop-modal rr-stall${short ? ' short' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={t.shop.aria}
        onClick={(e) => e.stopPropagation()}
      >
        <StallSign style={{ top: -railTop - 6 }} />
        {/* Off the frame's outer corner, over the leaves: the way out of a
            full-screen dialog should not have to be found inside it. */}
        <LeafClose
          className="rr-stall-x"
          onClick={onClose}
          aria-label="Close"
          size={40}
          style={{ top: -railTop - 14, right: -corner - 14 }}
        />

        <header className="rr-stall-head">
          <StallRails tokens={tokens} rail={rail} onRail={pickRail} />
          {/* The purse, in the head. Every price below is read against it, and
              making the player close the shop to check it is the one thing a
              shop must never do. */}
          <StallPurse stock={shop?.stock ?? 0} />
        </header>

        {/* THE SHELF: one row, slid sideways, snapping card to card. Seven
            cards do not fit any phone, so the last visible card is cut by the
            edge on purpose — a card half in view is what tells a thumb there
            is more. */}
        <ul className="rr-stall-shelf">
          {shop && shelfOrder(shop.items).map((item) => (
            <StallCard
              key={item.kind}
              item={item}
              rail={rail}
              rate={rail === 'carrots' ? undefined : shop.rates?.[rail]}
              busy={busyNow}
              size={short ? 'short' : 'tall'}
              onBuy={() => onBuy(item.kind)}
              onPayMoney={tokens.length ? () => onPayUsdc!(item.kind) : undefined}
            />
          ))}
        </ul>

        {/* The strapline, or what just happened. Which sentence depends on WHY
            there is or is not a money rail — see `tokens` above. The middle
            case used to describe a choice the player could not see. */}
        <footer className="rr-stall-foot">
          {status ? (
            <span className={error ? 'bad' : 'good'}>{status}</span>
          ) : shop && !shop.usdcEnabled ? (
            <span>{t.shop.cardsOff}</span>
          ) : shop && !onPayUsdc ? (
            <span>{t.shop.connectForCard}</span>
          ) : (
            <span>{t.shop.eitherWay}</span>
          )}
        </footer>
      </LeafFrame>
    </div>,
    document.body,
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
