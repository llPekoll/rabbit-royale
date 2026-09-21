/**
 * THE STALL'S CARD, on its own — the piece of the shop that is judged by eye.
 *
 * The whole stall is `Burrow/Shop`; these stories isolate one card so the
 * ART can be looked at: some kinds are 24px sprites, some are emoji, and the
 * card draws them all at hero size. `AllKinds` puts the seven side by side,
 * which is where the resolution gap shows.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { StallCard, type StallRail } from '@/components/stall-card';
import type { ItemKind, ShopItem } from '@/components/use-shop';
import '@/app/globals.css';

/** Prices mirrored from tuning, so the story reads like the real shelf. */
const PRICES: Record<ItemKind, { price: number; usdc: number; cap: number }> = {
  energy: { price: 900, usdc: 0.99, cap: 5 },
  trap: { price: 180, usdc: 0.25, cap: 12 },
  bomb: { price: 300, usdc: 0.40, cap: 20 },
  lightning: { price: 520, usdc: 0.60, cap: 20 },
  shield: { price: 750, usdc: 0.90, cap: 20 },
  mirage: { price: 1100, usdc: 0.99, cap: 20 },
  fence: { price: 300, usdc: 0.40, cap: 4 },
  smoke: { price: 2400, usdc: 1.99, cap: 3 },
};
const KINDS = Object.keys(PRICES) as ItemKind[];

function item(kind: ItemKind, held: number, stock: number): ShopItem {
  const { price, usdc, cap } = PRICES[kind];
  return { kind, price, usdc, held, cap, hasRoom: held < cap, canBuy: stock >= price && held < cap };
}

interface CardArgs { kind: ItemKind; held: number; stock: number; rail: StallRail }

function Card({ kind, held, stock, rail }: CardArgs) {
  return (
    <div style={{ padding: 40, background: '#1d100a', display: 'inline-block' }}>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        <StallCard
          item={item(kind, held, stock)} rail={rail} rate={rail === 'sol' ? 200 : rail === 'skr' ? 0.02 : 1}
          busy={false} onBuy={() => {}} onPayMoney={() => {}}
        />
      </ul>
    </div>
  );
}

const meta: Meta<typeof Card> = {
  title: 'Burrow/Stall card',
  component: Card,
  parameters: { layout: 'fullscreen' },
  argTypes: {
    kind: { control: 'select', options: KINDS },
    rail: { control: 'inline-radio', options: ['carrots', 'usdc', 'sol', 'skr'] },
  },
};
export default meta;

type Story = StoryObj<typeof Card>;

/** One card, every knob. */
export const OneCard: Story = {
  args: { kind: 'shield', held: 2, stock: 4200, rail: 'carrots' },
};

/** Every kind side by side, at the same art height: the resolution gap. */
export const AllKinds: StoryObj<{ rail: StallRail }> = {
  render: ({ rail }) => (
    <ul style={{ display: 'flex', gap: 16, padding: 40, background: '#1d100a', flexWrap: 'wrap', listStyle: 'none', margin: 0 }}>
      {KINDS.map((kind) => (
        <StallCard
          key={kind} item={item(kind, kind === 'trap' ? 3 : 0, 4200)} rail={rail}
          rate={rail === 'sol' ? 200 : rail === 'skr' ? 0.02 : 1}
          busy={false} onBuy={() => {}} onPayMoney={() => {}}
        />
      ))}
    </ul>
  ),
  args: { rail: 'carrots' },
};
