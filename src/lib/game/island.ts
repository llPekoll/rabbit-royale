/**
 * Island generation — pure and seed-deterministic.
 *
 * Everything is a function of the seed, so an island rebuilds from its id
 * alone: the server stores a seed, not 200 tiles, and the CLIENT cuts the
 * identical coastline from the same seed without it ever crossing the wire.
 *
 * NOTE: this module holds the buried contents. It runs SERVER-SIDE ONLY —
 * shipping it to the browser would hand every player the bomb map. The client
 * gets a redacted view (`publicView`) and the shape (from gridConfig, which is
 * safe: where the land is was never a secret).
 *
 * That import discipline is NOT what keeps the bombs secret, though, and it is
 * worth being precise about why. Everything this module needs — `mulberry32`,
 * `seedFrom`, `shuffle`, `farmableTiles`, `spawnTile`, `tierFor` — already ships
 * to the browser for other reasons, and the algorithm below is a pure function
 * of its inputs. Anyone holding the inputs can re-run it in a console without
 * ever importing this file. So the secret cannot be the CODE; it has to be an
 * input the client never receives.
 *
 * Hence two seeds. `seed` is public and cuts everything the client must draw
 * (coastline, tiers, placements, spawn). `contentSeed` is private, never
 * appears in `publicView` or in any payload, and is the ONLY thing that decides
 * where a bomb sits. Publishing `seed` is then harmless by construction.
 */
import { CHEST_TIER_WEIGHTS, FIRST_RUN, ISLAND, RISK_GRADIENT, tierFor } from '@config/tuning';
import {
  COLS, ROWS, SPAWN_INDEX, makeShape, isForbidden, neighbors, toColRow, toIndex,
  type IslandShape,
} from '@/config/gridConfig';
import { farmableTiles, spawnTile, terrainNeighbors } from './terrainBoard';
import { isFirstIsland } from './first-island';
import { mulberry32, pickWeighted, seedFrom, shuffle, type Rng } from './rng';
import type { HintReveal, Island, Tile } from './types';

export interface GenerateOptions {
  /** PUBLIC. Cuts the land the client draws; travels in every snapshot. */
  seed: string;
  /**
   * PRIVATE. Seeds what is BURIED, and nothing else.
   *
   * Must never be sent to a client, logged next to a player id, or derived from
   * `seed` — the whole point is that holding `seed` tells you nothing about the
   * bombs. The server passes a fresh `randomUUID()`.
   *
   * Optional only so that the pure-generation tests can pin a content layout by
   * seed alone; it falls back to `seed`, which is exactly the old (guessable)
   * behaviour and is why the server must always pass one explicitly.
   */
  contentSeed?: string;
  /** Drives the tier (densities) — the highest lifetime among the players. */
  lifetimeCarrots?: number;
}

