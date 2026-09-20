/**
 * Building the taught board in Pixi — the half both first-run lessons share.
 *
 * `FirstNumbers` and `FirstFlag` set up an identical scene and then differ
 * only in what they light and what they say. Everything identical lives here,
 * so a fix found while judging one lesson (the hint layer, the zoom, the
 * centring) is a fix in both rather than a thing that has to be remembered
 * twice.
 *
 * Real `Tile` and real `PlayerRabbit`: a story that reimplements what it
 * illustrates stops being evidence.
 */
import { Container } from 'pixi.js';
import type { Application } from 'pixi.js';
import { Tile } from '@/game/entities/Tile';
import { PlayerRabbit } from '@/game/entities/PlayerRabbit';
import { initTileTextures } from '@/game/services/TileTextures';
import { createIslandBackground } from '@/game/services/IslandBackground';
import { CloudField } from '@/game/fx/Clouds';
import * as Keys from '@/config/assetKeys';
import { COLS, ROWS, tilePos } from '@/config/gridConfig';
import { BOARD_ZOOM, CHEST, CLUE, DUG, GROUND, RABBIT, STAGE, at } from './board';

export interface LessonScene {
  tiles: Map<number, Tile>;
  rabbit: PlayerRabbit;
  board: Container;
  /** Tear down everything not parented to the stage. */
  destroy(): void;
}

/**
 * Build the pocket: ground, hints, rabbit, sky and (optionally) the island art.
 *
 * `hintOnClue` is the number the clue shows. It is a parameter rather than a
 * constant because the numbers lesson may want to show the same board reading
 * something other than 1 while explaining what the glyph means.
 */
export function buildLessonBoard(
  stage: Container,
  app: Application,
  opts: { background: boolean; hintOnClue?: number; chest?: boolean },
): LessonScene {
  initTileTextures(app.renderer);

  let bg: { destroy(): void } | null = null;
  if (opts.background) {
    void createIslandBackground(stage, STAGE.width / 2, STAGE.height / 2, 'first-lesson')
      .then((b) => { bg = b; });
  }

  const sky = new CloudField(stage, { width: STAGE.width, height: STAGE.height });
  const ticker = (t: { deltaTime: number }) => sky.update(t.deltaTime * (1000 / 60));
  app.ticker.add(ticker);

  const board = new Container();
  board.sortableChildren = true;
  /**
   * Centre the pocket on the canvas, at the lesson's zoom.
   *
   * `tilePos` is the grid's OWN projection, origin included. Computing it here
   * from col/row and a guessed pitch put the whole lesson off the right-hand
   * edge, with every tile present and none of them on screen.
   */
  const clueAt = tilePos(CLUE);
  board.scale.set(BOARD_ZOOM);
  board.position.set(
    STAGE.width / 2 - clueAt.x * BOARD_ZOOM,
    STAGE.height / 2 - clueAt.y * BOARD_ZOOM,
  );
  stage.addChild(board);

  /**
   * THE NUMBERS' OWN LAYER, and the lessons do not exist without it.
   *
   * `Tile` draws its hint into a layer handed to it, and without one `addHint`
   * has nowhere to put the number — the board rendered with no "1" on the clue
   * at all, which is the single fact both lessons rest on. The scene passes
   * `this.hintLayer` for exactly this reason (IslandScene:451).
   */
  const hintLayer = new Container();
  hintLayer.zIndex = 1_000_000;
  hintLayer.sortableChildren = false;
  board.addChild(hintLayer);

  const tiles = new Map<number, Tile>();
  for (const [dc, dr] of GROUND) {
    const index = at(dc, dr);
    if (index < 0 || index >= COLS * ROWS) continue;
    const tile = new Tile(index, undefined, 0, 0, hintLayer);
    tiles.set(index, tile);
    board.addChild(tile.container);
  }

  // Open the ground the lesson stands on. The clue gets its number; the rest
  // read 0 and simply say "you have been here".
  const clueHint = opts.hintOnClue ?? 1;
  for (const index of DUG) {
    tiles.get(index)?.revealContent('empty', index === CLUE ? clueHint : 0, false);
  }

  /**
   * THE CHEST, drawn before it is dug.
   *
   * The real board does the same: the box is visible from the spawn with its
   * glow and ring, so the player can SEE the prize — what they cannot know is
   * that it is the thing to go and get, which is what the arrow answers
   * (`fx/ChestPointer`). `hideChestTier` because the tutorial's chest gives
   * that slot to the arrow, exactly as the island does.
   */
  if (opts.chest) {
    const tile = tiles.get(CHEST);
    if (tile) {
      tile.setChest(0xffffff, false, 'bronze');
      tile.hideChestTier();
    }
  }

  const rabbit = new PlayerRabbit(RABBIT, Keys.BUNNY_WHITE);
  board.addChild(rabbit.container);

  return {
    tiles,
    rabbit,
    board,
    destroy() {
      app.ticker.remove(ticker);
      sky.destroy();
      bg?.destroy();
    },
  };
}

/** The hint layer of a board built above — for anything drawn over the numbers. */
export function hintLayerOf(board: Container): Container | null {
  for (const child of board.children) {
    if (child instanceof Container && child.zIndex === 1_000_000) return child;
  }
  return null;
}
