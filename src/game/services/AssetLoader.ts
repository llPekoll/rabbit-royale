import { Assets, Spritesheet, Texture, TextureSource } from 'pixi.js';
import { loadButtonAssets, loadArcadeFonts, loadCoinAssets } from '@domin8/arcade-kit/pixi';
import { CARROT_URL } from '@domin8/arcade-kit/game';
import * as Keys from '@/config/assetKeys';

// Force nearest-neighbor (pixelated) scaling for all textures
TextureSource.defaultOptions.scaleMode = 'nearest';

/** Frame layout for bunny spritesheets: 8 cols x 8 rows of 32x32 */
const FRAME_SIZE = 32;
const SHEET_COLS = 8;

const BUNNY_SHEETS = [
  { key: Keys.BUNNY_BROWN, src: '/assets/bunnies/Bunny Sprite Sheet - Brown.png' },
  { key: Keys.BUNNY_GRAY, src: '/assets/bunnies/Bunny Sprite Sheet - Gray.png' },
  { key: Keys.BUNNY_ORANGE, src: '/assets/bunnies/Bunny Sprite Sheet - Orange.png' },
  { key: Keys.BUNNY_WHITE, src: '/assets/bunnies/Bunny Sprite Sheet - White.png' },
  { key: Keys.BUNNY_YELLOW, src: '/assets/bunnies/Bunny Sprite Sheet - Yellowish.png' },
];

const IMAGES = [
  { key: Keys.DEAD_SKULL, src: '/assets/bunnies/RR-Skull.png' },
  { key: Keys.GHOST_DOWN, src: '/assets/bunnies/RR-Ghost-Down.png' },
  { key: Keys.GHOST_UP, src: '/assets/bunnies/RR-Ghost-Up.png' },
  { key: Keys.BOMB_SMALL, src: '/assets/RR-Bomb-Small.png' },
  { key: Keys.LOGO, src: '/assets/ui/rr-logo-1x.png' },
  { key: Keys.LOGO_BANNER, src: '/assets/ui/RR-Logo_Banner.png' },
  { key: Keys.TREASURE_CHEST, src: '/assets/ui/treasure_chest.png' },
  { key: Keys.LOOT_BOX, src: '/assets/fx/loot-box.png' },
  // The carrot comes from the shared kit rather than public/: it is the same
  // prop the hub's season pass draws, and one copy means one carrot.
  { key: Keys.CARROT, src: CARROT_URL },
  // The drifting clouds. Eight shapes so a sky of them never visibly repeats.
  ...Array.from({ length: Keys.CLOUD_COUNT }, (_, i) => ({
    key: Keys.cloudKey(i + 1),
    src: `/assets/clouds/Clouds_0${i + 1}.png`,
  })),
];

// Golden coin frames now come from @domin8/arcade-kit (loadCoinAssets) — see
// the Promise.all below. CoinRain reads them via the kit's GOLDEN_COIN_ALIASES.

/** Explosion spritesheet: 48x48 frames */
const EXPLOSION = {
  key: Keys.EXPLOSION_SMALL,
  src: '/assets/fx/expfx1_epic_explosion_A_small_orange/spritesheet.png',
  frameWidth: 48,
  frameHeight: 48,
};

/** Store parsed spritesheets for AnimatedSprite creation */
export const bunnySheets = new Map<string, Spritesheet>();
export let explosionSheet: Spritesheet | null = null;
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
      Assets.add({ alias: Keys.LOOT_BOX, src: '/assets/fx/loot-box.png' });
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

/** Get explosion animation textures. */
export function getExplosionTextures(): Texture[] {
  if (!explosionSheet) return [];
  return Object.values(explosionSheet.textures);
}
