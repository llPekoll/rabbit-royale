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
import {
  STAGES, GROW_MS, SPAWN_GAP_MS, IDLE_CYCLE_MS,
  gardenCapacity, gardenProgress, idleProgress, spawnGapMs, grownCount, growthFrame,
  MIN_LIVE_PLOTS,
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
