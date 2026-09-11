/**
 * The bumper-car rules, asserted without a server.
 *
 * Every case in `docs/bumping.md` that can fail silently rather than throw —
 * which is all of them. A push that quietly refuses looks identical to a
 * dropped input, and a chain applied in the wrong order stacks two rabbits on
 * one tile without anything complaining.
 */
import { describe, expect, it } from 'vitest';
import { planPush, occupancyOf, HEAD_ON_WINDOW_MS } from '../src/lib/game/push';
import { spawnTile, terrainNeighbors, farmableTiles } from '../src/lib/game/terrainBoard';
import { resolveMove, spawnRabbit } from '../src/lib/game/run';
import { generateIsland } from '../src/lib/game/island';
import { makeShape } from '../src/config/gridConfig';
import { mulberry32 } from '../src/lib/game/rng';
import type { Rabbit } from '../src/lib/game/types';

const SEED = 'push-test';
const NOW = 1_000_000;
const SHAPE = makeShape(SEED);

/** A rabbit standing on `tile`, with no recent move unless asked. */
function at(tile: number, over: Partial<Rabbit> = {}): Rabbit {
  return { ...spawnRabbit(`p${tile}`, 'R', 10, SEED), tile, ...over };
}

/** A tile with at least two free neighbours in a line, for chain tests. */
function lineOfThree(): [number, number, number] | null {
  for (const a of farmableTiles(SEED)) {
    for (const b of terrainNeighbors(SEED, a)) {
      // c must continue the same direction: the push direction is a → b → c.
      const da = b - a;
      const c = b + da;
      if (terrainNeighbors(SEED, b).includes(c)) return [a, b, c];
    }
  }
  return null;
}

describe('an unoccupied tile is not a push', () => {
  it('plans nothing', () => {
    const mover = at(spawnTile(SEED));
    const to = terrainNeighbors(SEED, mover.tile)[0];
    const out = planPush(SEED, mover, to, occupancyOf([mover]), NOW);
    expect(out.ok && out.plan.steps).toEqual([]);
  });
});

describe('rule 1 — a push moves one tile', () => {
  it('shoves the occupant onto the next tile along', () => {
    const [a, b, c] = lineOfThree()!;
    const mover = at(a);
    const victim = at(b);
    const out = planPush(SEED, mover, b, occupancyOf([mover, victim]), NOW);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.plan.steps).toEqual([{ playerId: victim.playerId, from: b, to: c }]);
  });
});

describe('rule 3 — a stunned rabbit is terrain', () => {
  it('cannot be pushed', () => {
    const [a, b] = lineOfThree()!;
    const mover = at(a);
    const victim = at(b, { stunnedUntil: NOW + 5_000 });
    const out = planPush(SEED, mover, b, occupancyOf([mover, victim]), NOW);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.refusal).toBe('stunned-target');
  });

  it('blocks a chain that reaches it', () => {
    const [a, b, c] = lineOfThree()!;
    const mover = at(a);
    const middle = at(b);
    const stunned = at(c, { stunnedUntil: NOW + 5_000 });
    const out = planPush(SEED, mover, b, occupancyOf([mover, middle, stunned]), NOW);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.refusal).toBe('chain-blocked');
  });

  it('can be pushed again once the stun lapses', () => {
    const [a, b] = lineOfThree()!;
    const mover = at(a);
    const victim = at(b, { stunnedUntil: NOW - 1 });
    expect(planPush(SEED, mover, b, occupancyOf([mover, victim]), NOW).ok).toBe(true);
  });
});

describe('rule 4 — head-on bounces, a chase does not', () => {
  it('refuses when the target just stepped towards the mover', () => {
    const [a, b, c] = lineOfThree()!;
    const mover = at(a);
    // The victim arrived on b from c — that is, straight at the mover.
    const victim = at(b, { lastMoveAt: NOW - 10, cameFrom: c });
    const out = planPush(SEED, mover, b, occupancyOf([mover, victim]), NOW);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.refusal).toBe('head-on');
  });

  it('allows the push when the target was running AWAY', () => {
    const [a, b, c] = lineOfThree()!;
    const mover = at(a);
    // Arrived on b from a's side: fleeing, not colliding.
    const victim = at(b, { lastMoveAt: NOW - 10, cameFrom: a });
    expect(planPush(SEED, mover, b, occupancyOf([mover, victim]), NOW).ok).toBe(true);
  });

  it('allows the push once the window has passed', () => {
    const [a, b, c] = lineOfThree()!;
    const mover = at(a);
    const victim = at(b, { lastMoveAt: NOW - HEAD_ON_WINDOW_MS - 1, cameFrom: c });
    expect(planPush(SEED, mover, b, occupancyOf([mover, victim]), NOW).ok).toBe(true);
  });
});

describe('rule 5 — pushes chain', () => {
  it('moves everyone in the line, furthest first', () => {
    const [a, b, c] = lineOfThree()!;
    const d = c + (c - b);
    if (!terrainNeighbors(SEED, c).includes(d)) return; // no room; nothing to assert
    const mover = at(a);
    const first = at(b);
    const second = at(c);
    const out = planPush(SEED, mover, b, occupancyOf([mover, first, second]), NOW);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // Furthest first, or the second step would land on an occupied tile.
    expect(out.plan.steps.map((s) => s.from)).toEqual([c, b]);
  });

  it('fails entirely when the far end is blocked', () => {
    // A line whose far end leaves the board or hits terrain.
    for (const a of farmableTiles(SEED)) {
      for (const b of terrainNeighbors(SEED, a)) {
        const c = b + (b - a);
        if (terrainNeighbors(SEED, b).includes(c)) continue; // this one is open
        const out = planPush(SEED, at(a), b, occupancyOf([at(a), at(b)]), NOW);
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.refusal).toBe('chain-blocked');
        return;
      }
    }
  });
});

