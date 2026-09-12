import { Application, Assets, Container, Graphics, Texture } from 'pixi.js';
import gsap from 'gsap';
import { SceneManager } from './SceneManager';
import { BootScene } from './scenes/BootScene';
import { CarrotWipe } from './fx/CarrotWipe';
// TEMPORARY — see fx/TapProbe.
import { createTapProbe, type TapProbeHandle } from './fx/TapProbe';
import * as Keys from '@/config/assetKeys';

/** Background color. The video's feathered edges (alpha-masked on all
 *  four sides in GameScene) hide any subtle hue mismatch between the
 *  video's sea and this fill, so an approximate match is sufficient. */
export const BG_COLOR = 0x1eaac4;

/**
 * Ceiling on the renderer's pixel ratio.
 *
 * The Seeker's screen is ~460 PPI, so a native `devicePixelRatio` of 3+ makes
 * the GPU shade two to three times the pixels for art that is drawn on a coarse
 * grid and scaled with nearest-neighbour — the extra samples land inside the
 * same flat pixel blocks and are invisible by construction. Capping at 2 keeps
 * the art crisp on any phone and gives the battery back the difference.
 */
const MAX_RESOLUTION = 2;

/**
 * Frames per second.
 *
 * The Seeker's panel can do 120, and letting the ticker run there doubles the
 * work for a game whose pieces move one tile at a time on a 0.2s tween —
 * nobody can see the difference on a grid, and the phone's battery pays for it
 * all the same. Pinned at 60.
 */
const TARGET_FPS = 60;

/** Design-space reference dimensions for each orientation. Scene code
 *  reads the live GAME_W / GAME_H below, which resize() swaps on rotation. */
export const LANDSCAPE_W = 960;
export const LANDSCAPE_H = 540;
export const PORTRAIT_W = 480;
export const PORTRAIT_H = 860;

/** Current design-space dimensions. Mutated by resize() — consumers import
 *  these as ES-module live bindings and see the updated value. */
export let GAME_W: number = LANDSCAPE_W;
export let GAME_H: number = LANDSCAPE_H;

export interface GameApp {
  destroy(): void;
  pixi: Application;
  scenes: SceneManager;
  /** Root container that scales design-space → screen. */
  gameRoot: Container;
  /** The carrot iris that hides the cut between the two places. Absent only if
   *  its texture failed to load — the game still crosses, just bare. */
  wipe: CarrotWipe | null;
}

// Patch GSAP Tween.render to silently kill tweens targeting destroyed Pixi objects
// instead of spamming "Cannot set properties of null" every frame.
{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proto = gsap.core.Tween.prototype as any;
  if (!proto._patchedRender) {
    const orig = proto.render;
    proto.render = function (t: number, s?: boolean, f?: boolean) {
      try {
        return orig.call(this, t, s, f);
      } catch {
        this.kill();
        return this;
      }
    };
    proto._patchedRender = true;
  }
}

