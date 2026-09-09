/**
 * Shared game types.
 *
 * Positions are TILE INDICES, not x/y pairs. The board is an isometric grid
 * whose neighbours are not "the four cardinal directions" — the renderer, the
 * input mapping and the island's shape all already speak in indices, and having
 * the server speak a second dialect would mean translating on every message and
 * getting it wrong somewhere. `gridConfig` owns the index↔col/row maths.
 */

/** What is buried under a tile. Only the server knows this before a dig. */
export type TileContent = 'empty' | 'carrot' | 'golden' | 'bomb' | 'chest';

export interface Tile {
  /** Has this tile been dug? Revealed tiles are walkable for free. */
  revealed: boolean;
  content: TileContent;
  /** Minesweeper hint: bombs among the 8 neighbours. Valid once revealed. */
  adjacent: number;
  /** Who planted this bomb, if a saboteur did (Phase 5). Victims see the name. */
  plantedBy?: string;
  /** Whoever first dug it — carrots go to the first digger only. */
  dugBy?: string;
}

export interface Island {
  id: string;
  seed: string;
  /** Land tiles, by index. Water squares are absent, not present-and-empty. */
  tiles: Map<number, Tile>;
  /** Tier name from tuning.ISLAND_TIERS — drives visuals and densities. */
  tier: string;
  /** Tiles dug so far, tracked incrementally: the eruption check runs per dig. */
  dugCount: number;
  createdAt: number;
}

export interface Rabbit {
  playerId: string;
  name: string;
  /** Tile index. */
  tile: number;
  energy: number;
  carrots: number;
  /** Server timestamp until which input is ignored (bomb stun). */
  stunnedUntil: number;
  /** Last accepted move, for the anti-speedhack gate. */
  lastMoveAt: number;
  /** 0 energy = run over. */
  alive: boolean;
  /** Season leader, drawn with the crown and worth more when raided. */
  crowned: boolean;
}

/** What a dig produced. The server sends this back; the client only animates. */
export interface DigResult {
  tile: number;
  content: TileContent;
  adjacent: number;
  energyDelta: number;
  carrotDelta: number;
  /** Set when the tile was a bomb: the tile the blast threw the rabbit onto. */
  knockback?: { tile: number; stunnedUntil: number };
  /** Chest contents (Phase 1 stub gives carrots; Phase 5 gives real items). */
  loot?: { kind: string; amount: number };
  /** A sabotage bomb names its planter, so revenge has an address. */
  plantedBy?: string;
}
