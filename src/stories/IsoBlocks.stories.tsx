/**
 * Tiny Swords' terrain, baked into isometric BLOCKS.
 *
 * The pack is drawn top-down: every tile is a flat square facing the camera,
 * and the game has been shearing those squares onto the diamond lattice at
 * draw time. That shear resamples 64px of pixel art down to a 44x24 diamond
 * every frame, which is what made the ground read as mushy — the complaint
 * that started this.
 *
 * `tools/gen_iso_sheets.py` does the projection ONCE, offline, at 8x
 * supersampling, and hangs two shaded faces under each tile so a cell is a
 * solid with thickness rather than a lid. This story is where that bake is
 * judged, BEFORE anything overwrites what the game loads: the sheets come from
 * `public/assets/terrain-iso/`, the game's own `public/assets/terrain/` is
 * untouched.
 *
 * What to look for, none of which throws:
 *
 *   - do neighbouring tiles meet with no seam and no overlap?
 *   - does a block read as a solid — two tones and a corner — or as a curve?
 *   - does a plateau close, or does the sea show through under its rim?
 *   - is the grass still legible after the squash, or has it turned to soup?
 */
import { useEffect, useRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { generateIsland, levelAt } from '@/game/island';

/** The board's diamond and tier lift — `src/config/gridConfig.ts`. */
const W = 44;
const H = 24;
const LIFT = 18;
/** The sheets keep 64px cells, so the existing slicing is unchanged. */
const CELL = 64;

const SHEETS = '/assets/terrain-iso';
const SEA = '#16263a';

/** Blob-set column from the west/east neighbours — mirrors `autotile.ts`. */
const blobCol = (w: boolean, e: boolean) => (w && e ? 1 : e ? 0 : w ? 2 : 3);
/** Blob-set row from the north/south neighbours. */
const blobRow = (n: boolean, s: boolean) => (n && s ? 1 : s ? 0 : n ? 2 : 3);
/** The elevation sheet banishes its one-row-tall surface to row 4. */
const SURFACE_ROW = [0, 1, 2, 4];
/** The grass blob set starts at column 5 of a palette sheet. */
const GRASS_COL = 5;

/**
 * The veil over an undug tile — `src/game/entities/Tile.ts`.
 *
 * Mirrored rather than imported because the game's version is a Pixi sprite
 * built from a baked texture, and this story draws on a plain 2D canvas on
 * purpose (see `Board`). The numbers are the ones that ship.
 *
 * Worth knowing while looking at it: `Tile.ts` records that these were
 * calibrated against the PAINTED backdrop, which is darker and busier than
 * generated grass, and that over terrain the same navy reads as another shade
 * of ground rather than as a covered tile. This story is where that can
 * finally be judged against the real blocks.
 */
const FOG_COLOR = '#1a2a3a';
const FOG_ALPHA = 0.55;

/**
 * How much of its cell a veil covers — the game's own inset, from
 * `TileTextures.ts`, where the reasoning is already written down:
 *
 *   "a grid whose diamonds touch edge to edge looks like a mesh laid over the
 *    art, where inset ones read as separate tiles you pick between"
 *
 * Veils that meet edge to edge merge into one dark blob and the board stops
 * being countable — which is the whole point of a per-tile veil.
 */
/**
 * How far each of the veil's four corners is pulled in, in PIXELS.
 *
 * Four numbers rather than one scale factor, because the four sides do not
 * have the same job. The bottom corner is the one a cliff face hangs from, so
 * it usually wants more clearance than the others; the top has open ground
 * behind it and needs the least. A single `inset` could only move all four
 * together, which is what made 0.88 too tight on the cliff side and 0.76 too
 * loose everywhere else.
 *
 * Pixels, not a ratio, so the gap is the same whatever the tile size — a ratio
 * silently shrinks the gap on a smaller diamond, which is where it is already
 * hardest to see.
 */
const FOG_TRIM = { top: 2, right: 2, bottom: 2, left: 2 };

/** The game's highlight gold — `Tile.ts`. */
const HIGHLIGHT = '#ffd700';

/** The pack's own hand cursor, for tiles that answer to a click. */
const CURSOR_HAND = '/assets/ui/cursors/hand.png';

interface Args {
  /** Grid size, in cells. */
  size: number;
  /** Draw the raised shelf in the middle. */
  plateau: boolean;
  /** Magnification, so pixels can be judged. */
  zoom: number;
  /** Veil opacity. 0.55 is what the game ships; 0 shows the bare island. */
  fogAlpha: number;
  /** Share of tiles drawn as already dug. */
  dug: number;
  /** Pixels trimmed off the veil's top corner. */
  trimTop: number;
  /** Pixels trimmed off the veil's right corner. */
  trimRight: number;
  /** Pixels trimmed off the veil's bottom corner — the cliff side. */
  trimBottom: number;
  /** Pixels trimmed off the veil's left corner. */
  trimLeft: number;
}

function load(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`cannot load ${url}`));
    img.src = url;
  });
}

