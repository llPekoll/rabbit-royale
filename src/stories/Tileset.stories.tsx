/**
 * Every sheet the island loads, sliced and laid out cell by cell.
 *
 * This exists because the PNG masters in `art-source/` were recompressed, and
 * the honest question afterwards is "does the art still load and slice?".
 *
 * Scope, stated plainly so the story is not read as more than it is: the
 * recompression touched `art-source/tiny-swords-png/` ONLY. Nothing under
 * `public/assets/` changed, and those are the files this story — and the game —
 * actually fetch. So this is a regression baseline, not proof that the
 * optimisation was safe; it could not have broken these bytes.
 *
 * What it IS good for is the class of failure that never throws. A wrong
 * `frame` rectangle, an off-by-one origin column, a re-cut sheet whose grid
 * shifted by 64px — `loadIslandTileset` resolves happily and you get the wrong
 * picture. Compare against this and a shifted grid is obvious at a glance.
 *
 * It drives the REAL `loadIslandTileset()`, not a copy, so if the slicing
 * constants in `tileset.ts` drift, this drifts with them.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Container, Sprite, Graphics, Text, AnimatedSprite, TilingSprite } from 'pixi.js';
import { PixiStage } from './PixiStage';
import { loadIslandTileset, type IslandTileset, type UnitKind } from '@/game/island';
import { TIER_PALETTE_COUNT } from '@/game/island/tileset';

const WIDTH = 960;
const HEIGHT = 540;
const BG = '#101820';

/** Caption above each block, so a missing cell can be named, not just seen. */
function label(text: string, x: number, y: number): Text {
  const t = new Text({
    text,
    style: { fontFamily: 'monospace', fontSize: 11, fill: '#8fb8d0' },
  });
  t.position.set(x, y);
  return t;
}

/**
 * A checker plate behind a cell.
 *
 * Most of these sprites are mostly transparent, and on a flat background a
 * fully-empty cell and a missing cell look identical. The checker makes the
 * padding visible as padding.
 */
function checker(x: number, y: number, w: number, h: number, cell = 8): Graphics {
  const g = new Graphics();
  for (let j = 0; j * cell < h; j++) {
    for (let i = 0; i * cell < w; i++) {
      const cw = Math.min(cell, w - i * cell);
      const ch = Math.min(cell, h - j * cell);
      g.rect(x + i * cell, y + j * cell, cw, ch);
      g.fill((i + j) % 2 ? 0x243240 : 0x1b2530);
    }
  }
  return g;
}

/** Lay a grid of textures out at `scale`, captioned, on a checker plate. */
function grid(
  parent: Container,
  rows: { texture: import('pixi.js').Texture }[][] | import('pixi.js').Texture[][],
  opts: { x: number; y: number; scale: number; caption: string; gap?: number },
) {
  const { x, y, scale, caption, gap = 2 } = opts;
  parent.addChild(label(caption, x, y - 14));
  const cells = rows as import('pixi.js').Texture[][];
  cells.forEach((line, r) => {
    line.forEach((tex, c) => {
      const w = tex.width * scale;
      const h = tex.height * scale;
      const px = x + c * (w + gap);
      const py = y + r * (h + gap);
      parent.addChild(checker(px, py, w, h));
      const s = new Sprite(tex);
      s.position.set(px, py);
      s.scale.set(scale);
      parent.addChild(s);
    });
  });
}

/** Height a `grid` call will occupy, so blocks can be stacked without overlap. */
function gridHeight(rows: unknown[][], texH: number, scale: number, gap = 2): number {
  return rows.length * (texH * scale + gap);
}

interface Args {
  scale: number;
  animate: boolean;
}

/* ------------------------------------------------------------------ */

function TerrainScene({ scale }: Args) {
  return (
    <PixiStage
      width={WIDTH}
      height={HEIGHT}
      background={BG}
      prepare={async () => {
        (TerrainScene as { t?: IslandTileset }).t = await loadIslandTileset();
      }}
      setup={(stage) => {
        const ts = (TerrainScene as { t?: IslandTileset }).t;
        if (!ts) return;
        const root = new Container();
        stage.addChild(root);

        // Flat sheet: the two blob sets the ground is painted from.
        grid(root, ts.flat.grass, { x: 20, y: 24, scale, caption: 'flat.grass  4x4 blob set (sheet cols 0-3)' });
        const gh = gridHeight(ts.flat.grass, 64, scale);
        grid(root, ts.flat.sand, { x: 20, y: 24 + gh + 26, scale, caption: 'flat.sand  4x4 blob set (sheet cols 5-8)' });

        // Elevation: 8 rows x 4 cols, surfaces and cliff faces.
        grid(root, ts.elevation, {
          x: 20 + 4 * (64 * scale + 2) + 40,
          y: 24,
          scale,
          caption: 'elevation  8x4 (surfaces 0/1/2/4, faces 3/5, stack 7)',
        });
      }}
    />
  );
}

