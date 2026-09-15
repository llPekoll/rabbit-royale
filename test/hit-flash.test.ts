/**
 * The hit flash's schedule.
 *
 * The rabbit blinks white when a bomb goes off under it, and the effect is
 * driven by one clock tween whose rendered state is a pure function of that
 * clock. This pins the function, because the two shapes it replaced both failed
 * INVISIBLY and neither was catchable by screenshot — a blink is shorter than a
 * capture is reliable:
 *
 *   - `tl.to({}, { duration })` used as a spacer tweens no property, so GSAP
 *     folds it to zero: every blink fired on the same frame and the effect read
 *     as a single flash however high `times` went.
 *   - `.call()`s positioned around a parallel spacer fired in an order that set
 *     the filter and never cleared it, so the rabbit latched to white for the
 *     whole tween.
 *
 * Both produced "a flash happens", which is exactly what a screenshot can
 * confirm and exactly what a person looking at it would report. The thing that
 * separates them from the real effect is the COUNT and the DUTY CYCLE, so that
 * is what is asserted here.
 */
import { describe, expect, it } from 'vitest';
import { blinkOutVisibleAt, flashOnAt } from '../src/game/fx/Blast';

/** The defaults `hitFlash` ships with. */
const ON = 0.05;
const OFF = 0.06;

/** Sample one blink's worth of clock at `n` even steps. */
function sample(from: number, to: number, n: number): boolean[] {
  return Array.from({ length: n }, (_, i) => flashOnAt(from + ((to - from) * i) / n, ON, OFF));
}

describe('the hit flash blinks, rather than latching on', () => {
  it('is white at the start of every blink and clear by its end', () => {
    for (let i = 0; i < 6; i++) {
      expect(flashOnAt(i, ON, OFF), `blink ${i} starts white`).toBe(true);
      // Just before the next blink begins, the sprite must be back to normal —
      // this is the assertion the latched-on version failed.
      expect(flashOnAt(i + 0.99, ON, OFF), `blink ${i} ends clear`).toBe(false);
    }
  });

  it('turns over once per unit of clock, so `times` really is the count', () => {
    // Count rising edges across six blinks, the way an eye counts them.
    const seen = sample(0, 6, 6 * 200);
    let edges = 0;
    for (let i = 1; i < seen.length; i++) if (seen[i] && !seen[i - 1]) edges++;
    // The first sample starts already-white, so it is an edge the loop cannot
    // see; five more follow.
    expect(seen[0]).toBe(true);
    expect(edges).toBe(5);
  });

  it('holds white for the on-fraction of each blink, not all of it', () => {
    const seen = sample(0, 1, 1000);
    const white = seen.filter(Boolean).length / seen.length;
    // 0.05 on / 0.11 total ≈ 0.4545. The collapsed version gave ~1 (always on
    // once set) and the folded one gave a single frame out of the whole tween.
    expect(white).toBeCloseTo(ON / (ON + OFF), 2);
  });

  it('scales its rate with the on/off pair rather than the blink count', () => {
    // A longer `off` makes the same blink index dimmer for longer — this is
    // what the story's `blinks` control leans on when it is turned up.
    expect(flashOnAt(0.5, ON, OFF)).toBe(false);
    expect(flashOnAt(0.5, ON, 0.01)).toBe(true);
  });
});

/**
 * The exit flicker.
 *
 * Same class of effect as the flash and the same reason for pinning it: the
 * toggling outruns a screenshot, so "it blinks" is all a capture can report and
 * "it blinks FASTER as it goes" is the part that carries the meaning.
 */
describe('the rabbit flickers out rather than vanishing', () => {
  it('starts visible and ends hidden', () => {
    expect(blinkOutVisibleAt(0)).toBe(true);
    // The tween also hard-sets `visible = false` on complete; this pins that
    // the curve is already arriving there rather than being yanked.
    expect(blinkOutVisibleAt(1)).toBe(false);
  });

  it('accelerates: the second half toggles more than the first', () => {
    const count = (from: number, to: number) => {
      let edges = 0;
      let prev = blinkOutVisibleAt(from);
      for (let i = 1; i <= 500; i++) {
        const v = blinkOutVisibleAt(from + ((to - from) * i) / 500);
        if (v !== prev) edges++;
        prev = v;
      }
      return edges;
    };
    const early = count(0, 0.5);
    const late = count(0.5, 1);
    expect(late).toBeGreaterThan(early);
  });

  it('blinks enough times to read as a flicker, not as one cut', () => {
    let edges = 0;
    let prev = blinkOutVisibleAt(0);
    for (let i = 1; i <= 2000; i++) {
      const v = blinkOutVisibleAt(i / 2000);
      if (v !== prev) edges++;
      prev = v;
    }
    // Fifteen blinks across the exit — odd, so it opens visible and lands
    // hidden without the tween having to cut it.
    expect(edges).toBe(15);
  });
});
