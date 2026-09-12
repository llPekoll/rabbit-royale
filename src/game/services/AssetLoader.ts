import { Assets, Spritesheet, Texture, TextureSource } from 'pixi.js';
import { loadButtonAssets, loadArcadeFonts, loadCoinAssets } from '@domin8/arcade-kit/pixi';
import { CARROT_URL } from '@domin8/arcade-kit/game';
import * as Keys from '@/config/assetKeys';
import { BURROW_BUILDING_URLS } from '@/game/burrow/buildings';

// Force nearest-neighbor (pixelated) scaling for all textures
TextureSource.defaultOptions.scaleMode = 'nearest';

/** Frame layout for bunny spritesheets: 8 cols x 8 rows of 32x32 */
const FRAME_SIZE = 32;
const SHEET_COLS = 8;

const BUNNY_SHEETS = [
  { key: Keys.BUNNY_BROWN, src: '/assets/bunnies/Bunny Sprite Sheet - Brown.webp' },
  { key: Keys.BUNNY_GRAY, src: '/assets/bunnies/Bunny Sprite Sheet - Gray.webp' },
  { key: Keys.BUNNY_ORANGE, src: '/assets/bunnies/Bunny Sprite Sheet - Orange.webp' },
  { key: Keys.BUNNY_WHITE, src: '/assets/bunnies/Bunny Sprite Sheet - White.webp' },
  { key: Keys.BUNNY_YELLOW, src: '/assets/bunnies/Bunny Sprite Sheet - Yellowish.webp' },
];

const IMAGES = [
  { key: Keys.DEAD_SKULL, src: '/assets/bunnies/RR-Skull.webp' },
  { key: Keys.GHOST_DOWN, src: '/assets/bunnies/RR-Ghost-Down.webp' },
  { key: Keys.GHOST_UP, src: '/assets/bunnies/RR-Ghost-Up.webp' },
  { key: Keys.BOMB_SMALL, src: '/assets/misc/RR-Bomb-Small.webp' },
  { key: Keys.LOGO, src: '/assets/ui/rr-logo-1x.webp' },
  { key: Keys.LOGO_BANNER, src: '/assets/ui/rr-logo-banner.webp' },
  { key: Keys.TREASURE_CHEST, src: '/assets/ui/treasure_chest.webp' },
  { key: Keys.LOOT_BOX, src: '/assets/fx/loot-box.webp' },
  // The carrot comes from the shared kit rather than public/: it is the same
  // prop the hub's season pass draws, and one copy means one carrot.
  { key: Keys.CARROT, src: CARROT_URL },
  // The iris aperture. Generated (tools/gen_carrot_mask.py) rather than taken
  // from the kit's carrot: a mask keeps only alpha, and the sprite's shape
  // lives partly in its shading.
  { key: Keys.CARROT_MASK, src: '/assets/fx/carrot-mask.webp' },
  // The field's crop, as a growth animation. Loaded here rather than by the
  // scene so the burrow never paints a frame of bare dirt while it arrives.
  { key: Keys.CARROT_GROWTH, src: '/assets/carottes/carrote.png' },
  // The burrow's buildings, one per level of the upgrade ladder. Loaded here
  // rather than by the scene for the same reason the crop is: the homestead
  // must never paint a frame with no house standing on it, and an upgrade has
  // to swap the texture instantly rather than after a fetch.
  ...BURROW_BUILDING_URLS.map((src) => ({ key: src, src })),
  // The drifting clouds. Eight shapes so a sky of them never visibly repeats.
  ...Array.from({ length: Keys.CLOUD_COUNT }, (_, i) => ({
    key: Keys.cloudKey(i + 1),
    src: `/assets/clouds/Clouds_0${i + 1}.webp`,
  })),
];

// Golden coin frames now come from @domin8/arcade-kit (loadCoinAssets) — see
// the Promise.all below. CoinRain reads them via the kit's GOLDEN_COIN_ALIASES.

/** Explosion spritesheet: 48x48 frames */
const EXPLOSION = {
  key: Keys.EXPLOSION_SMALL,
  src: '/assets/fx/explosion.webp',
  frameWidth: 48,
  frameHeight: 48,
};

