/**
 * THE LOOP BAR — DIG ▸ DEFEND ▸ RAID, on the burrow's floor.
 *
 * WHAT TO JUDGE HERE:
 *
 *  1. THE ALERT BADGE. `questDoor` is what puts the red "!" on a slab, and it
 *     is the painted pill now (leaf-badge.tsx) rather than the kit's flat
 *     chip. `Pointed` shows it on each of the three slabs in turn — the pill
 *     must hang off the corner without being clipped by the slab's own box,
 *     and its ends must keep their shape at the 20px it is drawn at.
 *  2. THE DIAL AND ITS CARROT. DIG wears the whole medallion, and the carrot
 *     lies across it at 45deg. Press the slab: the board, the coloured ring
 *     AND the carrot must sink together as one object, and the carrot must
 *     keep its angle rather than snapping upright.
 *  3. THE TANK. `dig.energy` drives the ring anticlockwise from 12 o'clock.
 *     `Empty` and `Full` are the two ends of it.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { LoopBar } from '@/components/loop-bar';
import { LocaleProvider } from '@/i18n/provider';
import '@/app/globals.css';
import '@/app/px-top-floor.css';

const meta: Meta<typeof LoopBar> = {
  title: 'Chrome/LoopBar',
  component: LoopBar,
  parameters: { layout: 'fullscreen', backgrounds: { disable: true } },
  decorators: [
    (Story) => (
      <LocaleProvider>
        <div
          style={{
            minHeight: '100vh',
            background: 'linear-gradient(180deg, #2a7d9e 0%, #3f9ab4 55%, #6fbf8f 100%)',
          }}
        >
          <Story />
        </div>
      </LocaleProvider>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof LoopBar>;

const base = {
  dig: { energy: 40, maxEnergy: 60, runCost: 20, crossingCost: 5, nextRunInMs: null, regenPerHour: 30 },
  home: { gardenReady: 0, shieldMs: 172_800_000, trapsLive: 0, trapsPlaced: 0 },
  raid: { open: 9, best: null, bombs: 0 },
  onDig: () => {},
  onHome: () => {},
  onRaid: () => {},
};

/** No quest pointing anywhere: three slabs, no badge. */
export const Plain: Story = { args: { ...base } };

/** The quest points at DIG — the badge hangs off the medallion's slab. */
export const PointedDig: Story = { args: { ...base, questDoor: 'farm' } };

/** At DEFEND. */
export const PointedHome: Story = { args: { ...base, questDoor: 'garden' } };

/** At RAID, where the slab is red and the pill has to survive on it. */
export const PointedRaid: Story = { args: { ...base, questDoor: 'raid' } };

/** The tank at both ends, to read the ring against the carrot. */
export const Empty: Story = {
  args: { ...base, dig: { ...base.dig, energy: 0 }, questDoor: 'farm' },
};
export const Full: Story = {
  args: { ...base, dig: { ...base.dig, energy: 60 }, questDoor: 'farm' },
};
