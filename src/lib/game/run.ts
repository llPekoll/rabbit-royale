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
import type { DigResult, Island, Rabbit } from './types';

export type MoveRejection =
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
  // One step only. Checked here rather than trusted from the client, which is
  // the entire reason this function exists.
  if (!isAdjacent(rabbit.tile, to)) return reject('not-adjacent');

  rabbit.lastMoveAt = now;

  // Walking revealed ground is free — that is the whole reason to read numbers.
  if (tile.revealed) {
    rabbit.tile = to;
    return { ok: true, tile: to, energy: rabbit.energy, carrots: rabbit.carrots, runOver: false };
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

  const options = neighbors(from, shape).filter((n) => n !== bomb);
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
): Rabbit {
  return {
    playerId,
    name,
    tile: SPAWN_INDEX,
    energy,
    carrots: 0,
    stunnedUntil: 0,
    lastMoveAt: 0,
    alive: true,
    crowned: false,
  };
}
