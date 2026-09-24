/**
 * Shared game types.
 *
 * Positions are TILE INDICES, not x/y pairs. The board is an isometric grid
 * whose neighbours are not "the four cardinal directions" — the renderer, the
 * input mapping and the island's shape all already speak in indices, and having
 * the server speak a second dialect would mean translating on every message and
 * getting it wrong somewhere. `gridConfig` owns the index↔col/row maths.
 */

import type { ChestTier } from '@/config/chestConfig';

/** What is buried under a tile. Only the server knows this before a dig. */
export type TileContent = 'empty' | 'carrot' | 'golden' | 'bomb' | 'chest';

export interface Tile {
  /** Has this tile been dug? Revealed tiles are walkable for free. */
  revealed: boolean;
  /**
   * The hint is KNOWN but the tile is not dug — the cascade's state.
   *
   * Minesweeper's open-a-zone rule, kept without its "dig everything" half:
   * a dug tile with no bomb around it shows the numbers of its neighbours,
   * and theirs if they are zero too, out to the first real number. What it
   * does not do is dig them: a hinted tile still holds its carrot or its
   * chest, still costs a step to collect, and still counts as ground left
   * for the eruption. The island stays the clock and the race stays
   * physical; only the reading gets faster. See `cascadeHints`.
   */
  hinted?: boolean;
  content: TileContent;
  /** Minesweeper hint: bombs among the 8 neighbours. Valid once revealed. */
  adjacent: number;
  /** Who planted this bomb, if a saboteur did (Phase 5). Victims see the name. */
  plantedBy?: string;
  /**
   * A player marked this bomb with a red X, and was RIGHT — see FLAG in tuning
   * and `flagTile`. Only ever set on a bomb: a wrong X is answered on the spot
   * and leaves no mark. The bomb stays buried; nobody may step onto it.
   */
  flagged?: boolean;
  /** Who placed the X. */
  flaggedBy?: string;
  /** Whoever first dug it — carrots go to the first digger only. */
  dugBy?: string;
  /**
   * Which ladder rung a `chest` tile sits on, and therefore what it may hold.
   *
   * Set at generation and PUBLIC: the board announces it with a coloured beam
   * and the word written above the box, because the walk towards a chest is the
   * decision the feature is about. Undefined on every other content.
   */
  chestTier?: ChestTier;
}

export interface Island {
  id: string;
  seed: string;
  /** Land tiles, by index. Water squares are absent, not present-and-empty. */
  tiles: Map<number, Tile>;
  /** Tier name from tuning.ISLAND_TIERS — drives visuals and densities. */
  tier: string;
  /** The rabbit level this island was dealt for (RABBIT_LEVELS), 1 → MAX.
   *  Absent on an island dealt by lifetime (the tests, the tutorial). */
  level?: number;
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
  /** Server timestamp until which a BLOOP holds the rabbit on the island. */
  inkedUntil?: number;
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
  /** The player's rabbit level at spawn (RABBIT_LEVELS). Below RAID_MIN a
   *  rabbit neither strikes nor is struck — no bolt, mirage or shove. */
  level?: number;
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
    /**
     * Did this run ever MOVE? Set by the first accepted step, dig or not.
     *
     * Distinct from `tilesDug`, and the distinction is the whole point:
     * walking revealed ground is free (see `resolveMove`), and a rabbit spawns
     * beside ground somebody has already opened — so a player can cross,
     * play, and walk home having dug nothing. Counting that as "never
     * started" refunded a run that really happened. Only a player who never
     * took a step at all was merely looking.
     */
    moved?: boolean;
    bombsHit: number;
    /** Right Xs in a row, with no wrong X and no blast — see FLAG in tuning. */
    flagStreak?: number;
    /** Bombs correctly marked this run, for the recap. */
    bombsFlagged?: number;
    /**
     * Chests this rabbit was FIRST to open. Banked onto `players.chestsOpened`
     * for the quest board; optional so a fixture built before it counts as
     * zero rather than failing to type.
     */
    chests?: number;
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

/** The kinds above, as a value — and the guard that narrows a table's `kind`. */
export const LOOT_ITEM_KINDS: readonly LootItemKind[] = [
  'bomb', 'shield', 'lightning', 'water', 'fertiliser',
];

/**
 * Is this drop one the run's bag can hold?
 *
 * The loot tables type `kind` as a plain string (four tiers of differing shape
 * will not unify otherwise), so this is where a rolled kind is proven to be a
 * bankable item rather than asserted with a cast. A kind that is neither this,
 * `carrots` nor `nft` is silently dropped — which a cast would have turned into
 * a corrupt bag entry instead.
 */
export function isLootItemKind(v: string): v is LootItemKind {
  return (LOOT_ITEM_KINDS as readonly string[]).includes(v);
}

/** A hint the cascade opened on an UNDUG tile — the number, never the content. */
export interface HintReveal {
  tile: number;
  adjacent: number;
}

/** What a red X turned out to be worth — see FLAG in tuning and `flagTile`. */
export interface FlagResult {
  tile: number;
  /** Was there a bomb under it? */
  correct: boolean;
  /** Energy gained (right) or lost (wrong), signed. */
  energyDelta: number;
  /** Carrots paid. 0 on a wrong X. */
  carrotDelta: number;
  /** The marker's streak AFTER this X. 0 on a wrong one. */
  streak: number;
  /** A right X that dug the bomb up whole: a raid bomb for the run's bag. */
  item?: boolean;
  /**
   * Numbers written because of a WRONG X: the tile itself (it is safe, and now
   * says so), and whatever the cascade opens if it turned out to be a zero.
   */
  hinted?: HintReveal[];
}

/** What a dig produced. The server sends this back; the client only animates. */
export interface DigResult {
  tile: number;
  content: TileContent;
  adjacent: number;
  energyDelta: number;
  carrotDelta: number;
  /**
   * Hints the cascade opened because this dig landed on a zero. Broadcast to
   * the island like the reveal itself: what the ground says is a shared fact.
   */
  hinted?: HintReveal[];
  /** Set when the tile was a bomb: the tile the blast threw the rabbit onto. */
  knockback?: { tile: number; stunnedUntil: number };
  /**
   * Chest contents. Carrots land immediately; items are banked with the run.
   *
   * `announced` says whether the box was VISIBLE before the dig — a tiered
   * chest advertises its position and colour through `publicView`, so the
   * player crossed the island on purpose to open it. That walk is what earns
   * the full ceremony; a chest nobody could see pays out without taking the
   * screen. Derived from `chestTier` rather than stored separately, because
   * the tier IS what makes a chest public.
   */
  loot?: { kind: string; amount: number; announced: boolean };
  /**
   * A crown chest also gave up an RR Genesis piece.
   *
   * Its own flag rather than a `loot` kind, because it arrives ALONGSIDE the
   * chest's item rather than instead of it — the client has two things to
   * celebrate, and a single field could only name one.
   */
  nft?: boolean;
  /** A sabotage bomb names its planter, so revenge has an address. */
  plantedBy?: string;
}
