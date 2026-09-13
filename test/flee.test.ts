/**
 * Sheep that get out of the way.
 *
 * The rule this file exists to defend is the fourth one: a sheep can never
 * block. It BLOCKS its cell and it used to never move, so one standing in a
 * dead end took the carrots behind it out of the game for the whole run — and
 * that is not a bug anybody reports, it just quietly makes an island worse.
 *
 * Everything here drives a fake `Ground`, because the point is the decision,
 * not the terrain: a real map would make the cornered cases hard to set up and
 * impossible to read.
 */
import { describe, expect, it } from 'vitest';
import {
  cellDistance,
  isSpooked,
  planFlight,
  planFlock,
  GRAZE_CHANCE,
  PANIC_RADIUS,
  SPRINT_STEPS,
  type Ground,
} from '../src/lib/game/flee';
import { toIndex } from '../src/config/gridConfig';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

/**
 * A board where `open` names every cell that exists and `tiers` gives the ones
 * that are not at sea level. Anything not in `taken` is free.
 */
function ground(open: string[], opts: { taken?: string[]; tiers?: Record<string, number> } = {}): Ground {
  const exists = new Set(open);
  const taken = new Set(opts.taken ?? []);
  const tiers = opts.tiers ?? {};
  return {
    stepsFrom(x, y) {
      const out: Array<{ x: number; y: number }> = [];
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (!dx && !dy) continue;
          if (exists.has(`${x + dx},${y + dy}`)) out.push({ x: x + dx, y: y + dy });
        }
      }
      return out;
    },
    isFree: (x, y) => exists.has(`${x},${y}`) && !taken.has(`${x},${y}`),
    tierAt: (x, y) => tiers[`${x},${y}`] ?? 0,
  };
}

/** A deterministic "random" that always takes the first option. */
const first = () => 0;
/** Never grazes: above GRAZE_CHANCE, so a calm sheep stays put. */
const never = () => 0.99;

describe('a sheep decides to bolt', () => {
  it('is spooked by a rabbit within the panic radius', () => {
    const sheep = { id: 's', x: 5, y: 5 };
    expect(isSpooked(sheep, [toIndex(5 + PANIC_RADIUS, 5)])).toBe(true);
    expect(isSpooked(sheep, [toIndex(5 + PANIC_RADIUS + 1, 5)])).toBe(false);
  });

  it('measures distance in MOVES, not in crow flight', () => {
    // The island steps diagonally, so (1,1) away is one move, not 1.41.
    expect(cellDistance(0, 0, 1, 1)).toBe(1);
    expect(cellDistance(0, 0, 3, 1)).toBe(3);
  });

  it('ignores a rabbit that is nowhere near', () => {
    expect(isSpooked({ id: 's', x: 0, y: 0 }, [toIndex(9, 9)])).toBe(false);
  });
});

describe('a calm sheep', () => {
  it('grazes only sometimes, so a flock drifts rather than marches', () => {
    const g = ground(['0,0', '1,0']);
    expect(planFlight({ id: 's', x: 0, y: 0 }, g, false, never)).toBeNull();
    expect(planFlight({ id: 's', x: 0, y: 0 }, g, false, first)).not.toBeNull();
    // The dial is the one the old `wander` used.
    expect(GRAZE_CHANCE).toBeGreaterThan(0);
    expect(GRAZE_CHANCE).toBeLessThan(1);
  });

  it('moves exactly one cell', () => {
    const g = ground(['0,0', '1,0', '2,0', '3,0']);
    const flight = planFlight({ id: 's', x: 0, y: 0 }, g, false, first);
    expect(cellDistance(0, 0, flight!.to.x, flight!.to.y)).toBe(1);
    expect(flight!.sprinting).toBe(false);
  });

  it('stays on its own shelf while grazing', () => {
    // The only neighbour is one tier up: a grazing sheep does not climb.
    const g = ground(['0,0', '1,0'], { tiers: { '1,0': 1 } });
    expect(planFlight({ id: 's', x: 0, y: 0 }, g, false, first)).toBeNull();
  });
});