function PalettesScene({ scale }: Args) {
  return (
    <PixiStage
      width={WIDTH}
      height={HEIGHT}
      background={BG}
      prepare={async () => {
        (PalettesScene as { t?: IslandTileset }).t = await loadIslandTileset();
      }}
      setup={(stage) => {
        const ts = (PalettesScene as { t?: IslandTileset }).t;
        if (!ts) return;
        const root = new Container();
        stage.addChild(root);
        // One column per palette: the same blob set in five tiers of green.
        // A palette that failed to load shows as a gap in the row, and a
        // mis-set origin column shows as shoreline surf where grass belongs.
        ts.tierGrass.forEach((cells, i) => {
          const colW = 4 * (64 * scale + 2);
          grid(root, cells, {
            x: 20 + i * (colW + 18),
            y: 26,
            scale,
            caption: `palette-${i + 1}`,
          });
        });
        root.addChild(
          label(
            `${ts.tierGrass.length}/${TIER_PALETTE_COUNT} palettes loaded - cols ${5}-${8} of a 9x6 sheet`,
            20,
            26 + gridHeight(ts.tierGrass[0] ?? [], 64, scale) + 18,
          ),
        );
      }}
    />
  );
}

function DecoScene({ scale, animate }: Args) {
  return (
    <PixiStage
      width={WIDTH}
      height={HEIGHT}
      background={BG}
      prepare={async () => {
        (DecoScene as { t?: IslandTileset }).t = await loadIslandTileset();
      }}
      setup={(stage) => {
        const ts = (DecoScene as { t?: IslandTileset }).t;
        if (!ts) return;
        const root = new Container();
        stage.addChild(root);

        // Props, on a shared baseline. This is the block worth staring at:
        // each prop carries its own `anchorY` (from PROP_FOOT_PX), so a
        // correct row has every prop's FEET on the line — not its box.
        const baseY = 150;
        root.addChild(label('props  18, drawn on a shared ground line (anchorY from PROP_FOOT_PX)', 20, 24));
        const line = new Graphics();
        line.rect(20, baseY, WIDTH - 40, 1).fill(0x3d5a70);
        root.addChild(line);

        let x = 24;
        ts.props.forEach((p, i) => {
          const w = p.texture.width * scale;
          const h = p.texture.height * scale;
          root.addChild(checker(x, baseY - p.anchorY * h, w, h));
          const s = new Sprite(p.texture);
          s.anchor.set(0, p.anchorY);
          s.position.set(x, baseY);
          s.scale.set(scale);
          root.addChild(s);
          root.addChild(label(String(i + 1), x, baseY + 6));
          x += w + 6;
        });

        // Tree sway + the stump it opens onto, on their own baseline.
        const treeY = 470;
        root.addChild(label('tree  6 sway frames + stump', 20, 300));
        const treeLine = new Graphics();
        treeLine.rect(20, treeY, WIDTH - 40, 1).fill(0x3d5a70);
        root.addChild(treeLine);

        const tScale = scale * 0.55;
        let tx = 24;
        const addFoot = (tex: import('pixi.js').Texture, anchorY: number) => {
          const s = new Sprite(tex);
          s.anchor.set(0, anchorY);
          s.position.set(tx, treeY);
          s.scale.set(tScale);
          root.addChild(s);
          tx += tex.width * tScale + 4;
        };
        if (animate) {
          const anim = new AnimatedSprite(ts.tree.frames);
          anim.anchor.set(0, ts.tree.anchorY);
          anim.position.set(tx, treeY);
          anim.scale.set(tScale);
          anim.animationSpeed = 8 / 60;
          anim.play();
          root.addChild(anim);
          tx += ts.tree.frames[0].width * tScale + 10;
        } else {
          ts.tree.frames.forEach((f) => addFoot(f, ts.tree.anchorY));
        }
        addFoot(ts.stump.texture, ts.stump.anchorY);
      }}
    />
  );
}

