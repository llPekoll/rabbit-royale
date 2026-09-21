/**
 * The shelf's drag gesture.
 *
 * What is pinned here is the one rule the pixels depend on: a drag must eat
 * the click it spawns, and must eat NOTHING else. Both halves have shipped
 * broken — capturing the pointer too early ate every purchase click, and then
 * arming the swallow with no way to disarm it ate every click after the first
 * drag that ended off the row. The second is why the shop could not buy
 * anything in any currency on 2026-09-21.
 */
import { describe, expect, it } from 'vitest';
import { DRAG_SLOP_PX, StallDrag } from '../src/components/stall-drag';

/** A press that travels `dx` and is released. Returns the machine. */
function drag(d: StallDrag, dx: number, left = 100) {
  d.down(0, left);
  d.move(dx);
  d.up();
  return d;
}

describe('a press that does not travel', () => {
  it('is a click, and is not swallowed', () => {
    const d = new StallDrag();
    d.down(0, 100);
    d.move(DRAG_SLOP_PX); // within the slop — still a click
    expect(d.dragging).toBe(false);
    d.up();
    expect(d.click()).toBe(false);
  });

  it('does not scroll the row', () => {
    const d = new StallDrag();
    d.down(0, 100);
    expect(d.move(DRAG_SLOP_PX)).toBeNull();
  });
});

describe('a press that travels', () => {
  it('becomes a drag and scrolls the row against the pointer', () => {
    const d = new StallDrag();
    d.down(0, 100);
    // Pulling right (+dx) scrolls the row left — the content follows the hand.
    expect(d.move(DRAG_SLOP_PX + 10)).toBe(100 - (DRAG_SLOP_PX + 10));
    expect(d.dragging).toBe(true);
  });

  it('swallows exactly the one click it spawns', () => {
    const d = drag(new StallDrag(), 50);
    expect(d.click()).toBe(true);
    // The NEXT click is a real one and must reach the button.
    expect(d.click()).toBe(false);
  });
});

/**
 * THE REGRESSION. A drag released off the row fires no click, so the swallow
 * has to expire on its own. When it did not, `onClickCapture` sat above every
 * price button eating carrot, USDC, SOL and SKR purchases alike — one shared
 * button per card (`onClick={money ? onPayMoney : onBuy}`), so one latch broke
 * every rail at once, until the page was reloaded.
 */
describe('a drag that ends without a click', () => {
  it('does not leave the shelf deaf', () => {
    const d = drag(new StallDrag(), 50);
    expect(d.swallowing).toBe(true); // armed, waiting for a click…
    d.disarm();                      // …that never comes; the owner expires it
    expect(d.click()).toBe(false);   // the next real click gets through
  });

  it('still buys on the press after it', () => {
    const d = drag(new StallDrag(), 50);
    d.disarm();
    // A fresh press on a price button: no travel, so no swallow.
    d.down(0, 100);
    d.up();
    expect(d.click()).toBe(false);
  });
});
