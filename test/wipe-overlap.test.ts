/**
 * Two crossings that overlap must not wedge the game.
 *
 * This is the bug that made the burrow untappable, and it had no symptom at
 * all — no error, no log, nothing on screen. The board looked perfectly normal
 * and simply stopped answering taps, for the rest of the session.
 *
 * The mechanism, in three steps:
 *
 *  1. `to()` resolved its promise only from GSAP's `onComplete`.
 *  2. Every new tween killed the previous one — and `kill()` does NOT fire
 *     `onComplete`. `play()` opens with `set(1)`, which kills as well, so this
 *     needed no exotic timing: a second crossing started while one was still
 *     running was enough.
 *  3. The older `play()` was therefore stuck awaiting a promise that would
 *     never settle, so it never reached its own `finally` — and the shutter it
 *     was holding up never came down.
 *
 * The shutter is `eventMode: 'static'` on purpose (while it is up it must
 * swallow taps meant for the board behind it), and it is left at aperture 0,
 * fully open and so invisible. The result is a transparent, interactive sheet
 * parked over the whole game.
 *
 * "Tap into placement and straight back out" is a thing a player does, which is
 * why this was reproducible in seconds and invisible for days.
 *
 * These are behavioural assertions, not source greps: the failure is entirely
 * about promise settlement, and only running the thing shows it.
 *
 * Run against BOTH shutters. The curtain was written after this bug was found
 * and carries its own copy of the same settle-then-kill machinery — because
 * what has to settle a promise is whatever kills its tween, and that is three
 * different methods in each class. A second implementation of a fix is a second
 * chance to get it wrong, so both are put through the same three crossings.
 */
import { describe, expect, it, vi } from 'vitest';
import { Container, Graphics, Sprite, Texture } from 'pixi.js';

/**
 * The wipe reaches into Pixi for real textures and a renderer. None of that
 * matters to promise settlement, so the display objects are stubbed down to
 * the handful of members the two shutters touch.
 */
vi.mock('pixi.js', async () => {
  class FakeContainer {
    children: unknown[] = [];
    visible = true;
    eventMode = 'auto';
    zIndex = 0;
    label = '';
    addChild(...c: unknown[]) { this.children.push(...c); return c[0]; }
    destroy() {}
    setMask() {}
  }
  class FakeGraphics extends FakeContainer {
    clear() { return this; }
    rect() { return this; }
    fill() { return this; }
  }
  class FakeSprite extends FakeContainer {
    anchor = { set: () => {} };
    position = { set: () => {} };
    // The curtain masks with a gradient SPRITE and mirrors it by flipping the
    // x-scale, so the stub needs a real scale object rather than the bare
    // width/height the irises make do with.
    scale = { x: 1, y: 1 };
    width = 0; height = 0; x = 0; y = 0;
    texture: { width: number; height: number };
    constructor(t?: { width?: number; height?: number }) {
      super();
      // `draw()` sizes the hole from its own texture's aspect, so the stub has
      // to carry one — a zero would make the width NaN and hide real failures
      // behind arithmetic ones.
      this.texture = { width: t?.width ?? 64, height: t?.height ?? 64 };
    }
  }
  return {
    Container: FakeContainer,
    Graphics: FakeGraphics,
    Sprite: FakeSprite,
    Texture: class {
      width = 64; height = 64;
      source = { scaleMode: 'linear', addressMode: 'clamp-to-edge' };
      // The curtain builds its ramp from raw pixels at construction.
      static from() { return new this(); }
    },
  };
});

const { ShapeWipe } = await import('../src/game/fx/ShapeWipe');
const { CurtainWipe } = await import('../src/game/fx/CurtainWipe');

/** The shutter contract these tests care about — the part `Application` and
 *  `GameCanvas.wipeTo` rely on, and the part the bug broke. */
interface Shutter {
  view: { visible: boolean };
  play(midpoint: () => void | Promise<void>): Promise<void>;
}

const SHUTTERS: Array<[string, () => Shutter]> = [
  ['ShapeWipe', () => new ShapeWipe({
    width: 800,
    height: 600,
    texture: new (Texture as unknown as new () => Texture)(),
    openScale: 2.6,
  })],
  ['CurtainWipe', () => new CurtainWipe({ width: 800, height: 600 })],
];

describe.each(SHUTTERS)('overlapping crossings (%s)', (_name, makeWipe) => {
  it('settles the first crossing when a second interrupts it', async () => {
    const wipe = makeWipe();

    // One crossing in flight...
    const first = wipe.play(() => {});
    // ...and a second started before it finished, which is what a player does
    // by tapping into placement and straight back out.
    const second = wipe.play(() => {});

    // Neither may hang. Without the fix the first never settles at all, so
    // this times out rather than failing an assertion — which is itself the
    // shape of the bug.
    await expect(Promise.all([first, second])).resolves.toBeDefined();
  }, 10_000);

  it('leaves the shutter down once every crossing has finished', async () => {
    const wipe = makeWipe();

    const first = wipe.play(() => {});
    const second = wipe.play(() => {});
    await Promise.all([first, second]);

    // The whole point: an interactive sheet left visible is a game that cannot
    // be tapped.
    expect(wipe.view.visible).toBe(false);
  }, 10_000);

  it('still lowers the shutter when the midpoint throws', async () => {
    const wipe = makeWipe();

    await expect(wipe.play(() => { throw new Error('scene rebuild failed'); }))
      .rejects.toThrow('scene rebuild failed');

    // The error propagates — the caller should know the crossing failed — but
    // the shutter is not left holding the screen hostage over it.
    expect(wipe.view.visible).toBe(false);
  }, 10_000);
});
