/**
 * A tiny Pixi host for stories: mounts an Application, hands the caller its
 * stage, and tears everything down on unmount. Stories use it to drive REAL
 * game entities (LogoEmbers, Tile, …) rather than a mock — a story that
 * reimplements what it illustrates stops being evidence.
 */
import { useEffect, useRef } from 'react';
import { Application, Container, Assets } from 'pixi.js';

export interface PixiStageProps {
  width: number;
  height: number;
  background?: string;
  /** Sprite URLs to preload (Assets.add + load) before `setup` runs. */
  assets?: Record<string, string>;
  /** Awaited before `setup` runs — for atlases the game parses in its own
   *  loader (a story that skipped them would render a fallback, not the real
   *  thing). */
  prepare?: () => Promise<unknown>;
  /** Build the scene. Return a cleanup for anything not parented to `stage`. */
  setup: (stage: Container, app: Application) => void | (() => void);
  /** Per-frame hook; `deltaMs` is real milliseconds. */
  onTick?: (deltaMs: number) => void;
  style?: React.CSSProperties;
}

export function PixiStage({ width, height, background = '#081120', assets, prepare, setup, onTick, style }: PixiStageProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let app: Application | null = null;
    let disposed = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      const a = new Application();
      // Same ceiling as the game (see Application.ts MAX_RESOLUTION): a story
      // that renders at a different pixel ratio is not showing what ships.
      await a.init({
        width, height, background, antialias: false, autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
      });
      a.ticker.maxFPS = 60;
      if (disposed) { a.destroy(true, { children: true }); return; }
      app = a;
      hostRef.current?.appendChild(a.canvas);
      a.canvas.style.imageRendering = 'pixelated';
      // Fit the story's frame WITHOUT distorting it.
      //
      // `maxWidth: 100%` alone squeezes the width and leaves the height, so a
      // panel narrower than the design space (Storybook's Seeker viewport is
      // 800 wide against a 960 canvas) showed a stretched picture with the
      // right-hand side of the board simply gone — which reads as "the grid is
      // missing" rather than as "the frame is too narrow". `height: auto` with
      // an aspect ratio is what the game itself does on resize: scale
      // uniformly, letterbox the remainder.
      a.canvas.style.maxWidth = '100%';
      a.canvas.style.height = 'auto';
      a.canvas.style.aspectRatio = `${width} / ${height}`;

      if (assets) {
        for (const [key, src] of Object.entries(assets)) Assets.add({ alias: key, src });
        await Assets.load(Object.keys(assets));
        if (disposed) return;
      }

      if (prepare) {
        await prepare();
        if (disposed) return;
      }

      const stage = new Container();
      stage.sortableChildren = true;
      a.stage.addChild(stage);
      cleanup = setup(stage, a) ?? undefined;

      if (onTick) a.ticker.add((t) => onTick(t.deltaTime * (1000 / 60)));
    })();

    return () => {
      disposed = true;
      cleanup?.();
      app?.destroy(true, { children: true });
    };
    // Stories re-mount on arg changes; a deps list would keep a stale scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={hostRef} style={{ lineHeight: 0, ...style }} />;
}
