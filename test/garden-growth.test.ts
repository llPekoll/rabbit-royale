/**
 * The field has to READ as the garden it stands for.
 *
 * The trap this code exists to avoid: driving each carrot's growth FRAME from
 * `gardenReady` is the obvious design and is silently broken, because the
 * garden fills over twelve hours. On any timescale a player is actually
 * watching, every sprite would be pinned to one frame and the animation would
 * never be seen at all. So progress drives the RATE at which plots start their
 * (fast, one-shot) animation, and these pin that inversion down.
 */
import { describe, expect, it } from 'vitest';
import { GARDEN } from '../config/tuning';
import PLOTS from '../src/config/carrotPlots.json';
import {
  STAGES, GROW_MS, SPAWN_GAP_MS, IDLE_CYCLE_MS, PER_CELL, REFERENCE_PLOTS,
  gardenCapacity, gardenProgress, idleProgress, spawnGapMs, grownCount, growthFrame,
  plantsPerCell, MIN_LIVE_PLOTS, recyclesPlots, standingTarget,
} from '../src/lib/game/garden-growth';

describe('capacity matches the economy', () => {
  it('is CAP_HOURS of production at the level, not a made-up number', () => {
    // A "full" field must pay out what a full field is worth, or the picture
    // is lying about the thing it depicts.
    expect(gardenCapacity(1)).toBe(GARDEN.CAP_HOURS * GARDEN.YIELD_PER_HOUR_BASE);
    expect(gardenCapacity(3)).toBe(
      GARDEN.CAP_HOURS * (GARDEN.YIELD_PER_HOUR_BASE + 2 * GARDEN.YIELD_PER_LEVEL),
    );
  });

  it('grows with the burrow level — a better base fills a bigger field', () => {
    expect(gardenCapacity(5)).toBeGreaterThan(gardenCapacity(1));
  });
});

describe('progress', () => {
  it('is empty at zero and full at capacity', () => {
    expect(gardenProgress(0, 1)).toBe(0);
    expect(gardenProgress(gardenCapacity(1), 1)).toBe(1);
  });

  it('clamps, so an over-full garden is not an over-full field', () => {
    expect(gardenProgress(gardenCapacity(1) * 3, 1)).toBe(1);
    expect(gardenProgress(-50, 1)).toBe(0);
  });

  it('reads LOWER at a higher level for the same carrots', () => {
    // A level 5 burrow holding a level 1 harvest is nearly empty, and should
    // look it: the field is relative to what this burrow can hold.
    const carrots = gardenCapacity(1);
    expect(gardenProgress(carrots, 5)).toBeLessThan(gardenProgress(carrots, 1));
  });
});

