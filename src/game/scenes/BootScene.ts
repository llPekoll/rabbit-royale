import { Application, Container, Graphics } from 'pixi.js';
import type { Scene } from '../SceneManager';
import { SceneManager } from '../SceneManager';
import { GAME_W, GAME_H } from '../Application';
import { loadAllAssets } from '../services/AssetLoader';
import { initTileTextures } from '../services/TileTextures';
import { IslandScene } from './IslandScene';
import { BurrowScene } from './BurrowScene';
import type { BootData } from '../keys';
import { SCENE } from '../keys';

// Hold off on drawing the loading bar this long. A warm cache resolves the
// asset load within a frame or two, and flashing a progress bar for that single
// frame is the jarring blip we want to avoid. Only slow loads reveal the bar.
const BAR_SHOW_DELAY_MS = 220;

export class BootScene implements Scene {
  container: Container;
  private app: Application;
  private sceneManager: SceneManager;
  private bar: Graphics | null = null;
  private fill: Graphics | null = null;
  private data: BootData | null = null;

  constructor(app: Application, sceneManager: SceneManager) {
    this.app = app;
    this.sceneManager = sceneManager;
    this.container = new Container();
  }

  init(data?: unknown): void {
    if (data) this.data = data as BootData;
  }

  create(): Promise<void> {
    return this.loadAssets();
  }

  private async loadAssets(): Promise<void> {
    let lastProgress = 0;

    const showTimer = setTimeout(() => {
      this.buildBar();
      this.drawFill(lastProgress);
    }, BAR_SHOW_DELAY_MS);

    await loadAllAssets((progress) => {
      lastProgress = progress;
      if (this.fill) this.drawFill(progress);
    });

    clearTimeout(showTimer);
    initTileTextures(this.app.renderer);

    // BOTH scenes are built here, once, and kept.
    //
    // The player crosses between their burrow and the island constantly, and
    // rebuilding a scene on each crossing re-decodes its artwork and drops its
    // WebGL state — a visible pause on a move that should be instant. Paying
    // for both up front, behind the loading screen the player is already
    // watching, buys a game that never stalls again.
    await this.sceneManager.resident_add(SCENE.burrow, BurrowScene, this.data?.burrow);
    await this.sceneManager.resident_add(SCENE.island, IslandScene, this.data?.island);

    // The burrow is home: it is where a returning player lands.
    this.sceneManager.show(SCENE.burrow);
    this.data?.onReady?.();
  }

  private buildBar(): void {
    this.bar = new Graphics();
    this.bar.rect(GAME_W / 2 - 150, GAME_H / 2 - 10, 300, 20);
    this.bar.fill(0x333333);
    this.container.addChild(this.bar);

    this.fill = new Graphics();
    this.container.addChild(this.fill);
  }

  private drawFill(progress: number): void {
    if (!this.fill) return;
    this.fill.clear();
    this.fill.rect(GAME_W / 2 - 148, GAME_H / 2 - 8, 296 * progress, 16);
    this.fill.fill(0xffd700);
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
