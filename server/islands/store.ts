/**
 * Where island state lives.
 *
 * The MVP runs ONE ws process, so islands sit in a Map and this interface looks
 * like ceremony. It is not: the day a single process stops keeping up, the fix
 * is a second implementation of this interface (islands owned by a shard,
 * addressed by id) plus the socket.io Redis adapter — not a rewrite of the game
 * loop. Every caller goes through `IslandStore`; nothing reaches into the Map.
 *
 * Islands are deliberately NOT persisted to Postgres. An island lives minutes,
 * is fully reconstructible from its seed, and writing 400 tiles per dig would
 * put the database on the hot path for no benefit. What survives a restart is
 * what players earned (runs, carrots), which is written at run boundaries.
 */
import { randomUUID } from 'node:crypto';

import { ERUPTION, MULTIPLAYER } from '../../config/tuning';
import { generateIsland, safeTilesLeft } from '../../src/lib/game/island';
import { makeShape, type IslandShape } from '../../src/config/gridConfig';
import { forgetTerrain, terrainFor } from '../../src/lib/game/terrainBoard';
import type { ActiveMirage } from '../../src/lib/game/mirage';
import type { Island, Rabbit } from '../../src/lib/game/types';

export interface LiveIsland {
  island: Island;
  /** The coastline, cut from the same seed. Cached: every move consults it. */
  shape: IslandShape;
  /** playerId → rabbit. Seats, including players in reconnect grace. */
  rabbits: Map<string, Rabbit>;
  /** playerId → deadline; a refresh keeps the seat this long. */
  disconnectedAt: Map<string, number>;
  /** Set while the eruption cutscene plays: no moves are accepted. */
  erupting: boolean;
  /** Warning stage 0-3, broadcast only when it changes (the volcano smokes). */
  warnStage: number;
  /**
   * Share of the safe tiles already dug, 0 → 1 — the number the HUD shows.
   *
   * Cached rather than recomputed for the snapshot: `islandProgress` walks
   * every tile, and a join would pay that walk for a figure the dig handler
   * has just worked out anyway. Written on every dig, read when somebody
   * joins mid-run.
   */
  dugFraction: number;
  /**
   * Mirages currently bending the numbers, by VICTIM.
   *
   * Per victim rather than per island: a mirage is thrown at one rival, and
   * everyone else on the shared island goes on reading honest ground. Holding
   * it here rather than on the rabbit means it survives the victim's
   * reconnect, which is exactly the window an attacker would otherwise use.
   */
  mirages: Map<string, ActiveMirage>;
  /**
   * Where the sheep are RIGHT NOW, by placement id.
   *
   * Everything else standing on the island (trees, rocks, soldiers) is derived
   * from the seed on both sides and never moves, so the server has nothing to
   * say about it. Sheep bolt when a rabbit gets close (`flee.ts`), and the
   * moment a thing moves its position stops being derivable: two clients
   * running the same seed would drift apart, and since a sheep BLOCKS its cell
   * they would disagree about which moves are legal. So the server owns it and
   * broadcasts it, exactly like a rabbit's tile.
   *
   * Seeded from the terrain's placements when the island is created, so a run
   * still opens on the flock the seed describes.
   */
  sheep: Map<string, { x: number; y: number }>;
  emptySince: number | null;
  /**
   * Nobody else is ever seated here. The first island a player sees is
   * theirs alone — a tutorial with a stranger racing across it is not a
   * tutorial — so `findJoinable` skips it. Torn down like any other.
   */
  solo: boolean;
}

export interface IslandStore {
  get(id: string): LiveIsland | undefined;
  all(): Iterable<LiveIsland>;
  create(seed: string, lifetimeCarrots: number, opts?: { solo?: boolean }): LiveIsland;
  delete(id: string): void;
  /**
   * The island a joining player belongs on: the fullest island that still has
   * room, so players CLUSTER rather than scattering one-per-island. Drop-in
   * without a lobby only feels alive if the emptiest island is not the default.
   */
  findJoinable(): LiveIsland | undefined;
  /**
   * The island already holding a seat for this player, if any.
   *
   * Consulted BEFORE `findJoinable`, because a seat outlives the connection: a
   * player reconnecting inside the grace window has a rabbit somewhere, and
   * sending them to the fullest island instead would leave that one behind,
   * still carrying their carrots, for the sweep to bank.
   */
  seatOf(playerId: string): LiveIsland | undefined;
  /** Islands with nobody on them past their TTL — swept on a timer. */
  reapable(now: number): LiveIsland[];
}

