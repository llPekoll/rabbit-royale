/**
 * Run mechanics: what happens when a rabbit tries to step onto a tile.
 *
 * This is THE authoritative rule set. The WS server calls it, and it is the
 * only place that decides what a dig costs or where a bomb throws you. The
 * client is never a source of truth on bombs, energy or score (BUILD-PLAN
 * rule #4) — it sends a destination and renders what comes back.
 *
 * Everything is a transform on `(island, rabbit, targetTile)`: it mutates the
 * two objects it is handed and returns what happened, so a caller can broadcast
 * a delta rather than diffing whole islands.
 */
import { BOMB, CHEST_LOOT, ENERGY, MULTIPLAYER } from '@config/tuning';
import { SPAWN_INDEX, neighbors, toColRow, type IslandShape } from '@/config/gridConfig';
import { pickWeighted, randInt, type Rng } from './rng';
import { revealTile } from './island';
import { spawnTile, terrainNeighbors } from './terrainBoard';
import { occupancyOf, planPush } from './push';
import type { DigResult, Island, Rabbit } from './types';

export type MoveRejection =
  | 'head-on'
  | 'blocked'
  | 'dead'
  | 'stunned'
  | 'too-fast'
  | 'not-adjacent'
  | 'off-island'
  | 'no-energy';

export interface MoveOutcome {
  ok: boolean;
  rejection?: MoveRejection;
  /** Set when the move dug a fresh tile. Absent when walking revealed ground. */
  dig?: DigResult;
  /** Where the rabbit ended up (post-knockback). */
  tile: number;
  energy: number;
  carrots: number;
  /** The run ended on this move — energy hit zero. */
  runOver: boolean;
  /**
   * Rabbits this move shoved, and what it cost them.
   *
   * Empty on an ordinary walk. One entry per rabbit in the chain, furthest
   * first — the order they have to be applied in, and the order the client
   * should animate them. Each carries its own dig, because rule 2 says landing
   * on undug ground digs it: a push can set off a bomb under someone who never
   * chose to dig there.
   */
  pushed?: PushedRabbit[];
}

/** One rabbit displaced by another's move. */
export interface PushedRabbit {
  playerId: string;
  from: number;
  to: number;
  /** Who did this to them. Rule 7: the victim always knows. */
  pushedBy: string;
  /** What the landing tile turned out to hold, when the push dug it. */
  dig?: DigResult;
  /** Their energy after the landing, and whether it ended their run. */
  energy: number;
  runOver: boolean;
}

/**
 * Resolve one move intent.
 *
 * `now` and `rng` are injected rather than read from globals so the whole rule
 * set is testable and reproducible: a playtest bug report replays exactly.
 */
