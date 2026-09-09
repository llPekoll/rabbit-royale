/**
 * The drifting sky, on its own.
 *
 * Worth isolating because the thing to judge is SPEED and DENSITY, and both are
 * invisible in a screenshot — you have to watch it. The bare-sea variant drops
 * the island so the bands are visible as bands.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { PixiStage } from './PixiStage';
import { CloudField } from '@/game/fx/Clouds';
import { createIslandBackground } from '@/game/services/IslandBackground';
import { loadAllAssets } from '@/game/services/AssetLoader';

interface Args {
  perBand: number;
  island: boolean;
}

function Scene({ perBand, island }: Args) {
  return (
    <PixiStage
      width={960}
      height={540}
      background="#1eaac4"
      prepare={() => loadAllAssets()}
      setup={(stage, app) => {
        let bg: { destroy(): void } | null = null;
        if (island) {
          void createIslandBackground(stage, 480, 270).then((b) => { bg = b; });
        }
        const sky = new CloudField(stage, { width: 960, height: 540, perBand });
        const ticker = (t: { deltaTime: number }) => sky.update(t.deltaTime * (1000 / 60));
        app.ticker.add(ticker);
        return () => { app.ticker.remove(ticker); sky.destroy(); bg?.destroy(); };
      }}
    />
  );
}

const meta: Meta<Args> = {
  title: 'Island/Clouds',
  render: (args) => <Scene key={JSON.stringify(args)} {...args} />,
  args: { perBand: 4, island: true },
  argTypes: { perBand: { control: { type: 'range', min: 1, max: 10, step: 1 } } },
};
export default meta;

type Story = StoryObj<Args>;

/** As the game draws it: clouds on all four sides, never over the board. */
export const OverTheIsland: Story = {};

/** No island — the four bands, visible as bands. */
export const BareSea: Story = { args: { island: false } };

/** Overcast, for judging where density starts to distract. */
export const Dense: Story = { args: { perBand: 9 } };
