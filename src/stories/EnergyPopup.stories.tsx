/**
 * "Out of energy" — the popup behind GO FARM on an empty tank.
 *
 * Framed as the SEEKER sees it, like the shop stories: landscape, the burrow's
 * column over the art, the arrow at the bottom. That framing is the point of
 * the component — the dialog exists because the arrow used to be `disabled`
 * here, answering the only tap on the screen with silence.
 *
 * Interactive: press GO FARM. The three states worth judging are the ordinary
 * one, the broke one (the carrot price is out and the money price is not) and
 * the capped one (five refills taken today, so only the wait is left).
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { EnergyPopup } from '@/components/energy-popup';
import { GoButton } from '@/components/go-button';
import type { ItemKind, ShopState } from '@/components/use-shop';
import '@/app/globals.css';

const ART = '/assets/island/burrow_generated.webp';

/** Mirrored from tuning, so the story reads like the real shelf. */
const PRICES: Record<ItemKind, { price: number; usdc: number; cap: number }> = {
  trap: { price: 180, usdc: 0.25, cap: 12 },
  bomb: { price: 300, usdc: 0.40, cap: 20 },
  lightning: { price: 520, usdc: 0.60, cap: 20 },
  shield: { price: 750, usdc: 0.90, cap: 20 },
  energy: { price: 900, usdc: 0.99, cap: 5 },
  smoke: { price: 2400, usdc: 1.99, cap: 3 },
  mirage: { price: 1100, usdc: 0.99, cap: 20 },
};

function makeShop(stock: number, refillsTaken: number, usdcEnabled: boolean): ShopState {
  return {
    stock,
    usdcEnabled,
    tokens: usdcEnabled ? (['usdc', 'sol', 'skr'] as const).slice() : [],
    items: (Object.keys(PRICES) as ItemKind[]).map((kind) => {
      const { price, usdc, cap } = PRICES[kind];
      const have = kind === 'energy' ? refillsTaken : 0;
      return {
        kind, price, usdc, held: have, cap,
        hasRoom: have < cap,
        canBuy: stock >= price && have < cap,
      };
    }),
    traps: { held: 3, placed: 2, maxPlaced: 8, drain: 8, freePerDay: 3 },
  };
}

function Harness({
  stock = 4200,
  usdcEnabled = true,
  refillsTaken = 1,
  nextEnergyInMs = 14 * 60_000,
  open = true,
}: {
  stock?: number;
  usdcEnabled?: boolean;
  /** Refills already bought inside the rolling day. Five is the ceiling. */
  refillsTaken?: number;
  nextEnergyInMs?: number | null;
  open?: boolean;
}) {
  const [carrots, setCarrots] = useState(stock);
  const [taken, setTaken] = useState(refillsTaken);
  const [energy, setEnergy] = useState(0);
  const [popup, setPopup] = useState(open);
  const [note, setNote] = useState<string | null>(null);

  const shop = makeShop(carrots, taken, usdcEnabled);
  const maxEnergy = 20;

  const buy = () => {
    const { price, cap } = PRICES.energy;
    if (taken >= cap) { setNote('No more refills today. The garden still grows.'); return; }
    if (carrots < price) { setNote('Not enough carrots.'); return; }
    setCarrots((c) => c - price);
    setTaken((t) => t + 1);
    setEnergy(maxEnergy);
    setPopup(false);
  };

  return (
    <div style={{
      width: 900, height: 500, position: 'relative',
      overflow: 'hidden', background: '#2d5a27',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `url(${ART})`, backgroundSize: 'cover',
        backgroundPosition: 'center', imageRendering: 'pixelated',
      }} />
      <div style={{
        position: 'relative', width: 380, height: '100%', padding: 12,
        display: 'flex', flexDirection: 'column', gap: 8,
        background: 'linear-gradient(90deg, rgba(13,17,23,0.82) 60%, rgba(13,17,23,0))',
      }}>
        <h1 className="rr-burrow-title" style={{ margin: 0 }}>
          Your burrow &middot; {carrots} &#127823;
        </h1>
        <div className="rr-card" style={{ margin: 0 }}>
          <div className="rr-row">
            <span>Energy</span>
            <span style={{ color: energy > 0 ? 'var(--carrot)' : 'var(--danger)' }}>
              {energy}/{maxEnergy}
            </span>
          </div>
        </div>
      </div>

      {/* The button this dialog is about. Never disabled — an empty tank opens
          the popup rather than eating the press. */}
      <GoButton
        dir="down"
        label="Go farm"
        onClick={() => { if (energy > 0) { setNote('Would cross to the island.'); return; } setPopup(true); }}
      />

      {popup && (
        <EnergyPopup
          shop={shop}
          stock={carrots}
          energy={energy}
          maxEnergy={maxEnergy}
          nextEnergyInMs={nextEnergyInMs}
          busy={false}
          note={note}
          onBuy={buy}
          onPayUsdc={usdcEnabled ? () => setNote('Would open the wallet.') : undefined}
          onOpenShop={() => { setPopup(false); setNote('Would open the shed.'); }}
          onClose={() => { setPopup(false); setNote(null); }}
        />
      )}
    </div>
  );
}

const meta: Meta<typeof Harness> = {
  title: 'Burrow/EnergyPopup',
  component: Harness,
  parameters: { layout: 'centered' },
};
export default meta;
type Story = StoryObj<typeof Harness>;

/** The ordinary case: carrots in the purse, both routes open, a short wait. */
export const Default: Story = {};

/** Shut, which is the state the arrow is pressed from. Press GO FARM. */
export const Closed: Story = { args: { open: false } };

/**
 * Broke. The carrot price is out and the dollar price is not — having no
 * carrots is not the same as having no way to buy, and the free wait is still
 * written above both.
 */
export const Broke: Story = { args: { stock: 40 } };

/**
 * Five refills taken today. Both prices close, and what is left is the clock —
 * which is exactly why the wait is stated before the offer rather than under it.
 */
export const Capped: Story = { args: { refillsTaken: 5, stock: 999_999 } };

/** No treasury configured: the money route is hidden rather than shown broken. */
export const CarrotsOnly: Story = { args: { usdcEnabled: false } };

/** A long wait — the case that makes the paid line worth reading. */
export const LongWait: Story = { args: { nextEnergyInMs: 3 * 3_600_000 + 20 * 60_000 } };