export async function createApp(
  container: HTMLElement,
  /** Handed to the boot, which builds both scenes from it. */
  boot?: import('./keys').BootData,
  /** Called with the scene manager BEFORE the boot runs, so `boot.onReady` —
   *  which fires from inside it — has something to reach it by. */
  onScenes?: (scenes: SceneManager) => void,
): Promise<GameApp> {
  // Kill any orphaned GSAP tweens from previous HMR instances
  gsap.globalTimeline.clear();

  const pixi = new Application();

  await pixi.init({
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundAlpha: 0,
    resolution: Math.min(window.devicePixelRatio || 1, MAX_RESOLUTION),
    autoDensity: true,
    antialias: false,
    roundPixels: true,
    canvas: document.createElement('canvas'),
  });

  // A 120Hz panel would otherwise drive the ticker at 120. See TARGET_FPS.
  pixi.ticker.maxFPS = TARGET_FPS;

  const canvas = pixi.canvas as HTMLCanvasElement;
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  // Match the Pixi background fill (backgroundAlpha is 0, so the canvas is
  // transparent until the bgFill rect draws). A black CSS fallback flashed the
  // whole screen for a frame on reveal; using BG_COLOR keeps any pre-render
  // frame seamless with the game's sea color.
  canvas.style.backgroundColor = `#${BG_COLOR.toString(16).padStart(6, '0')}`;
  // The scenes ask for cursors by name (`sprite.cursor = 'pointer'`), and Pixi
  // resolves those names through this table straight onto `canvas.style`. That
  // write beats the stylesheet, so the kit's pointers have to be repeated here
  // or the board would be the one surface still showing the system arrow while
  // every button around it had changed. Read from the CSS variables rather than
  // spelled out again, so the files and their hotspots are declared once.
  const cur = (name: string) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  pixi.renderer.events.cursorStyles.default = cur('--cur-arrow');
  pixi.renderer.events.cursorStyles.pointer = cur('--cur-hand');
  container.appendChild(canvas);

  // The live application, reachable from the console.
  //
  // The Storybook stage has always exposed this (see stories/PixiStage), and
  // the page's own `rrDiag` was written against it — but the GAME never set
  // it, so every run of that diagnostic gave up at "no __PIXI_APP__" and its
  // whole Pixi half, the part that answers WHICH display object a tap reaches,
  // has never once executed. Set here so the real app can be questioned the
  // same way a story can.
  (globalThis as { __PIXI_APP__?: Application }).__PIXI_APP__ = pixi;

  // Full-viewport background rect. Added directly to the stage (not inside
  // gameRoot) so it always covers the whole screen including letterbox
  // regions outside the design canvas. Drawn as Graphics so its color goes
  // through the same sRGB sampling/output path as the video texture and
  // matches the sea's blue without any clear-color gamma mismatch.
  const bgFill = new Graphics();
  bgFill.zIndex = -1000;
  pixi.stage.addChild(bgFill);

  // Root container: scales the 960×540 design space to fit the viewport.
  // All scene content is added as children of gameRoot — their coordinates
  // stay in the original 960×540 design space.
  const gameRoot = new Container();
  gameRoot.sortableChildren = true;
  pixi.stage.addChild(gameRoot);

  // Declared before resize() so that function can close over it; filled in
  // after the boot, which is what loads the carrot it is cut from.
  let wipe: CarrotWipe | null = null;
  // TEMPORARY — declared here for the same reason as the wipe above: `resize`
  // closes over it, and it is built after the boot. See fx/TapProbe.
  let probeRef: TapProbeHandle | null = null;

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    pixi.renderer.resize(w, h);

    // Redraw the background rect to cover the whole viewport.
    bgFill.clear();
    bgFill.rect(0, 0, w, h);
    bgFill.fill(BG_COLOR);

    // Swap design canvas per orientation so small portrait viewports (e.g.
    // 390×719 Telegram mini-app) don't end up scaling a landscape canvas to
    // ~0.4× and rendering everything tiny.
    const portrait = h > w;
    GAME_W = portrait ? PORTRAIT_W : LANDSCAPE_W;
    GAME_H = portrait ? PORTRAIT_H : LANDSCAPE_H;

    // Scale design space to fit (uniform), center horizontally, anchor to top
    const scale = Math.min(w / GAME_W, h / GAME_H);
    gameRoot.scale.set(scale);
    gameRoot.position.set(
      Math.round((w - GAME_W * scale) / 2),
      0,
    );

    // The shutter is built after this function (it needs the booted textures)
    // but resize runs once before that, so it is optional here rather than
    // hoisted — a rotation mid-wipe still has to re-cover the new viewport.
    wipe?.resize(w, h);
    // TEMPORARY — see fx/TapProbe.
    probeRef?.resize(w, h);
  }

  resize();
  window.addEventListener('resize', resize);

  pixi.stage.sortableChildren = true;
  // The stage stays `passive` — Pixi's default — and this is load-bearing.
  //
  // It was `static` for three days, on the belief that a passive root stops
  // events reaching children even when those are `static`. That is not what
  // Pixi 8 does: `EventBoundary._interactivePrune` skips a passive container
  // only when its `interactiveChildren` is false, so a passive stage descends
  // into everything and tests exactly the objects that asked to be tested.
  // (The mouse really was dead at the time — the CSS spacer over the board
  // was the cause, fixed in the same commit; this line rode along on the
  // wrong theory.)
  //
  // A `static` root is worse than useless: `hitTestRecursive` passes the
  // interactive mode DOWN the tree once it meets one, so under a static stage
  // every sprite in the game is hit-tested by its bounds, and the topmost one
  // that contains the point ENDS the search — returning an empty path that
  // bubbles up to the nearest interactive ancestor. On the burrow, whose taps
  // are handled by the placement diamonds themselves, that ancestor is the
  // stage: a tree, a bush, or simply the rectangular bounds of the cell IN
  // FRONT swallowed the tap before the diamond behind it was ever asked, and
  // the probe reported `target: Container` with no parent — the stage.
  //
  // Measured on the real BurrowScene (tools/tap-probe.mjs), same cell, same
  // click: passive → `burrow-hint-183` and a `[tap]`; static → the stage and
  // nothing. The island never noticed either way, because its scene container
  // is itself `static` with an all-covering hitArea and resolves the tile
  // geometrically — which is why the bug was invisible there and total here.

  const scenes = new SceneManager(pixi, gameRoot);
  onScenes?.(scenes);
  await scenes.start(BootScene, boot);

  // The iris sits on the STAGE, not in gameRoot: it has to cover the letterbox
  // as well as the board, and gameRoot is only the scaled design space. Added
  // after the boot so the carrot texture the loader fetched is already there,
  // and given the top zIndex so no scene can ever draw over the shutter.
  // A decorative shutter must never be the reason the game fails to boot: if
  // the carrot is somehow missing, cross bare (see GameHandles.wipeTo) rather
  // than take the whole app down for a transition.
  const carrot = Assets.get<Texture>(Keys.CARROT_MASK);
  if (carrot) {
    wipe = new CarrotWipe({
      width: window.innerWidth,
      height: window.innerHeight,
      texture: carrot,
    });
    wipe.view.zIndex = 1000;
    pixi.stage.addChild(wipe.view);
  } else {
    console.warn('[rr] no carrot texture: crossing between scenes without the iris');
  }

  // TEMPORARY — the tap probe. On the stage, above the iris, so it reports
  // whatever the renderer is actually delivering. See fx/TapProbe.
  probeRef = createTapProbe(pixi);
  pixi.stage.addChild(probeRef.view);
  probeRef.resize(window.innerWidth, window.innerHeight);

  return {
    pixi,
    scenes,
    gameRoot,
    wipe,
    destroy() {
      window.removeEventListener('resize', resize);
      probeRef?.destroy();
      // Don't leave a destroyed app behind for the console to question — after
      // an HMR reload its hit test would answer for a renderer that is gone.
      const g = globalThis as { __PIXI_APP__?: Application };
      if (g.__PIXI_APP__ === pixi) delete g.__PIXI_APP__;
      wipe?.destroy();
      scenes.destroyAll();
      gsap.globalTimeline.clear();
      pixi.destroy(true, { children: true });
    },
  };
}
