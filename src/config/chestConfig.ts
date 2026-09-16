/**
 * What a chest LOOKS like, and what its label promises.
 *
 * The rarity is drawn procedurally — a ground glow, a ring, a shaft of light
 * and a word — over ONE piece of art (the loot-box atlas). There is no sprite
 * per tier and there does not need to be: `Tile.setChest` tints the flair, and
 * the chest itself stays the same dark box at every rarity. That is what makes
 * a new tier cost a colour rather than a drawing.
 *
 * ## Why these words and not the collection's
 *
 * The ladder used to run common/rare/epic/legendary, borrowed from RR-Casino.
 * That collided with RR Genesis, whose 500 pieces carry rarities of their OWN
 * under those exact four names (330 common / 120 rare / 40 epic / 10
 * legendary) — so a LEGENDARY chest could hand over a COMMON rabbit, and the
 * player would read a generous prize (one artwork in five hundred) as a
 * let-down, because the screen had just used the word "legendary" to mean
 * something else.
 *
 * Metals fix it by not being rarity words at all. A chest is a container and
 * these name how much it holds; the collection keeps its own vocabulary, and
 * the two can never be mistaken for one scale. CROWN sits on top because the
 * crown already means "the best there is" in this game (the season's #1 wears
 * one) — it is the one tier whose name the player already understands.
 */

/** The four chest sizes, poorest to richest. */
export type ChestTier = 'bronze' | 'silver' | 'gold' | 'crown';

/** The order the ladder is read in — and the one a story lays out. */
export const CHEST_TIER_ORDER: readonly ChestTier[] = ['bronze', 'silver', 'gold', 'crown'];

/**
 * The accent each tier is announced in — glow, ring, beam, label.
 *
 * The metals name their own colours, which is most of the work done: bronze,
 * silver and gold are read correctly by everyone without a key. The care goes
 * into the two risks that creates.
 *
 * FIRST, gold and bronze are both warm and sit close in hue. So bronze is
 * pushed dark and coppery while gold is pushed bright and yellow — far enough
 * apart to survive being seen across a board against grass, which is the only
 * test that matters here.
 *
 * SECOND, CROWN cannot be a richer gold, or the top of the ladder becomes a
 * shade of the tier below it and the best chest in the game reads as "gold,
 * slightly more". It breaks the metal run on purpose and goes violet — the one
 * hue nothing else on the board uses, so a crown chest is identifiable at a
 * glance from anywhere.
 *
 * Never used as a `tint` on the chest sprite itself. A tint MULTIPLIES the art,
 * and the art is already a dark red-brown — two tiers came out the same muddy
 * colour when this was tried. The accent has to sit behind the box or under it.
 */
export const CHEST_TIER_COLOR: Record<ChestTier, number> = {
  bronze: 0xb87333,
  silver: 0xc9d3dd,
  gold: 0xffd54f,
  crown: 0xba68c8,
};

/**
 * What each tier actually pays out, as the label promises it.
 *
 * This is the player-facing contract of the ladder: the word above the chest
 * has to mean something specific, or the colours are decoration. The tiers name
 * a FAMILY rather than an item — "a garden consumable", not "a watering can" —
 * because the GDD's `reward is lottery` only holds if the exact prize is still
 * a surprise. A chest that displayed its contents would make a bomb chest
 * ignorable to anyone farming, and the walk to it is the whole feature.
 *
 * Kept here beside the colours, not in `tuning.ts`, because it describes what
 * the player READS off the board. The weighted tables that actually roll a drop
 * are `CHEST_LOOT_BY_TIER` in config/tuning.ts — one per tier, precisely so
 * this promise can be kept — and a test pins the two together.
 */
export const CHEST_TIER_PROMISE: Record<ChestTier, string> = {
  bronze: 'Carrots',
  silver: 'A garden consumable - water or fertiliser',
  gold: 'A raid item - bomb, shield or lightning',
  crown: 'A raid item, and a chance at an RR Genesis piece',
};

/**
 * Is this string one of the four tiers?
 *
 * The tier arrives from the server as a plain string, so it is validated rather
 * than asserted: a snapshot from an older build (or a tampered one) naming a
 * tier this client does not know must fall back to a drawn chest, not throw
 * mid-render or index the flair table with undefined.
 */
export function isChestTier(v: unknown): v is ChestTier {
  return typeof v === 'string' && (CHEST_TIER_ORDER as readonly string[]).includes(v);
}

/** The accent as a CSS hex, for the DOM half of a story or a panel. */
export function chestTierCss(tier: ChestTier): string {
  return `#${CHEST_TIER_COLOR[tier].toString(16).padStart(6, '0')}`;
}

/**
 * The four rarities an RR Genesis piece can carry — the collection's OWN
 * ladder, deliberately kept apart from the chest one above.
 *
 * Mirrors the kit's `RevealRarity`, which is locked to these names because they
 * drive its ray palettes. Declared here so the rest of the game can talk about
 * a piece's rarity without importing the ceremony.
 */
export type GenesisRarity = 'common' | 'rare' | 'epic' | 'legendary';

/** How many of the 500 carry each rarity — from the collection's own manifest. */
export const GENESIS_SUPPLY: Record<GenesisRarity, number> = {
  common: 330,
  rare: 120,
  epic: 40,
  legendary: 10,
};

/**
 * What the ceremony stamps over a won piece.
 *
 * Always prefixed, and that prefix is the whole point: "LEGENDARY" alone would
 * be read as the chest's tier by a player who has been reading chest tiers all
 * session. "GENESIS LEGENDARY" says which ladder the word belongs to, in the
 * only moment where both are on screen at once.
 */
export function genesisStamp(rarity: GenesisRarity): string {
  return `GENESIS ${rarity.toUpperCase()}`;
}
