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
import { BOMB, DROWN, CHEST_LOOT, CHEST_LOOT_BY_TIER, CHEST_NFT_ODDS, ENERGY, FLAG, MULTIPLAYER, RUN, xGainFor, mayFight } from '@config/tuning';
import { SPAWN_INDEX, neighbors, toColRow, type IslandShape } from '@/config/gridConfig';
import { pickWeighted, randInt, type Rng } from './rng';
import { boardNeighbors, cascadeAround, revealTile } from './island';
import { isFirstIsland } from './first-island';
import { spawnTile, terrainNeighbors } from './terrainBoard';
import { canDig } from './reachable';
import { occupancyOf, planPush } from './push';
import type { DigResult, FlagResult, HintReveal, Island, Rabbit } from './types';
import { isLootItemKind } from './types';

export type MoveRejection =
  | 'head-on'
  | 'blocked'
  | 'dead'
  | 'stunned'
  | 'too-fast'
  | 'not-adjacent'
  | 'off-island'
  | 'no-energy'
  /** A red X stands there: a known bomb, and the game will not let you walk in. */
  | 'flagged'
  /**
   * The first island is holding the player at its lesson.
   *
   * Only ever returned on the tutorial board, and only until the taught bomb
   * wears its X: the run does not go on until the one thing it is teaching has
   * been done. See `teachingHold`.
   */
  | 'learn-first';

export interface MoveOutcome {
  ok: boolean;
  rejection?: MoveRejection;
  /** Set when the move dug a fresh tile. Absent when walking revealed ground. */
  dig?: DigResult;
  /**
   * Numbers the cascade wrote because of a plain WALK. The cascade only
   * reaches ISLAND.CASCADE_RADIUS from the rabbit, so walking through open
   * zeros is what carries it on. A dig's hints ride in `dig.hinted` instead.
   */
  hinted?: HintReveal[];
  /** Where the rabbit ended up (post-knockback). */
  tile: number;
  energy: number;
  carrots: number;
  /**
   * The run ended on this move — energy hit zero, or the tutorial was finished.
   *
   * The second case is the first island only: its chest IS its ending, see
   * `tutorialDone` below.
   */
  runOver: boolean;
  /**
   * The tutorial's chest has just been dug, so the run ended on a WIN.
   *
   * Carried apart from `runOver` because the two endings are not the same
   * ending: an exhausted rabbit is out of energy and the recap asks whether
   * they want more, while this one has finished what the island was for. Only
   * ever set on the first island.
   */
  tutorialDone?: boolean;
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
  /**
   * Thrown into the sea (`DROWN`). `to` is then where they climb back out —
   * the middle of the island — and `sea` the first cell of water they went
   * into, so a client can throw them the right way before they reappear.
   */
  drowned?: true;
  sea?: number;
  /** Their energy after the landing, and whether it ended their run. */
  energy: number;
  runOver: boolean;
}

export type FlagRejection =
  | 'dead'
  | 'stunned'
  | 'off-island'
  /** Not one of the eight cells around the rabbit. */
  | 'not-adjacent'
  /** Dug, read, already marked, or a standing chest: nothing to claim there. */
  | 'known';

export interface FlagOutcome {
  ok: boolean;
  rejection?: FlagRejection;
  flag?: FlagResult;
  energy: number;
  carrots: number;
  /** A wrong X on the last of the energy ends the run, like a blast would. */
  runOver: boolean;
}

/**
 * Resolve one red X — see FLAG in tuning for the why and the sums.
 *
 * Reach is the BOARD's eight neighbours, not the terrain's steps: a bomb on
 * the shelf above is counted by the number under the rabbit's feet, so it has
 * to be markable from there too, climbable or not.
 *
 * Only ground that says nothing may be marked. A dug tile is known, a hinted
 * one is known SAFE (the cascade never writes on a bomb), a chest is never a
 * bomb, and an X already stands where an X stands. Refusing those is a
 * kindness, not a rule of the puzzle: an X there could only lose.
 */