export function resolveMove(
  island: Island,
  rabbit: Rabbit,
  to: number,
  shape: IslandShape,
  rng: Rng,
  now: number = Date.now(),
  /**
   * Everyone else on the island, so a step can shove them.
   *
   * Optional: without it nothing is pushed and moves resolve exactly as they
   * did before. That keeps every existing caller and test honest, and makes
   * pushing a thing the SERVER opts into by handing over the roster.
   */
  others?: Iterable<Rabbit>,
  /**
   * Tiles the flock is standing on right now.
   *
   * Same bargain as `others`: optional, so every existing caller and test is
   * unchanged, and the SERVER is what opts into the live picture by handing it
   * over. A sheep blocks its cell, and where the flock stands stopped being a
   * function of the seed the day sheep started bolting (see `flee.ts`).
   */
  blocked?: ReadonlySet<number>,
): MoveOutcome {
  const reject = (rejection: MoveRejection): MoveOutcome => ({
    ok: false,
    rejection,
    tile: rabbit.tile,
    energy: rabbit.energy,
    carrots: rabbit.carrots,
    runOver: !rabbit.alive,
  });

  if (!rabbit.alive) return reject('dead');
  if (now < rabbit.stunnedUntil) return reject('stunned');
  // Anti-speedhack: a human cannot out-pace this, a script can.
  if (now - rabbit.lastMoveAt < MULTIPLAYER.MIN_MOVE_INTERVAL_MS) return reject('too-fast');

  const tile = island.tiles.get(to);
  if (!tile) return reject('off-island');
  // One step only, and onto ground the TERRAIN allows. Checked here rather
  // than trusted from the client, which is the entire reason this function
  // exists: the ring the player taps is drawn from the same rule, so a client
  // that lied about a cliff or a tree would simply have its move refused.
  if (!canWalk(island.seed, rabbit.tile, to, blocked)) {
    // 'blocked' when something is standing there, 'not-adjacent' when the
    // ground itself refuses — the client tells them apart to pick a message,
    // and "you cannot reach that" is wrong for a tile with a sheep on it.
    return reject(blocked?.has(to) ? 'blocked' : 'not-adjacent');
  }

  // Who is standing there, and where does everybody end up? Planned BEFORE
  // anything is committed, so a chain whose far end is a cliff refuses the
  // whole move instead of leaving rabbits half-shoved.
  const occupancy = others ? occupancyOf(others) : new Map<number, Rabbit>();
  const push = planPush(island.seed, rabbit, to, occupancy, now);
  if (!push.ok) {
    return reject(push.refusal === 'head-on' ? 'head-on' : 'blocked');
  }

  rabbit.lastMoveAt = now;
  rabbit.cameFrom = rabbit.tile;

  // Apply the shove. Furthest first, so nobody lands on an occupied tile.
  //
  // Rule 2: a pushed rabbit DIGS what it lands on, bomb included. This is the
  // one place the game spends a consequence someone did not choose, and it is
  // deliberate — see `docs/bumping.md`. The energy is not charged to them,
  // though: they did not choose to dig, so they pay the blast and not the toll.
  const pushed: PushedRabbit[] = [];
  for (const step of push.plan.steps) {
    const victim = occupancy.get(step.from)!;
    victim.tile = step.to;
    victim.cameFrom = step.from;

    const entry: PushedRabbit = {
      playerId: victim.playerId,
      from: step.from,
      to: step.to,
      pushedBy: rabbit.playerId,
      energy: victim.energy,
      runOver: false,
    };

    const landing = island.tiles.get(step.to);
    if (landing && !landing.revealed) {
      revealTile(island, step.to, victim.playerId);
      const dug: DigResult = {
        tile: step.to,
        content: landing.content,
        adjacent: landing.adjacent,
        energyDelta: 0,
        carrotDelta: 0,
      };
      if (landing.content === 'bomb') {
        victim.energy -= ENERGY.BOMB_LOSS;
        dug.energyDelta = -ENERGY.BOMB_LOSS;
        victim.stunnedUntil = now + BOMB.STUN_MS;
        if (victim.energy <= 0) {
          victim.energy = 0;
          victim.alive = false;
          entry.runOver = true;
        }
      }
      entry.dig = dug;
      entry.energy = victim.energy;
    }
    pushed.push(entry);
  }

  // Walking revealed ground is free — that is the whole reason to read numbers.
  if (tile.revealed) {
    rabbit.tile = to;
    return { ok: true, tile: to, energy: rabbit.energy, carrots: rabbit.carrots, runOver: false, pushed };
  }

  // Digging costs. You may not spend your last point of energy into nothing —
  // running out mid-dig would hide WHY the run ended.
  if (rabbit.energy < ENERGY.DIG_COST) return reject('no-energy');

  const firstDigger = revealTile(island, to, rabbit.playerId);
  rabbit.energy -= ENERGY.DIG_COST;

  const dig: DigResult = {
    tile: to,
    content: tile.content,
    adjacent: tile.adjacent,
    energyDelta: -ENERGY.DIG_COST,
    carrotDelta: 0,
  };

  switch (tile.content) {
    case 'bomb': {
      rabbit.energy -= ENERGY.BOMB_LOSS;
      dig.energyDelta -= ENERGY.BOMB_LOSS;
      rabbit.stunnedUntil = now + BOMB.STUN_MS;
      // Thrown backwards from where it STOOD — the rabbit never enters the
      // bomb tile.
      const landing = knockbackTarget(island, rabbit.tile, to, shape);
      rabbit.tile = landing;
      dig.knockback = { tile: landing, stunnedUntil: rabbit.stunnedUntil };
      if (tile.plantedBy) dig.plantedBy = tile.plantedBy;
      break;
    }
    case 'carrot':
    case 'golden': {
      // Only the FIRST digger is paid: on a shared island two rabbits may reach
      // the same tile in one tick, and the server's ordering settles it.
      if (firstDigger) {
        const gain = tile.content === 'golden' ? ENERGY.GOLDEN_GAIN : ENERGY.CARROT_GAIN;
        rabbit.energy = Math.min(ENERGY.MAX, rabbit.energy + gain);
        rabbit.carrots += 1;
        dig.energyDelta += gain;
        dig.carrotDelta = 1;
      }
      rabbit.tile = to;
      break;
    }
    case 'chest': {
      if (firstDigger) {
        const roll = pickWeighted(rng, CHEST_LOOT);
        const amount = randInt(rng, roll.min, roll.max);
        dig.loot = { kind: roll.kind, amount };
        // Phase 1 stub: only carrots are real. Items are recorded by the caller
        // once the inventory exists (Phase 5) — the table already rolls them.
        if (roll.kind === 'carrots') {
          rabbit.carrots += amount;
          dig.carrotDelta = amount;
        }
      }
      rabbit.tile = to;
      break;
    }
    default:
      rabbit.tile = to;
  }

  if (rabbit.energy <= 0) {
    rabbit.energy = 0;
    rabbit.alive = false;
  }

  return {
    ok: true,
    dig,
    tile: rabbit.tile,
    energy: rabbit.energy,
    carrots: rabbit.carrots,
    runOver: !rabbit.alive,
    pushed,
  };
}