/**
 * The lightning strike: two bolts, six frames of 64px each.
 *
 * The art draws a bolt falling from the top of its cell and SPLASHING at the
 * bottom, so the sprite's anchor belongs at its foot rather than its middle —
 * see `LIGHTNING_FOOT`. Anchored centrally the strike lands half a tile high
 * and reads as hovering.
 */
const LIGHTNING = {
  keys: Keys.LIGHTNING_STRIKES,
  src: (key: string) => `/assets/fx/${key}.webp`,
  frame: 64,
  frames: 6,
};

/**
 * Where the bolt meets the ground, as a share of its cell.
 *
 * Measured off the art: every frame reaches y=62 of 64. Anchoring there puts
 * the splash on the tile rather than the middle of the bolt.
 */
export const LIGHTNING_FOOT = 62 / 64;

/**
 * The BIG bolt: a 6x5 grid of 195x220 cells, read left-to-right then down.
 *
 * Only the first 27 cells hold art — the sheet's last three are blank padding
 * from the grid, and playing them would leave the animation hanging on empty
 * frames after it has visibly finished. Two cells INSIDE the run (13 and 14)
 * are blank on purpose: the sparks flicker out and come back, so the count is
 * a hard 27 rather than "up to the first empty cell".
 */
const LIGHTNING_BOLT_SHEET = {
  key: Keys.LIGHTNING_BOLT,
  src: '/assets/fx/lightning-bolt.webp',
  frameWidth: 195,
  frameHeight: 220,
  cols: 6,
  frames: 27,
};

/**
 * Where the BIG bolt meets the ground, as a share of its cell.
 *
 * Measured off the art: the strike splashes at the very bottom of its cell and
 * the sparks settle there, so the foot is the cell's bottom edge. Anchoring
 * centrally floats the whole strike half its height above its target.
 */
export const LIGHTNING_BOLT_FOOT = 1;

/** How many frames the big bolt plays. */
export const LIGHTNING_BOLT_FRAMES = LIGHTNING_BOLT_SHEET.frames;

/** Store parsed spritesheets for AnimatedSprite creation */
export const bunnySheets = new Map<string, Spritesheet>();
export let explosionSheet: Spritesheet | null = null;
/** One parsed sheet per bolt shape, in `LIGHTNING_STRIKES` order. */
export const lightningSheets: Spritesheet[] = [];
/** The big bolt's parsed sheet — `getLightningBoltTextures()` reads it. */
export let lightningBoltSheet: Spritesheet | null = null;
/** The loot box's parsed atlas — `lootBoxFrames('idle'|'shine')` reads it. */
export let lootBoxSheet: Spritesheet | null = null;

/**
 * Parse the loot box's Aseprite atlas. Its JSON is the source of truth for
 * both the frame rects and the animation TAGS (`highlight` is the shine), so
 * nothing here hand-copies a grid. Exported because Storybook mounts Tile
 * without the game's own loader — a story that faked the frames would stop
 * being evidence. Idempotent, and a failure only costs the animation: Tile
 * falls back to the still chest PNG.
 */
export async function loadLootBoxSheet(): Promise<Spritesheet | null> {
  if (lootBoxSheet) return lootBoxSheet;
  try {
    if (!Assets.get<Texture>(Keys.LOOT_BOX)) {
      Assets.add({ alias: Keys.LOOT_BOX, src: '/assets/fx/loot-box.webp' });
      await Assets.load(Keys.LOOT_BOX);
    }
    const json = (await fetch('/assets/fx/loot-box.json').then((r) => r.json())) as {
      frames: Array<{ frame: { x: number; y: number; w: number; h: number } }>;
      meta: { frameTags?: Array<{ name: string; from: number; to: number }> };
    };
    const frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }> = {};
    json.frames.forEach((f, i) => {
      frames[`loot-${i}`] = { frame: f.frame };
    });
    const animations: Record<string, string[]> = {};
    for (const tag of json.meta.frameTags ?? []) {
      const names: string[] = [];
      for (let i = tag.from; i <= tag.to; i++) names.push(`loot-${i}`);
      animations[tag.name] = names;
    }
    const sheet = new Spritesheet(Assets.get<Texture>(Keys.LOOT_BOX), {
      frames,
      animations,
      meta: { scale: 1 },
    });
    await sheet.parse();
    lootBoxSheet = sheet;
    return sheet;
  } catch (e) {
    console.warn('[rr] loot-box atlas failed to load:', e);
    return null;
  }
}

