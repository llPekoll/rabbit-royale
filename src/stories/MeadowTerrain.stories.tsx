/** Visual experiment only: the real burrow, sea and sky, with calm ground layers. */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Container, Texture } from 'pixi.js';
import { PixiStage } from './PixiStage';
import { loadAllAssets } from '@/game/services/AssetLoader';
import { createBurrowTerrain, type BurrowTerrainView } from '@/game/burrow/BurrowTerrain';
import { createSeaGradient } from '@/game/fx/SeaGradient';
import { SEA_GRADIENT_LOOK } from '@/config/waterLook';
import { CarrotCrop } from '@/game/entities/CarrotCrop';
import * as Keys from '@/config/assetKeys';

interface Args { zoom: number; seed: string; flat: boolean; details: boolean; shadows: boolean; shadowLength: number; autumn: boolean }

function Meadow(args: Args) {
  return <PixiStage width={960} height={540} background="#0d5f8c" prepare={loadAllAssets}
    setup={(stage, app) => {
      const look = SEA_GRADIENT_LOOK;
      const sea = createSeaGradient(960, 540, { ...look, angle: look.angleDeg * Math.PI / 180 });
      stage.addChild(sea.view);
      const world = new Container();
      world.sortableChildren = true;
      world.scale.set(args.zoom);
      world.position.set(480 * (1 - args.zoom), 270 - 290 * args.zoom);
      stage.addChild(world);
      let disposed = false;
      let terrain: BurrowTerrainView | undefined;
      let crop: CarrotCrop | undefined;
      void createBurrowTerrain(world, args.seed, 2, args).then(view => {
        if (disposed) { view.destroy(); return; }
        terrain = view;
        view.setShield(null);
        crop = new CarrotCrop(world, Texture.from(Keys.CARROT_GROWTH), args.seed, 2);
        crop.setProgress(.85);
        world.label = 'meadow-study-ready';
      });
      const tick = (t: {deltaMS:number}) => { terrain?.update(t.deltaMS); crop?.update(t.deltaMS); };
      app.ticker.add(tick);
      return () => { disposed = true; app.ticker.remove(tick); crop?.destroy(); terrain?.destroy(); sea.destroy(); };
    }} />;
}

const meta: Meta<Args> = {
  title: 'Burrow/Meadow study',
  parameters: { layout: 'fullscreen' },
  globals: { viewport: { value: 'desktop', isRotated: false } },
  render: args => <Meadow key={JSON.stringify(args)} {...args} />,
  args: { zoom: 1.5, seed: 'player-1', flat: true, details: true, shadows: true, shadowLength: .65, autumn: false },
  argTypes: { zoom: { control: { type: 'range', min: .8, max: 2.2, step: .1 } }, shadowLength: { control: { type: 'range', min: .2, max: 1.2, step: .05 } } },
};
export default meta;
type Story = StoryObj<Args>;
export const Clearing: Story = { name: 'Clairière · aplats et lumière' };
export const Bare: Story = { name: 'Les aplats seuls', args: { details: false, shadows: false } };
export const NoCastShadows: Story = { name: 'Sans ombres portées', args: { shadows: false } };
export const Autumn: Story = { name: 'Herbe de fin d’été', args: { autumn: true } };
export const Current: Story = { name: 'Sol actuel · comparaison', args: { flat: false, shadows: false } };