export function flagTile(island: Island, rabbit: Rabbit, at: number, now: number = Date.now()): FlagOutcome {
  const reject = (rejection: FlagRejection): FlagOutcome => ({
    ok: false, rejection, energy: rabbit.energy, carrots: rabbit.carrots, runOver: !rabbit.alive,
  });
  if (!rabbit.alive) return reject('dead');
  if (now < rabbit.stunnedUntil) return reject('stunned');
  const tile = island.tiles.get(at);
  if (!tile) return reject('off-island');
  if (!boardNeighbors(island, rabbit.tile).includes(at)) return reject('not-adjacent');
  if (tile.revealed || tile.hinted || tile.flagged || tile.content === 'chest') return reject('known');

  const run = rabbit.run;
  if (tile.content === 'bomb') {
    tile.flagged = true;
    tile.flaggedBy = rabbit.playerId;
    const before = rabbit.energy;
    // Per tier — see `IslandTier.xGain`.
    const gain = xGainFor(island.tier);
    rabbit.energy = Math.min(ENERGY.MAX, rabbit.energy + gain);
    const streak = (run?.flagStreak ?? 0) + 1;
    // What the full bar turned away is paid as carrots — see OVERFLOW_CARROTS.
    const overflow = gain - (rabbit.energy - before);
    const carrots = Math.min(FLAG.CARROTS_MAX, FLAG.CARROTS_BASE + FLAG.CARROTS_STEP * (streak - 1))
      + overflow * FLAG.OVERFLOW_CARROTS;
    rabbit.carrots += carrots;
    const flag: FlagResult = {
      tile: at, correct: true, energyDelta: rabbit.energy - before, carrotDelta: carrots, streak,
    };
    if (run) {
      run.flagStreak = streak;
      run.bombsFlagged = (run.bombsFlagged ?? 0) + 1;
      if (streak % FLAG.ITEM_EVERY === 0) {
        run.loot.bomb = (run.loot.bomb ?? 0) + 1;
        flag.item = true;
      }
    }
    return { ok: true, flag, energy: rabbit.energy, carrots: rabbit.carrots, runOver: false };
  }

  // Wrong. The tile is safe, and paying for that is what buys the knowledge:
  // its number is written on it, exactly as the cascade would have, and if it
  // is a zero the cascade runs on from it. Nothing is dug.
  rabbit.energy -= FLAG.LOSS;
  if (run) run.flagStreak = 0;
  tile.hinted = true;
  const hinted: HintReveal[] = [{ tile: at, adjacent: tile.adjacent }, ...cascadeAround(island, rabbit.tile)];
  if (rabbit.energy <= 0) {
    rabbit.energy = 0;
    rabbit.alive = false;
  }
  return {
    ok: true,
    flag: { tile: at, correct: false, energyDelta: -FLAG.LOSS, carrotDelta: 0, streak: 0, hinted },
    energy: rabbit.energy,
    carrots: rabbit.carrots,
    runOver: !rabbit.alive,
  };
}

/**
 * Resolve one move intent.
 *
 * `now` and `rng` are injected rather than read from globals so the whole rule
 * set is testable and reproducible: a playtest bug report replays exactly.
 */
/**
 * IS THE TUTORIAL HOLDING THE PLAYER AT ITS LESSON?
 *
 * The first island teaches one thing the rest of the game cannot: the red X.
 * Every other rule is learned by accident — you walk, you dig, a bomb goes
 * off and the caption names what happened — but nobody arms a MODE at random,
 * so the X has to be provoked, and a player who walks past the taught bomb
 * never learns it exists. Paul, 2026-09-20: "il faut plus que le joueur ne
 * plus jouer tant qu'il a pas mis sa bomb."
 *
 * So the board holds. Until the taught bomb wears its X, the only steps
 * allowed are onto ground that is already open — the player can still move,
 * look around and read, they simply cannot DIG their way past the lesson.
 *
 * Returns the tile the hold is about (the taught bomb), or null when the run
 * is free: not the first island, or the lesson is done.
 *
 * WHY "already open" AND NOT "everything but the bomb". Refusing only the bomb
 * would let the player dig the whole island around it and never look at it;
 * worse, the lesson's own sentence ("seven are already dug, so the bomb is the
 * last one") stops being true the moment they open a ninth cell beside the
 * witness. Holding them to read what is on screen is the lesson.
 */
/**
 * Steps from `a` to `b` over ground a rabbit may actually walk.
 *
 * Breadth-first over `boardNeighbors`, which is the same adjacency the hints
 * are counted over — so "closer" here means closer in the way the player
 * experiences it, not in straight-line pixels. Returns Infinity when there is
 * no path at all, which makes any step that opens one count as progress.
 */