/** Stamp one sheet cell so its diamond lands on the cell centre `(cx, cy)`. */
function put(
  ctx: CanvasRenderingContext2D,
  sheet: HTMLImageElement,
  col: number,
  row: number,
  cx: number,
  cy: number,
) {
  ctx.drawImage(
    sheet,
    col * CELL, row * CELL, CELL, CELL,
    // The diamond sits centred in its 64px cell, so back the box out by half
    // the difference to put the diamond on the cell.
    Math.round(cx - CELL / 2), Math.round(cy - H / 2 - (CELL - H) / 2),
    CELL, CELL,
  );
}

/**
 * Lay the veil over one cell, as the diamond the game uses.
 *
 * The game hangs the veil inside the cell's terrain block so it sorts with the
 * ground; on a flat canvas the same thing is achieved by drawing it right
 * after the tile it covers, which is why this takes a cell rather than being a
 * pass of its own.
 */
interface Trim {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * The veil's four corners, each pulled in by its own number of pixels.
 *
 * Returned rather than drawn so the highlight can ring exactly the same shape
 * — a highlight on the cell's full diamond would not line up with the thing
 * the eye reads as the tile.
 */
function veilPoints(cx: number, cy: number, t: Trim) {
  const hw = W / 2;
  const hh = H / 2;
  return {
    top: [cx, cy - hh + t.top] as const,
    right: [cx + hw - t.right, cy] as const,
    bottom: [cx, cy + hh - t.bottom] as const,
    left: [cx - hw + t.left, cy] as const,
  };
}

function veilPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, t: Trim) {
  const p = veilPoints(cx, cy, t);
  ctx.beginPath();
  ctx.moveTo(...p.top);
  ctx.lineTo(...p.right);
  ctx.lineTo(...p.bottom);
  ctx.lineTo(...p.left);
  ctx.closePath();
}

function fog(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  alpha: number,
  trim: Trim,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = FOG_COLOR;
  veilPath(ctx, cx, cy, trim);
  ctx.fill();
  ctx.restore();
}

/**
 * Ring the cell under the pointer, so "which tile am I on" is never a guess.
 *
 * Drawn at the veil's own inset rather than the cell's full diamond: the
 * highlight has to agree with the thing the eye reads as the tile, and on a
 * veiled board that is the inset lozenge, not the cell behind it.
 */
function outline(ctx: CanvasRenderingContext2D, cx: number, cy: number, trim: Trim) {
  ctx.save();
  ctx.strokeStyle = HIGHLIGHT;
  ctx.lineWidth = 1;
  veilPath(ctx, cx, cy, trim);
  ctx.stroke();
  ctx.restore();
}

/** Say which sheet is missing, rather than leaving a blank canvas. */
function reportError(cv: HTMLCanvasElement | null, e: unknown) {
  const ctx = cv?.getContext('2d');
  if (!cv || !ctx) return;
  ctx.fillStyle = '#a52f1c';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = '#fff';
  ctx.font = '13px monospace';
  ctx.fillText(String(e), 12, 28);
  ctx.fillText('lancer: python3 tools/gen_iso_sheets.py', 12, 48);
}

/**
 * Draw the lattice on a 2D canvas rather than through Pixi.
 *
 * Deliberate: the bake has to be judged as PIXELS, and a canvas with
 * `imageSmoothingEnabled = false` shows exactly the bytes in the sheet. Going
 * through the renderer would put its own filtering between the art and the
 * eye, which is the thing being measured.
 */