export function generateIsland(opts: GenerateOptions): Island {
  const rng = mulberry32(seedFrom(`content:${opts.contentSeed ?? opts.seed}`));
  const tier = tierFor(opts.lifetimeCarrots ?? 0);
  const shape = makeShape(opts.seed);

  // Playable ground only. A tile is absent from the map unless the TERRAIN
  // offers it: not the sea, not the rock a cliff face is drawn over, not a
  // cell with a pine on it, and not a pocket cut off behind a cliff. Anything
  // buried outside that set is a prize the player can see and never reach,
  // which is worse than no prize at all.
  const tiles = new Map<number, Tile>();
  for (const i of farmableTiles(opts.seed)) {
    tiles.set(i, { revealed: false, content: 'empty', adjacent: 0 });
  }

  // The spawn and its immediate ring are carved out of the bomb pool, so a run
  // can never open on a blast. The spawn comes from the terrain too — the
  // centre of a 16x16 can be open water once the coastline is generated.
  const spawn = spawnTile(opts.seed);
  const safe = new Set<number>([spawn, ...terrainNeighbors(opts.seed, spawn)]);

  if (isFirstIsland(opts.seed)) {
    firstIslandLayout(opts.seed, tiles, spawn, safe, rng);
  } else {
    // Deal contents by shuffling the eligible tiles once and slicing. Simpler
    // than rejection-sampling per item, and it cannot loop forever at the high
    // densities of the late tiers.
    //
    // Bombs and goldens are drawn FIRST and weighted by the walk from the spawn
    // (RISK_GRADIENT): the counts are the tier's, where they fall is not
    // uniform any more. What is left is shuffled and sliced as before.
    const total = tiles.size;
    const eligible = [...tiles.keys()].filter((i) => !safe.has(i));
    const dist = stepsFrom(opts.seed, spawn, tiles);
    let furthest = 1;
    for (const d of dist.values()) if (d > furthest) furthest = d;
    // A tile the walk never reached is treated as the far edge — it cannot
    // happen on terrain `farmableTiles` cut, and must not divide by zero if it does.
    const depth = (i: number) => (dist.get(i) ?? furthest) / furthest;
    const weighted = (from: number[], g: { NEAR: number; FAR: number }) =>
      weightedOrder(rng, from, (i) => g.NEAR + (g.FAR - g.NEAR) * depth(i));

    const bombCount = Math.floor(total * tier.bombDensity);
    const carrots = Math.floor(total * tier.carrotDensity);
    const golden = Math.floor(carrots * tier.goldenShare);

    // SPREAD, not clumped: a candidate already touching ISLAND.BOMB_MAX_TOUCHING
    // bombs is passed over. Two bombs side by side light mostly the same
    // tiles, so a clump buys fewer numbers than the same bombs apart — and the
    // ground it leaves unlit is a field of zeros, a way round every puzzle.
    // Same count, more of the board worth reading. The passed-over are only
    // deferred: at Caldera's density the cap cannot always hold, and the
    // island must never be dealt short.
    const board = { tiles };
    const bombTiles: number[] = [];
    const deferred: number[] = [];
    for (const i of weighted(eligible, RISK_GRADIENT.BOMB)) {
      if (bombTiles.length >= bombCount) break;
      const touching = boardNeighbors(board, i).filter((n) => tiles.get(n)!.content === 'bomb').length;
      if (touching > ISLAND.BOMB_MAX_TOUCHING) { deferred.push(i); continue; }
      tiles.get(i)!.content = 'bomb';
      bombTiles.push(i);
    }
    for (const i of deferred) {
      if (bombTiles.length >= bombCount) break;
      tiles.get(i)!.content = 'bomb';
      bombTiles.push(i);
    }
    const taken = new Set(bombTiles);
    const goldenTiles = weighted(eligible.filter((i) => !taken.has(i)), RISK_GRADIENT.GOLDEN).slice(0, golden);
    for (const i of goldenTiles) { tiles.get(i)!.content = 'golden'; taken.add(i); }

    // CHESTS BEFORE CARROTS, and on the rim — the chests are the island's win
    // condition now (see `chestProgress`), so where they sit IS the level's
    // shape. Dealt from the uniform pool they landed anywhere, which let a run
    // end without ever leaving the middle. `rimTiles` spreads them round the
    // coast instead, so collecting them is a lap of the island.
    for (const i of rimTiles(opts.seed, spawn, tiles, eligible.filter((i) => !taken.has(i)),
                            Math.round(total * ISLAND.CHEST_DENSITY))) {
      const t = tiles.get(i)!;
      t.content = 'chest';
      // Each chest draws its own tier, which decides both what it may hold and how
      // loudly it announces itself. Drawn from the CONTENT rng like everything else
      // buried here: the tier is shown on the board, but which tile got the crown
      // must not be derivable from the public seed.
      t.chestTier = pickWeighted(rng, CHEST_TIER_WEIGHTS).kind;
      taken.add(i);
    }

    const pool = shuffle(rng, eligible.filter((i) => !taken.has(i)));
    let cursor = 0;
    const take = (n: number) => pool.slice(cursor, (cursor += n));
    for (const i of take(carrots - golden)) tiles.get(i)!.content = 'carrot';
  }

  const island: Island = {
    id: opts.seed,
    seed: opts.seed,
    tiles,
    tier: tier.name,
    dugCount: 0,
    createdAt: Date.now(),
  };

  recomputeAdjacency(island, shape);
  // You always land somewhere you can read.
  for (const i of safe) revealTile(island, i);
  // And the ring's zeros open the ground around them, the way a first click
  // does in minesweeper — the same rule a dig applies, applied at birth, and
  // with the same reach: what a rabbit standing on the spawn would be shown.
  cascadeHints(island, safe, spawn);
  return island;
}