function buildBunnySpritesheetData(
  key: string
): Record<string, { frame: { x: number; y: number; w: number; h: number } }> {
  const frames: Record<
    string,
    { frame: { x: number; y: number; w: number; h: number } }
  > = {};
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < SHEET_COLS; col++) {
      const idx = row * SHEET_COLS + col;
      frames[`${key}-${idx}`] = {
        frame: {
          x: col * FRAME_SIZE,
          y: row * FRAME_SIZE,
          w: FRAME_SIZE,
          h: FRAME_SIZE,
        },
      };
    }
  }
  return frames;
}

/** Bunny animation definitions: name → [startFrame, endFrame, fps, loop] */
export const BUNNY_ANIM_DEFS: Record<
  string,
  [number, number, number, boolean]
> = {
  idle: [0, 7, 8, true],
  move: [8, 15, 12, true],
  eat: [16, 23, 8, false],
  sleep: [32, 39, 4, true],
  happy: [40, 47, 10, false],
  damage: [48, 55, 12, false],
  death: [56, 61, 8, false],
};

export async function loadAllAssets(
  onProgress?: (progress: number) => void
): Promise<void> {
  // Register all assets
  const allItems: { key: string; src: string }[] = [
    ...IMAGES,
    ...BUNNY_SHEETS,
    { key: EXPLOSION.key, src: EXPLOSION.src },
    ...LIGHTNING.keys.map((key) => ({ key, src: LIGHTNING.src(key) })),
    { key: LIGHTNING_BOLT_SHEET.key, src: LIGHTNING_BOLT_SHEET.src },
  ];

  // Add all to Assets resolver
  for (const item of allItems) {
    Assets.add({ alias: item.key, src: item.src });
  }

  // Load everything with progress. The shared 9-slice button sprites come from
  // the kit (resting + pressed twins, under the kit's own aliases) — loaded in
  // parallel so NineButton can bake from them.
  const aliases = allItems.map((i) => i.key);
  await Promise.all([
    Assets.load(aliases, (progress) => onProgress?.(progress)),
    loadButtonAssets(),
    loadArcadeFonts(),
    loadCoinAssets(),
  ]);

  // Parse bunny spritesheets into Spritesheet objects
  for (const sheet of BUNNY_SHEETS) {
    const baseTexture = Assets.get<Texture>(sheet.key);
    const frames = buildBunnySpritesheetData(sheet.key);
    const spritesheetData = {
      frames,
      meta: { scale: 1 },
    };
    const spritesheet = new Spritesheet(baseTexture, spritesheetData);
    await spritesheet.parse();
    bunnySheets.set(sheet.key, spritesheet);
  }

  // Parse explosion spritesheet
  const explTex = Assets.get<Texture>(EXPLOSION.key);
  const explW = explTex.width;
  const cols = Math.floor(explW / EXPLOSION.frameWidth);
  const explFrames: Record<
    string,
    { frame: { x: number; y: number; w: number; h: number } }
  > = {};
  // Assume roughly 14 frames (standard for this asset)
  const totalFrames = 14;
  for (let i = 0; i < totalFrames; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    explFrames[`explosion-${i}`] = {
      frame: {
        x: col * EXPLOSION.frameWidth,
        y: row * EXPLOSION.frameHeight,
        w: EXPLOSION.frameWidth,
        h: EXPLOSION.frameHeight,
      },
    };
  }
  const explSheet = new Spritesheet(explTex, {
    frames: explFrames,
    meta: { scale: 1 },
  });
  await explSheet.parse();
  explosionSheet = explSheet;

  // The lightning strips: one row each, so the slice is a loop over columns.
  lightningSheets.length = 0;
  for (const key of LIGHTNING.keys) {
    const tex = Assets.get<Texture>(key);
    if (!tex) continue;
    const frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }> = {};
    for (let i = 0; i < LIGHTNING.frames; i++) {
      frames[`${key}-${i}`] = {
        frame: { x: i * LIGHTNING.frame, y: 0, w: LIGHTNING.frame, h: LIGHTNING.frame },
      };
    }
    const sheet = new Spritesheet(tex, { frames, meta: { scale: 1 } });
    await sheet.parse();
    lightningSheets.push(sheet);
  }

  // The big bolt: a grid rather than a strip, so the slice walks rows too.
  const boltTex = Assets.get<Texture>(LIGHTNING_BOLT_SHEET.key);
  if (boltTex) {
    const frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }> = {};
    for (let i = 0; i < LIGHTNING_BOLT_SHEET.frames; i++) {
      frames[`${LIGHTNING_BOLT_SHEET.key}-${i}`] = {
        frame: {
          x: (i % LIGHTNING_BOLT_SHEET.cols) * LIGHTNING_BOLT_SHEET.frameWidth,
          y: Math.floor(i / LIGHTNING_BOLT_SHEET.cols) * LIGHTNING_BOLT_SHEET.frameHeight,
          w: LIGHTNING_BOLT_SHEET.frameWidth,
          h: LIGHTNING_BOLT_SHEET.frameHeight,
        },
      };
    }
    const sheet = new Spritesheet(boltTex, { frames, meta: { scale: 1 } });
    await sheet.parse();
    lightningBoltSheet = sheet;
  }

  await loadLootBoxSheet();
  // Bitmap fonts (outline + basic) are registered by loadArcadeFonts() above.
}

