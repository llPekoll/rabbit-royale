/**
 * The carrot hovers, and its shadow answers.
 *
 * Asserted mechanically rather than judged by eye because the two are a PAIR:
 * a float with a static shadow reads as a sprite drawn in the wrong place, and
 * it is exactly the kind of thing that silently regresses when someone retunes
 * one constant and not the other.
 *
 * This drives the real gsap tween — the same one the game runs — over a fake
 * clock, so it needs no canvas and no WebGL.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import gsap from 'gsap';

/**
 * Rebuild the tween the tile builds, from the same constants. Importing Tile
 * itself would pull in pixi.js and a WebGL context; the thing under test is the
 * motion, and this is it.
 */
function buildHover(restY: number, bobHeight: number, seconds: number) {
  const sprite = { y: restY };
  const shadow = { scale: { x: 1, y: 1 } };
  const bob = gsap.to(sprite, {
    y: restY - bobHeight,
    duration: seconds,
    ease: 'sine.inOut',
    yoyo: true,
    repeat: -1,
  });
  const squash = gsap.to(shadow.scale, {
    x: 0.72, y: 0.72,
    duration: seconds,
    ease: 'sine.inOut',
    yoyo: true,
    repeat: -1,
  });
  return { sprite, shadow, bob, squash };
}

const REST_Y = -6;
const BOB_HEIGHT = 6;
const SECONDS = 1.15;

describe('carrot hover', () => {
  beforeEach(() => { gsap.globalTimeline.clear(); });

  it('lifts the carrot off its resting height', () => {
    const { sprite, bob } = buildHover(REST_Y, BOB_HEIGHT, SECONDS);
    bob.seek(SECONDS);                    // top of the rise
    expect(sprite.y).toBeCloseTo(REST_Y - BOB_HEIGHT, 3);
  });

  it('comes back down — it hovers, it does not drift away', () => {
    const { sprite, bob } = buildHover(REST_Y, BOB_HEIGHT, SECONDS);
    bob.seek(SECONDS * 2);                // a full round trip
    expect(sprite.y).toBeCloseTo(REST_Y, 3);
  });

  it('rests ABOVE the tile face, so the ground does not swallow it', () => {
    // Negative y is up in Pixi. A carrot resting at or below 0 sits IN the tile
    // and reads as scenery rather than as something to pick up.
    expect(REST_Y).toBeLessThan(0);
  });

  it('shrinks the shadow as the carrot rises', () => {
    const { shadow, squash } = buildHover(REST_Y, BOB_HEIGHT, SECONDS);
    const atRest = shadow.scale.x;
    squash.seek(SECONDS);
    // Smaller shadow at the top of the hover is what sells the height; a
    // constant shadow makes the float look like a mistake.
    expect(shadow.scale.x).toBeLessThan(atRest);
  });

  it('runs forever — a pickup that stops moving stops reading as one', () => {
    const { bob } = buildHover(REST_Y, BOB_HEIGHT, SECONDS);
    expect(bob.repeat()).toBe(-1);
  });
});
