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

/**
 * Plus petit que le 960x540 du jeu : dans le cadre Storybook, avec le volet
 * Controls ouvert en bas, un canvas pleine hauteur pousse le bouton hors de
 * l'écran. L'iris est proportionnel à la diagonale, donc il se lit pareil.
 */
const WIDTH = 720;
const HEIGHT = 405;

/** The two backdrops the game actually ships, so the iris is judged against
 *  real art rather than against flat colour — a hole cut out of a painted
 *  scene is the only version of this effect anyone will ever see. */
const ART = {
  burrow: '/assets/island/burrow_generated.webp',
  island: '/assets/island/land2.webp',
} as const;

type Where = keyof typeof ART;

function place(kind: Where, gradient: boolean): Container {
  const c = new Container();

  if (gradient) {
    // A vertical ramp instead of the art: flat bands make it obvious if the
    // aperture ever dims or tints what shows through it, which a busy painting
    // can hide. Drawn as strips because a Graphics fill takes one colour.
    const bands = 24;
    const top = kind === 'burrow' ? [0x6b3f1d, 0xe8b06a] : [0x0d4a63, 0x7fe3d0];
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      const g = new Graphics();
      g.rect(0, (i * HEIGHT) / bands, WIDTH, HEIGHT / bands + 1);
      g.fill(lerpColor(top[0], top[1], t));
      c.addChild(g);
    }
    return c;
  }

  const sprite = new Sprite(Assets.get<Texture>(ART[kind]));
  // `cover`, so neither backdrop letterboxes and the iris always has paint
  // under it wherever it opens.
  const scale = Math.max(WIDTH / sprite.texture.width, HEIGHT / sprite.texture.height);
  sprite.scale.set(scale);
  sprite.anchor.set(0.5);
  sprite.position.set(WIDTH / 2, HEIGHT / 2);
  c.addChild(sprite);
  return c;
}

/** Blend two packed RGB values — the gradient's only maths. */
function lerpColor(a: number, b: number, t: number): number {
  const ch = (v: number, shift: number) => (v >> shift) & 0xff;
  const mix = (shift: number) =>
    Math.round(ch(a, shift) + (ch(b, shift) - ch(a, shift)) * t) << shift;
  return mix(16) | mix(8) | mix(0);
}

interface Args {
  /** Park the iris part-open to inspect the silhouette at a fixed size. */
  aperture: number;
  frozen: boolean;
  /** Swap the painted backdrops for flat ramps — see `place`. */
  gradient: boolean;
}

function Scene({ aperture, frozen, gradient }: Args) {
  const playRef = useRef<(() => void) | null>(null);
  const [where, setWhere] = useState<Where>('burrow');

  return (
    <div style={{ display: 'grid', gap: 10, justifyItems: 'start', padding: 10 }}>
      {/* Le bouton AU-DESSUS du canvas, pas en dessous : sous 540px de rendu il
          sort du cadre et le volet Controls le recouvre — invisible et donc
          incliquable, ce qui rend la story inutilisable. */}
      <button
        onClick={() => playRef.current?.()}
        style={{
          font: '600 13px ui-monospace, monospace',
          padding: '10px 18px',
          cursor: 'pointer',
        }}
      >
        {frozen ? 'gelé — utilise le curseur aperture' : `GO — actuellement dans ${where === 'burrow' ? 'le terrier' : "l'île"}`}
      </button>
      <PixiStage
        width={WIDTH}
        height={HEIGHT}
        background="#000000"
        prepare={async () => { await Assets.load([CARROT_URL, ART.burrow, ART.island]); }}
        setup={(stage) => {
          const scenes = {
            burrow: place('burrow', gradient),
            island: place('island', gradient),
          };
          let current: Where = 'burrow';
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
    </div>
  );
}

const meta: Meta<Args> = {
  title: 'FX/Carrot wipe',
  render: (args) => <Scene key={JSON.stringify(args)} {...args} />,
  args: { aperture: 0.35, frozen: false, gradient: false },
  argTypes: { aperture: { control: { type: 'range', min: 0, max: 1, step: 0.01 } } },
};
export default meta;

type Story = StoryObj<Args>;

/** Press GO: the iris closes on a carrot, swaps the screen, and opens again. */
export const Wipe: Story = {};

/**
 * The same wipe over flat vertical ramps.
 *
 * Worth its own story because a painted backdrop can HIDE a fault: if the
 * aperture ever dimmed, tinted or feathered what shows through it, busy pixel
 * art would disguise it and a clean gradient will not.
 */
export const OverGradient: Story = { args: { gradient: true } };

/**
 * Parked mid-close, where the shape has to be legible. This is the frame the
 * whole effect is judged on — a carrot that reads as a blob here is a carrot
 * nobody will recognise at speed.
 */
export const Silhouette: Story = { args: { frozen: true, aperture: 0.3 } };

/** Nearly shut, the last moment before the cut. */
export const AlmostClosed: Story = { args: { frozen: true, aperture: 0.12 } };
