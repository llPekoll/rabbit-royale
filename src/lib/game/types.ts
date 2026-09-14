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
  /**
   * The tile this rabbit stepped off on its last move.
   *
   * Kept so a head-on collision can be told from a chase: both look like two
   * rabbits one tile apart, and only the DIRECTION of the last step separates
   * them. Undefined before the first move.
   */
  cameFrom?: number;
  /** 0 energy = run over. */
  alive: boolean;
  /** Season leader, drawn with the crown and worth more when raided. */
  crowned: boolean;
  /**
   * The run's own paperwork, carried ON THE RABBIT rather than on the socket.
   *
   * A seat outlives its connection: a refresh keeps the run alive through the
   * reconnect grace, and the sweep that eventually frees the seat has no socket
   * to read from. Banking used to take these from `socket.data`, so the one
   * exit that had no socket — the sweep — deleted the rabbit and its carrots
   * without ever writing them down. They live here so any exit can bank.
   */
  run?: {
    /** `runs` row id. Cleared once banked, which is what makes banking safe to
     *  call from more than one exit. */
    id?: string;
    startedAt: number;
    tilesDug: number;
    bombsHit: number;
    /**
     * Items pulled from chests this run, by kind, banked with the carrots.
     *
     * Held here rather than written at the dig for the same reason the carrots
     * are: a run is banked at ONE point, from whichever exit fires, and an item
     * credited mid-dig would survive a run whose carrots were rolled back —
     * a player could then farm chests by never finishing. Living on the rabbit
     * also means the sweep can bank a loot bag for a player who is long gone.
     *
     * `nft` is deliberately absent from this bag: it is not a stackable item and
     * is recorded on its own — see `run.nfts`.
     */
    loot: Partial<Record<LootItemKind, number>>;
    /** Chest NFT drops this run, as tile indices — the seed the mint is drawn
     *  from. Kept apart from `loot` because one is a count and this is not. */
    nfts: number[];
  };
}

/**
 * The chest kinds that become an inventory grant. `carrots` is paid straight
 * onto the rabbit and `nft` is minted, so neither appears here.
 */
export type LootItemKind = 'bomb' | 'shield' | 'lightning' | 'water' | 'fertiliser';

/** What a dig produced. The server sends this back; the client only animates. */
export interface DigResult {
  tile: number;
  content: TileContent;
  adjacent: number;
  energyDelta: number;
  carrotDelta: number;
  /** Set when the tile was a bomb: the tile the blast threw the rabbit onto. */
  knockback?: { tile: number; stunnedUntil: number };
  /** Chest contents. Carrots land immediately; items are banked with the run. */
  loot?: { kind: string; amount: number };
  /** A sabotage bomb names its planter, so revenge has an address. */
  plantedBy?: string;
}