function Board({ size, plateau, zoom }: Args) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [pal1, pal2, elev] = await Promise.all([
        load(`${SHEETS}/palette-1.webp`),
        load(`${SHEETS}/palette-2.webp`),
        load(`${SHEETS}/tilemap-elevation.webp`),
      ]);
      if (cancelled) return;
      const cv = ref.current;
      if (!cv) return;
      const ctx = cv.getContext('2d');
      if (!ctx) return;

      const hw = W / 2;
      const hh = H / 2;
      const originX = size * hw + CELL;
      const originY = LIFT + CELL;
      cv.width = (size * 2) * hw + CELL * 2;
      cv.height = (size * 2) * hh + CELL * 2 + LIFT;
      cv.style.width = `${cv.width * zoom}px`;
      cv.style.height = `${cv.height * zoom}px`;
      cv.style.imageRendering = 'pixelated';

      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = SEA;
      ctx.fillRect(0, 0, cv.width, cv.height);

      const lo = Math.floor(size / 3);
      const hi = Math.ceil((size * 2) / 3) - 1;
      const raised = (c: number, r: number) =>
        plateau && c >= lo && c <= hi && r >= lo && r <= hi;
      const inBoard = (c: number, r: number) => c >= 0 && c < size && r >= 0 && r < size;

      // Painter's order along x + y, so a near cell covers the far one.
      for (let diag = 0; diag <= (size - 1) * 2; diag++) {
        for (let c = 0; c < size; c++) {
          const r = diag - c;
          if (!inBoard(c, r)) continue;
          const up = raised(c, r);
          const cx = originX + (c - r) * hw;
          const cy = originY + (c + r) * hh - (up ? LIFT : 0);

          if (up) {
            const col = blobCol(raised(c - 1, r), raised(c + 1, r));
            const row = blobRow(raised(c, r - 1), raised(c, r + 1));
            put(ctx, elev, col, SURFACE_ROW[row], cx, cy);
            put(ctx, pal2, GRASS_COL + col, row, cx, cy);
          } else {
            const col = blobCol(inBoard(c - 1, r), inBoard(c + 1, r));
            const row = blobRow(inBoard(c, r - 1), inBoard(c, r + 1));
            put(ctx, pal1, GRASS_COL + col, row, cx, cy);
          }
        }
      }
    })().catch((e: unknown) => reportError(ref.current, e));
    return () => { cancelled = true; };
  }, [size, plateau, zoom]);

  return (
    <div style={{ background: SEA, padding: 16, overflow: 'auto' }}>
      <canvas ref={ref} />
    </div>
  );
}

/**
 * A real generated island, drawn from the baked blocks.
 *
 * The board stories above use a square grid with a square shelf, which proves
 * the tiling but not much else: every edge is straight and every corner is the
 * same corner. `generateIsland` is what the game actually plays on — a ragged
 * coastline, eroded plateaus, one-cell spits — and it is where a blob set
 * either holds together or shows its gaps.
 *
 * Same generator, same seed and same knobs as `Island.stories.tsx`, so one
 * island can be compared across projections.
 */
