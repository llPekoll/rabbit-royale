/**
 * The wipes — the cartoon transitions between the burrow and the island.
 *
 * Four of them, drawn at random per crossing in the game: an iris closing on a
 * carrot, on a rabbit, on a bomb, and a plain curtain sweeping in from one
 * side. Each gets its OWN story, because each fails in its own way and only
 * one at a time can be judged: a silhouette is judged on whether it is still
 * recognisable at the moment the hole is small, and the curtain on whether its
 * feathered edge reads as light going out rather than as a black rectangle
 * sliding past.
 *
 * The stories that most need to exist: the effect is pure MOTION, and the two
 * things that decide whether it works — does the shape read at the moment it is
 * small, and does the black hold long enough to hide a cut — are both invisible
 * in a screenshot. Press the button and watch.
 *
 * Driven by the real `RandomWipe` over two stand-in scenes, so what is under
 * test is the wipe itself and not a mock of it — with `pick` pinned to one
 * variant, which is the hook the class exposes for exactly this. The "swap" at
 * the midpoint is the same shape as the game's: a callback that runs while
 * nothing is visible.
 */
import { useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Container, Graphics, Sprite, Texture, Assets } from 'pixi.js';
import { PixiStage } from './PixiStage';
import { RandomWipe, type WipeVariant } from '@/game/fx/RandomWipe';
import { WIPE_MASK_URLS, type WipeShape } from '@/config/wipe';

/** The generated apertures — see tools/gen_carrot_mask.py and
 *  tools/gen_wipe_masks.py. */
const MASK_URLS = Object.values(WIPE_MASK_URLS);

/** Breath between passes in the looping stories, so each wipe reads as one. */
const LOOP_PAUSE_MS = 700;

/**
 * Plus petit que le 960x540 du jeu : dans le cadre Storybook, avec le volet
 * Controls ouvert en bas, un canvas pleine hauteur pousse le bouton hors de
 * l'écran. L'iris est proportionnel à la diagonale, donc il se lit pareil.
 */
const WIDTH = 720;
const HEIGHT = 405;

/** The backdrops the game actually ships, so the wipe is judged against real
 *  art rather than against flat colour — a hole cut out of a painted scene is
 *  the only version of this effect anyone will ever see.
 *
 *  Both entries are the burrow's painting since the three island paintings
 *  (`land1/2/3`) were deleted: the island is DRAWN now, cell by cell, from
 *  the seed (`TerrainBackground`), so there is no single picture of one left
 *  to cut a hole in. The wipe does not care which art it covers — it is
 *  judged on the edge of the hole — and a painted scene is still what it
 *  needs to be judged against. */
const ART = {
  burrow: '/assets/island/burrow_generated.webp',
  island: '/assets/island/burrow_generated.webp',
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
  // `cover`, so neither backdrop letterboxes and the wipe always has paint
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
  /**
   * Which of the four to draw, or `random` for the rotation the game runs.
   *
   * Pinned per story rather than left to chance: a story whose effect changes
   * between presses cannot be used to judge any one of them.
   */
  variant: WipeVariant | 'random';
  /** Park a SHAPE wipe part-open to inspect the silhouette at a fixed size.
   *  Has no meaning for the curtain, which has no silhouette to inspect. */
  aperture: number;
  frozen: boolean;
  /** Swap the painted backdrops for flat ramps — see `place`. */
  gradient: boolean;
  /** Run the wipe over and over, so the motion can be watched rather than
   *  triggered — the timing is the thing under review, and a single press is
   *  over before the eye has settled. */
  loop: boolean;
}

