/**
 * TEMPORARY — the "does Pixi see the tap at all" probe.
 *
 * Placing a bomb fails SILENTLY: no log in the scene, no request in the
 * network panel, nothing. A missing log is indistinguishable from a missing
 * handler, so reading the code has not settled it. This asks the renderer
 * instead, and it lives on the STAGE rather than in React — the chrome around
 * the board is known to work, so a DOM button would only re-prove that.
 *
 * Two things, both inside Pixi:
 *
 *  - A BUTTON, drawn as a Pixi sprite with its own `pointertap`. If it counts
 *    up, Pixi's event system is alive and delivering to a `static` target, and
 *    the board's silence is about the board. If it does NOT, nothing in the
 *    scene graph can ever be clicked and the fault is in the renderer's event
 *    plumbing — the stage's `eventMode`, or the canvas never getting the
 *    pointer at all.
 *
 *  - A stage-level listener in the CAPTURE phase, which sees a tap on its way
 *    DOWN the tree before any target can handle or stop it. It names what
 *    Pixi's own hit test resolves under that point, which is the one fact no
 *    amount of reading answers: WHICH display object the tap is delivered to.
 *
 * Delete this file and its two call sites in Application.ts once lifting a
 * bomb is confirmed working.
 */
import { Application, Container, Graphics, Text, type FederatedPointerEvent } from 'pixi.js';

export interface TapProbeHandle {
  view: Container;
  resize(width: number, height: number): void;
  destroy(): void;
}

/** What Pixi's hit test resolves at a point, in the renderer's own pixels. */
function describe(app: Application, gx: number, gy: number): string {
  const boundary = (app.renderer.events as unknown as {
    rootBoundary?: { hitTest(x: number, y: number): Container | null };
  }).rootBoundary;
  const hit = boundary?.hitTest(gx, gy);
  if (!hit) return 'nothing';
  // The label first: the scene names its diamonds `burrow-hint-<i>` and the
  // farm labels its veils the same way, precisely so a hit test can say WHICH
  // cell answered rather than just 'Sprite'.
  const name = hit.label || hit.constructor?.name || '?';
  // The chain up to the stage, which is where a swallowing ancestor shows up:
  // a parent with `interactiveChildren = false`, or an infinite `hitArea`, is
  // invisible in the target's own name but obvious in its lineage.
  const chain: string[] = [];
  for (let p: Container | null = hit.parent; p && chain.length < 6; p = p.parent) {
    chain.push(`${p.label || p.constructor?.name || '?'}${p.visible ? '' : ':hidden'}`);
  }
  return `${name} (eventMode ${hit.eventMode}) < ${chain.join(' < ')}`;
}

export function createTapProbe(app: Application): TapProbeHandle {
  const view = new Container();
  view.label = 'tap-probe';

  const PAD = 8;
  const W = 150;
  const H = 34;

  const bg = new Graphics().roundRect(0, 0, W, H, 4).fill(0x1b2430).stroke({ width: 2, color: 0xffd45c });
  // The button is the target, so IT is what has to be static — not the panel
  // around it, which would make the readout below swallow taps as well.
  bg.eventMode = 'static';
  bg.cursor = 'pointer';
  bg.label = 'probe-button';

  let presses = 0;
  const label = new Text({
    text: 'PIXI PROBE: 0',
    style: { fontFamily: 'monospace', fontSize: 12, fill: 0xffd45c },
  });
  label.position.set(10, 10);
  label.eventMode = 'none';

  // The readout, under the button. Two lines: the last tap Pixi delivered
  // anywhere, and what its hit test says is there.
  const readout = new Text({
    text: '',
    style: { fontFamily: 'monospace', fontSize: 10, fill: 0xc8d4e0, wordWrap: true, wordWrapWidth: 460 },
  });
  readout.position.set(0, H + 4);
  readout.eventMode = 'none';

  bg.on('pointertap', () => {
    presses++;
    label.text = `PIXI PROBE: ${presses}`;
    console.log('[pixi-probe] button tapped', presses);
  });

  view.addChild(bg, label, readout);
  // Above the iris (z 1000) so the probe is readable even mid-wipe, and it is
  // the only thing in the game allowed up here.
  view.zIndex = 2000;

  /**
   * Every tap, in the CAPTURE phase on the stage.
   *
   * Capture rather than bubble: a target that handles the tap and stops it, or
   * one that sits under a swallowing ancestor, never lets a bubbling listener
   * on the stage hear about it — which is the exact failure being chased.
   */
  const onTap = (e: FederatedPointerEvent) => {
    const target = (e.target as Container | null);
    const line = `tap ${Math.round(e.global.x)},${Math.round(e.global.y)}\ntarget: ${
      target ? `${target.label || target.constructor?.name || '?'} (eventMode ${target.eventMode})` : 'none'
    }\nhitTest: ${describe(app, e.global.x, e.global.y)}`;
    console.log('[pixi-probe]', line.replace(/\n/g, ' | '));
    readout.text = line;
  };
  app.stage.addEventListener('pointertap', onTap, true);
  app.stage.addEventListener('pointerdown', onTap, true);

  return {
    view,
    resize(width: number) {
      // Top-left, under the HTML topbar's right-hand chips rather than behind
      // them; the burrow's own column is on the left below this line.
      view.position.set(PAD, PAD);
      readout.style.wordWrapWidth = Math.max(200, width - PAD * 2);
    },
    destroy() {
      app.stage.removeEventListener('pointertap', onTap, true);
      app.stage.removeEventListener('pointerdown', onTap, true);
      view.destroy({ children: true });
    },
  };
}