describe('a spooked sheep', () => {
  it('sprints several cells, not one', () => {
    const g = ground(['0,0', '1,0', '2,0', '3,0', '4,0', '5,0']);
    const flight = planFlight({ id: 's', x: 0, y: 0 }, g, true, first);
    expect(flight!.sprinting).toBe(true);
    expect(cellDistance(0, 0, flight!.to.x, flight!.to.y)).toBe(SPRINT_STEPS);
  });

  /**
   * THE rule. A sheep blocks its cell, so one that cannot leave a dead end is
   * a permanent wall across whatever is behind it.
   */
  it('climbs out of a dead end rather than staying to block it', () => {
    // A pocket with exactly one exit, and that exit is a tier up.
    const g = ground(['0,0', '1,0'], { tiers: { '1,0': 1 } });
    const flight = planFlight({ id: 's', x: 0, y: 0 }, g, true, first);
    expect(flight).not.toBeNull();
    expect(flight!.to).toEqual({ x: 1, y: 0 });
  });

  it('prefers its own shelf when the shelf still has somewhere to go', () => {
    // Two exits from the start: one level, one up. A sprint of one step has to
    // take the level one.
    //
    // Checked with SPRINT_STEPS forced to a single step, because over four the
    // sheep legitimately exhausts its own shelf and then climbs — which is
    // rule 4 working, not the preference failing. The preference is about
    // which cell is picked while a choice exists, and that is a per-step
    // question.
    const g = ground(['0,0', '1,0', '0,1'], { tiers: { '1,0': 1 } });
    const oneStep = planFlight({ id: 's', x: 0, y: 0 }, g, false, () => 0);
    expect(oneStep).not.toBeNull();
    expect(g.tierAt(oneStep!.to.x, oneStep!.to.y)).toBe(0);
  });

  it('does not walk through another occupant', () => {
    const g = ground(['0,0', '1,0'], { taken: ['1,0'] });
    expect(planFlight({ id: 's', x: 0, y: 0 }, g, true, first)).toBeNull();
  });

  it('stands still only when walled in on every side', () => {
    // A single cell with no neighbours at all: nothing to plan.
    const g = ground(['0,0']);
    expect(planFlight({ id: 's', x: 0, y: 0 }, g, true, first)).toBeNull();
  });
});

describe('a flock', () => {
  it('never sends two sheep to the same cell', () => {
    // Both sheep can only reach '1,0'. The first claims it; the second must
    // find that it is taken.
    const claimed = new Set<string>();
    const g: Ground = {
      ...ground(['0,0', '1,0', '2,0']),
      isFree: (x, y) => !claimed.has(`${x},${y}`),
    };
    const flights = planFlock(
      [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 2, y: 0 }],
      g,
      [toIndex(0, 1)],
      first,
      (from, to) => {
        claimed.add(`${to.x},${to.y}`);
        claimed.delete(`${from.x},${from.y}`);
      },
    );
    const destinations = flights.map((f) => `${f.to.x},${f.to.y}`);
    expect(new Set(destinations).size).toBe(destinations.length);
  });

  it('leaves the unspooked ones alone', () => {
    const g = ground(['0,0', '1,0', '9,9', '8,9']);
    // Only the sheep at the origin has a rabbit near it.
    const flights = planFlock(
      [{ id: 'near', x: 0, y: 0 }, { id: 'far', x: 9, y: 9 }],
      g,
      [toIndex(1, 1)],
      never,
      () => {},
    );
    expect(flights.map((f) => f.id)).toEqual(['near']);
  });
});

/**
 * The half that cannot be got wrong quietly.
 *
 * A sheep BLOCKS its cell. The moment it moves, its position stops being a
 * function of the seed — and if the server does not own and broadcast it, two
 * browsers drift apart and disagree about which moves are legal. The player
 * sees a move refused for no visible reason, which is the worst kind of bug:
 * it looks like the game cheating.
 *
 * Source-read, because the wiring is what matters here and standing up a
 * socket, a store and two clients to assert it would test the harness.
 */