function GeneratedIsland(
  { seed, tiers, zoom, cells, fogAlpha, dug, trimTop, trimRight, trimBottom, trimLeft }:
  {
    seed: string; tiers: number; zoom: number; cells: number;
    /** 0 hides the veil entirely, so the same island can be seen both ways. */
    fogAlpha: number;
    /** Share of tiles already dug, i.e. drawn without a veil. */
    dug: number;
    /** Pixels trimmed off each of the veil's four corners. */
    trimTop: number;
    trimRight: number;
    trimBottom: number;
    trimLeft: number;
  },
) {
  const ref = useRef<HTMLCanvasElement>(null);
  // The cell under the pointer, and the draw function, both held across
  // renders: hovering must repaint without re-running the whole generator.
  const hover = useRef<{ x: number; y: number } | null>(null);
  const redraw = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | null = null;
    (async () => {
      const [pal1, pal2, pal3, elev] = await Promise.all([
        load(`${SHEETS}/palette-1.webp`),
        load(`${SHEETS}/palette-2.webp`),
        load(`${SHEETS}/palette-3.webp`),
        load(`${SHEETS}/tilemap-elevation.webp`),
      ]);
      if (cancelled) return;
      const cv = ref.current;
      const ctx = cv?.getContext('2d');
      if (!cv || !ctx) return;

      // Smaller than the generator's 34x24 default, which spans 1404px across
      // and runs off the frame at any useful zoom. The coastline is what this
      // story is for, and it reads just as well on a smaller box.
      const map = generateIsland({ seed, tiers, width: cells, height: Math.round(cells * 0.8) });
      const { width, height } = map;
      const hw = W / 2;
      const hh = H / 2;

      // Size the canvas to the LAND, not to the grid. A generated island fills
      // roughly half its box, and the rest is sea the generator guarantees as a
      // margin — sizing to the grid leaves the picture adrift in empty water
      // and pushes the island off the frame.
      let minX = Infinity; let maxX = -Infinity;
      let minY = Infinity; let maxY = -Infinity;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const tier = levelAt(map, x, y);
          if (tier <= 0) continue;
          const px = (x - y) * hw;
          const py = (x + y) * hh - (tier - 1) * LIFT;
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
        }
      }
      if (!Number.isFinite(minX)) return;
      // A tile's art hangs half a cell past its anchor on each side, plus the
      // block's own thickness below it.
      const padX = CELL / 2;
      const padTop = CELL / 2;
      const padBottom = CELL / 2 + LIFT;

      cv.width = Math.ceil(maxX - minX + padX * 2);
      cv.height = Math.ceil(maxY - minY + padTop + padBottom);
      cv.style.width = `${cv.width * zoom}px`;
      cv.style.height = `${cv.height * zoom}px`;
      cv.style.imageRendering = 'pixelated';
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = SEA;
      ctx.fillRect(0, 0, cv.width, cv.height);

      const originX = -minX + padX;
      const originY = -minY + padTop;
      // Tier n takes palette n, which is how a plateau stays legible against
      // the ground below it — the pack ships the same grass in five shades and
      // its own key art uses them exactly this way.
      const palettes = [pal1, pal2, pal3];

      /** Where a cell's diamond centre sits on screen. */
      const centre = (x: number, y: number, tier: number) => ({
        cx: originX + (x - y) * hw,
        cy: originY + (x + y) * hh - (tier - 1) * LIFT,
      });

      const trim: Trim = {
        top: trimTop, right: trimRight, bottom: trimBottom, left: trimLeft,
      };

      const draw = () => {
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = SEA;
        ctx.fillRect(0, 0, cv.width, cv.height);

        for (let diag = 0; diag <= (width - 1) + (height - 1); diag++) {
          for (let x = 0; x < width; x++) {
            const y = diag - x;
            if (y < 0 || y >= height) continue;
            const tier = levelAt(map, x, y);
            if (tier <= 0) continue;

            const same = (dx: number, dy: number) => levelAt(map, x + dx, y + dy) >= tier;
            const col = blobCol(same(-1, 0), same(1, 0));
            const row = blobRow(same(0, -1), same(0, 1));
            const { cx, cy } = centre(x, y, tier);

            const sheet = palettes[Math.min(tier - 1, palettes.length - 1)];
            // Above sea level the shelf gets its rock surface first, then grass
            // over it — the grass corners are transparent, so a rim of rock
            // survives and gives the plateau its outline.
            if (tier > 1) put(ctx, elev, col, SURFACE_ROW[row], cx, cy);
            put(ctx, sheet, GRASS_COL + col, row, cx, cy);

            // The veil, on the tiles not yet dug. Hashed from the coordinates
            // rather than Math.random so the same island always veils the same
            // cells — a story that reshuffles on every redraw cannot be
            // compared against itself.
            if (fogAlpha > 0) {
              const h = Math.abs(Math.sin((x * 73856093) ^ (y * 19349663)) * 43758.5453) % 1;
              if (h >= dug) fog(ctx, cx, cy, fogAlpha, trim);
            }

            const hov = hover.current;
            if (hov && hov.x === x && hov.y === y) outline(ctx, cx, cy, trim);
          }
        }
      };
      redraw.current = draw;
      draw();

      /**
       * Which cell a point names — the tiers walked from the top down.
       *
       * A raised tile is drawn ABOVE its own cell, so inverting the flat
       * projection answers with the cell in front of the one the eye is on.
       * Trying the highest tier first and taking the first diamond that
       * contains the point is what the renderer's own picker does, and it is
       * what the eye does too, since a higher tile draws over a lower one.
       */
      const pick = (sx: number, sy: number) => {
        for (let tier = map.tiers; tier >= 1; tier--) {
          const lifted = sy + (tier - 1) * LIFT;
          const gx = (lifted - originY) / hh;
          const gy = (sx - originX) / hw;
          const x = Math.round((gx + gy) / 2);
          const y = Math.round((gx - gy) / 2);
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          if (levelAt(map, x, y) !== tier) continue;
          return { x, y };
        }
        return null;
      };

      const onMove = (ev: PointerEvent) => {
        const r = cv.getBoundingClientRect();
        // The canvas is displayed at `zoom`, so screen pixels are scaled back
        // to canvas pixels before anything is projected.
        const sx = (ev.clientX - r.left) * (cv.width / r.width);
        const sy = (ev.clientY - r.top) * (cv.height / r.height);
        const hit = pick(sx, sy);
        const prev = hover.current;
        if (hit?.x === prev?.x && hit?.y === prev?.y) return;
        hover.current = hit;
        cv.style.cursor = hit ? `url(${CURSOR_HAND}) 4 2, pointer` : 'default';
        draw();
      };
      const onLeave = () => {
        if (!hover.current) return;
        hover.current = null;
        cv.style.cursor = 'default';
        draw();
      };
      cv.addEventListener('pointermove', onMove);
      cv.addEventListener('pointerleave', onLeave);
      cleanup = () => {
        cv.removeEventListener('pointermove', onMove);
        cv.removeEventListener('pointerleave', onLeave);
      };
    })().catch((e: unknown) => reportError(ref.current, e));
    return () => { cancelled = true; cleanup?.(); };
  }, [seed, tiers, zoom, cells, fogAlpha, dug, trimTop, trimRight, trimBottom, trimLeft]);

  return (
    <div style={{ background: SEA, padding: 16, overflow: 'auto' }}>
      <canvas ref={ref} />
    </div>
  );
}