/** One of the 8 steps? Cheap enough to inline, but named so it reads. */
export function isAdjacent(a: number, b: number): boolean {
  if (a === b) return false;
  const p = toColRow(a);
  const q = toColRow(b);
  return Math.abs(p.col - q.col) <= 1 && Math.abs(p.row - q.row) <= 1;
}

/**
 * One step, onto ground this island actually offers.
 *
 * `isAdjacent` only ever knew about distance, which was enough while the board
 * was a flat silhouette. On generated terrain a neighbouring tile can be two
 * tiers up, or have a pine on it — both of which the player can SEE, so a
 * server that allowed the step would be contradicting its own picture.
 *
 * The terrain is rebuilt from the island's seed on both sides, so this is the
 * same answer the client's ring is drawn from.
 */
export function canWalk(seed: string, from: number, to: number, blocked?: ReadonlySet<number>): boolean {
  if (!isAdjacent(from, to)) return false;
  if (!terrainNeighbors(seed, from).includes(to)) return false;
  /**
   * Cells a sheep has walked onto since the island was cut.
   *
   * The seed says where the flock STARTED; it cannot say where it is now, and
   * a sheep blocks its cell. Without this the server contradicts its own
   * broadcast — it would refuse a tile the flock has left and wave a rabbit
   * through one it has moved onto, which the player sees as the sheep being
   * decorative right up until a move is rejected for no visible reason.
   *
   * Optional because most callers ask a question the flock cannot change (a
   * blast's landing spot, the client's own ring); the server's move handler is
   * the one that must pass it.
   */
  return !blocked?.has(to);
}

/**
 * Where a blast throws a rabbit: away from the bomb, preferring ALREADY
 * REVEALED ground — being thrown into fresh dirt would cost energy the player
 * did not choose to spend. Falls back to any legal neighbour, then to standing
 * still when the rabbit is boxed in on a headland.
 */
export function knockbackTarget(
  island: Island,
  from: number,
  bomb: number,
  shape: IslandShape,
): number {
  const origin = toColRow(from);
  const blast = toColRow(bomb);
  // The direction the blast pushes: straight back along the approach.
  const away = { col: origin.col - blast.col, row: origin.row - blast.row };

  // Terrain neighbours, so a blast never throws the rabbit into the sea, up a
  // cliff or inside a tree. `from` itself is the fallback: standing still is
  // the only landing that is always legal.
  const options = terrainNeighbors(island.seed, from).filter((n) => n !== bomb);
  if (options.length === 0) return from;

  let best = from;
  let bestScore = -Infinity;
  for (const candidate of options) {
    const c = toColRow(candidate);
    const dir = { col: c.col - origin.col, row: c.row - origin.row };
    // Dot product against the blast direction: most directly "away" wins.
    let score = dir.col * away.col + dir.row * away.row;
    // A revealed landing is strictly better than an unrevealed one, whichever
    // way it lies — the tie-break the comment above is about.
    if (island.tiles.get(candidate)?.revealed) score += 0.5;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

/** A rabbit at the start of a run, placed on the island's spawn. */
export function spawnRabbit(
  playerId: string,
  name: string,
  energy: number = ENERGY.START,
  seed?: string,
): Rabbit {
  return {
    playerId,
    name,
    // The middle of a 16x16 is open water on plenty of generated coastlines,
    // so the spawn is chosen FROM the island when one is named. `SPAWN_INDEX`
    // remains the answer for callers with no seed (tests, fixtures).
    tile: seed ? spawnTile(seed) : SPAWN_INDEX,
    energy,
    carrots: 0,
    stunnedUntil: 0,
    lastMoveAt: 0,
    alive: true,
    crowned: false,
  };
}
