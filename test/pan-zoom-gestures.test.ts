/**
 * Tap, drag and pinch have to be told apart, or the board is unplayable in one
 * of two ways: a drag that hops the rabbit, or a tap that never moves it.
 *
 * Driven through a fake container that only knows `on`/`off`, so the
 * recogniser is tested as the pure state machine it is — no Pixi, no canvas.
 */
import { describe, expect, it, vi } from 'vitest';
import { PanZoomGestures, type PanZoomHandlers } from '../src/game/input/PanZoomGestures';
import type { Container } from 'pixi.js';

/** Just enough of a container to hang listeners on. */
function fakeTarget() {
  const listeners = new Map<string, Set<(e: unknown) => void>>();
  return {
    on(name: string, fn: (e: unknown) => void) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(fn);
      return this;
    },
    off(name: string, fn: (e: unknown) => void) {
      listeners.get(name)?.delete(fn);
      return this;
    },
    emit(name: string, e: unknown) {
      for (const fn of listeners.get(name) ?? []) fn(e);
    },
  };
}

/** A pointer event with only the fields the recogniser reads. */
const ev = (pointerId: number, x: number, y: number, extra: Record<string, unknown> = {}) => ({
  pointerId, global: { x, y }, pointerType: 'touch', button: 0, ...extra,
});

/** Screen px -> design px at a 2x fit, so the two spaces are told apart. */
const toDesign = (g: { x: number; y: number }) => ({ x: g.x / 2, y: g.y / 2 });

function setup() {
  const target = fakeTarget();
  const handlers: PanZoomHandlers = {
    onGestureStart: vi.fn(),
    onPan: vi.fn(),
    onPinch: vi.fn(),
    onTap: vi.fn(),
  };
  const g = new PanZoomGestures(target as unknown as Container, toDesign, handlers, { slopPx: 10 });
  g.attach();
  return { target, handlers, g };
}

describe('a tap', () => {
  it('fires once, on the release, at the release point in design px', () => {
    const { target, handlers } = setup();
    target.emit('pointerdown', ev(1, 100, 80));
    expect(handlers.onTap).not.toHaveBeenCalled();
    target.emit('pointerup', ev(1, 104, 82));
    expect(handlers.onTap).toHaveBeenCalledTimes(1);
    expect(handlers.onTap).toHaveBeenCalledWith({ x: 52, y: 41 });
    expect(handlers.onPan).not.toHaveBeenCalled();
  });

  it('survives a wobble inside the slop', () => {
    const { target, handlers } = setup();
    target.emit('pointerdown', ev(1, 100, 80));
    target.emit('globalpointermove', ev(1, 106, 84));
    target.emit('pointerup', ev(1, 106, 84));
    expect(handlers.onTap).toHaveBeenCalledTimes(1);
    expect(handlers.onPan).not.toHaveBeenCalled();
  });

  it('ignores a release for a pointer that never went down here', () => {
    // A press on a HUD button that lifts over the canvas.
    const { target, handlers } = setup();
    target.emit('pointerup', ev(7, 10, 10));
    expect(handlers.onTap).not.toHaveBeenCalled();
  });

  it('ignores every mouse button but the primary', () => {
    const { target, handlers } = setup();
    target.emit('pointerdown', ev(1, 100, 80, { pointerType: 'mouse', button: 2 }));
    target.emit('pointerup', ev(1, 100, 80, { pointerType: 'mouse', button: 2 }));
    expect(handlers.onTap).not.toHaveBeenCalled();
    expect(handlers.onGestureStart).not.toHaveBeenCalled();
  });
});

describe('a drag', () => {
  it('pans by the design-space delta once past the slop, and is never a tap', () => {
    const { target, handlers } = setup();
    target.emit('pointerdown', ev(1, 100, 100));
    expect(handlers.onGestureStart).toHaveBeenCalledTimes(1);
    // Inside the slop: nothing yet.
    target.emit('globalpointermove', ev(1, 105, 100));
    expect(handlers.onPan).not.toHaveBeenCalled();
    // Past it: the pan starts, measured from where the finger went DOWN.
    target.emit('globalpointermove', ev(1, 120, 100));
    expect(handlers.onPan).toHaveBeenLastCalledWith(10, 0);
    target.emit('globalpointermove', ev(1, 120, 140));
    expect(handlers.onPan).toHaveBeenLastCalledWith(0, 20);
    target.emit('pointerup', ev(1, 120, 140));
    expect(handlers.onTap).not.toHaveBeenCalled();
  });

  it('is still not a tap if the finger comes back to where it started', () => {
    const { target, handlers } = setup();
    target.emit('pointerdown', ev(1, 100, 100));
    target.emit('globalpointermove', ev(1, 160, 100));
    target.emit('globalpointermove', ev(1, 100, 100));
    target.emit('pointerup', ev(1, 100, 100));
    expect(handlers.onTap).not.toHaveBeenCalled();
  });

  it('keeps going when the pointer lifts outside the canvas', () => {
    const { target, handlers, g } = setup();
    target.emit('pointerdown', ev(1, 100, 100));
    target.emit('globalpointermove', ev(1, 160, 100));
    target.emit('pointerupoutside', ev(1, 200, 100));
    expect(g.active).toBe(false);
    expect(handlers.onTap).not.toHaveBeenCalled();
  });
});

describe('a pinch', () => {
  it('zooms by the ratio of the spacings, about the midpoint, in design px', () => {
    const { target, handlers } = setup();
    target.emit('pointerdown', ev(1, 100, 100));
    target.emit('pointerdown', ev(2, 200, 100));
    // Fingers 100px apart on screen (50 in design). Spread the second to 300.
    target.emit('globalpointermove', ev(2, 300, 100));
    expect(handlers.onPinch).toHaveBeenCalledTimes(1);
    const [factor, at] = (handlers.onPinch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(factor).toBeCloseTo(2, 5);
    // Midpoint after the move: screen (200, 100) -> design (100, 50).
    expect(at).toEqual({ x: 100, y: 50 });
    // And the midpoint travelled from design 75 to 100: a pan of 25.
    expect(handlers.onPan).toHaveBeenLastCalledWith(25, 0);
  });

  it('never ends in a tap, even if the second finger lifts at once', () => {
    const { target, handlers } = setup();
    target.emit('pointerdown', ev(1, 100, 100));
    target.emit('pointerdown', ev(2, 200, 100));
    target.emit('pointerup', ev(2, 200, 100));
    target.emit('pointerup', ev(1, 100, 100));
    expect(handlers.onTap).not.toHaveBeenCalled();
  });

  it('hands over to a one-finger pan when one finger lifts', () => {
    const { target, handlers } = setup();
    target.emit('pointerdown', ev(1, 100, 100));
    target.emit('pointerdown', ev(2, 200, 100));
    target.emit('pointerup', ev(2, 200, 100));
    target.emit('globalpointermove', ev(1, 140, 100));
    expect(handlers.onPan).toHaveBeenLastCalledWith(20, 0);
    expect(handlers.onPinch).not.toHaveBeenCalled();
  });
});

describe('teardown', () => {
  it('stops listening', () => {
    const { target, handlers, g } = setup();
    g.destroy();
    target.emit('pointerdown', ev(1, 100, 100));
    target.emit('pointerup', ev(1, 100, 100));
    expect(handlers.onTap).not.toHaveBeenCalled();
  });
});