/** Get animation textures for a bunny sheet + animation name. */
export function getBunnyAnimTextures(
  sheetKey: string,
  animName: string
): Texture[] {
  const sheet = bunnySheets.get(sheetKey);
  if (!sheet) return [];
  const def = BUNNY_ANIM_DEFS[animName];
  if (!def) return [];
  const [start, end] = def;
  const textures: Texture[] = [];
  for (let i = start; i <= end; i++) {
    const tex = sheet.textures[`${sheetKey}-${i}`];
    if (tex) textures.push(tex);
  }
  return textures;
}

/**
 * One bolt's frames, in order.
 *
 * `which` picks the shape — pass a seeded roll so a strike looks the same on
 * every client watching it. Out-of-range wraps, so a caller can hand it a
 * plain random integer without knowing how many shapes ship.
 *
 * Built by index rather than `Object.values`: the order of an animation is not
 * something to leave to a map's iteration order.
 */
export function getLightningTextures(which = 0): Texture[] {
  if (lightningSheets.length === 0) return [];
  const key = Keys.LIGHTNING_STRIKES[which % Keys.LIGHTNING_STRIKES.length];
  const sheet = lightningSheets[which % lightningSheets.length];
  return Array.from({ length: LIGHTNING.frames }, (_, i) => sheet.textures[`${key}-${i}`])
    .filter(Boolean);
}

/** How many bolt shapes ship, for a caller rolling a random one. */
export const LIGHTNING_SHAPES = Keys.LIGHTNING_STRIKES.length;

/**
 * The big bolt's 27 frames, in order.
 *
 * Built by index rather than `Object.values`, for the same reason the small
 * bolts are: the order of an animation is not something to leave to a map's
 * iteration order. The two blank frames mid-run are KEPT — they are the
 * flicker, and filtering them would close a gap the art puts there on purpose.
 */
export function getLightningBoltTextures(): Texture[] {
  if (!lightningBoltSheet) return [];
  const sheet = lightningBoltSheet;
  return Array.from(
    { length: LIGHTNING_BOLT_SHEET.frames },
    (_, i) => sheet.textures[`${LIGHTNING_BOLT_SHEET.key}-${i}`],
  ).filter(Boolean);
}

/** Get explosion animation textures. */
export function getExplosionTextures(): Texture[] {
  if (!explosionSheet) return [];
  return Object.values(explosionSheet.textures);
}