/**
 * `items` in a random order that favours the heavy: the first n of it are a
 * weighted sample WITHOUT replacement (exponential clocks — each item rings at
 * -ln(u)/w, earliest first). One rng draw per item, in input order, so the
 * deal stays a pure function of the content seed.
 */
function weightedOrder(rng: Rng, items: readonly number[], weight: (i: number) => number): number[] {
  return items
    .map((i) => ({ i, at: -Math.log(1 - rng()) / Math.max(weight(i), 1e-6) }))
    .sort((a, b) => a.at - b.at)
    .map((e) => e.i);
}

/**
 * Open the hints around every ZERO in `from`, and around every zero those
 * hints turn out to be, out to the first real number.
 *
 * Minesweeper's cascade, minus the digging. A tile whose count is zero has
 * no bomb beside it, so showing its neighbours' numbers gives away nothing a
 * player could not deduce in eight safe steps — it only saves the steps. The
 * neighbours are HINTED, not revealed: whatever they hold stays in the
 * ground for whoever walks there, and they still count as safe tiles left
 * (`islandProgress`), so the island's clock does not move. A bomb is never
 * hinted, by construction: it is never the neighbour of a zero.
 *
 * Starts only from tiles that are open (dug or already hinted) AND zero;
 * anything else in `from` is ignored, so a caller can pass the tiles it just
 * touched without sorting them first. Returns what it opened, in the order
 * it opened it — the wire payload.
 */
export function cascadeHints(island: Island, from: Iterable<number>, around?: number): HintReveal[] {
  const opened: HintReveal[] = [];
  const isZero = (t: Tile) => t.content !== 'bomb' && t.adjacent === 0;
  // BOUNDED to ISLAND.CASCADE_RADIUS squares of `around` — where the rabbit
  // stands. Nothing past it is written or walked; the region is not lost, it
  // is resumed from its open zeros the next time someone moves (`cascadeAround`).
  // Without `around` the walk is unbounded, which is what the pure tests pin.
  const centre = around === undefined ? null : toColRow(around);
  const inReach = (i: number) => {
    if (!centre) return true;
    const { col, row } = toColRow(i);
    return Math.max(Math.abs(col - centre.col), Math.abs(row - centre.row)) <= ISLAND.CASCADE_RADIUS;
  };
  // The walk runs over EVERY open zero it meets, dug or hinted, seen before or
  // not — the zone is the connected region of zeros, and a zero that was dug
  // an hour ago is as much a bridge as one hinted this instant. Marking is
  // separate from walking: only an unopened tile gets a hint written on it.
  const seen = new Set<number>();
  const queue: number[] = [];
  for (const i of from) {
    const t = island.tiles.get(i);
    if (t && (t.revealed || t.hinted) && isZero(t) && !seen.has(i)) { seen.add(i); queue.push(i); }
  }
  for (let head = 0; head < queue.length; head++) {
    for (const nb of boardNeighbors(island, queue[head])) {
      if (!inReach(nb)) continue;
      const t = island.tiles.get(nb)!;
      if (!t.revealed && !t.hinted) {
        t.hinted = true;
        opened.push({ tile: nb, adjacent: t.adjacent });
      }
      if (isZero(t) && !seen.has(nb)) { seen.add(nb); queue.push(nb); }
    }
  }
  return opened;
}

