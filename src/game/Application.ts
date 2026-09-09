import { Application, Container, Graphics } from 'pixi.js';
import gsap from 'gsap';
import { SceneManager } from './SceneManager';
import { BootScene } from './scenes/BootScene';

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
  container.appendChild(canvas);

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
  }

  resize();
  window.addEventListener('resize', resize);

  pixi.stage.sortableChildren = true;

  const scenes = new SceneManager(pixi, gameRoot);
  onScenes?.(scenes);
  await scenes.start(BootScene, boot);

  return {
    pixi,
    scenes,
    gameRoot,
    destroy() {
      window.removeEventListener('resize', resize);
      scenes.destroyAll();
      gsap.globalTimeline.clear();
      pixi.destroy(true, { children: true });
    },
  };
}