function Scene({ variant, aperture, frozen, gradient, loop }: Args) {
  const playRef = useRef<(() => void) | null>(null);
  const [where, setWhere] = useState<Where>('burrow');
  // What the last crossing actually drew. Only interesting in the `random`
  // story, where the whole question is whether the rotation is really varying.
  const [drew, setDrew] = useState<WipeVariant | null>(null);

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
        {frozen
          ? 'gelé - utilise le curseur aperture'
          : `GO - actuellement dans ${where === 'burrow' ? 'le terrier' : "l'île"}`}
        {variant === 'random' && drew ? ` - dernier : ${drew}` : ''}
      </button>
      <PixiStage
        width={WIDTH}
        height={HEIGHT}
        background="#000000"
        prepare={async () => { await Assets.load([...MASK_URLS, ART.burrow, ART.island]); }}
        setup={(stage) => {
          const scenes = {
            burrow: place('burrow', gradient),
            island: place('island', gradient),
          };
          let current: Where = 'burrow';
          scenes.island.visible = false;
          stage.addChild(scenes.burrow, scenes.island);

          const wipe = new RandomWipe({
            width: WIDTH,
            height: HEIGHT,
            textures: Object.fromEntries(
              (Object.keys(WIPE_MASK_URLS) as WipeShape[])
                .map((shape) => [shape, Assets.get<Texture>(WIPE_MASK_URLS[shape])]),
            ),
            // The story's whole trick: `random` leaves the game's own draw
            // alone, anything else pins this story to one effect.
            pick: variant === 'random' ? undefined : () => variant,
            // The sand dissolve is the one variant that needs the scenes
            // themselves — it has nothing to cover with, it removes the
            // outgoing scene to reveal the one underneath. `current` is still
            // the scene being LEFT at the moment this is asked, which is the
            // fact it needs; see `Application` for the same wiring in the game.
            scenes: () => ({
              from: scenes[current],
              to: scenes[current === 'burrow' ? 'island' : 'burrow'],
            }),
          });
          stage.addChild(wipe.view);

          // Freezing reaches past `RandomWipe` into the one variant being
          // shown, because parking a shape half-open is not something a
          // crossing does — it is an inspection, and only the shape wipes have
          // an aperture to park. `RandomWipe` deliberately exposes no `set`:
          // the game never needs one, and adding it there to serve a story
          // would put a control on the shipping class that nothing ships with.
          if (frozen && variant !== 'random' && variant !== 'curtain' && variant !== 'sand') {
            const shape = wipe.shapeWipe(variant);
            if (shape) {
              shape.view.visible = true;
              shape.set(aperture);
            }
          }

          const cross = () => wipe.play(() => {
            // The swap, at full black — exactly as the game does it.
            current = current === 'burrow' ? 'island' : 'burrow';
            scenes.burrow.visible = current === 'burrow';
            scenes.island.visible = current === 'island';
            setWhere(current);
          }).then(() => { setDrew(wipe.variant); });

          playRef.current = () => { if (!frozen) void cross(); };

          // Parked inspection for the sand, mirroring what `frozen` does for
          // the shape apertures: the crumble is eased, so sampling it on a
          // timer clusters the frames at the ends and skips the mixed middle —
          // which is the only part where there is anything to judge.
          if (frozen && (variant === 'sand' || variant === 'curtain')) {
            const pair = {
              from: scenes[current],
              to: scenes[current === 'burrow' ? 'island' : 'burrow'],
            };
            const fx = variant === 'sand' ? wipe.sandWipe() : wipe.curtainWipe();
            fx.stack(pair);
            fx.set(aperture);
          }

          // The loop waits a beat between passes: back to back, the reopening
          // of one wipe runs into the closing of the next and the shape never
          // gets a moment to be seen whole.
          let timer: ReturnType<typeof setTimeout> | null = null;
          let stopped = false;
          if (loop && !frozen) {
            const again = async () => {
              while (!stopped) {
                await cross();
                if (stopped) break;
                await new Promise<void>((r) => { timer = setTimeout(r, LOOP_PAUSE_MS); });
              }
            };
            void again();
          }

          return () => {
            stopped = true;
            if (timer) clearTimeout(timer);
            playRef.current = null;
            wipe.destroy();
          };
        }}
      />
    </div>
  );
}