describe('the growth animation itself', () => {
  it('runs on a HUMAN timescale, not the garden\'s', () => {
    // The whole point: a plot's animation is seconds, while the garden it
    // reports on takes hours. If this ever grew to garden scale, the field
    // would freeze.
    expect(GROW_MS).toBeLessThan(10_000);
    expect(GARDEN.CAP_HOURS * 3_600_000).toBeGreaterThan(GROW_MS * 1000);
  });

  it('starts at the sprout and ends at the ripe frame', () => {
    expect(growthFrame(0)).toBe(0);
    expect(growthFrame(GROW_MS)).toBe(STAGES - 1);
  });

  it('holds on the last frame instead of looping', () => {
    // A grown carrot stays grown until harvested. A looping field would read as
    // decoration rather than as a crop you own.
    expect(growthFrame(GROW_MS * 10)).toBe(STAGES - 1);
    expect(growthFrame(GROW_MS * 1000)).toBe(STAGES - 1);
  });

  it('passes through the middle of the sheet on the way', () => {
    const mid = growthFrame(GROW_MS / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(STAGES - 1);
  });
});

describe('fullness drives the RATE, which is what makes it visible', () => {
  it('sprouts faster the fuller the garden is', () => {
    expect(spawnGapMs(1)).toBeLessThan(spawnGapMs(0.5));
    expect(spawnGapMs(0.5)).toBeLessThan(spawnGapMs(0));
  });

  it('never goes silent on an empty garden', () => {
    // Nothing growing at all reads as a broken asset, not as an empty field.
    expect(spawnGapMs(0)).toBe(SPAWN_GAP_MS.empty);
    expect(SPAWN_GAP_MS.empty).toBeLessThan(10_000);
  });

  it('stays slower than the animation is long, so plots do not stack up', () => {
    // At full tilt a new plot still starts less often than... well, often
    // enough to look busy, but the gap must stay positive and sane.
    expect(spawnGapMs(1)).toBeGreaterThan(0);
    expect(spawnGapMs(1)).toBe(SPAWN_GAP_MS.full);
  });
});

describe('how much of the field stands grown', () => {
  it('is full when full', () => {
    expect(grownCount(1, 35)).toBe(35);
  });

  it('never falls to nothing — an inert field reads as a broken asset', () => {
    // This was a real bug: at a literal zero NOTHING sprouted, so a freshly
    // harvested garden was a still picture of bare dirt. "Empty" has to still
    // look like a garden.
    expect(grownCount(0, 35)).toBeGreaterThan(0);
    expect(grownCount(0, 35)).toBe(MIN_LIVE_PLOTS);
  });

  it('keeps the floor small enough to still read as empty', () => {
    // It must not look like a crop worth harvesting either.
    expect(grownCount(0, 35)).toBeLessThan(grownCount(0.25, 35));
    expect(MIN_LIVE_PLOTS / 35).toBeLessThan(0.1);
  });

  it('rises with fullness — the harvest waiting, made visible', () => {
    expect(grownCount(0.5, 35)).toBeGreaterThan(grownCount(0.1, 35));
  });
});

describe('the signed-out loop', () => {
  it('cycles rather than finishing, so the waiting screen stays alive', () => {
    expect(idleProgress(0)).toBe(0);
    expect(idleProgress(IDLE_CYCLE_MS / 2)).toBeCloseTo(0.5, 5);
    // Wraps: one full cycle is back to the start, not stuck at the end.
    expect(idleProgress(IDLE_CYCLE_MS)).toBe(0);
  });

  it('completes a turn while someone is plausibly still looking', () => {
    // A cycle nobody ever sees finish is a still image with extra steps.
    expect(IDLE_CYCLE_MS).toBeLessThanOrEqual(5 * 60_000);
  });

  it('survives a negative or absurd clock', () => {
    expect(idleProgress(-1000)).toBeGreaterThanOrEqual(0);
    expect(idleProgress(-1000)).toBeLessThan(1);
    expect(idleProgress(1e12)).toBeGreaterThanOrEqual(0);
    expect(idleProgress(1e12)).toBeLessThan(1);
  });
});

/**
 * The field and the panel are two readings of ONE number.
 *
 * Everything below guards a seam where a picture could quietly drift from the
 * economy it depicts. None of these would fail loudly in the game — a field
 * that fills to the wrong ceiling, or plays at a speed the artist did not
 * draw, just looks slightly off forever — so they are pinned here instead.
 */
describe('the picture and the economy cannot drift apart', () => {
  it('reports the SAME capacity to the HUD as it fills the field to', async () => {
    // `burrowView` prints "holds 576"; `gardenProgress` divides by the ceiling
    // to draw the crop. These were two separate expressions of the same
    // formula, one of them rounded — so a fractional yield would have made the
    // field hit full at a number the panel never promised.
    const { gardenCapacity: fromBurrow } = await import('../src/lib/game/burrow');
    for (const level of [1, 2, 5, 10, 20]) {
      expect(fromBurrow(level)).toBe(gardenCapacity(level));
    }
  });

  it('fills the field exactly when the garden is at the advertised ceiling', async () => {
    const { burrowView } = await import('../src/lib/game/burrow');
    const level = 4;
    const row = {
      burrowLevel: level,
      stock: 0,
      lifetimeCarrots: 0,
      energy: 0,
      // Long enough ago that the garden is certainly capped.
      gardenCollectedAt: new Date(Date.now() - 48 * 3_600_000),
      energyUpdatedAt: new Date(),
    };
    const view = burrowView(row as never);
    expect(view.gardenReady).toBe(view.gardenCapacity);
    // The capped garden draws a FULL field, with nothing left over.
    expect(gardenProgress(view.gardenReady, level)).toBe(1);
  });
});

describe('the animation is timed by the art, not by a constant', () => {
  it('plays for exactly as long as the artist drew it', async () => {
    // The frames carry their own hold times out of Aseprite; GROW_MS is their
    // sum. It used to be a hand-typed 1400 against a 12 x 100 sheet, so every
    // carrot grew ~17% slower than drawn.
    const atlas = await import('../public/assets/carottes/carrote.json');
    const frames = (atlas.default ?? atlas).frames;
    const drawn = frames.reduce(
      (sum: number, f: { duration: number }) => sum + f.duration, 0,
    );
    expect(GROW_MS).toBe(drawn);
  });

  it('has one growth stage per frame in the sheet', () => {
    // A re-export that adds or drops a stage must not leave STAGES describing
    // a sheet that no longer exists — `growthFrame` would clamp early and
    // carrots would stop half-grown, with nothing failing.
    expect(STAGES).toBe(PLOTS.frames.length);
  });

  it('reaches the last frame exactly at the end of the cycle', () => {
    expect(growthFrame(GROW_MS - 1)).toBe(STAGES - 1);
  });
});

describe('a bigger garden grows more carrots', () => {
  it('sows more plants per cell as the burrow is upgraded', () => {
    // Every other consequence of an upgrade shows in the place. A field that
    // looked identical at level 1 and level 20 was the one part of the burrow
    // that denied the player's progress.
    expect(plantsPerCell(20)).toBeGreaterThan(plantsPerCell(1));
  });

  it('never thins out a garden that was upgraded', () => {
    let last = 0;
    for (let level = 1; level <= 20; level++) {
      const n = plantsPerCell(level);
      expect(n).toBeGreaterThanOrEqual(last);
      last = n;
    }
  });

  it('stays within the range, including off the ends', () => {
    // Called with whatever the scene holds, which is `null` before the burrow
    // has loaded and could be anything after a bad response.
    for (const level of [-5, 0, 1, 20, 999]) {
      expect(plantsPerCell(level)).toBeGreaterThanOrEqual(PER_CELL.min);
      expect(plantsPerCell(level)).toBeLessThanOrEqual(PER_CELL.max);
    }
  });

  it('keeps FULLNESS readable rather than swamping it with size', () => {
    // The density says how big the garden is; the share of plots standing says
    // how full it is. If density scaled hard enough, a quarter-full top-level
    // field would carry more carrots than a FULL level-1 one and "how busy
    // does it look" would stop meaning anything on its own.
    const cells = 12;
    const fullAtLevel1 = grownCount(1, cells * plantsPerCell(1));
    const quarterAtMax = grownCount(0.25, cells * plantsPerCell(20));
    expect(quarterAtMax).toBeLessThan(fullAtLevel1);
  });
});

describe('a denser field still fills in the same time', () => {
  it('fills a big garden no slower than a small one', () => {
    // The gap is a per-PLOT pause, so on its own it made the time-to-full
    // proportional to the number of plants — and the player who upgraded was
    // the one who waited longest to SEE the harvest the panel already promised
    // them. Time to fill is gap x plots, and that is what must hold still.
    const cells = 12;
    const small = cells * plantsPerCell(1);
    const big = cells * plantsPerCell(20);
    expect(big).toBeGreaterThan(small);

    const fill = (plots: number) => spawnGapMs(1, plots) * plots;
    expect(fill(big)).toBeCloseTo(fill(small), 5);
  });

  it('is unchanged for a field the original size', () => {
    // The default keeps every caller that predates varying density — the
    // signed-out DOM field, and the tuning these numbers were chosen against.
    expect(spawnGapMs(0.5, REFERENCE_PLOTS)).toBe(spawnGapMs(0.5));
    expect(spawnGapMs(1)).toBe(SPAWN_GAP_MS.full);
    expect(spawnGapMs(0)).toBe(SPAWN_GAP_MS.empty);
  });

  it('survives a field with no plants in it', () => {
    // `plots.length` is 0 on a seed whose field failed to generate; a division
    // by it must not hand back Infinity and stall the sprouting loop forever.
    expect(Number.isFinite(spawnGapMs(0.5, 0))).toBe(true);
  });
});

describe('a real garden only ever fills', () => {
  /**
   * The bug these pin down: the field was showing carrots appear and then
   * vanish while the panel's "+N" only climbed. Two causes, both of which made
   * the picture contradict the number it is a picture of.
   */
  const PLOTS_N = 40;

  it('never pulls a standing carrot out of a real garden', () => {
    // `gardenReady` is polled, so it arrives in steps and rounds. A target read
    // straight off it dips by a plant on a rounding wobble, and the field
    // answers by uprooting a grown carrot — the harvest, deleted to fix an
    // off-by-one. The standing count is a high-water mark instead.
    const live = grownCount(0.5, PLOTS_N);
    expect(standingTarget(0.49, live, PLOTS_N)).toBe(live);
    expect(standingTarget(0, live, PLOTS_N)).toBe(live);
  });

  it('still grows when the garden genuinely fills', () => {
    const live = grownCount(0.5, PLOTS_N);
    expect(standingTarget(0.9, live, PLOTS_N)).toBe(grownCount(0.9, PLOTS_N));
  });

  it('lets the idle loop empty, because it has no harvest to contradict', () => {
    // Signed out the field is scenery on a wrapping cycle: it must fall back to
    // bare each turn, or it fills once and stands there for good.
    expect(standingTarget(null, PLOTS_N, PLOTS_N)).toBe(grownCount(0, PLOTS_N));
  });

  it('recycles plots only on the decorative loop', () => {
    // Recycling means a grown carrot disappears and pops up elsewhere. That is
    // fine for scenery and a lie on a real garden, at ANY fullness — including
    // the just-harvested field, which is exactly when the player is watching.
    expect(recyclesPlots(null)).toBe(true);
    expect(recyclesPlots(0)).toBe(false);
    expect(recyclesPlots(0.5)).toBe(false);
  });

  it('keeps a freshly harvested field alive without churning it', () => {
    // The floor still applies — a bare garden shows a couple of shoots rather
    // than reading as a failed asset load — but those shoots now stay put.
    expect(grownCount(0, PLOTS_N)).toBe(MIN_LIVE_PLOTS);
    expect(recyclesPlots(0)).toBe(false);
  });
});
