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
import { BURROW, CROWN, RAID, RAID_RUN } from '@config/tuning';
import { entranceTile, fieldTiles, burrowNeighbors } from '@/config/burrowConfig';

/** Steps from a tile to the nearest field tile — the raid's own distance metric. */
export function distanceToField(): Map<number, number> {
  const dist = new Map<number, number>();
  let frontier = fieldTiles();
  for (const t of frontier) dist.set(t, 0);
  let d = 0;
  while (frontier.length) {
    d++;
    const next: number[] = [];
    for (const t of frontier) {
      for (const n of burrowNeighbors(t)) {
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
export function raidProgress(endedAt: number, dist = distanceToField()): number {
  const start = dist.get(entranceTile());
  const here = dist.get(endedAt);
  if (start === undefined || here === undefined || start === 0) return 1;
  return Math.max(0, Math.min(1, (start - here) / start));
}

export interface RaidOutcome {
  /** 0..1, how far across the burrow the raider got. */
  progress: number;
  /** Carrots transferred. */
  loot: number;
  /** Damage dealt to the burrow's HP. */
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
    endedAt: number;
    defenderStock: number;
    defenderHp: number;
    defenderLevel: number;
    shielded: boolean;
    crowned?: boolean;
  },
  rng: () => number = Math.random,
  dist = distanceToField(),
): RaidOutcome {
  // A shield is absolute. Anything less invites the farming it exists to stop.
  if (opts.shielded) {
    return { progress: 0, loot: 0, damage: 0, reachedField: false };
  }

  const progress = raidProgress(opts.endedAt, dist);
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

  // Damage rolls in a band so two identical raids do not read as scripted.
  const jitter = 1 + (rng() * 2 - 1) * RAID.DAMAGE_JITTER;
  const damage = Math.min(
    opts.defenderHp,
    Math.round(RAID.BOMB_DAMAGE * progress * jitter),
  );

  return { progress, loot, damage, reachedField };
}

/** Max HP for a burrow level — the one stat a burrow has. */
export const burrowMaxHp = (level: number) => level * BURROW.HP_PER_LEVEL;

/**
 * Does this raid break the burrow? A broken burrow earns its owner the
 * post-raid shield, which is the anti-churn rule the whole loop rests on.
 */
export const breaksBurrow = (hpBefore: number, damage: number) => damage >= hpBefore;