/** The raw sheet, so a single tile can be inspected at magnification. */
function Sheet({ name, zoom }: { name: string; zoom: number }) {
  return (
    <div style={{ background: SEA, padding: 16, overflow: 'auto' }}>
      <img
        src={`${SHEETS}/${name}`}
        alt={name}
        style={{
          imageRendering: 'pixelated',
          width: `${(name.startsWith('palette') ? 576 : 256) * zoom}px`,
        }}
      />
    </div>
  );
}

const meta: Meta<Args> = {
  title: 'Island/Iso blocks',
  parameters: { layout: 'fullscreen' },
  argTypes: {
    size: { control: { type: 'range', min: 3, max: 34, step: 1 } },
    zoom: { control: { type: 'range', min: 1, max: 6, step: 1 } },
    fogAlpha: { control: { type: 'range', min: 0, max: 1, step: 0.05 } },
    dug: { control: { type: 'range', min: 0, max: 1, step: 0.05 } },
    trimTop: { control: { type: 'range', min: 0, max: 10, step: 1 } },
    trimRight: { control: { type: 'range', min: 0, max: 10, step: 1 } },
    trimBottom: { control: { type: 'range', min: 0, max: 10, step: 1 } },
    trimLeft: { control: { type: 'range', min: 0, max: 10, step: 1 } },
  },
};
export default meta;

type Story = StoryObj<Args>;

/** The claim: blocks with volume, meeting with no seam. */
export const Board_: Story = {
  name: 'Plateau',
  args: { size: 8, plateau: true, zoom: 2, fogAlpha: 0, dug: 0, trimTop: FOG_TRIM.top, trimRight: FOG_TRIM.right,
    trimBottom: FOG_TRIM.bottom, trimLeft: FOG_TRIM.left },
  render: (args) => <Board {...args} />,
};

/** Flat ground alone — the tiling is easiest to fault with nothing on it. */
export const Flat: Story = {
  name: 'Sol seul',
  args: { size: 10, plateau: false, zoom: 2, fogAlpha: 0, dug: 0, trimTop: FOG_TRIM.top, trimRight: FOG_TRIM.right,
    trimBottom: FOG_TRIM.bottom, trimLeft: FOG_TRIM.left },
  render: (args) => <Board {...args} />,
};

