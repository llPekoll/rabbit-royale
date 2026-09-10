/**
 * The carrot iris, the cartoon wipe between the burrow and the island.
 *
 * The story that most needs to exist: the effect is pure MOTION, and the two
 * things that decide whether it works — does the hole read as a carrot at the
 * moment it is small, and does the black hold long enough to hide a cut — are
 * both invisible in a screenshot. Press the button and watch.
 *
 * Driven by the real `CarrotWipe` over two stand-in scenes, so what is under
 * test is the wipe itself and not a mock of it. The "swap" at the midpoint is
 * the same shape as the game's: a callback that runs while nothing is visible.
 */
import { useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Container, Graphics, Sprite, Texture, Assets } from 'pixi.js';
import { PixiStage } from './PixiStage';
import { CarrotWipe } from '@/game/fx/CarrotWipe';
import { CARROT_URL } from '@domin8/arcade-kit/game';

const WIDTH = 960;
const HEIGHT = 540;

/** Two flat, obviously-different screens, so the cut is unmistakable. Bright
 *  on purpose: a dark stand-in makes a working hole look like a dimmed one. */
function place(kind: 'burrow' | 'island'): Container {
  const c = new Container();
  const bg = new Graphics();
  bg.rect(0, 0, WIDTH, HEIGHT);
  bg.fill(kind === 'burrow' ? 0x8a5a33 : 0x1eaac4);
  c.addChild(bg);

  // A few blocks, purely so the eye can tell the two screens apart mid-wipe.
  const g = new Graphics();
  for (let i = 0; i < 40; i++) {
    const x = (i * 137) % WIDTH;
    const y = (i * 89) % HEIGHT;
    g.rect(x, y, 46, 46);
    g.fill(kind === 'burrow' ? 0xc98a4b : 0x7ac74f);
  }
  c.addChild(g);
  return c;
}

interface Args {
  /** Park the iris part-open to inspect the silhouette at a fixed size. */
  aperture: number;
  frozen: boolean;
}

function Scene({ aperture, frozen }: Args) {
  const playRef = useRef<(() => void) | null>(null);
  const [where, setWhere] = useState<'burrow' | 'island'>('burrow');

  return (
    <div style={{ display: 'grid', gap: 10, justifyItems: 'start' }}>
      <PixiStage
        width={WIDTH}
        height={HEIGHT}
        background="#000000"
        prepare={async () => { await Assets.load(CARROT_URL); }}
        setup={(stage) => {
          const scenes = {
            burrow: place('burrow'),
            island: place('island'),
          };
          let current: 'burrow' | 'island' = 'burrow';
          scenes.island.visible = false;
          stage.addChild(scenes.burrow, scenes.island);

          const wipe = new CarrotWipe({
            width: WIDTH,
            height: HEIGHT,
            texture: Assets.get<Texture>(CARROT_URL),
          });
          stage.addChild(wipe.view);

          if (frozen) {
            wipe.view.visible = true;
            wipe.set(aperture);
          }

          playRef.current = () => {
            if (frozen) return;
            void wipe.play(() => {
              // The swap, at full black — exactly as the game does it.
              current = current === 'burrow' ? 'island' : 'burrow';
              scenes.burrow.visible = current === 'burrow';
              scenes.island.visible = current === 'island';
              setWhere(current);
            });
          };

          return () => { playRef.current = null; wipe.destroy(); };
        }}
      />
      <button
        onClick={() => playRef.current?.()}
        style={{ font: '600 13px ui-monospace, monospace', padding: '8px 14px' }}
      >
        {frozen ? 'frozen — use the aperture control' : `GO — currently in the ${where}`}
      </button>
    </div>
  );
}

const meta: Meta<Args> = {
  title: 'FX/Carrot wipe',
  render: (args) => <Scene key={JSON.stringify(args)} {...args} />,
  args: { aperture: 0.35, frozen: false },
  argTypes: { aperture: { control: { type: 'range', min: 0, max: 1, step: 0.01 } } },
};
export default meta;

type Story = StoryObj<Args>;

/** Press GO: the iris closes on a carrot, swaps the screen, and opens again. */
export const Wipe: Story = {};

/**
 * Parked mid-close, where the shape has to be legible. This is the frame the
 * whole effect is judged on — a carrot that reads as a blob here is a carrot
 * nobody will recognise at speed.
 */
export const Silhouette: Story = { args: { frozen: true, aperture: 0.3 } };

/** Nearly shut, the last moment before the cut. */
export const AlmostClosed: Story = { args: { frozen: true, aperture: 0.12 } };
