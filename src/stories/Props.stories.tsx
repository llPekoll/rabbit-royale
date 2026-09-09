/**
 * The props, up close and side by side.
 *
 * The random-walk story shows them in situ, which is the honest test but a slow
 * one — you wait for a rabbit to happen to dig a carrot. This mounts one of each
 * directly, at a size where you can actually judge the float, the shadow and
 * the blast.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { AnimatedSprite, Container } from 'pixi.js';
import { PixiStage } from './PixiStage';
import { Tile } from '@/game/entities/Tile';
import { PlayerRabbit } from '@/game/entities/PlayerRabbit';
import { loadAllAssets, getExplosionTextures } from '@/game/services/AssetLoader';
import { initTileTextures } from '@/game/services/TileTextures';
import * as Keys from '@/config/assetKeys';
import { SPAWN_INDEX, toColRow, toIndex, tilePos } from '@/config/gridConfig';
import type { TileContent } from '@/lib/game/types';

/** Tile indices in a short row across the middle of the board. */
function rowOf(n: number): number[] {
  const { col, row } = toColRow(SPAWN_INDEX);
  return Array.from({ length: n }, (_, i) => toIndex(col - Math.floor(n / 2) + i, row));
}

interface Args {
  /** Zoom, so the pixel art can actually be judged. */
  scale: number;
  /** Loop the explosion so it can be watched rather than caught. */
  loopExplosion: boolean;
}

function Scene({ scale, loopExplosion }: Args) {
  return (
    <PixiStage
      width={960}
      height={420}
      background="#2f6b3a"
      prepare={() => loadAllAssets()}
      setup={(stage, app) => {
        initTileTextures(app.renderer);

        // Zoom about the row being shown, not about the origin, or the tiles
        // scale straight off the canvas.
        const board = new Container();
        board.sortableChildren = true;
        board.scale.set(scale);
        const anchor = tilePos(SPAWN_INDEX);
        board.position.set(480 - anchor.x * scale, 230 - anchor.y * scale);
        stage.addChild(board);

        // One tile per prop, in a row: carrot, golden carrot, bomb, chest, hint.
        const contents: Array<[TileContent, number]> = [
          ['carrot', 0], ['golden', 0], ['bomb', 0], ['empty', 3], ['empty', 1],
        ];
        const indices = rowOf(contents.length);
        const tilesByIndex = new Map<number, Tile>();
        indices.forEach((index, i) => {
          const tile = new Tile(index);
          tilesByIndex.set(index, tile);
          board.addChild(tile.container);
          const [content, adjacent] = contents[i];
          tile.revealContent(content, adjacent, false);
        });

        // A rabbit beside them, for scale — the whole question about a prop is
        // whether it reads next to the character, not on its own.
        const rabbit = new PlayerRabbit(indices[0], Keys.BUNNY_WHITE);
        board.addChild(rabbit.container);

        // The blast, over the bomb tile — and the skull it leaves behind.
        const bombTile = indices[2];
        let timer: ReturnType<typeof setInterval> | undefined;
        const boom = () => {
          const textures = getExplosionTextures();
          if (textures.length === 0) return;
          const pos = tilePos(bombTile);
          const sprite = new AnimatedSprite(textures);
          sprite.anchor.set(0.5);
          sprite.position.set(pos.x, pos.y - 20);
          sprite.scale.set(1.6);
          sprite.zIndex = 55;
          sprite.animationSpeed = 20 / 60;
          sprite.loop = false;
          sprite.onComplete = () => { board.removeChild(sprite); sprite.destroy(); };
          board.addChild(sprite);
          sprite.play();
        };
        boom();
        // What the tile looks like afterwards, which is what a player actually
        // spends the run looking at.
        tilesByIndex.get(bombTile)?.markBombSite();
        if (loopExplosion) timer = setInterval(boom, 1400);

        return () => { if (timer) clearInterval(timer); };
      }}
    />
  );
}

const meta: Meta<Args> = {
  title: 'Island/Props',
  render: (args) => <Scene key={JSON.stringify(args)} {...args} />,
  args: { scale: 3, loopExplosion: true },
  argTypes: {
    scale: { control: { type: 'range', min: 1, max: 6, step: 0.5 } },
    loopExplosion: { control: 'boolean' },
  },
};
export default meta;

type Story = StoryObj<Args>;

/** Carrot, golden carrot, bomb + blast, and two hint numbers, with a rabbit for scale. */
export const All: Story = {};

/** Close enough to judge the carrot's hover and the shadow that anchors it. */
export const CarrotCloseUp: Story = { args: { scale: 6, loopExplosion: false } };