function WaterScene({ scale, animate }: Args) {
  return (
    <PixiStage
      width={WIDTH}
      height={HEIGHT}
      background={BG}
      prepare={async () => {
        (WaterScene as { t?: IslandTileset }).t = await loadIslandTileset();
      }}
      setup={(stage) => {
        const ts = (WaterScene as { t?: IslandTileset }).t;
        if (!ts) return;
        const root = new Container();
        stage.addChild(root);

        // Water is a single 64px tile meant to REPEAT — shown tiled, because a
        // seam only exists at the join and a lone cell would hide it.
        root.addChild(label('water  one 64px tile, tiled 6x2 (look for seams)', 20, 24));
        const tile = new TilingSprite({ texture: ts.water, width: 6 * 64, height: 2 * 64 });
        tile.position.set(20, 40);
        root.addChild(tile);

        // Foam: 8 frames of 192, each centred on the 64px tile it edges.
        root.addChild(label(`foam  ${ts.foam.length} frames of 192px`, 20, 190));
        const fScale = 0.9;
        if (animate) {
          const anim = new AnimatedSprite(ts.foam);
          anim.position.set(20, 206);
          anim.scale.set(fScale);
          anim.animationSpeed = 8 / 60;
          anim.play();
          root.addChild(anim);
        } else {
          ts.foam.forEach((f, i) => {
            const s = new Sprite(f);
            s.position.set(20 + i * (192 * fScale * 0.62), 206);
            s.scale.set(fScale * 0.62);
            root.addChild(s);
          });
        }

        // Sea rocks: 4 rocks x 8 bob frames.
        root.addChild(label(`sea rocks  ${ts.seaRocks.length} rocks x ${ts.seaRocks[0]?.length ?? 0} bob frames`, 20, 380));
        ts.seaRocks.forEach((frames, r) => {
          if (animate) {
            const anim = new AnimatedSprite(frames);
            anim.position.set(20 + r * 130, 396);
            anim.animationSpeed = 6 / 60;
            anim.play();
            root.addChild(anim);
          } else {
            frames.forEach((f, i) => {
              const s = new Sprite(f);
              s.position.set(20 + r * 230 + i * 26, 396);
              s.scale.set(0.42);
              root.addChild(s);
            });
          }
        });
      }}
    />
  );
}

/**
 * The inhabitants, each on a shared ground line.
 *
 * Same question as the props block: `anchorY` comes from the foot measured
 * inside the frame, so a correct row stands every sheep and soldier ON the
 * line. A unit floating above it or sunk through it means its `foot` in
 * `UNIT_GEOMETRY` is wrong for that sheet.
 */
function UnitsScene({ scale, animate }: Args) {
  return (
    <PixiStage
      width={WIDTH}
      height={HEIGHT}
      background={BG}
      prepare={async () => {
        (UnitsScene as { t?: IslandTileset }).t = await loadIslandTileset();
      }}
      setup={(stage) => {
        const ts = (UnitsScene as { t?: IslandTileset }).t;
        if (!ts) return;
        const root = new Container();
        stage.addChild(root);

        const kinds = Object.keys(ts.units) as UnitKind[];
        const baseY = 300;
        root.addChild(label('units  standing on a shared ground line (anchorY from UNIT_GEOMETRY.foot)', 20, 24));
        const line = new Graphics();
        line.rect(20, baseY, WIDTH - 40, 1).fill(0x3d5a70);
        root.addChild(line);

        let x = 30;
        kinds.forEach((kind) => {
          const u = ts.units[kind];
          const w = u.frames[0].width * scale;
          if (animate) {
            const anim = new AnimatedSprite(u.frames);
            anim.anchor.set(0.5, u.anchorY);
            anim.position.set(x + w / 2, baseY);
            anim.scale.set(scale);
            anim.animationSpeed = 8 / 60;
            anim.play();
            root.addChild(anim);
          } else {
            const sp = new Sprite(u.frames[0]);
            sp.anchor.set(0.5, u.anchorY);
            sp.position.set(x + w / 2, baseY);
            sp.scale.set(scale);
            root.addChild(sp);
          }
          root.addChild(label(`${kind} (${u.frames.length}f)`, x, baseY + 8));
          x += w + 10;
        });
      }}
    />
  );
}

/* ------------------------------------------------------------------ */

const meta: Meta<Args> = {
  title: 'Island/Tileset',
  args: { scale: 1.2, animate: true },
  argTypes: {
    scale: { control: { type: 'range', min: 0.5, max: 3, step: 0.1 } },
    animate: { control: 'boolean' },
  },
};
export default meta;

type Story = StoryObj<Args>;

/** The flat blob sets and the elevation sheet, cell by cell. */
export const Terrain: Story = {
  render: (args) => <TerrainScene key={JSON.stringify(args)} {...args} />,
};

/** The five grass palettes side by side — one per terrain tier. */
export const Palettes: Story = {
  render: (args) => <PalettesScene key={JSON.stringify(args)} {...args} />,
  args: { scale: 0.9, animate: false },
};

/** Props on a shared ground line, plus the tree's sway and stump. */
export const Decoration: Story = {
  render: (args) => <DecoScene key={JSON.stringify(args)} {...args} />,
  args: { scale: 1, animate: true },
};

/** Water tiled for seams, foam, and the bobbing sea rocks. */
export const Water: Story = {
  render: (args) => <WaterScene key={JSON.stringify(args)} {...args} />,
  args: { scale: 1, animate: true },
};

/** Sheep and soldiers, on a ground line that exposes a wrong foot offset. */
export const Units: Story = {
  render: (args) => <UnitsScene key={JSON.stringify(args)} {...args} />,
  args: { scale: 0.9, animate: true },
};
