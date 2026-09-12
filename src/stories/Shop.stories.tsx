/**
 * The shop: the button in the burrow, and the drawer it opens.
 *
 * Framed as the SEEKER sees it — landscape, the panels in a column over the
 * burrow art — because that is the device this game is built for, and a shop
 * judged on a desktop page is judged somewhere it will rarely be.
 *
 * The drawer exists BECAUSE of this framing: as a card in the column it put its
 * fifth item below the fold, which made buying energy a scroll nobody would
 * find. So the question these stories answer is whether the panel is readable
 * at 330px and whether the two prices still read as equals inside it.
 *
 * Interactive: press Shop, buy things, watch a line hit its cap. Escape or a
 * tap on the scrim closes it, like every other drawer in the game.
 *
 * The currency switch in the header re-prices every tile. Worth flicking
 * through: `0.0013 SOL` is a longer string than `$0.25`, and the money button
 * shares its row with the carrot price at 330px.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { ShopButton, ShopPanel } from '@/components/shop-card';
import type { ItemKind, ShopState } from '@/components/use-shop';
import type { PayTokenId } from '@/lib/pay/tokens';
import '@/app/globals.css';

const ART = '/assets/island/burrow_generated.webp';

/** Prices mirrored from tuning, so the story reads like the real shelf. */
const PRICES: Record<ItemKind, { price: number; usdc: number; cap: number }> = {
  trap: { price: 180, usdc: 0.25, cap: 12 },
  bomb: { price: 300, usdc: 0.40, cap: 20 },
  lightning: { price: 520, usdc: 0.60, cap: 20 },
  shield: { price: 750, usdc: 0.90, cap: 20 },
  energy: { price: 900, usdc: 0.99, cap: 5 },
  smoke: { price: 2400, usdc: 1.99, cap: 3 },
  mirage: { price: 1100, usdc: 0.99, cap: 20 },
};

function makeShop(stock: number, held: Partial<Record<ItemKind, number>>, usdcEnabled: boolean): ShopState {
  return {
    stock,
    usdcEnabled,
    // Mirrors what the server sends: the rails this deployment takes.
    tokens: usdcEnabled ? (['usdc', 'sol', 'skr'] as const).slice() : [],
    items: (Object.keys(PRICES) as ItemKind[]).map((kind) => {
      const { price, usdc, cap } = PRICES[kind];
      const have = held[kind] ?? 0;
      return {
        kind, price, usdc, held: have, cap,
        hasRoom: have < cap,
        canBuy: stock >= price && have < cap,
      };
    }),
    traps: { held: held.trap ?? 3, placed: 2, maxPlaced: 8, drain: 8, freePerDay: 3 },
    // Roughly what Jupiter was quoting when this was written. The story needs
    // real-ish magnitudes rather than round numbers: SOL at $200 is what turns
    // a $0.25 trap into `0.0013 SOL`, and whether THAT fits the button is the
    // thing worth looking at here.
    rates: usdcEnabled ? { usdc: 1, sol: 200, skr: 0.02 } : null,
  };
}

function Harness({
  stock = 4200,
  usdcEnabled = true,
  held = {},
  open = true,
}: {
  stock?: number;
  usdcEnabled?: boolean;
  held?: Partial<Record<ItemKind, number>>;
  /** Start with the drawer up. Most stories do — it is what they are about. */
  open?: boolean;
}) {
  const [bag, setBag] = useState<Partial<Record<ItemKind, number>>>(held);
  const [carrots, setCarrots] = useState(stock);
  const [shopOpen, setShopOpen] = useState(open);
  const [placing, setPlacing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [rail, setRail] = useState<PayTokenId>('usdc');

  const shop = makeShop(carrots, bag, usdcEnabled);

  const buy = (kind: ItemKind) => {
    const { price, cap } = PRICES[kind];
    if ((bag[kind] ?? 0) >= cap) { setNote('Your bag is full of those.'); return; }
    if (carrots < price) { setNote('Not enough carrots.'); return; }
    setCarrots((c) => c - price);
    setBag((b) => ({ ...b, [kind]: (b[kind] ?? 0) + 1 }));
    setNote(`Bought a ${kind}. -${price} carrots`);
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

        {/* The burrow's own panels, so the Shop button is judged BESIDE the
            things it competes with rather than alone on a page. */}
        <div className="rr-card" style={{ margin: 0 }}>
          <div className="rr-row">
            <span>&#127793; Garden</span>
            <span style={{ color: 'var(--carrot)' }}>+48</span>
          </div>
          <button style={{ width: '100%' }}>Harvest</button>
        </div>

        {placing ? (
          <button className="rr-btn" onClick={() => setPlacing(false)}>Done placing</button>
        ) : (
          <ShopButton shop={shop} onOpen={() => setShopOpen(true)} />
        )}

        {placing && (
          <p className="rr-note">
            Tap a tile to mine it &middot; {shop.traps.held} left
          </p>
        )}
      </div>

      {shopOpen && (
        <ShopPanel
          payToken={rail}
          onPayTokenChange={setRail}
          shop={shop}
          busy={false}
          onBuy={buy}
          onPayUsdc={usdcEnabled ? (k: ItemKind) => setNote(`Would open the wallet for ${k}`) : undefined}
          note={note}
          onPlaceTraps={() => { setShopOpen(false); setPlacing(true); }}
          onClose={() => { setShopOpen(false); setNote(null); }}
        />
      )}
    </div>
  );
}

const meta: Meta<typeof Harness> = {
  title: 'Burrow/Shop',
  component: Harness,
  parameters: { layout: 'centered' },
};
export default meta;
type Story = StoryObj<typeof Harness>;

/** The ordinary case: some carrots, both routes open. */
export const Default: Story = {};

/**
 * Shut, which is how the burrow actually looks most of the time.
 *
 * The button is the whole shop from here, and it still has to report the
 * defence — a player must be able to see their burrow is unmined without
 * opening anything. Press it.
 */
export const Closed: Story = { args: { open: false } };

/**
 * No treasury configured, so the money route is hidden entirely rather than
 * shown as a button that cannot complete.
 */
export const CarrotsOnly: Story = { args: { usdcEnabled: false } };

/**
 * Broke. Every carrot button is out, every USDC button still live — which is
 * the point of keeping the two independent: having no carrots is not the same
 * as having no way to buy.
 */
export const Broke: Story = { args: { stock: 12 } };

/**
 * At the caps. A full bag closes BOTH buttons on that line, which is what stops
 * money buying past a limit the grind cannot pass.
 */
export const Capped: Story = {
  args: {
    stock: 999_999,
    held: { bomb: 20, lightning: 20, shield: 20, trap: 12, energy: 5 },
  },
};