/**
 * The cascade as seen from `tile`: the WHOLE connected region of zeros opens,
 * out to the first real number on every side.
 *
 * Unbounded, which is minesweeper's own rule. It used to stop at
 * `ISLAND.CASCADE_RADIUS` squares of the rabbit, so a wide field of zeros came
 * open in slices as the player walked into it — and a zone half opened reads
 * as a zone that failed to open. Paul, watching the ripple run over one:
 * "quand tu clean une zone faut nettoyer toute la zone".
 *
 * What that costs is real and was the reason for the bound: a region can be
 * large (35 tiles on average, 193 at the worst measured), and every tile it
 * opens is reading the player did not have to do. The trade was made
 * deliberately — a zone that opens fully is one the player can trust, and the
 * ripple now says where it went.
 *
 * The island's BIRTH still bounds its cascade (see `generateIsland`): a board
 * dealt unbounded is born with a quarter of its numbers already written, which
 * is a different thing entirely from a zone opening under a spade.
 */
export function cascadeAround(island: Island, tile: number): HintReveal[] {
  // Seeded from the tile itself: the walk spreads over every open zero it
  // meets, so one foot in the region is enough to open all of it.
  return cascadeHints(island, [tile]);
}

/**
 * Steps from `from` to every reachable tile, over the terrain's own moves.
 *
 * Distance in STEPS rather than in grid squares, so "two tiles out" means two
 * moves a rabbit can actually make — a tile across a cliff is far however
 * close its index looks.
 */
function stepsFrom(seed: string, from: number, tiles: ReadonlyMap<number, Tile>): Map<number, number> {
  const dist = new Map<number, number>([[from, 0]]);
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const here = queue[head];
    const d = dist.get(here)!;
    for (const nb of terrainNeighbors(seed, here)) {
      if (!tiles.has(nb) || dist.has(nb)) continue;
      dist.set(nb, d + 1);
      queue.push(nb);
    }
  }
  return dist;
}

/**
 * `count` tiles on the island's RIM, as far apart from EACH OTHER as the coast
 * allows.
 *
 * This is where the chests go, and every word of that sentence is carrying
 * weight. FAR FROM THE SPAWN, because a chest is what ends the island: one
 * sitting two steps from the middle is a level that can be finished without
 * ever walking out, and the walk is the game. FAR FROM EACH OTHER, because
 * "far from the spawn" alone does not make a lap — it makes a ring of tiles
 * that can still be bunched three-to-a-bay, and a bay you clear in one visit
 * is one stop however many chests you carry out of it.
 *
 * ## Why not angular slices
 *
 * The first cut divided the coast into `count` equal wedges around the spawn
 * and took each wedge's furthest tile. That is the obvious way and it is
 * subtly wrong, because an island is not a disc: a wide, close coast fills two
 * neighbouring wedges, so both hand back tiles from the SAME stretch of shore
 * and the two chests come out side by side. It showed up immediately in the
 * `Island/Chest spawn` story — pairs touching on the north coast of half the
 * seeds — because the rule only ever constrained a chest's ANGLE, never its
 * distance to the chest next door.
 *
 * ## Farthest-point selection
 *
 * So the spacing is chosen directly instead. Start from the tile furthest out,
 * then repeatedly take the candidate whose nearest ALREADY-CHOSEN chest is as
 * far away as possible (a greedy max-min, the standard farthest-point
 * traversal). Each pick is the emptiest remaining stretch of coast by
 * construction, so the chests spread themselves around the island without
 * anyone having to say where the compass points are — and on a lumpy island
 * they follow the lumps, which is exactly what the wedges could not do.
 *
 * Distance is in STEPS (`stepsFrom`), not grid squares: a tile across a cliff
 * is far however close its index looks, and the rim we want is the rim a
 * rabbit actually walks to. The spacing between chests is measured on the grid
 * (`hypot`) rather than by a second walk — a full BFS per candidate per pick
 * would be `count` times the work for a tie-break that only has to be
 * approximately right, and the two disagree only where a cliff splits two
 * tiles that are close on the grid, which the depth floor has already pushed
 * out to the coast.
 */