/**
 * The rules as `resolveMove` actually applies them — the seam where a plan
 * becomes a consequence, and where rule 2 does its damage.
 */
describe('through resolveMove', () => {
  const setup = () => {
    const [a, b, c] = lineOfThree()!;
    const island = generateIsland({ seed: SEED });
    return { island, a, b, c };
  };

  it('shoves the occupant and takes their tile', () => {
    const { island, a, b, c } = setup();
    if (!island.tiles.has(a) || !island.tiles.has(b) || !island.tiles.has(c)) return;
    const mover = at(a);
    const victim = at(b);
    // Revealed ground, so the move itself is free and only the push is tested.
    island.tiles.get(b)!.revealed = true;
    island.tiles.get(c)!.revealed = true;

    const out = resolveMove(island, mover, b, SHAPE, mulberry32(1), NOW, [victim]);
    expect(out.ok).toBe(true);
    expect(mover.tile).toBe(b);
    expect(victim.tile).toBe(c);
    expect(out.pushed?.[0]).toMatchObject({ playerId: victim.playerId, from: b, to: c });
  });

  it('rule 7 — the victim is told who pushed them', () => {
    const { island, a, b, c } = setup();
    if (!island.tiles.has(c)) return;
    island.tiles.get(b)!.revealed = true;
    island.tiles.get(c)!.revealed = true;
    const mover = at(a);
    const out = resolveMove(island, mover, b, SHAPE, mulberry32(1), NOW, [at(b)]);
    expect(out.pushed?.[0].pushedBy).toBe(mover.playerId);
  });

  /**
   * Rule 2, the deliberate cruelty: a rabbit shoved onto undug ground digs it,
   * and a bomb goes off under someone who never chose to dig there.
   */
  it('rule 2 — a push onto an undug bomb detonates it', () => {
    const { island, a, b, c } = setup();
    if (!island.tiles.has(c)) return;
    island.tiles.get(b)!.revealed = true;
    island.tiles.get(c)!.content = 'bomb';
    island.tiles.get(c)!.revealed = false;

    const victim = at(b, { energy: 10 });
    const out = resolveMove(island, at(a), b, SHAPE, mulberry32(1), NOW, [victim]);
    expect(out.ok).toBe(true);
    const hit = out.pushed?.[0];
    expect(hit?.dig?.content).toBe('bomb');
    expect(victim.energy).toBeLessThan(10);
    expect(victim.stunnedUntil).toBeGreaterThan(NOW);
  });

  it('rule 2 — the victim is not charged the dig cost, only the blast', () => {
    const { island, a, b, c } = setup();
    if (!island.tiles.has(c)) return;
    island.tiles.get(b)!.revealed = true;
    const landing = island.tiles.get(c)!;
    landing.content = 'empty';
    landing.revealed = false;

    const victim = at(b, { energy: 10 });
    resolveMove(island, at(a), b, SHAPE, mulberry32(1), NOW, [victim]);
    // Empty ground, so a push costs the victim nothing at all.
    expect(victim.energy).toBe(10);
    expect(landing.revealed).toBe(true);
  });

  it('refuses the move when the chain is blocked', () => {
    const { island, a, b } = setup();
    island.tiles.get(b)!.revealed = true;
    const blocker = at(b, { stunnedUntil: NOW + 5_000 });
    const mover = at(a);
    const out = resolveMove(island, mover, b, SHAPE, mulberry32(1), NOW, [blocker]);
    expect(out.ok).toBe(false);
    // The mover stayed put: a refused push is a refused move.
    expect(mover.tile).toBe(a);
  });

  it('pushes nobody when the roster is not passed', () => {
    const { island, a, b } = setup();
    island.tiles.get(b)!.revealed = true;
    const out = resolveMove(island, at(a), b, SHAPE, mulberry32(1), NOW);
    expect(out.ok).toBe(true);
    expect(out.pushed ?? []).toEqual([]);
  });
});

describe('a plan never stacks two rabbits on one tile', () => {
  it('holds over many positions', () => {
    const tiles = farmableTiles(SEED);
    for (const a of tiles.slice(0, 60)) {
      for (const b of terrainNeighbors(SEED, a)) {
        const c = b + (b - a);
        const crowd = [at(a), at(b), ...(terrainNeighbors(SEED, b).includes(c) ? [at(c)] : [])];
        const out = planPush(SEED, crowd[0], b, occupancyOf(crowd), NOW);
        if (!out.ok) continue;

        // Apply the plan in order and check nobody collides.
        const occupied = new Set(crowd.map((r) => r.tile));
        for (const step of out.plan.steps) {
          occupied.delete(step.from);
          expect(occupied.has(step.to), `two rabbits on ${step.to}`).toBe(false);
          occupied.add(step.to);
        }
      }
    }
  });
});
