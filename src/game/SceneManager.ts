import { Application, Container } from 'pixi.js';

export interface Scene {
  container: Container;
  init?(data?: unknown): Promise<void> | void;
  create(): Promise<void> | void;
  update?(delta: number): void;
  destroy(): void;
}

export type SceneConstructor = new (
  app: Application,
  sceneManager: SceneManager
) => Scene;

export class SceneManager {
  private current: Scene | null = null;
  private tickerCallback: ((ticker: { deltaTime: number }) => void) | null =
    null;
  app: Application;
  /** The root container that scenes are added to (scaled design-space). */
  private root: Container;

  constructor(app: Application, root?: Container) {
    this.app = app;
    this.root = root ?? app.stage;
  }

  async start(SceneClass: SceneConstructor, data?: unknown): Promise<void> {
    this.destroyCurrent();

    const scene = new SceneClass(this.app, this);
    this.current = scene;

    if (scene.init) await scene.init(data);
    this.root.addChild(scene.container);
    await scene.create();

    if (scene.update) {
      this.tickerCallback = (ticker) => scene.update!(ticker.deltaTime);
      this.app.ticker.add(this.tickerCallback);
    }
  }

  destroyCurrent(): void {
    if (this.current) {
      if (this.tickerCallback) {
        this.app.ticker.remove(this.tickerCallback);
        this.tickerCallback = null;
      }
      this.root.removeChild(this.current.container);
      this.current.destroy();
      this.current = null;
    }
  }
}