function rimTiles(
  seed: string,
  spawn: number,
  tiles: ReadonlyMap<number, Tile>,
  eligible: readonly number[],
  count: number,
): number[] {
  if (count <= 0) return [];
  const dist = stepsFrom(seed, spawn, tiles);
  let furthest = 1;
  for (const d of dist.values()) if (d > furthest) furthest = d;

  // Only the outer band is in the running — see `ISLAND.CHEST_MIN_DEPTH`.
  // Without this floor the spacing rule alone would happily put a chest in the
  // middle of the island, because the middle is a long way from the coast.
  const floor = furthest * ISLAND.CHEST_MIN_DEPTH;
  const pool: Array<{ tile: number; d: number; col: number; row: number }> = [];
  for (const i of eligible) {
    const d = dist.get(i);
    if (d === undefined || d < floor) continue;
    const { col, row } = toColRow(i);
    pool.push({ tile: i, d, col, row });
  }
  if (!pool.length) return [];

  // Seed the traversal with the tile furthest from the spawn. Deterministic
  // (ties break on the lower index, since `eligible` arrives in a fixed order),
  // which matters because the whole generator is a pure function of its seeds.
  let head = pool[0];
  for (const c of pool) if (c.d > head.d) head = c;

  const picked = [head];
  // Each candidate's distance to the NEAREST chest picked so far, updated as
  // the set grows rather than recomputed — this is the whole cost of the
  // algorithm, and it stays linear per pick.
  const near = pool.map((c) => Math.hypot(c.col - head.col, c.row - head.row));

  while (picked.length < count) {
    let bestAt = -1;
    let bestGap = -1;
    for (let k = 0; k < pool.length; k++) {
      // The emptiest stretch of coast left. `>` not `>=` keeps the first of a
      // tie, which is the lower tile index and so keeps the deal reproducible.
      if (near[k] > bestGap) { bestGap = near[k]; bestAt = k; }
    }
    // Every remaining candidate is already touching a chosen chest: the coast
    // has run out of room and the island is simply dealt short. Better than
    // pairing up boxes to hit a count the player never sees.
    if (bestAt < 0 || bestGap <= 0) break;

    const chosen = pool[bestAt];
    picked.push(chosen);
    for (let k = 0; k < pool.length; k++) {
      const gap = Math.hypot(pool[k].col - chosen.col, pool[k].row - chosen.row);
      if (gap < near[k]) near[k] = gap;
    }
  }
  return picked.map((c) => c.tile);
}

/**
 * The first island, dealt BY HAND — see FIRST_RUN in tuning for the beats.
 *
 * Four placements are authored and the rest is dealt like any island, at the
 * first island's own densities:
 *
 *   THE TAUGHT BOMB sits two steps from the spawn, touching as few ring tiles
 *   as the ground allows (ideally one). Nothing else explosive comes within
 *   two steps, so the pre-revealed ring reads all zeros and a single "1" — the
 *   first number a player ever sees has exactly one thing to mean, and the
 *   tile it points at is one step from safe ground.
 *
 *   THE GOLDEN CARROT is a neighbour of that bomb, off the ring. Whether the
 *   player reads the "1" and walks around, or steps on it and is thrown, the
 *   heart back is right there — the lesson costs a heart only briefly.
 *
 *   THE CHEST is within FIRST_RUN.CHEST_MAX_DISTANCE steps and always the
 *   lowest tier: it is announced on the board (that is what a tier does), so
 *   the walk-to-a-prize decision gets made once on a board with almost nothing
 *   to fear, and a bronze box cannot roll the crown's NFT on a tutorial.
 *
 * Everything else — the remaining bombs, the carrots — is shuffled from the
 * content rng over the tiles that are three or more steps out, so two first
 * islands are still two islands and the private seed still decides them.
 */