function stepsBetween(island: Island, from: number, to: number): number {
  if (from === to) return 0;
  const seen = new Set<number>([from]);
  let frontier = [from];
  for (let depth = 1; depth <= island.tiles.size; depth++) {
    const next: number[] = [];
    for (const cell of frontier) {
      for (const n of boardNeighbors(island, cell)) {
        if (seen.has(n)) continue;
        if (n === to) return depth;
        seen.add(n);
        next.push(n);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }
  return Infinity;
}

export function teachingHold(island: Island): number | null {
  if (!isFirstIsland(island.seed)) return null;
  for (const [index, tile] of island.tiles) {
    if (tile.content !== 'bomb') continue;
    // The taught bomb is the one whose edge the player can already read.
    const visible = boardNeighbors(island, index)
      .some((n) => { const t = island.tiles.get(n); return t?.revealed || t?.hinted; });
    if (!visible) continue;
    // Marked already — the lesson is done and the island lets go.
    return tile.flagged ? null : index;
  }
  return null;
}

/**
 * Where a drowned rabbit climbs back out: the open ground nearest the spawn.
 *
 * OPEN ground — revealed — because a landing on undug earth would be a dig
 * nobody chose, and the sea already charged its price. And FREE ground, after
 * the shove is applied: not where a rabbit will stand once the line has moved
 * (`to` is the mover's), and not under a sheep. Searched outward from the
 * spawn along the steps a rabbit can take, so the answer is somewhere it could
 * have walked to. Falls back on the spawn itself on an island with no open
 * cell free, which a live island never is — the spawn opens with its ring.
 */
export function drownRespawn(
  island: Island,
  steps: ReadonlyArray<{ from: number; to: number; drowned?: true }>,
  occupancy: ReadonlyMap<number, Rabbit>,
  to: number,
  blocked?: ReadonlySet<number>,
): number {
  const taken = new Set<number>(occupancy.keys());
  for (const s of steps) {
    taken.delete(s.from);
    if (!s.drowned) taken.add(s.to);
  }
  taken.add(to);
  const start = spawnTile(island.seed);
  const seen = new Set<number>([start]);
  const queue = [start];
  while (queue.length) {
    const t = queue.shift()!;
    if (island.tiles.get(t)?.revealed && !taken.has(t) && !blocked?.has(t)) return t;
    for (const n of terrainNeighbors(island.seed, t)) {
      if (!seen.has(n)) { seen.add(n); queue.push(n); }
    }
  }
  return start;
}

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
  // A red X is a bomb somebody PROVED. Walking onto it can only be a slip of
  // the thumb, and a slip must not cost a heart the player already earned the
  // right to keep. (A shove can still land a rabbit there — see `planPush`;
  // that is the pusher's doing, and it goes off like any bomb.)
  if (tile.flagged && !tile.revealed) return reject('flagged');
  /**
   * THE TUTORIAL'S HOLD. Until the taught bomb is marked, a step may only land
   * on ground that is already DUG — no digging past the lesson.
   *
   * `revealed`, NOT `revealed || hinted`, and that distinction is the whole
   * bug this replaced. A hinted tile shows its number but is still in the
   * ground: stepping on it DIGS it, and the dig cascades another ring open,
   * which hints more tiles, which are then steppable too. The hold leaked one
   * ring at a time until the player walked to the chest and finished the
   * tutorial having never marked anything — observed in a live run on
   * 2026-09-20 (tiles 497, 498, 467, then the chest at 436).
   *
   * Walking DUG ground stays free, which is what keeps this a hold rather than
   * a freeze: the player can still move around what they have opened and read
   * the numbers on it. They simply cannot open anything new.
   */
  const held = teachingHold(island);
  if (held !== null && !tile.revealed) {
    /**
     * A hinted tile may be stepped on ONLY to reach the bomb.
     *
     * `flagTile` needs the rabbit standing NEXT to the cell it marks, and on a
     * fresh board none of the taught bomb's neighbours is dug — holding to dug
     * ground alone was a deadlock: 9 reachable tiles, none of them beside the
     * bomb, and the lesson could never be completed. Caught in simulation
     * before it shipped.
     *
     * So the hold opens exactly one door: a hinted cell that TOUCHES the
     * taught bomb. That is the single step the lesson asks for, it cannot
     * cascade the player across the island (a bomb's neighbour is never a
     * zero, so digging it opens nothing), and every other direction stays
     * shut. Anything already dug stays free to walk, as ever.
     */
    /**
     * A hinted tile may be stepped on ONLY along the way to the bomb.
     *
     * "Touches the bomb" was too strict on the hand-drawn corridor: the walk
     * to the lesson runs through hinted cells that are two and three steps
     * out, so the player was stopped short of the tile they were being told
     * to mark. The rule is now the honest one — a step is allowed when it
     * brings the rabbit CLOSER to the taught bomb — which on a corridor is
     * the corridor, and on any wider board still refuses every detour.
     */
    const closer = stepsBetween(island, to, held) < stepsBetween(island, rabbit.tile, held);
    if (!(tile.hinted === true && closer)) return reject('learn-first');
  }
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
  // NO SHOVE BELOW RAID_MIN (2026-09-23): a shove is an attack, and nobody
  // attacks or is attacked before the last level. A rabbit in the way is a
  // wall then, the way a sheep is.
  if (push.plan.steps.some((s) => {
    const shoved = occupancy.get(s.from);
    return !shoved || !mayFight(rabbit.level, shoved.level);
  })) return reject('blocked');

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
    if (step.drowned) {
      // Into the sea: the bomb's price, the time under, and the walk back from
      // the middle. Nothing is dug — the water is not ground.
      const back = drownRespawn(island, push.plan.steps, occupancy, to, blocked);
      victim.tile = back;
      victim.cameFrom = back;
      victim.energy -= DROWN.LOSS;
      victim.stunnedUntil = now + DROWN.STUN_MS;
      if (victim.run) victim.run.flagStreak = 0;
      const runOver = victim.energy <= 0;
      if (runOver) {
        victim.energy = 0;
        victim.alive = false;
      }
      pushed.push({
        playerId: victim.playerId, from: step.from, to: back, sea: step.to, drowned: true,
        pushedBy: rabbit.playerId, energy: victim.energy, runOver,
      });
      continue;
    }
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
        if (victim.run) victim.run.flagStreak = 0;
        if (victim.energy <= 0) {
          victim.energy = 0;
          victim.alive = false;
          entry.runOver = true;
        }
      } else {
        // A shove onto a zero opens the ground like any other dig would.
        const hinted = cascadeAround(island, step.to);
        if (hinted.length) dug.hinted = hinted;
      }
      entry.dig = dug;
      entry.energy = victim.energy;
    }
    pushed.push(entry);
  }

  // Walking revealed ground is free — that is the whole reason to read numbers.
  if (tile.revealed) {
    rabbit.tile = to;
    const hinted = cascadeAround(island, to);
    return {
      ok: true, tile: to, energy: rabbit.energy, carrots: rabbit.carrots, runOver: false, pushed,
      ...(hinted.length ? { hinted } : {}),
    };
  }

  // Digging costs. You may not spend your last point of energy into nothing —
  // running out mid-dig would hide WHY the run ended. The rule lives in
  // `canDig` so the client's ring lights exactly what is accepted here.
  if (!canDig(rabbit.energy)) return reject('no-energy');

  const firstDigger = revealTile(island, to, rabbit.playerId);
  rabbit.energy -= ENERGY.DIG_COST;

  const dig: DigResult = {
    tile: to,
    content: tile.content,
    adjacent: tile.adjacent,
    energyDelta: -ENERGY.DIG_COST,
    carrotDelta: 0,
  };

  /** Set by the chest branch on the first island — see there. */
  let tutorialDone = false;

  switch (tile.content) {
    case 'bomb': {
      rabbit.energy -= ENERGY.BOMB_LOSS;
      dig.energyDelta -= ENERGY.BOMB_LOSS;
      rabbit.stunnedUntil = now + BOMB.STUN_MS;
      // A blast costs the energy AND the X streak — see FLAG.
      if (rabbit.run) rabbit.run.flagStreak = 0;
      /**
       * The blast THROWS THE RABBIT BACK onto the tile it stepped from.
       *
       * It lands where it came from (`cameFrom`, set above for this move), not
       * in the crater. Decided 2026-09-23, reversing the "ends up in the
       * crater" rule: the animation reads as hop onto the bomb, blast, thrown
       * back to where you stood, one second of stars, back up — and the board
       * has to agree with that picture, or the ring lights around a rabbit
       * that is not there. A tile it came from is walkable and, the mover
       * having just left it, free.
       */
      const landing = rabbit.cameFrom ?? to;
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
        // Worth CARROTS, not one: a dug carrot pays RUN.CARROT_VALUE. See there
        // for why `+= 1` made playing the worst way to earn.
        const value = tile.content === 'golden' ? RUN.GOLDEN_VALUE : RUN.CARROT_VALUE;
        rabbit.energy = Math.min(ENERGY.MAX, rabbit.energy + gain);
        rabbit.carrots += value;
        dig.energyDelta += gain;
        dig.carrotDelta = value;
      }
      rabbit.tile = to;
      break;
    }
    case 'chest': {
      if (firstDigger) {
        // The tier decides the table, which is what makes the word written above
        // the chest a promise rather than decoration — see CHEST_LOOT_BY_TIER.
        // A chest with no tier (old island, hand-built fixture) falls back to
        // the flat table so it can never roll nothing at all.
        const chestTier = tile.chestTier;
        const table = chestTier ? CHEST_LOOT_BY_TIER[chestTier] : CHEST_LOOT;
        const roll = pickWeighted(rng, table);
        const amount = randInt(rng, roll.min, roll.max);
        if (rabbit.run) rabbit.run.chests = (rabbit.run.chests ?? 0) + 1;
        // A tiered chest was drawn on the board with its colour and word above
        // it; an untiered one was buried like anything else. The client shows
        // the walked-to prize and lets the hidden one fly past.
        dig.loot = { kind: roll.kind, amount, announced: chestTier !== undefined };

        // The Genesis piece is a SEPARATE roll on top of a crown chest's
        // guaranteed item, never instead of it: folding it into the table would
        // make the best outcome cost the player the item they were promised.
        if (chestTier === 'crown' && rng() < CHEST_NFT_ODDS.inCrown) {
          rabbit.run?.nfts.push(to);
          dig.nft = true;
        }

        // Three destinations, because the table holds three different KINDS of
        // thing. Carrots are paid onto the rabbit like any other dig; items go
        // into the run's bag and are granted when the run banks; an NFT is
        // neither a count nor a currency, so only the tile it came from is
        // recorded and the mint is the caller's problem.
        if (roll.kind === 'carrots') {
          rabbit.carrots += amount;
          dig.carrotDelta = amount;
        } else if (roll.kind === 'nft') {
          rabbit.run?.nfts.push(to);
        } else if (rabbit.run && isLootItemKind(roll.kind)) {
          const bag = rabbit.run.loot;
          bag[roll.kind] = (bag[roll.kind] ?? 0) + amount;
        }
      }
      rabbit.tile = to;
      // THE TUTORIAL ENDS ON ITS CHEST.
      //
      // The first island is dealt one chest, a walk from the spawn, and an
      // arrow points at it (`fx/ChestPointer`): going and getting it IS the
      // lesson — walk, read the numbers, survive the bomb, open the box. Once
      // it is open the island has nothing left to teach, and what it had left
      // to offer was a field of ordinary carrots and an eruption clock that a
      // first-time player has no reason to sit through.
      //
      // Ending here also puts the recap on screen at the best possible moment:
      // right after the prize, with a haul to show (FIRST_RUN.CARROT_DENSITY is
      // generous on purpose) — and the recap is what sends them to the burrow,
      // which is the first time that place has anything in it.
      //
      // `firstDigger` gates it with the loot above: the run ends for whoever
      // actually opened the box. On the first island that is always its one
      // player (`solo`), but the rule is written so it cannot end somebody
      // else's run on a board that is ever shared.
      if (firstDigger && isFirstIsland(island.seed)) tutorialDone = true;
      break;
    }
    default:
      rabbit.tile = to;
  }

  // A zero opens its surroundings — the cascade, see `cascadeHints`. Not on a
  // bomb (a bomb tile's own count says nothing about it being safe to stand
  // beside), and never digging anything: the hints are the whole gift.
  //
  // Run from wherever the rabbit came to REST rather than from `to`: the
  // cascade is bounded around the rabbit, and after a blast that is the
  // landing tile. A revealed bomb is never a zero, so nothing starts from it.
  const hinted = cascadeAround(island, rabbit.tile);
  if (hinted.length) dig.hinted = hinted;

  // ZERO ENDS THE RUN, whatever emptied the bar — a blast or the digging
  // itself. One rule, sayable in one sentence: no energy, no more exploring.
  // For a day a bar emptied by digging left the rabbit alive and "dry", to be
  // revived by a right X. It was withdrawn: it needed three sentences on
  // screen to explain, it let a player bank proven bombs as a reserve tank so
  // energy stopped being a limit, and it took the run's ending — and the
  // recap's refill offer — away from the moment a player most wants to go on.
  // The X still saves a run; it has to do it BEFORE the bar is empty, which is
  // what the low-energy warning is for (`EnergyCoach`).
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
    // Either ending closes the run. The rabbit is left ALIVE on a tutorial
    // win — it is standing on the chest it just opened, and drawing it slumped
    // would tell the player they died on the prize.
    runOver: !rabbit.alive || tutorialDone,
    ...(tutorialDone ? { tutorialDone } : {}),
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

/** A rabbit at the start of a run, placed on the island's spawn. */
export function spawnRabbit(
  playerId: string,
  name: string,
  energy: number = ENERGY.START,
  seed?: string,
  /** The player's rabbit level (RABBIT_LEVELS). The server always passes it;
   *  a rabbit without one (tests, fixtures) is not held to the level gates. */
  level?: number,
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
    ...(level !== undefined ? { level } : {}),
  };
}
