/**
 * Run mechanics: what happens when a rabbit tries to move.
 *
 * This is THE authoritative rule set. The WS server calls it; the client calls
 * the same code to predict, so a correct client and the server always agree and
 * only a cheating one diverges (BUILD-PLAN rule #4: the client is never the
 * source of truth on bombs, energy or score).
 *
 * Everything is a pure-ish transform on `(island, rabbit, direction)` — it
 * mutates the two objects it is handed and returns what happened, so a caller
 * can broadcast the delta without diffing whole islands.
 */
import { BOMB, CHEST_LOOT, ENERGY, MULTIPLAYER } from '../../../config/tuning';
import { pickWeighted, randInt, type Rng } from './rng';
import { knockbackTarget, revealTile } from './island';
import {
  DIRECTIONS, idx, inBounds,
  type DigResult, type Direction, type Island, type Rabbit,
} from './types';

export type MoveRejection =
  | 'dead'
  | 'stunned'
  | 'too-fast'
  | 'out-of-bounds'
  | 'no-energy';

export interface MoveOutcome {
  ok: boolean;
  rejection?: MoveRejection;
  /** Set when the move dug a fresh tile. Absent when walking revealed ground. */
  dig?: DigResult;
  /** Where the rabbit ended up (post-knockback). */
  position: { x: number; y: number };
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
  dir: Direction,
  rng: Rng,
  now: number = Date.now(),
): MoveOutcome {
  const reject = (rejection: MoveRejection): MoveOutcome => ({
    ok: false,
    rejection,
    position: { x: rabbit.x, y: rabbit.y },
    energy: rabbit.energy,
    carrots: rabbit.carrots,
    runOver: !rabbit.alive,
  });

  if (!rabbit.alive) return reject('dead');
  if (now < rabbit.stunnedUntil) return reject('stunned');
  // Anti-speedhack: a human cannot out-pace this, a script can.
  if (now - rabbit.lastMoveAt < MULTIPLAYER.MIN_MOVE_INTERVAL_MS) return reject('too-fast');

  const [dx, dy] = DIRECTIONS[dir];
  const nx = rabbit.x + dx;
  const ny = rabbit.y + dy;
  if (!inBounds(island, nx, ny)) return reject('out-of-bounds');

  rabbit.lastMoveAt = now;
  const tile = island.tiles[idx(island, nx, ny)];

  // Walking revealed ground is free — that is the whole reason to read numbers.
  if (tile.revealed) {
    rabbit.x = nx;
    rabbit.y = ny;
    return { ok: true, position: { x: nx, y: ny }, energy: rabbit.energy, carrots: rabbit.carrots, runOver: false };
  }

  // Digging costs. You may not dig your last point of energy into nothing —
  // running out mid-dig would hide WHY the run ended.
  if (rabbit.energy < ENERGY.DIG_COST) return reject('no-energy');

  const firstDigger = revealTile(island, idx(island, nx, ny), rabbit.playerId);
  rabbit.energy -= ENERGY.DIG_COST;

  const dig: DigResult = {
    x: nx,
    y: ny,
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
      // Thrown backwards, away from the blast. The rabbit does NOT enter the
      // bomb tile — it is blown from where it stood.
      const back = [-dx, -dy] as const;
      const landing = knockbackTarget(island, { x: rabbit.x, y: rabbit.y }, back, BOMB.KNOCKBACK_TILES);
      rabbit.x = landing.x;
      rabbit.y = landing.y;
      dig.knockback = { ...landing, stunnedUntil: rabbit.stunnedUntil };
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
      rabbit.x = nx;
      rabbit.y = ny;
      break;
    }
    case 'chest': {
      if (firstDigger) {
        const roll = pickWeighted(rng, CHEST_LOOT);
        const amount = randInt(rng, roll.min, roll.max);
        dig.loot = { kind: roll.kind, amount };
        // Phase 1 stub: only carrots are real. Items are recorded by the caller
        // once the inventory exists (Phase 5) — the loot table already rolls them.
        if (roll.kind === 'carrots') {
          rabbit.carrots += amount;
          dig.carrotDelta = amount;
        }
      }
      rabbit.x = nx;
      rabbit.y = ny;
      break;
    }
    default: {
      rabbit.x = nx;
      rabbit.y = ny;
    }
  }

  if (rabbit.energy <= 0) {
    rabbit.energy = 0;
    rabbit.alive = false;
  }

  return {
    ok: true,
    dig,
    position: { x: rabbit.x, y: rabbit.y },
    energy: rabbit.energy,
    carrots: rabbit.carrots,
    runOver: !rabbit.alive,
  };
}

/** A rabbit at the start of a run, placed on the island's spawn. */
export function spawnRabbit(
  island: Island,
  playerId: string,
  name: string,
  energy: number = ENERGY.START,
): Rabbit {
  return {
    playerId,
    name,
    x: Math.floor(island.width / 2),
    y: Math.floor(island.height / 2),
    energy,
    carrots: 0,
    stunnedUntil: 0,
    lastMoveAt: 0,
    alive: true,
    crowned: false,
  };
}
