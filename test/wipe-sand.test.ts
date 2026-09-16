/**
 * The sand dissolve: out to black, swap, back in — one scene at a time.
 *
 * The property worth pinning is that ONLY ONE SCENE IS EVER DRAWN. The black in
 * the middle is the floor of the stack showing through, not a sheet laid over
 * anything, so it exists only for as long as neither scene is on screen. Show
 * both at once and the dissolve stops going through black at all: the outgoing
 * one simply uncovers the incoming one, which is the `curtain`'s effect, not
 * this one.
 *
 * The filter-leak failure below was live, and it is not visible on a single
 * crossing — it needs two in a row, which is why it is pinned here rather than
 * left to the looping story that caught it.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('pixi.js', async () => {
  class FakeContainer {
    children: unknown[] = [];
    visible = true;
    eventMode = 'auto';
    zIndex = 0;
    label = '';
    filters: unknown[] = [];
    addChild(...c: unknown[]) { this.children.push(...c); return c[0]; }
    destroy() {}
  }
  return {
    Container: FakeContainer,
    Filter: class { resources = { dissolveUniforms: { uniforms: {} } }; },
    GlProgram: { from: () => ({}) },
  };
});

vi.mock('../src/game/fx/DissolveFilter', () => ({
  DissolveFilter: class { amount = 0; },
}));

const { SandWipe } = await import('../src/game/fx/SandWipe');
const { Container } = await import('pixi.js');

const make = () => new SandWipe({ width: 800, height: 600 });
const scene = () => new Container();

describe('the sand dissolve', () => {
  it('leaves the revealed scene on screen at the end', async () => {
    const wipe = make();
    const from = scene();
    const to = scene();

    wipe.stack({ from, to });
    // The swap is what hides scenes — the manager's `show` reveals the
    // destination and hides the rest. So the state that matters is the state
    // AFTER it has run, and that is what this checks.
    await wipe.play(() => { to.visible = false; from.visible = false; });

    // Whatever the swap did, the revealed scene is visible at the end and the
    // departed one is not.
    expect(to.visible).toBe(true);
    expect(from.visible).toBe(false);
  });

  it('shows one scene at a time, so the middle is actually black', async () => {
    // The black is the floor of the stack showing through. If both scenes are
    // ever visible together, the crumble uncovers the incoming one instead of
    // reaching black — the curtain's effect, not this one.
    const wipe = make();
    const from = scene();
    const to = scene();

    wipe.stack({ from, to });
    // At the turn — the instant the swap runs — the outgoing scene has fully
    // dissolved and the incoming one has not yet been put up.
    let bothAtTurn: boolean | null = null;
    await wipe.play(() => { bothAtTurn = from.visible && to.visible; });

    expect(bothAtTurn).toBe(false);
  });

  it('dissolves ONE scene, never both', async () => {
    // The bug: a crossing's `to` is the next crossing's `from`, so a filter
    // left behind arrives already attached. Both scenes then share the one
    // filter instance, the one `amount` drives both, and the screen goes to
    // black at the end of every pass.
    //
    // Reproduced through `stack` ALONE, with no `play` between the two — that
    // is what makes this a real test of the fix. A completed `play` ends in
    // `clear`, which strips the filter on its way out and so hides the leak
    // entirely: an earlier version of this test stacked, played, then stacked
    // again, and passed just as happily with the fix removed.
    //
    // Re-stacking without playing is not a contrived sequence, either: it is
    // what an interrupted crossing does, and `RandomWipe` stacks on every
    // single `play` before it knows whether the last one finished.
    const wipe = make();
    const burrow = scene();
    const island = scene();

    wipe.stack({ from: burrow, to: island });
    wipe.stack({ from: island, to: burrow });

    // The scene being dissolved carries the filter; the one being revealed
    // must be clean, or it dissolves along with it.
    expect(island.filters).toHaveLength(1);
    expect(burrow.filters).toHaveLength(0);
  });

  it('leaves no filter attached once the crossing is over', async () => {
    // A filter costs a render target and a full-screen pass every frame for as
    // long as it is attached. Left on, it would sit on whichever scene was last
    // departed for the rest of the session, doing nothing.
    const wipe = make();
    const from = scene();
    const to = scene();

    wipe.stack({ from, to });
    await wipe.play(() => {});

    // BOTH, because the filter moves from one scene to the other at the turn.
    expect(from.filters).toHaveLength(0);
    expect(to.filters).toHaveLength(0);
  });

  it('crosses bare rather than not at all when given no scenes', async () => {
    // Same rule as a missing silhouette: the change always happens, the
    // flourish is what is optional.
    const wipe = make();
    const swap = vi.fn();
    await wipe.play(swap);
    expect(swap).toHaveBeenCalledOnce();
  });

  it('swaps at the turn, under full black', async () => {
    // The swap belongs at the one instant nothing of either scene is drawn.
    // Earlier and the rebuild happens in view; later and the outgoing scene is
    // already coming back as the new one.
    const wipe = make();
    const from = scene();
    const to = scene();
    let amountAtSwap = -1;

    wipe.stack({ from, to });
    await wipe.play(() => { amountAtSwap = wipe.progress; });

    // 1 is fully dissolved: every pixel of the outgoing scene gone.
    expect(amountAtSwap).toBe(1);
  });
});
