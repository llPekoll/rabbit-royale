/**
 * The Godot caustic water shader, on the island's isometric board.
 *
 * A found `canvas_item` material — caustics, specular filigree, foam band and
 * a coast outline, each its own layer keyed off a three-channel mask. The
 * fragment body in `fx/GodotCausticWater.ts` is the Godot source with Godot's
 * built-in names swapped for Pixi's and NOTHING else changed; the port's
 * header lists that rename line for line.
 *
 * ## Where the iso is
 *
 * Not in the shader. The material reads a main texture that encodes the body
 * of water — `.b` depth, `.g` foam, `.r` outline — and paints from it, so the
 * isometric part of the job is the MASK: `buildIsoWaterMask` walks the
 * island's own diamond grid, measures distance to land IN CELLS, and projects
 * it through the board's `HALF_W`/`HALF_H`. The coastline the shader outlines
 * is therefore the same zig-zag the tiles draw.
 *
 * The one iso number that does reach the shader goes through the uniform its
 * author put there for it: `aspectRatio`, set to 24/44, which squashes the
 * caustic sampling onto the ground plane instead of hanging it behind the
 * island like a curtain. `02 · Espace ecran` takes the ground-plane sampling
 * back out, which is what the two look like side by side.
 */
import { useRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Container } from 'pixi.js';
import { PixiStage } from './PixiStage';
import {
  createGodotCausticWater, loadGodotWater, buildIsoWaterMask, depthGradientTexture,
  GODOT_WATER_DEFAULTS, DEPTH_RAMP, ISO_ASPECT, type GodotCausticWater,
} from '@/game/fx/GodotCausticWater';
import {
  generateIsland, levelAt, IsoIslandView, loadIslandTileset, isoBounds,
} from '@/game/island';
import { HALF_W, HALF_H, TIER_LIFT } from '@/config/gridConfig';

const WIDTH = 960;
const HEIGHT = 540;

/**
 * The board this water is shown against, fixed.
 *
 * Not controls: they generate the ISLAND, not the sea, and having them in the
 * panel means a dial change and a different island arrive together — at which
 * point a screenshot no longer isolates what moved.
 */
const SEED = 'harbour-9';
const CELLS = 18;
const TIERS = 3;

/**
 * How the mask is cut, also fixed.
 *
 * These shape the three channels the shader READS rather than anything it
 * does.
 *
 * `SHORE_CELLS` is 0, which makes the depth channel a hard edge: water at full
 * value everywhere, land at nothing. That is the second half of removing the
 * drop shadow, and it took two passes to find because there were two causes.
 * Flattening the colour ramp stopped the shader PAINTING a gradient, but the
 * last line of the fragment also uses depth as the alpha:
 *
 *     finalColor = vec4(rgb, mainTex.b * generalTransparency);
 *
 * so a depth channel that ramped over a cell and a half still faded the sea
 * out toward every coast, and the dark canvas showed through the fade. The
 * rim was the BACKGROUND, not anything the material drew — which is why it
 * survived the first fix and why no uniform would turn it off.
 */
const SHORE_CELLS = 0;
const FOAM_CELLS = 1.4;
const OUTLINE_CELLS = 0.45;

interface Args {
  /**
   * Only what the shader itself declares.
   *
   * The island's own knobs (seed, grid size, tiers) are NOT here: they build
   * the board this water is shown against, not the water, and a panel that
   * mixes the two invites tuning the sea by regenerating the island. The board
   * is fixed below so every screenshot of a dial change differs only by that
   * dial.
   */

  /**
   * 0 = sample in screen space (the Godot original), 1 = sample on the board's
   * ground plane. This is the isometry: it ROTATES as well as squashes.
   */
  iso: number;
  /** The shader's own Y squash. Only in play in screen space. */
  aspectRatio: number;
  /** How coarsely the sampling is snapped. The Godot default is 2048. */
  pixelization: number;

  causticColor: string;
  causticHighlightColor: string;
  /** How many times the caustic motif repeats across the board. */
  causticScale: number;
  causticSpeed: number;
  /** How hard the noise field pushes the caustic sampling about. */
  causticMovementAmount: number;
  /** Higher eats more of the caustics away — this is what makes them patchy. */
  causticFaderMultiplier: number;

  specularColor: string;
  /** Above this the two scrolling noises light a sparkle. */
  specularThreshold: number;
  specularSpeed: number;
  specularScale: number;

  foamColor: string;
  /** Subtracted from the mask's foam band — higher means less foam. */
  foamIntensity: number;
  foamScale: number;

  outlineColor: string;
  generalTransparency: number;

  /** The sea's one colour. */
  seaColor: string;

}

