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
  /**
   * Scenes built once and KEPT, addressed by a key.
   *
   * `start` tears the previous scene down and builds the next from nothing —
   * right for boot, wrong for moving between the burrow and the island, which a
   * player does constantly. Rebuilding there re-decodes the artwork and drops
   * the WebGL state every single time, so the game pauses on a move that should
   * be instant. These are loaded once, up front, and then only shown or hidden.
   */
  private resident = new Map<string, Scene>();

  /** The live scene, for callers that need to drive it (the socket layer feeds
   *  server events straight into the scene rather than through React state). */
  get currentScene(): Scene | null {
    return this.current;
  }
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

  /**
   * Build a scene once and keep it. Returns the same instance on every call.
   *
   * The scene is added to the root immediately but hidden, so its textures are
   * uploaded and its layout settled long before the player asks to see it.
   */
  async resident_add(key: string, SceneClass: SceneConstructor, data?: unknown): Promise<Scene> {
    const existing = this.resident.get(key);
    if (existing) return existing;

    const scene = new SceneClass(this.app, this);
    this.resident.set(key, scene);
    if (scene.init) await scene.init(data);
    scene.container.visible = false;
    this.root.addChild(scene.container);
    await scene.create();
    return scene;
  }

  /**
   * Show one resident scene and hide the rest. No teardown, no rebuild: this is
   * the move between the burrow and the island, and it has to be instant.
   *
   * Only the visible scene is ticked — an off-screen scene running its clouds
   * and tweens is work nobody can see.
   */
  show(key: string): Scene | null {
    const next = this.resident.get(key);
    if (!next) return null;

    for (const [k, scene] of this.resident) scene.container.visible = k === key;

    if (this.tickerCallback) {
      this.app.ticker.remove(this.tickerCallback);
      this.tickerCallback = null;
    }
    this.current = next;
    if (next.update) {
      this.tickerCallback = (ticker) => next.update!(ticker.deltaTime);
      this.app.ticker.add(this.tickerCallback);
    }
    return next;
  }

  /** A resident scene, whether or not it is the visible one. */
  resident_get(key: string): Scene | null {
    return this.resident.get(key) ?? null;
  }

  destroyCurrent(): void {
    if (this.current) {
      if (this.tickerCallback) {
        this.app.ticker.remove(this.tickerCallback);
        this.tickerCallback = null;
      }
      // A resident scene outlives `start`: it is torn down by destroyAll, not
      // by the next scene taking the stage.
      if (![...this.resident.values()].includes(this.current)) {
        this.root.removeChild(this.current.container);
        this.current.destroy();
      }
      this.current = null;
    }
  }

  /** Tear everything down — the app is going away. */
  destroyAll(): void {
    this.destroyCurrent();
    for (const scene of this.resident.values()) {
      this.root.removeChild(scene.container);
      scene.destroy();
    }
    this.resident.clear();
  }
}