export class MemoryIslandStore implements IslandStore {
  private islands = new Map<string, LiveIsland>();

  get(id: string) { return this.islands.get(id); }
  all() { return this.islands.values(); }
  /**
   * Tear an island down, cache included.
   *
   * The island id IS its seed (`generateIsland` sets `id: opts.seed`), and the
   * terrain cache is keyed by seed — so this is the one place that knows both
   * that an island is finished and which cache entry it leaves behind. Doing it
   * here rather than at the two call sites (the eruption and the sweep) is what
   * stops the next teardown path from quietly reintroducing the leak.
   */
  delete(id: string) {
    this.islands.delete(id);
    forgetTerrain(id);
  }

  create(seed: string, lifetimeCarrots: number, opts: { solo?: boolean } = {}): LiveIsland {
    const live: LiveIsland = {
      solo: opts.solo ?? false,
      // Two seeds, and the second one never leaves this process. `seed` is the
      // island id and travels in every snapshot so the client can cut the same
      // coastline; `contentSeed` decides where the bombs are and is generated
      // fresh here. Without the split, publishing the id published the bomb map:
      // the generator is pure and every primitive it uses is already in the
      // browser bundle, so a player could re-run it in a console. See the note
      // at the top of `island.ts`.
      island: generateIsland({ seed, contentSeed: randomUUID(), lifetimeCarrots }),
      shape: makeShape(seed),
      rabbits: new Map(),
      disconnectedAt: new Map(),
      erupting: false,
      warnStage: 0,
      dugFraction: 0,
      mirages: new Map(),
      // The flock the seed describes, taken as a STARTING position rather than
      // as the truth: from here on the server moves them and tells everyone.
      sheep: new Map(
        terrainFor(seed).placements
          .filter((p) => p.kind === 'sheep')
          .map((p) => [p.id, { x: p.x, y: p.y }] as const),
      ),
      emptySince: Date.now(),
    };
    this.islands.set(live.island.id, live);
    return live;
  }

  seatOf(playerId: string): LiveIsland | undefined {
    for (const live of this.islands.values()) {
      if (live.erupting) continue;
      if (live.rabbits.has(playerId)) return live;
    }
    return undefined;
  }

  findJoinable(): LiveIsland | undefined {
    let best: LiveIsland | undefined;
    for (const live of this.islands.values()) {
      if (live.erupting) continue;
      if (live.solo) continue;
      const seats = live.rabbits.size;
      if (seats >= MULTIPLAYER.MAX_PLAYERS_PER_ISLAND) continue;
      // Nearly cleared: whoever is on it finishes it, but it is not worth a
      // run to anyone new. See ERUPTION.JOIN_MIN_TILES_LEFT.
      if (safeTilesLeft(live.island) < ERUPTION.JOIN_MIN_TILES_LEFT) continue;
      // Fullest-with-room: pack players together.
      if (!best || seats > best.rabbits.size) best = live;
    }
    return best;
  }

  reapable(now: number): LiveIsland[] {
    const out: LiveIsland[] = [];
    for (const live of this.islands.values()) {
      if (live.rabbits.size > 0) { live.emptySince = null; continue; }
      live.emptySince ??= now;
      // An empty island lives out its day so someone can come back and finish
      // it — unless there is nothing left worth coming back for, in which case
      // nobody would be sent to it anyway (see `findJoinable`) and it goes now.
      const spent = safeTilesLeft(live.island) < ERUPTION.JOIN_MIN_TILES_LEFT;
      if (spent || now - live.emptySince > MULTIPLAYER.EMPTY_ISLAND_TTL_MS) out.push(live);
    }
    return out;
  }
}