describe('the server owns the flock', () => {
  const STORE = read('../server/islands/store.ts');
  const SERVER = read('../server/index.ts');
  const RUN = read('../src/lib/game/run.ts');

  it('keeps the live positions on the island, not in the seed', () => {
    expect(STORE).toMatch(/sheep: Map<string, \{ x: number; y: number \}>/);
    // Seeded from the terrain, then owned: the seed is a starting point.
    expect(STORE).toMatch(/p\.kind === 'sheep'/);
  });

  it('ticks the flock and tells the room', () => {
    expect(SERVER).toMatch(/setInterval\(guard\('flock'/);
    expect(SERVER).toMatch(/emit\('sheep_moved'/);
  });

  it('sends the current flock to whoever joins mid-run', () => {
    // A stale flock is a stale set of legal moves.
    expect(SERVER).toMatch(/sheep: \[\.\.\.live\.sheep\]/);
  });

  it('refuses a step onto a tile the flock is standing on', () => {
    // Without this the server waves a rabbit onto a cell it has just told
    // everyone a sheep occupies.
    expect(RUN).toMatch(/blocked\?: ReadonlySet<number>/);
    expect(SERVER).toMatch(/const sheepTiles = new Set/);
  });

  it('frees the cell a sheep leaves, in the same breath as claiming the new one', () => {
    // Otherwise a flock walls itself in behind the ghosts of where it stood.
    expect(SERVER).toMatch(/occupied\.delete\(`\$\{from\.x\},\$\{from\.y\}`\)/);
    expect(SERVER).toMatch(/occupied\.add\(`\$\{to\.x\},\$\{to\.y\}`\)/);
  });

  it('leaves the client playing what it is told, with no rules of its own', () => {
    const SCENE = read('../src/game/scenes/IslandScene.ts');
    expect(SCENE).toMatch(/moveSheep\(id: string, tile: number/);
    // The flight rules must not be imported client-side.
    expect(SCENE).not.toMatch(/planFlight|planFlock/);
  });
});

/**
 * A sheep that WALKS rather than blinks.
 *
 * The flight rules were right long before the sheep looked right: a sprint
 * crossed up to four cells and the wire carried only the last one, so the
 * flock jumped between cells instead of running between them. The route is the
 * fix, and these are the two halves of it — the planner has to report every
 * cell, and the client has to be handed them.
 */
describe('a sheep walks the cells it crossed', () => {
  it('reports a graze as the single cell it stepped to', () => {
    const g = ground(['0,0', '1,0', '0,1', '1,1']);
    const flight = planFlight({ id: 's', x: 0, y: 0 }, g, false, first);
    expect(flight?.path).toEqual([flight!.to]);
  });

  it('goes as far as the budget allows, instead of milling about', () => {
    // The bug this replaced: four random steps in a row, each merely forbidden
    // from retracing, curl around themselves — on open ground that landed the
    // sheep 1 cell from home 17% of the time and the full 4 only 11%, after
    // visibly running the whole way. A bolt has to end up somewhere.
    const open: string[] = [];
    for (let x = 0; x < 21; x++) for (let y = 0; y < 21; y++) open.push(`${x},${y}`);
    const g = ground(open);
    for (let run = 0; run < 200; run++) {
      const flight = planFlight({ id: 's', x: 10, y: 10 }, g, true, Math.random)!;
      expect(cellDistance(10, 10, flight.to.x, flight.to.y)).toBe(SPRINT_STEPS);
      // And by the shortest route: one cell of progress per cell walked.
      expect(flight.path.length).toBe(SPRINT_STEPS);
    }
  });

  it('settles for the furthest cell it CAN reach when hemmed in', () => {
    // A stub two cells long: the budget is four, the terrain offers two, and
    // the sheep must take the two rather than refuse to move.
    const flight = planFlight(
      { id: 's', x: 0, y: 0 },
      ground(['0,0', '1,0', '2,0']),
      true,
      first,
    );
    expect(flight?.to).toEqual({ x: 2, y: 0 });
    expect(flight?.path).toHaveLength(2);
  });

  it('reports every cell of a sprint, in order, ending where it stops', () => {
    // A corridor: the only way out is east, so the route is forced and can be
    // asserted exactly rather than merely counted.
    const open = ['0,0', '1,0', '2,0', '3,0', '4,0'];
    const flight = planFlight({ id: 's', x: 0, y: 0 }, ground(open), true, first);
    expect(flight?.sprinting).toBe(true);
    expect(flight?.path).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 },
    ]);
    // The endpoint is still reported on its own — the board and the blocking
    // set only ever want where it ended up.
    expect(flight?.to).toEqual({ x: 4, y: 0 });
  });

  it('never reports a path longer than a sprint, nor one that starts where it stood', () => {
    const open: string[] = [];
    for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) open.push(`${x},${y}`);
    const flight = planFlight({ id: 's', x: 4, y: 4 }, ground(open), true, Math.random);
    expect(flight!.path.length).toBeLessThanOrEqual(SPRINT_STEPS);
    // Excluding the origin is what lets the client treat each entry as "a cell
    // to cross"; including it would stall the first stride.
    expect(flight!.path).not.toContainEqual(flight!.from);
    expect(flight!.path.at(-1)).toEqual(flight!.to);
  });

  it('every step of a path is adjacent to the one before it', () => {
    // The client tweens straight between consecutive entries, so a gap in the
    // route is a sheep sliding across cells it never visited.
    const open: string[] = [];
    for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) open.push(`${x},${y}`);
    for (let run = 0; run < 50; run++) {
      const flight = planFlight({ id: 's', x: 4, y: 4 }, ground(open), true, Math.random);
      if (!flight) continue;
      let prev = flight.from;
      for (const cell of flight.path) {
        expect(cellDistance(prev.x, prev.y, cell.x, cell.y)).toBe(1);
        prev = cell;
      }
    }
  });

  it('plays the bounce sheet while bolting and the idle sheet otherwise', () => {
    // Half the flock used to be scattered onto the bounce sheet permanently,
    // so it hopped on the spot while grazing while the other half slid around
    // without lifting a hoof. The sheet is what the sheep is DOING.
    const VIEW = read('../src/game/island/IsoIslandView.ts');
    expect(VIEW).toMatch(/graze: 'sheepIdle'/);
    expect(VIEW).toMatch(/bolt: 'sheepBounce'/);
    // Chosen from the order, and dropped again when the sheep arrives.
    expect(VIEW).toMatch(/setGait\(entry, sprinting \? 'bolt' : 'graze'\)/);
    expect(VIEW).toMatch(/setGait\(entry, 'graze'\)/);
  });

  it('never scatters a sheep onto the bolting sheet at spawn', () => {
    // It would hop in place for the whole run without going anywhere.
    const VIEW = read('../src/game/island/IsoIslandView.ts');
    expect(VIEW).not.toMatch(/kind: 'sheepBounce', weight/);
    expect(VIEW).toMatch(/\? \(\['sheepIdle'\] as const\)/);
  });

  it('puts the route on the wire and walks it on the client', () => {
    const SERVER = read('../server/index.ts');
    // The endpoint alone is what made it teleport.
    expect(SERVER).toMatch(/path: f\.path\.map/);

    const SCENE = read('../src/game/scenes/IslandScene.ts');
    expect(SCENE).toMatch(/walkSheep\(id: string, tiles: readonly number\[\]/);
    // Still no rules client-side: it plays the route it is given.
    expect(SCENE).not.toMatch(/planFlight|planFlock/);

    const VIEW = read('../src/game/island/IsoIslandView.ts');
    expect(VIEW).toMatch(/walkOccupant\(/);
  });

  it('drops a walk in progress when the flock is placed outright', () => {
    // The snapshot and the rebuild both SNAP, and a walk left running would
    // keep drawing the sprite along its old route — quietly overriding the
    // cell just written, one frame later.
    const VIEW = read('../src/game/island/IsoIslandView.ts');
    expect(VIEW).toMatch(/placeOccupant\([\s\S]*?entry\.walk = undefined/);
    const BG = read('../src/game/services/TerrainBackground.ts');
    expect(BG).toMatch(/moveSheep\(id, x, y\) \{[\s\S]*?island\.placeOccupant/);
  });

  it('claims the destination cell immediately, not when the walk lands', () => {
    // A sheep whose cell only updated on arrival would leave a walkable hole
    // the server had already closed, and the ring would offer a tile the
    // server then refuses.
    const VIEW = read('../src/game/island/IsoIslandView.ts');
    expect(VIEW).toMatch(/entry\.occupant\.x = last\.x/);
    const SCENE = read('../src/game/scenes/IslandScene.ts');
    expect(SCENE).toMatch(/this\.sheepTiles\.set\(id, last\)/);
  });
});