const hex = (s: string) => Number(s.replace('#', '0x'));

function Scene(args: Args) {
  const tick = useRef<((ms: number) => void) | null>(null);

  return (
    <PixiStage
      key={JSON.stringify(args)}
      width={WIDTH}
      height={HEIGHT}
      // Near-black, so anything visible is the shader's doing. The material
      // paints its own sea colour from the depth ramp and its own alpha from
      // the mask — a background in the sea's teal would hide both.
      // The sea's own colour, not a dark canvas.
      //
      // The shader's final alpha is the mask's depth channel, so wherever that
      // is below 1 the background shows through. Against a near-black canvas
      // that reads as an ink shadow round the island. Painting the background
      // the same teal the water is means even a soft edge composites to the
      // sea rather than to a dark halo — belt and braces with SHORE_CELLS = 0.
      background={args.seaColor}
      prepare={loadIslandTileset}
      setup={(stage) => {
        let water: GodotCausticWater | null = null;
        let view: IsoIslandView | null = null;

        void (async () => {
          const tileset = await loadIslandTileset();
          const map = generateIsland({
            seed: SEED, tiers: TIERS,
            width: CELLS, height: Math.round(CELLS * 0.8),
          });
          const metrics = { w: HALF_W * 2, h: HALF_H * 2, z: TIER_LIFT };
          const bounds = isoBounds(map.width, map.height, map.tiers, metrics, HALF_H * 2);
          const ox = Math.round((WIDTH - bounds.width) / 2);
          const oy = Math.round((HEIGHT - bounds.height) / 2);

          // The mask is built in the PLANE's pixels, so the projector carries
          // the island's placement (ox/oy + the bounds origin) into it. That
          // is what lines the shader's coastline up with the drawn tiles.
          const project = (x: number, y: number) => ({
            x: ox + bounds.originX + (x - y) * HALF_W,
            y: oy + bounds.originY + (x + y) * HALF_H,
          });

          const mask = buildIsoWaterMask({
            width: WIDTH, height: HEIGHT,
            cols: map.width, rows: map.height,
            isLand: (x, y) => levelAt(map, x, y) > 0,
            project, halfW: HALF_W, halfH: HALF_H,
            shoreCells: SHORE_CELLS,
            foamCells: FOAM_CELLS,
            outlineCells: OUTLINE_CELLS,
          });

          water = createGodotCausticWater(await loadGodotWater(), WIDTH, HEIGHT, {
            mask,
            // ONE colour at both ends, so the ramp is flat.
            //
            // The shader looks this up by depth, and a deep/shallow pair
            // darkened the water toward every coast — which does not read as
            // depth on a board this size, it reads as a drop shadow under the
            // island. The mask still carries depth in `.b` (the shader needs
            // it for the final alpha, and it is what stops the sea at the
            // shore); the RAMP just no longer paints it.
            gradient: depthGradientTexture(hex(args.seaColor), hex(args.seaColor)),
            iso: args.iso,
            halfW: HALF_W,
            halfH: HALF_H,
            aspectRatio: args.aspectRatio,
            pixelization: args.pixelization,
            causticColor: hex(args.causticColor),
            causticHighlightColor: hex(args.causticHighlightColor),
            causticScale: args.causticScale,
            causticSpeed: args.causticSpeed,
            causticMovementAmount: args.causticMovementAmount,
            causticFaderMultiplier: args.causticFaderMultiplier,
            specularColor: hex(args.specularColor),
            specularThreshold: args.specularThreshold,
            specularSpeed: args.specularSpeed,
            specularScale: args.specularScale,
            foamColor: hex(args.foamColor),
            foamIntensity: args.foamIntensity,
            foamScale: args.foamScale,
            outlineColor: hex(args.outlineColor),
            generalTransparency: args.generalTransparency,
          });
          stage.addChild(water.view);

          // The island over the sea. Its own sea and foam are off: this story
          // is about the shader's, and two coastlines would fight.
          //
          // Always drawn. It used to be a control, for a story that showed the
          // water with the island lifted off — which stopped being worth
          // looking at once the sea, the background and the land were all one
          // colour: what was left was the outline ring round a flat patch, and
          // that says nothing about the material the four remaining stories do
          // not say better.
          const deco = new Container();
          view = new IsoIslandView({
            map, tileset, metrics, sea: false, foam: false, decoLayer: deco,
          });
          const holder = new Container();
          holder.addChild(view.view);
          holder.position.set(ox, oy);
          stage.addChild(holder);
          deco.position.set(ox, oy);
          stage.addChild(deco);
          view.placeDeco(0, 0);

          tick.current = (ms) => {
            water?.update(ms);
            view?.update(ms);
          };
        })();

        return () => {
          water?.destroy();
          water = null;
          view = null;
          tick.current = null;
        };
      }}
      onTick={(ms) => tick.current?.(ms)}
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

const D = GODOT_WATER_DEFAULTS;

const meta: Meta<Args> = {
  title: 'Island/Godot Water',
  parameters: { layout: 'fullscreen', backgrounds: { disable: true } },
  argTypes: {
    iso: { control: { type: 'range', min: 0, max: 1, step: 0.05 } },
    aspectRatio: { control: { type: 'range', min: 0.2, max: 2, step: 0.01 } },
    pixelization: { control: { type: 'range', min: 32, max: 2048, step: 16 } },
    causticColor: { control: 'color' },
    causticHighlightColor: { control: 'color' },
    causticScale: { control: { type: 'range', min: 0.5, max: 14, step: 0.1 } },
    causticSpeed: { control: { type: 'range', min: -0.05, max: 0.05, step: 0.001 } },
    causticMovementAmount: { control: { type: 'range', min: 0, max: 1, step: 0.01 } },
    causticFaderMultiplier: { control: { type: 'range', min: 0, max: 3, step: 0.05 } },
    specularColor: { control: 'color' },
    specularThreshold: { control: { type: 'range', min: 0, max: 1, step: 0.01 } },
    specularSpeed: { control: { type: 'range', min: -0.2, max: 0.2, step: 0.005 } },
    specularScale: { control: { type: 'range', min: 1, max: 50, step: 0.5 } },
    foamColor: { control: 'color' },
    foamIntensity: { control: { type: 'range', min: 0, max: 1, step: 0.01 } },
    foamScale: { control: { type: 'range', min: 1, max: 50, step: 0.5 } },
    outlineColor: { control: 'color' },
    generalTransparency: { control: { type: 'range', min: 0, max: 1, step: 0.02 } },
    seaColor: { control: 'color' },
  },
  args: {
    // The shader's declared defaults, verbatim — except the two this port had
    // to move, each noted where it is set.
    iso: 1,
    aspectRatio: 1,
    pixelization: D.pixelization,
    causticColor: '#74c5c3',
    causticHighlightColor: '#bde4e5',
    // NOT the Godot 12. On the ground plane that repeats the motif twelve
    // times across the board, which at this zoom is a cell a few pixels wide
    // and reads as grain rather than as water. 2 is where the painted veins
    // are the size they were drawn to be seen at.
    causticScale: 2,
    causticSpeed: D.causticSpeed,
    causticMovementAmount: D.causticMovementAmount,
    causticFaderMultiplier: D.causticFaderMultiplier,
    specularColor: '#ffffff',
    specularThreshold: D.specularThreshold,
    specularSpeed: D.specularSpeed,
    specularScale: D.specularScale,
    foamColor: '#ffffff',
    foamIntensity: D.foamIntensity,
    foamScale: D.foamScale,
    outlineColor: '#acdbff',
    generalTransparency: D.generalTransparency,
    seaColor: '#2f8b93',
  },
  render: (args) => <Scene {...args} />,
};
export default meta;

type Story = StoryObj<Args>;

/** The material as Godot declares it, iso mask and all. */
export const Iso: Story = {
  name: '01 · Iso',
  args: {},
};

/**
 * The same material sampled in SCREEN space, which is what Godot does.
 *
 * `iso: 0` takes the ground-plane substitution out and the motif goes back to
 * lying flat on the screen's own axes. This is the comparison story 01 is
 * making, and it is worth knowing what it is: the first attempt at "iso" here
 * only set `aspectRatio`, which SCALES Y and nothing else — the cells came out
 * squashed but still screen-aligned, which reads as a stretched pattern rather
 * than as a plane you are looking across. The ground axes run at +/-28.6
 * degrees; no Y scale alone can turn one into the other.
 */
export const ScreenSpace: Story = {
  name: '02 · Espace ecran (Godot)',
  args: { iso: 0, aspectRatio: ISO_ASPECT },
};

export const GodotScale: Story = {
  name: '03 · Defaut Godot (scale 12)',
  args: { causticScale: 12 },
};

/**
 * `pixelization` brought down from 2048 to a value you can see.
 *
 * The Godot default is high enough to be a no-op on a screen this size. Low,
 * it snaps the caustic and specular sampling to a coarse grid — which is the
 * dial to reach for if this sea has to sit with the island's pixel art rather
 * than float smoothly over it.
 */
export const Pixelized: Story = {
  name: '04 · Pixelise',
  args: { pixelization: 160 },
};
