'use client';

/**
 * "Out of energy" — the small dialog, right where the player pressed.
 *
 * Pressing GO FARM on an empty tank used to do NOTHING: the arrow was
 * disabled, so the one control on the screen answered a tap with silence, and
 * the only way to a refill was the recap's "Get more energy" — which a player
 * who walked home rather than dying never sees. The way out of an empty bar
 * was therefore reachable only from one of the two ways of emptying it.
 *
 * So the button stays live and this opens instead. It is deliberately NOT the
 * Shed: that is a market stall with seven shelves and a defence report, and
 * answering "I want to dig now" with a whole shop is how a player loses the
 * thread of what they were doing. One line of state, one price, one purchase,
 * and the door back to the full shop for anyone who wants the rest.
 *
 * It borrows the Shed's palette on purpose (`rr-shop-scrim` is the same warm
 * soil and lamplight) — a second dialog in a second style would read as a
 * second game.
 */
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CloseButton, NineSlicePanel, PanelTitle } from '@domin8/arcade-kit';
import { PxButton, PxPanel, pxLabel } from './px';
import {
  CARROT_BTN, CHALK, COIN_BTN, DIALOG_PX, PLANK, PLANK_LIT, SOIL, SOIL_DEEP, priceText,
} from './shop-card';
import type { ShopItem, ShopState } from './use-shop';
import type { PayStage } from './use-usdc-pay';
import { priceLabel, type PayTokenId } from '@/lib/pay/tokens';

export interface EnergyPopupProps {
  /** The shelf, for the energy line's price and its daily window. Null while loading. */
  shop: ShopState | null;
  /** Carrots in the burrow right now — the number the price is judged against. */
  stock: number;
  energy: number;
  maxEnergy: number;
  /** Time to the next free point, or null when the bar is full. */
  nextEnergyInMs: number | null;
  /**
   * What a run takes out of the bar (ENERGY.RUN_COST), and how long until the
   * bar holds that much — null when it already does. Both optional so a
   * caller that predates the charge still renders; without them the dialog
   * falls back to counting single points.
   */
  runCost?: number;
  nextRunInMs?: number | null;
  busy: boolean;
  /**
   * The rail the purchase will settle on — chosen in the Shed, not here.
   *
   * This popup has no currency switch (one line, one price is the whole point
   * of it), but it MUST price in the same rail the payment uses: a button that
   * says `$0.99` and then asks the wallet for SOL is the one lie a money button
   * cannot tell.
   */
  payToken: PayTokenId;
  payStage?: PayStage;
  note?: string | null;
  error?: string | null;
  onBuy(): void;
  /** Absent when the money route is off, or for a guest with no wallet. */
  onPayUsdc?(): void;
  /** The rest of the shed, for a player who came for more than a refill. */
  onOpenShop(): void;
  onClose(): void;
}

export function EnergyPopup({
  shop, stock, energy, maxEnergy, nextEnergyInMs, runCost, nextRunInMs, busy, payToken, payStage = 'idle',
  note, error, onBuy, onPayUsdc, onOpenShop, onClose,
}: EnergyPopupProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const item: ShopItem | undefined = shop?.items.find((i) => i.kind === 'energy');
  const busyNow = busy || payStage !== 'idle';
  // Refills LEFT, not refills taken: the player is deciding whether to spend
  // one, and "3 taken" is the same fact asked backwards.
  const left = item ? item.cap - item.held : null;
  const capped = left !== null && left <= 0;
  const status = error
    ?? (payStage !== 'idle' && payStage !== 'done' ? PAY_STAGE[payStage] : note);

  return createPortal(
    <div className="rr-shop-scrim" onClick={onClose}>
      <NineSlicePanel
        color={SOIL}
        pixelScale={DIALOG_PX}
        className="rr-shop-modal rr-energy-modal rr-px-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Out of energy"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="rr-shop-top">
          <h2><PanelTitle>OUT OF ENERGY</PanelTitle></h2>
          <span className="rr-shop-purse">{stock.toLocaleString()} 🥕</span>
          <CloseButton inline className="rr-shop-x" onClick={onClose} aria-label="Close" style={{ minWidth: 44 }} />
        </header>

        {/* The middle scrolls, so a short screen keeps the title, the [X] and
            the way to the shed on it whatever the copy wraps to. */}
        <div className="rr-energy-body">
        {/* The bar, then the wait. Both are the reason the dialog is open, and
            the free route is stated BEFORE the paid one — a refill offered
            without the wait beside it is a toll rather than a shortcut. */}
        {/* A nested panel in the deep soil its band always was. */}
        <PxPanel color={SOIL_DEEP} className="rr-energy-state">
          <span className="rr-energy-count">
            {energy}<i>/{maxEnergy}</i>
          </span>
          {/* Plain ASCII punctuation only: the pixel face has no em dash and
              draws one as a blank box. See test/pixel-font-glyphs. */}
          <span className="rr-energy-say">
            {runCost
              ? <>A run takes {runCost}. Enough comes back on its own in{' '}
                {formatWait(nextRunInMs ?? nextEnergyInMs)}. Or fill it now and keep digging.</>
              : <>The bar is empty. One point comes back on its own in{' '}
                {formatWait(nextEnergyInMs)}. Or fill it now and keep digging.</>}
          </span>
        </PxPanel>

        <div className="rr-energy-buy">
          <span className="rr-energy-blurb">
            Fills the bar to {maxEnergy}.
            {left !== null && (
              <i>{capped ? ' No refills left today.' : ` ${left} refill${left > 1 ? 's' : ''} left today.`}</i>
            )}
          </span>
          <div className="rr-shop-tile-buy">
            <PxButton
              className="rr-pay-carrot"
              {...CARROT_BTN}
              wiggle
              onClick={onBuy}
              disabled={busyNow || !item || !item.canBuy}
            >
              <span style={priceText}>{item ? `${item.price.toLocaleString()} 🥕` : '...'}</span>
            </PxButton>
            {onPayUsdc && item && (
              <PxButton
                className="rr-pay-usdc"
                {...COIN_BTN}
                wiggle
                onClick={onPayUsdc}
                disabled={busyNow || !item.hasRoom}
                title={`$${item.usdc.toFixed(2)}`}
              >
                <span style={priceText}>{priceLabel(item.usdc, payToken, shop?.rates?.[payToken])}</span>
              </PxButton>
            )}
          </div>
        </div>
        </div>

        <footer className="rr-shop-foot">
          {status
            ? <PxPanel color={PLANK} className="rr-px-note"><span className={error ? 'bad' : 'good'}>{status}</span></PxPanel>
            /* A door, not a second offer: a quiet board in the lamp-lit plank
               of the stall it opens, chalk ink. */
            : (
              <PxButton
                className="rr-energy-more"
                color={PLANK_LIT}
                shadowColor={PLANK}
                textColor={CHALK}
                onClick={onOpenShop}
              >
                <span style={{ ...pxLabel, fontSize: 11 }}>Open the shed</span>
              </PxButton>
            )}
        </footer>
      </NineSlicePanel>
    </div>,
    document.body,
  );
}

/** Same wording as the burrow's own energy card — one clock, said one way. */
function formatWait(ms: number | null): string {
  if (ms === null) return 'a moment';
  const mins = Math.ceil(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

const PAY_STAGE: Record<string, string> = {
  quoting: 'Pricing...',
  signing: 'Approve it in your wallet...',
  confirming: 'Confirming on chain...',
};