function firstIslandLayout(
  seed: string,
  tiles: Map<number, Tile>,
  spawn: number,
  safe: ReadonlySet<number>,
  rng: Rng,
): void {
  const dist = stepsFrom(seed, spawn, tiles);
  const at = (d: number) => [...dist].filter(([, n]) => n === d).map(([i]) => i);
  const board = { tiles };
  // How many ring tiles a bomb here would light — counted the way the hints
  // are counted (`boardNeighbors`), across cliffs included.
  const ringTouches = (i: number) =>
    boardNeighbors(board, i).filter((n) => safe.has(n) && n !== spawn).length;
  // Every tile whose hint the safe ring can see. Nothing dealt at random may
  // land here, or the ring wakes up reading a number the lesson did not write.
  const seenFromRing = new Set<number>();
  for (const s of safe) for (const nb of boardNeighbors(board, s)) seenFromRing.add(nb);

  const reserved = new Set<number>();

  // The taught bomb: two steps out — so the player can walk to it — but not a
  // cell the spawn itself can see, and touching the fewest ring tiles. Sorted
  // rather than shuffled so the SAME ground always teaches the same way; the
  // tie-break still comes from the content rng, so the exact tile is private.
  const twoOut = shuffle(rng, at(2))
    .filter((i) => !boardNeighbors(board, spawn).includes(i))
    .sort((a, b) => ringTouches(a) - ringTouches(b));
  const taught = twoOut[0];
  if (taught !== undefined) {
    tiles.get(taught)!.content = 'bomb';
    reserved.add(taught);

    // The heart back: a neighbour of the bomb that is not on the ring.
    const golden = shuffle(rng, terrainNeighbors(seed, taught))
      .find((n) => tiles.has(n) && !safe.has(n) && !reserved.has(n));
    if (golden !== undefined) {
      tiles.get(golden)!.content = 'golden';
      reserved.add(golden);
    }
  }

  // The chest: as far out as the cap allows, so it is a walk and not a gift,
  // and never beside the taught bomb — the two lessons are not the same one.
  const chestCandidates = [...dist]
    .filter(([i, d]) => d >= 3 && d <= FIRST_RUN.CHEST_MAX_DISTANCE && !reserved.has(i)
      && !boardNeighbors(board, i).includes(taught ?? -1))
    .sort((a, b) => b[1] - a[1])
    .map(([i]) => i);
  const chest = chestCandidates.length ? chestCandidates[0] : undefined;
  if (chest !== undefined) {
    const t = tiles.get(chest)!;
    t.content = 'chest';
    t.chestTier = CHEST_TIER_WEIGHTS[0].kind;
    reserved.add(chest);
  }

  // The rest is dealt from three steps out AND out of the ring's sight — so
  // the numbers the player wakes up reading are the ones written above, and
  // a bomb on a shelf above the ring cannot light a second "1".
  const pool = shuffle(rng, [...dist]
    .filter(([i, d]) => d >= 3 && !reserved.has(i) && !seenFromRing.has(i))
    .map(([i]) => i));
  let cursor = 0;
  const take = (n: number) => pool.slice(cursor, (cursor += n));
  const total = tiles.size;

  for (const i of take(Math.floor(total * FIRST_RUN.BOMB_DENSITY))) tiles.get(i)!.content = 'bomb';
  for (const i of take(Math.floor(total * FIRST_RUN.CARROT_DENSITY))) tiles.get(i)!.content = 'carrot';
}

