/** Shared game types. Client and server both import these — never duplicate. */

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
  width: number;
  height: number;
  tiles: Tile[];
  /** Tier name from tuning.ISLAND_TIERS — drives the visuals and the densities. */
  tier: string;
  /** Tiles dug so far, tracked incrementally: the eruption check runs every dig. */
  dugCount: number;
  createdAt: number;
}

export interface Rabbit {
  playerId: string;
  name: string;
  x: number;
  y: number;
  energy: number;
  carrots: number;
  /** Server timestamp until which input is ignored (bomb stun). */
  stunnedUntil: number;
  /** Last accepted move, for the anti-speedhack gate. */
  lastMoveAt: number;
  /** 0 energy = run over. Kept on the island until they leave or restart. */
  alive: boolean;
  /** Season leader, drawn with the crown and worth more when raided. */
  crowned: boolean;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

export const DIRECTIONS: Record<Direction, readonly [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
} as const;

/** What a dig produced. The server sends this back; the client only animates. */
export interface DigResult {
  x: number;
  y: number;
  content: TileContent;
  adjacent: number;
  energyDelta: number;
  carrotDelta: number;
  /** Set when the tile was a bomb: where the blast threw the rabbit. */
  knockback?: { x: number; y: number; stunnedUntil: number };
  /** Chest contents (Phase 1 stub gives carrots; Phase 5 gives real items). */
  loot?: { kind: string; amount: number };
  /** A sabotage bomb names its planter, so revenge has an address. */
  plantedBy?: string;
}

/** Index helpers — tiles are a flat array, always addressed through these. */
export const idx = (island: Pick<Island, 'width'>, x: number, y: number) =>
  y * island.width + x;

export const inBounds = (island: Pick<Island, 'width' | 'height'>, x: number, y: number) =>
  x >= 0 && y >= 0 && x < island.width && y < island.height;
