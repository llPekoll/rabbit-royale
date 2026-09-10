// Bunny sprite sheets
export const BUNNY_BROWN = 'bunny-brown';
export const BUNNY_GRAY = 'bunny-gray';
export const BUNNY_ORANGE = 'bunny-orange';
export const BUNNY_WHITE = 'bunny-white';
export const BUNNY_YELLOW = 'bunny-yellow';
export const DEAD_SKULL = 'dead-skull';
export const GHOST_DOWN = 'ghost-down';
export const GHOST_UP = 'ghost-up';
export const BOMB_SMALL = 'bomb-small';

// Bunny animation rows (8 frames each, 32x32)
export const BUNNY_ANIMS = {
  idle: { row: 0, frames: 8 },
  move: { row: 1, frames: 8 },
  eat1: { row: 2, frames: 8 },
  eat2: { row: 3, frames: 8 },
  sleep: { row: 4, frames: 8 },
  happy: { row: 5, frames: 8 },
  damage: { row: 6, frames: 8 },
  death: { row: 7, frames: 6 },
} as const;

// Golden-coin frames now come from @domin8/arcade-kit
// (GOLDEN_COIN_ALIASES / loadCoinAssets) — no local key needed.

/** The pixel carrot — RR's own food prop, from the shared kit. TALL (13x29):
 *  size it by HEIGHT and derive the width, or it renders squashed. */
export const CARROT = 'carrot';
/** The iris aperture's silhouette — see tools/gen_carrot_mask.py. */
export const CARROT_MASK = 'carrot-mask';

/** The eight drifting cloud sprites, keyed `cloud-1`..`cloud-8`. */
export const CLOUD_COUNT = 8;
export const cloudKey = (n: number) => `cloud-${n}`;

// FX
export const EXPLOSION_SMALL = 'explosion-small';

// UI
export const LOGO = 'logo';
export const LOGO_BANNER = 'logo-banner';
export const TREASURE_CHEST = 'treasure-chest';
/** The animated loot box (shared with the arena): idle frames + a `highlight`
 *  shine tag. Its atlas ships beside it as `loot-box.json`. */
export const LOOT_BOX = 'loot-box';
// The shared arcade-kit 9-slice button sprites now load via the kit's
// `loadButtonAssets()` under its own aliases (see AssetLoader) — RR no longer
// keeps its own keys or `public/` copies for them.

// Music
export const MUSIC_ISLAND = 'music-island';
export const MUSIC_GAMEOVER = 'music-gameover';
export const MUSIC_VICTORY = 'music-victory';

// SFX
export const SFX_HOP = 'sfx-hop';
export const SFX_COIN = 'sfx-coin';
export const SFX_COIN_START = 'sfx-coin-start';
export const SFX_CHIME = 'sfx-chime';
export const SFX_CHIME_QUICK = 'sfx-chime-quick';
export const SFX_EXPLOSION = 'sfx-explosion';
export const SFX_DIE = 'sfx-die';
export const SFX_STEP = 'sfx-step';
export const SFX_MATCH = 'sfx-match';
export const SFX_INSERT_COIN = 'sfx-insert-coin';

// Ambiance
export const AMB_WATER = 'amb-water';
export const AMB_BIRDS = 'amb-birds';

// Bitmap fonts — registered by arcade-kit's loadArcadeFonts() (see AssetLoader).
// These family names must match the kit's FONT_OUTLINE / FONT_BASIC.
export const FONT_PIXEL_S = 'd8-outline';
export const FONT_PIXEL_M = 'pixel-16';
export const FONT_BASIC = 'd8-basic';