/**
 * A tile's neighbours ON THE BOARD: the eight cells around it that the island
 * actually holds, climbable or not.
 *
 * This is the set a hint counts over, and it is deliberately NOT
 * `terrainNeighbors`, which lists the cells a rabbit may STEP to. The two
 * differ at a cliff: a tile on the shelf above is one cell away and plainly
 * visible, but two tiers up and unclimbable, so a hint that only counted
 * steps read "0" beside a bomb — reported as "a tile next to a bomb shows
 * nothing". Minesweeper's number has always meant the eight cells around it,
 * and reachability has nothing to do with where a bomb is. Sea, rock and a
 * tree's cell are still excluded, because the island has no tile there and
 * nothing can be buried in them.
 */
export function boardNeighbors(island: Pick<Island, 'tiles'>, index: number): number[] {
  const { col, row } = toColRow(index);
  const out: number[] = [];
  for (const [dc, dr] of BOARD_STEPS) {
    const nc = col + dc;
    const nr = row + dr;
    if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
    const nb = toIndex(nc, nr);
    if (island.tiles.has(nb)) out.push(nb);
  }
  return out;
}

const BOARD_STEPS: readonly (readonly [number, number])[] = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

/** Bombs among a tile's 8 neighbours. */
export function countAdjacent(island: Island, index: number, shape: IslandShape): number {
  let n = 0;
  // `shape` is kept in the signature because the sabotage path still passes
  // it; the count itself reads the board — see `boardNeighbors`.
  void shape;
  for (const nb of boardNeighbors(island, index)) {
    if (island.tiles.get(nb)?.content === 'bomb') n++;
  }
  return n;
}

/**
 * Recompute every hint. Called at generation and again whenever a saboteur
 * plants a bomb — that is the point of the sabotage mechanic: a revealed "2"
 * silently becomes a "3", and an attentive victim can spot it.
 */
export function recomputeAdjacency(island: Island, shape: IslandShape): void {
  for (const [index, tile] of island.tiles) {
    tile.adjacent = countAdjacent(island, index, shape);
  }
}

/** Reveal a tile, keeping `dugCount` (the eruption clock) honest. */
export function revealTile(island: Island, index: number, by?: string): boolean {
  const tile = island.tiles.get(index);
  if (!tile || tile.revealed) return false;
  tile.revealed = true;
  if (by) tile.dugBy = by;
  island.dugCount++;
  return true;
}

/**
 * Where the island stands: how many SAFE tiles are still in the ground, and
 * how far along that makes it, 0 → 1, where 1 is the eruption.
 *
 * Safe tiles, not all tiles. An island is cleared when every tile that is not
 * a bomb has been dug: by then the bombs left are all known from the numbers,
 * and asking a player to step on them to "finish" would be asking them to lose
 * hearts for nothing. A bomb that IS dug (someone stepped on it) is simply no
 * longer in anyone's way.
 *
 * Walked, not tracked: the board is a few hundred tiles and this runs once
 * per dig, which is nothing next to the socket round-trip it sits behind — and
 * a counter kept alongside `dugCount` would be one more thing to get wrong on
 * every reveal path.
 */
export function islandProgress(island: Island): { safeLeft: number; safeTotal: number; fraction: number } {
  let safeTotal = 0;
  let safeLeft = 0;
  for (const tile of island.tiles.values()) {
    if (tile.content === 'bomb') continue;
    safeTotal++;
    if (!tile.revealed) safeLeft++;
  }
  const fraction = safeTotal === 0 ? 1 : 1 - safeLeft / safeTotal;
  return { safeLeft, safeTotal, fraction };
}

/** Safe tiles still in the ground. Below ERUPTION.JOIN_MIN_TILES_LEFT nobody new joins. */
export const safeTilesLeft = (island: Island) => islandProgress(island).safeLeft;