const meta: Meta<Args> = {
  title: 'FX/Wipes',
  render: (args) => <Scene key={JSON.stringify(args)} {...args} />,
  args: { variant: 'random', aperture: 0.35, frozen: false, gradient: false, loop: false },
  argTypes: {
    aperture: { control: { type: 'range', min: 0, max: 1, step: 0.01 } },
    variant: {
      control: { type: 'inline-radio' },
      options: ['random', 'carrot', 'bunny', 'bomb', 'curtain', 'sand'],
    },
  },
};
export default meta;

type Story = StoryObj<Args>;

/**
 * The rotation as it ships: press GO and get one of the four, unweighted.
 *
 * The story for the question the others cannot answer — whether the variety
 * actually reads as variety, or whether two of them are close enough that a
 * player would not notice the difference. The button names what was drawn, so
 * a run of the same one is visibly a run and not a suspicion.
 */
export const Random: Story = {};

/** The rotation, over and over. Leave it running to see how quickly (or not)
 *  the four start to feel like a set rather than four unrelated effects. */
export const RandomLooping: Story = { args: { loop: true } };

/** The carrot iris — the game's signature, and the only one the sign-in cut
 *  ever uses. */
export const Carrot: Story = { args: { variant: 'carrot', loop: true } };

/** The rabbit iris. The silhouette to watch: ears are thin, and thin things
 *  are what disappear first when a mask is scaled down. */
export const Bunny: Story = { args: { variant: 'bunny', loop: true } };

/** The bomb iris. Nearly round, so the risk here is the opposite one — that it
 *  reads as a plain circle iris and the fuse never registers. */
export const Bomb: Story = { args: { variant: 'bomb', loop: true } };

/**
 * The curtain — the plain sweep, direction drawn per pass.
 *
 * Watch the leading edge. The whole reason it is a gradient is that a hard edge
 * reads as a black rectangle passing in FRONT of the screen; feathered, it
 * reads as the light going out. If it ever looks like an object, the ramp is
 * too narrow.
 */
export const Curtain: Story = { args: { variant: 'curtain', loop: true } };

/**
 * The sand — the outgoing scene crumbling away to reveal the new one under it.
 *
 * The odd one out, and the story is here to check the one claim that separates
 * it from the rest: THERE IS NO BLACK. Not a hold, not a frame, not a margin.
 * Every pixel on screen at every instant belongs to one scene or the other, so
 * if any frame of this shows the background through, the scenes are not
 * stacked and the dissolve is eating a hole in the world rather than crossing
 * between two of them.
 *
 * The other thing to watch is the GRAIN. It should read as the picture being
 * made of pixels — square dots on the screen's own grid, the size of an art
 * pixel. If it shimmers or crawls between frames the dither is being sampled
 * in the wrong space, which is the failure `DissolveFilter` was written to
 * avoid and the one that looks like a compression artefact.
 */
export const Sand: Story = { args: { variant: 'sand', loop: true } };

/**
 * Every wipe over flat vertical ramps.
 *
 * Worth its own story because a painted backdrop can HIDE a fault: if an
 * aperture ever dimmed, tinted or feathered what shows through it, busy pixel
 * art would disguise it and a clean gradient will not. Doubly so for the
 * curtain, whose ramp is alpha over whatever is behind it — banding shows up on
 * a flat field and nowhere else.
 */
export const OverGradient: Story = { args: { gradient: true, loop: true } };

/**
 * The carrot parked mid-close, where the shape has to be legible. This is the
 * frame the whole effect is judged on — a carrot that reads as a blob here is a
 * carrot nobody will recognise at speed.
 */
export const Silhouette: Story = { args: { variant: 'carrot', frozen: true, aperture: 0.3 } };

/** The rabbit at the same size, for the same judgement. */
export const BunnySilhouette: Story = { args: { variant: 'bunny', frozen: true, aperture: 0.3 } };

/** The bomb at the same size, for the same judgement. */
export const BombSilhouette: Story = { args: { variant: 'bomb', frozen: true, aperture: 0.3 } };

/** Nearly shut, the last moment before the cut. */
export const AlmostClosed: Story = { args: { variant: 'carrot', frozen: true, aperture: 0.12 } };
