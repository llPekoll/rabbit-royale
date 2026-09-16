import { Application, Assets, Container, Graphics, Texture } from 'pixi.js';
import gsap from 'gsap';
import { createSeaGradient, type SeaGradient } from './fx/SeaGradient';
import { SEA_GRADIENT_LOOK } from '@/config/waterLook';
import { BloomFilter } from './fx/BloomFilter';
import { BLOOM_LOOK } from '@/config/bloomLook';
import { SceneManager } from './SceneManager';
import { BootScene } from './scenes/BootScene';
import { SCENE } from './keys';
import { RandomWipe } from './fx/RandomWipe';
import * as Keys from '@/config/assetKeys';
import { PORTRAIT_GATE_QUERY } from '@/config/orientation';

/**
 * Background color: the OPEN SEA, far from any land.
 *
 * This was the shallow teal the island sits in, painted edge to edge, and that
 * flatness is what made the island read as pasted onto blue paper rather than
 * floating in water. The sea now carries a gradient (`fx/SeaGradient`) that is
 * pale under the island and deepens outward, so the colour that reaches the
 * EDGES of the frame is the deep one — and this fill, which covers the
 * letterbox past the gradient's plane, has to be that same colour or the frame
 * shows a rim in the old blue.
 *
 * Kept in `waterLook.ts` with the rest of the sea's numbers; re-exported here
 * because half the codebase already imports `BG_COLOR` from this module.
 *
 * The video's feathered edges (alpha-masked on all four sides in GameScene)
 * hide any subtle hue mismatch between the video's sea and this fill, so an
 * approximate match is sufficient.
 */
export const BG_COLOR = SEA_GRADIENT_LOOK.sea;

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
 *  reads the live GAME_W / GAME_H below, which resize() swaps on rotation.
 *
 *  LANDSCAPE IS 960 WIDE AND AS TALL AS THE SCREEN'S SHAPE MAKES IT. The
 *  canvas used to be a fixed 960x540 CONTAINED in the window, and a phone is
 *  not 16:9: the Seeker's 890x400 is 20:9, so the fit was bound by the height
 *  (400/540) and drew every tile, rabbit and glyph at 0.74 of its size, with
 *  89px of bare sea down each side that the cameras could not see and never
 *  used. Paul (2026-09-16): the UI takes the screen and the tiles are too
 *  small to play. Letting the height follow the aspect ratio makes the fit
 *  bind on the WIDTH on every landscape screen from 16:9 to 2.4:1, so a
 *  design px is the same share of the screen's width everywhere — 0.93 CSS px
 *  on the Seeker, a quarter bigger than before — and the cameras frame against
 *  the pixels the player actually has. A 16:9 window still gets 960x540. */
export const LANDSCAPE_W = 960;
export const LANDSCAPE_H = 540;
/** The landscape canvas's height floor and ceiling: 2.4:1 to 4:3. Past either,
 *  the fit goes back to containing the canvas, so an absurd window is
 *  letterboxed rather than handed a design space nothing was drawn for. */
export const LANDSCAPE_H_MIN = 400;
export const LANDSCAPE_H_MAX = 720;
export const PORTRAIT_W = 480;
export const PORTRAIT_H = 860;