/** A real generated island — the coastline and plateaus the game plays on. */
export const Island: Story = {
  name: 'Ile generee',
  args: { size: 20, plateau: true, zoom: 2, fogAlpha: 0, dug: 0, trimTop: FOG_TRIM.top, trimRight: FOG_TRIM.right,
    trimBottom: FOG_TRIM.bottom, trimLeft: FOG_TRIM.left },
  render: (args) => (
    <GeneratedIsland
      seed="harbour-9" tiers={3}
      zoom={args.zoom} cells={args.size} fogAlpha={args.fogAlpha} dug={args.dug}
      trimTop={args.trimTop} trimRight={args.trimRight}
      trimBottom={args.trimBottom} trimLeft={args.trimLeft}
    />
  ),
};

/** Another seed, to check the blob set holds on a different coastline. */
export const IslandAlt: Story = {
  name: 'Ile generee (autre graine)',
  args: { size: 20, plateau: true, zoom: 2, fogAlpha: 0, dug: 0, trimTop: FOG_TRIM.top, trimRight: FOG_TRIM.right,
    trimBottom: FOG_TRIM.bottom, trimLeft: FOG_TRIM.left },
  render: (args) => (
    <GeneratedIsland
      seed="rabbit-royale" tiers={4}
      zoom={args.zoom} cells={args.size} fogAlpha={args.fogAlpha} dug={args.dug}
      trimTop={args.trimTop} trimRight={args.trimRight}
      trimBottom={args.trimBottom} trimLeft={args.trimLeft}
    />
  ),
};

/**
 * The island under the veil the game actually ships.
 *
 * The question this exists to answer: at 0.55 over navy, does an undug tile
 * read as COVERED, or merely as darker grass? `Tile.ts` says the constants
 * were tuned against the painted backdrop and suspects they no longer carry
 * over generated terrain. Slide `fogAlpha` to compare.
 */
export const Fog: Story = {
  name: 'Ile + fog',
  args: { size: 20, plateau: true, zoom: 2, fogAlpha: 0.55, dug: 0, trimTop: FOG_TRIM.top, trimRight: FOG_TRIM.right,
    trimBottom: FOG_TRIM.bottom, trimLeft: FOG_TRIM.left },
  render: (args) => (
    <GeneratedIsland
      seed="harbour-9" tiers={3}
      zoom={args.zoom} cells={args.size} fogAlpha={args.fogAlpha} dug={args.dug}
      trimTop={args.trimTop} trimRight={args.trimRight}
      trimBottom={args.trimBottom} trimLeft={args.trimLeft}
    />
  ),
};

/** Mid-run: a third of the board dug, so veiled and bare tiles sit side by side. */
export const FogPartial: Story = {
  name: 'Ile + fog (partiel)',
  args: { size: 20, plateau: true, zoom: 2, fogAlpha: 0.55, dug: 0.35, trimTop: FOG_TRIM.top, trimRight: FOG_TRIM.right,
    trimBottom: FOG_TRIM.bottom, trimLeft: FOG_TRIM.left },
  render: (args) => (
    <GeneratedIsland
      seed="harbour-9" tiers={3}
      zoom={args.zoom} cells={args.size} fogAlpha={args.fogAlpha} dug={args.dug}
      trimTop={args.trimTop} trimRight={args.trimRight}
      trimBottom={args.trimBottom} trimLeft={args.trimLeft}
    />
  ),
};

/** The sixteen grass blocks as they sit on the sheet. */
export const GrassSheet: Story = {
  name: 'Feuille herbe',
  args: { size: 8, plateau: true, zoom: 2, fogAlpha: 0, dug: 0, trimTop: FOG_TRIM.top, trimRight: FOG_TRIM.right,
    trimBottom: FOG_TRIM.bottom, trimLeft: FOG_TRIM.left },
  render: (args) => <Sheet name="palette-1.webp" zoom={args.zoom} />,
};

/** The elevation sheet: projected surfaces, upright faces. */
export const ElevationSheet: Story = {
  name: 'Feuille falaise',
  args: { size: 8, plateau: true, zoom: 2, fogAlpha: 0, dug: 0, trimTop: FOG_TRIM.top, trimRight: FOG_TRIM.right,
    trimBottom: FOG_TRIM.bottom, trimLeft: FOG_TRIM.left },
  render: (args) => <Sheet name="tilemap-elevation.webp" zoom={args.zoom} />,
};
