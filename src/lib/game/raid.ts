/**
 * Raid resolution: what a crossing of someone's burrow is worth.
 *
 * The Clash of Clans shape, and it is a MECHANICAL choice rather than a
 * thematic one. The crossing is about five steps, so a handful of traps will
 * always stop a raider dead — under a pass/fail rule that meant every raid
 * resolved to 100% or 0% however the numbers were tuned, because four traps on
 * a five-step walk have no middle. Paying by DEPTH REACHED gives the curve a
 * gradient by construction: each trap shaves a slice off the haul instead of
 * deciding the outcome, and no amount of retuning can turn that back into a
 * cliff.
 *
 * Two layers, as in CoC:
 *  - the burrow's HP, worn down by the raid and regenerating on its own;
 *  - the loot, a share of the victim's stock scaled by how far the raider got.
 */
import { CROWN, RAID, RAID_RUN } from '@config/tuning';
import {
  entranceTile, fieldTiles, burrowNeighbors, burrowAround, walkableTiles, burrowTier,
} from '@/game/burrow/board';

/**
 * Steps from a tile to the nearest field tile — the raid's own distance metric.
 *
 * Takes the DEFENDER's seed, because a burrow is no longer one shape shared by
 * every player: the ground is grown from its owner's id (see
 * `game/burrow/board`), so "how far is this tile from the carrots" is only a
 * question once you say whose carrots.
 */
export function distanceToField(seed: string): Map<number, number> {
  const dist = new Map<number, number>();
  let frontier = fieldTiles(seed);
  for (const t of frontier) dist.set(t, 0);
  let d = 0;
  while (frontier.length) {
    d++;
    const next: number[] = [];
    for (const t of frontier) {
      for (const n of burrowNeighbors(seed, t)) {
        if (dist.has(n)) continue;
        dist.set(n, d);
        next.push(n);
      }
    }
    frontier = next;
  }
  return dist;
}

/**
 * How deep a raid got, as 0..1.
 *
 * Measured against the distance the raider STARTED at, so a burrow whose layout
 * changes does not silently rescale everyone's rewards.
 */
export function raidProgress(
  seed: string,
  endedAt: number,
  dist = distanceToField(seed),
): number {
  const start = dist.get(entranceTile(seed));
  const here = dist.get(endedAt);
  if (start === undefined || here === undefined || start === 0) return 1;
  return Math.max(0, Math.min(1, (start - here) / start));
}

export interface RaidOutcome {
  /** 0..1, how far across the burrow the raider got. */
  progress: number;
  /** Carrots transferred. */
  loot: number;
  /**
   * How hard the raid hit, 0..BOMB_DAMAGE — the severity the raid log and the
   * profile history read ("35 dmg").
   *
   * It is a MEASURE, not a subtraction: burrows have no hit points to take it
   * off. Nothing is deducted anywhere from this number.
   */
  damage: number;
  /** True when the raider actually touched the carrot field. */
  reachedField: boolean;
}

/**
 * Settle a finished raid.
 *
 * `rng` is injected so a disputed raid can be replayed exactly — the damage
 * roll is the only random part, and a player who loses a big haul to it will
 * ask.
 */
export function settleRaid(
  opts: {
    /** The defender's burrow seed — their player id. */
    seed: string;
    endedAt: number;
    defenderStock: number;
    defenderLevel: number;
    shielded: boolean;
    crowned?: boolean;
  },
  rng: () => number = Math.random,
  dist = distanceToField(opts.seed),
): RaidOutcome {
  // A shield is absolute. Anything less invites the farming it exists to stop.
  if (opts.shielded) {
    return { progress: 0, loot: 0, damage: 0, reachedField: false };
  }

  const progress = raidProgress(opts.seed, opts.endedAt, dist);
  const reachedField = dist.get(opts.endedAt) === 0;

  // Loot scales from a floor to the cap. The floor is why attacking a
  // well-defended burrow is still worth doing: a raid that dies on the doorstep
  // pays something, so nobody stops attacking after one bad run.
  const share =
    RAID_RUN.LOOT_SHARE *
    (RAID_RUN.MIN_LOOT_FRACTION + (1 - RAID_RUN.MIN_LOOT_FRACTION) * progress);

  // The crown is worth stealing: the season leader carries a bigger purse.
  const mult = opts.crowned ? CROWN.LOOT_MULT : 1;
  const loot = Math.min(
    RAID.LOOT_CAP,
    Math.floor(opts.defenderStock * share * mult),
  );

  // Damage rolls in a band so two identical raids do not read as scripted. It
  // is clamped at 0 only: it used to be capped by the defender's remaining HP,
  // and with the hit-point bar gone there is no ceiling left to apply.
  const jitter = 1 + (rng() * 2 - 1) * RAID.DAMAGE_JITTER;
  const damage = Math.max(0, Math.round(RAID.BOMB_DAMAGE * progress * jitter));

  return { progress, loot, damage, reachedField };
}

/**
 * The clue numbers a raider reads: how many traps touch each tile.
 *
 * This is what makes a burrow a MINEFIELD rather than a maze. A raider standing
 * on a "0" knows all eight neighbours are safe and can stride; a "2" is a
 * decision. It is the same contract as the island — deterministic danger,
 * random reward — carried into the defensive half of the game.
 *
 * Computed on the server from the trap positions and sent as NUMBERS ONLY. The
 * raider is never told where the traps are, which is what keeps burying one
 * worth doing.
 */
export function trapClues(seed: string, traps: Iterable<number>): Map<number, number> {
  const mined = new Set(traps);
  const clues = new Map<number, number>();
  for (const tile of walkableTiles(seed)) {
    let n = 0;
    for (const neighbour of burrowNeighbors(seed, tile)) if (mined.has(neighbour)) n++;
    clues.set(tile, n);
  }
  return clues;
}

/**
 * What a raider may see of a burrow, from where they stand.
 *
 * Only the tiles they have ALREADY visited and those touching them — a raider
 * reads the board by walking it, one step of information at a time. Handing
 * over every clue at once would turn the crossing into a solved puzzle before
 * the first step.
 *
 * `smoked` blanks the numbers entirely: the defender bought a screen, so the
 * raider crosses blind and learns only what they spring. The TILES are still
 * listed — a raider must know where the walls are, or they are not playing a
 * board, they are guessing at a void.
 *
 * The `tier` rides along because the defender's ground is now TERRACED and
 * generated: a raider drawing a seen tile has to know which shelf it is on, or
 * every revealed cell lands at ground level and the ones on a plateau sit
 * inside the cliff they are standing on. It leaks nothing — the shape of the
 * land is not a secret, only where the traps are is.
 */
export function raiderView(
  seed: string,
  visited: Iterable<number>,
  clues: Map<number, number>,
  smoked: boolean,
): { tile: number; clue: number | null; tier: number }[] {
  const seen = new Set<number>();
  for (const tile of visited) {
    seen.add(tile);
    // SIGHT, not movement. `burrowNeighbors` drops anything more than one
    // shelf up or down, so on terraced ground a raider standing below a cliff
    // uncovered nothing in that direction and the burrow read as an empty
    // blue void — four cells revealed out of 231 on a corner entrance.
    // Seeing the wall costs nothing; what is behind it still has to be walked.
    for (const neighbour of burrowAround(seed, tile)) seen.add(neighbour);
  }
  return [...seen].map((tile) => ({
    tile,
    clue: smoked ? null : (clues.get(tile) ?? 0),
    tier: burrowTier(seed, tile),
  }));
}