/** The landscape canvas for a window of this shape — see LANDSCAPE_W. */
export function landscapeCanvas(w: number, h: number): { w: number; h: number } {
  const ratio = w > 0 ? h / w : LANDSCAPE_H / LANDSCAPE_W;
  const height = Math.round(LANDSCAPE_W * ratio);
  return { w: LANDSCAPE_W, h: Math.min(LANDSCAPE_H_MAX, Math.max(LANDSCAPE_H_MIN, height)) };
}

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
  /** The shutter that hides the cut between the two places — a different one
   *  of four each crossing (see RandomWipe). Absent only if the boot never got
   *  far enough to build it; the game still crosses, just bare. */
  wipe: RandomWipe | null;
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

  /**
   * The sea's depth, over that fill and under everything else.
   *
   * On the STAGE rather than in the scene's container, and this is the whole
   * point: the island's container carries the camera (`IslandScene` sets its
   * scale and position from the pan/zoom state), so a gradient parented there
   * would slide and scale with the board — the pale pool would drift off the
   * island the moment the player dragged, which is exactly the tell that gives
   * away a painted backdrop. Anchored to the screen, the light stays where the
   * light is and the island moves through it.
   *
   * Sized to the VIEWPORT, not to the design space, for the same reason
   * `bgFill` is: the letterbox is part of the picture.
   */
  const seaDepth: SeaGradient = createSeaGradient(
    window.innerWidth, window.innerHeight,
    {
      mode: SEA_GRADIENT_LOOK.mode,
      sea: SEA_GRADIENT_LOOK.sea,
      deep: SEA_GRADIENT_LOOK.deep,
      center: SEA_GRADIENT_LOOK.center,
      radius: SEA_GRADIENT_LOOK.radius,
      aspect: SEA_GRADIENT_LOOK.aspect,
      softness: SEA_GRADIENT_LOOK.softness,
      strength: SEA_GRADIENT_LOOK.strength,
      angle: (SEA_GRADIENT_LOOK.angleDeg * Math.PI) / 180,
      steps: SEA_GRADIENT_LOOK.steps,
    },
  );
  seaDepth.view.zIndex = -999;
  pixi.stage.addChild(seaDepth.view);

  // Root container: scales the 960×540 design space to fit the viewport.
  // All scene content is added as children of gameRoot — their coordinates
  // stay in the original 960×540 design space.
  const gameRoot = new Container();
  gameRoot.sortableChildren = true;
  pixi.stage.addChild(gameRoot);

  /**
   * Le bloom, sur `gameRoot` et pas sur le stage.
   *
   * Sur `gameRoot`, donc il voit tout le contenu de scene — l'ile, l'ecume, la
   * deco — mais NI le fond (`bgFill`), NI le degrade de mer (`seaDepth`), qui
   * sont poses directement sur le stage sous lui, NI le wipe (zIndex 1000) qui
   * est au-dessus.
   *
   * C'est le bon decoupage, et chacune des trois exclusions compte :
   *
   *  - le fond et le degrade sont des aplats calcules ; les faire passer dans
   *    un halo ne leur ajoute rien et ferait payer le filtre sur toute la
   *    surface du viewport, letterbox comprise ;
   *  - le WIPE surtout : c'est un rideau plein ecran, souvent clair. Sous le
   *    bloom il deborderait sur lui-meme a chaque transition, et le fondu
   *    ramasserait un flash a mi-course.
   */
  const bloom = new BloomFilter({
    threshold: BLOOM_LOOK.threshold,
    knee: BLOOM_LOOK.knee,
    radius: BLOOM_LOOK.radius,
    strength: BLOOM_LOOK.strength,
    tint: BLOOM_LOOK.tint,
    saturation: BLOOM_LOOK.saturation,
  });
  gameRoot.filters = [bloom];

  // Declared before resize() so that function can close over it; filled in
  // after the boot, which is what loads the silhouettes it is cut from.
  let wipe: RandomWipe | null = null;

  // A phone held upright is refused, not laid out (see PORTRAIT_GATE_QUERY):
  // the gate covers the page and the board keeps the landscape layout it had,
  // so turning back is instant rather than a re-frame into a canvas nobody
  // plays on. A phone OPENED upright still needs a first layout, and gets the
  // landscape one — its own screen, turned.
  let laidOut = false;
  function resize() {
    const gated = window.matchMedia?.(PORTRAIT_GATE_QUERY).matches ?? false;
    if (gated && laidOut) return;
    laidOut = true;
    const w = gated ? window.innerHeight : window.innerWidth;
    const h = gated ? window.innerWidth : window.innerHeight;
    pixi.renderer.resize(w, h);

    // Redraw the background rect to cover the whole viewport.
    bgFill.clear();
    bgFill.rect(0, 0, w, h);
    bgFill.fill(BG_COLOR);
    // The gradient covers the same area. Its dials are shares of the plane, so
    // resizing is all it needs — the pool stays centred on the island and keeps
    // its proportions on any viewport.
    seaDepth.resize(w, h);

    // Swap design canvas per orientation so small portrait viewports (e.g.
    // 390×719 Telegram mini-app) don't end up scaling a landscape canvas to
    // ~0.4× and rendering everything tiny.
    const portrait = h > w;
    const canvas = portrait ? { w: PORTRAIT_W, h: PORTRAIT_H } : landscapeCanvas(w, h);
    GAME_W = canvas.w;
    GAME_H = canvas.h;

    // Scale design space to fit (uniform), center horizontally, anchor to top
    const scale = Math.min(w / GAME_W, h / GAME_H);
    gameRoot.scale.set(scale);
    gameRoot.position.set(
      Math.round((w - GAME_W * scale) / 2),
      0,
    );

    // Le rayon du bloom suit le zoom du plateau, et il FAUT le recalculer ici.
    //
    // `BLOOM_LOOK.radius` est en pixels de l'espace design (960x540), qui est
    // l'unite dans laquelle la story l'a regle. Mais un filtre travaille sur
    // la texture rendue de son conteneur, donc APRES le scale de `gameRoot` :
    // laisse fixe, le halo ferait 6.5 pixels d'ecran sur un telephone comme
    // sur un 27 pouces, soit un effet deux fois plus discret sur le grand
    // ecran alors que tout le reste de l'image a double. Multiplier par
    // `scale` est ce qui fait que le bloom grandit avec l'art qu'il eclaire.
    //
    // `setResolution` par-dessus, pour le ratio de pixels du canvas (jusqu'a
    // MAX_RESOLUTION) : c'est la seconde conversion, et elle est independante
    // de celle-ci.
    bloom.radius = BLOOM_LOOK.radius * scale;
    bloom.setResolution(pixi.renderer.resolution);

    // The shutter is built after this function (it needs the booted textures)
    // but resize runs once before that, so it is optional here rather than
    // hoisted — a rotation mid-wipe still has to re-cover the new viewport.
    wipe?.resize(w, h);
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

  // The shutter sits on the STAGE, not in gameRoot: it has to cover the
  // letterbox as well as the board, and gameRoot is only the scaled design
  // space. Added after the boot so the silhouettes the loader fetched are
  // already there, and given the top zIndex so no scene can ever draw over it.
  //
  // A missing silhouette is not fatal: RandomWipe drops that shape and draws
  // from the rest, and the curtain in the set needs no texture at all — so
  // there is always something to cross with, and a decorative shutter is never
  // the reason the game fails to boot.
  wipe = new RandomWipe({
    width: window.innerWidth,
    height: window.innerHeight,
    textures: {
      carrot: Assets.get<Texture>(Keys.CARROT_MASK),
      bunny: Assets.get<Texture>(Keys.BUNNY_MASK),
      bomb: Assets.get<Texture>(Keys.BOMB_MASK),
    },
    /**
     * The pair the sand dissolve crumbles between — the only variant that
     * needs to know anything about the world it is crossing.
     *
     * Read at the moment of the crossing, NOT captured here: `currentScene` is
     * still the outgoing one at that point (the swap is the `midpoint`, which
     * has not run yet), which is exactly the fact this needs. Captured at boot
     * it would name whatever was on screen when the game started and dissolve
     * that for the rest of the session.
     *
     * `to` is the OTHER resident scene, and that is sound because there are
     * exactly two of them — the burrow and the island. A third would make this
     * ambiguous, and the honest fix then is to pass the destination key down
     * from `wipeTo` rather than to guess; hence the explicit null below rather
     * than a silent pick, so the day that happens the variant drops out of the
     * rotation instead of dissolving to the wrong place.
     */
    scenes: () => {
      const from = scenes.currentScene;
      if (!from) return null;
      const keys = [SCENE.burrow, SCENE.island];
      const residents = keys
        .map((k) => scenes.resident_get(k))
        .filter((s): s is NonNullable<typeof s> => s !== null);
      if (residents.length !== 2) return null;
      const to = residents.find((s) => s !== from);
      // The crossing is not between two places — `wipeOver` stays on one scene
      // (a raid, the trap grid), and there is nothing to reveal underneath.
      if (!to) return null;
      return { from: from.container, to: to.container };
    },
  });
  wipe.view.zIndex = 1000;
  pixi.stage.addChild(wipe.view);

  return {
    pixi,
    scenes,
    gameRoot,
    wipe,
    destroy() {
      window.removeEventListener('resize', resize);
      // Don't leave a destroyed app behind for the console to question — after
      // an HMR reload its hit test would answer for a renderer that is gone.
      const g = globalThis as { __PIXI_APP__?: Application };
      if (g.__PIXI_APP__ === pixi) delete g.__PIXI_APP__;
      wipe?.destroy();
      // Before `pixi.destroy`, which takes the display list but not the
      // geometry and shader this built for itself.
      seaDepth.destroy();
      // Same reason: a filter is not a child, so the display list's teardown
      // never reaches it. Detached first so nothing renders through a filter
      // whose program has just gone.
      gameRoot.filters = [];
      bloom.destroy();
      scenes.destroyAll();
      gsap.globalTimeline.clear();
      pixi.destroy(true, { children: true });
    },
  };
}