/**
 * THE WIN CONDITION: how many chests are still buried, and how far along the
 * island that makes it, 0 → 1, where 1 is the eruption.
 *
 * The island used to end when every safe tile had been dug, which is a goal
 * nobody could see. A player asked what they were doing on an island could
 * only answer "digging" — the finish line was a number in the HUD going up by
 * fractions of a percent, and 300 tiles of it. Testers read the volcano as a
 * timer rather than as progress and had no idea what would make it go off.
 *
 * Chests are a goal you can SEE: they announce themselves across the board
 * (`publicView` leaks their tile and tier on purpose), they sit on the rim
 * (`rimTiles`), and there are about ten. "Get the chests" is the whole rule,
 * and the walk between them is the island.
 *
 * A DUG chest counts however it was opened — by you, by a rival, on a raid.
 * The island is a shared level and whoever takes the last one ends it for
 * everyone, which is exactly the race the eruption was always meant to be.
 *
 * An island with no chests at all (a tiny one, where the density rounds to
 * zero) reads as finished rather than as never-ending: safer to erupt an empty
 * board than to strand its players on it.
 */
export function chestProgress(island: Island): { left: number; total: number; fraction: number } {
  let total = 0;
  let left = 0;
  for (const tile of island.tiles.values()) {
    if (tile.content !== 'chest') continue;
    total++;
    if (!tile.revealed) left++;
  }
  return { left, total, fraction: total === 0 ? 1 : 1 - left / total };
}

/** Chests still buried — 0 means the island is done. */
export const chestsLeft = (island: Island) => chestProgress(island).left;

/**
 * Share of the island's chests collected — drives the smoke stages and, at 1,
 * the eruption.
 *
 * Still called `dugFraction` on the wire and in the HUD because that is the
 * name the snapshot, the `volcano` event and the client state all use; what
 * changed is what it MEASURES. See `chestProgress`.
 */
export const dugFraction = (island: Island) => chestProgress(island).fraction;

/**
 * The island as a CLIENT may see it: only what is already REVEALED. An
 * unrevealed tile is not sent at all — there is no field to read a bomb out of,
 * which is the whole security model of this game.
 *
 * CHESTS ARE THE ONE EXCEPTION, and a deliberate one. A chest announces itself
 * from across the island — that is the feature: the player sees a CROWN four
 * tiles out and decides whether the walk is worth it. A chest nobody can see
 * until they have already dug it is not a decision, it is a surprise.
 *
 * What leaks is exactly two things: WHERE a chest is, and WHICH TIER it is.
 * Never what it rolled — the roll happens at the dig, from the private content
 * seed, and the tier only says which TABLE will be drawn from. And never
 * anything about its neighbours: `adjacent` is withheld until the tile is dug
 * like everywhere else, so a chest tells a player nothing about the bombs
 * around it. Walking to a visible chest is as dangerous as walking anywhere.
 */
export function publicView(island: Island) {
  const revealed: Array<{ tile: number; content: string; adjacent: number; dugBy?: string }> = [];
  const chests: Array<{ tile: number; tier: string }> = [];
  // Hinted tiles carry their NUMBER and nothing else — the cascade's whole
  // bargain is that the number is safe to show and the content is not.
  const hinted: HintReveal[] = [];
  const flagged: number[] = [];
  for (const [index, tile] of island.tiles) {
    // An undug chest still advertises its position and tier — and nothing else.
    if (!tile.revealed && tile.content === 'chest' && tile.chestTier) {
      chests.push({ tile: index, tier: tile.chestTier });
      // A chest can be hinted too: it is still undug, and its number is a
      // number like any other. Fall through to the hint below.
    }
    if (!tile.revealed) {
      if (tile.hinted) hinted.push({ tile: index, adjacent: tile.adjacent });
      // A red X is public: it was checked when it was placed, so it is a fact
      // about the board and not a player's private note. Only RIGHT ones exist.
      if (tile.flagged) flagged.push(index);
      continue;
    }
    revealed.push({ tile: index, content: tile.content, adjacent: tile.adjacent, dugBy: tile.dugBy });
  }
  return {
    seed: island.seed,
    tier: island.tier,
    dugFraction: dugFraction(island),
    revealed,
    chests,
    hinted,
    flagged,
  };
}

export type PublicIsland = ReturnType<typeof publicView>;
