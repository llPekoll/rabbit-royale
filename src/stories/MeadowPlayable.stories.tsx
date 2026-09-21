import { useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { PixiStage } from './PixiStage';
import { IslandScene } from '@/game/scenes/IslandScene';
import { SceneManager } from '@/game/SceneManager';
import { loadAllAssets } from '@/game/services/AssetLoader';
import { initTileTextures } from '@/game/services/TileTextures';
import { createSeaGradient } from '@/game/fx/SeaGradient';
import { SEA_GRADIENT_LOOK } from '@/config/waterLook';
import { MEADOW_LOOK } from '@/game/burrow/MeadowLook';
import { generateIsland } from '@/lib/game/island';
import { spawnTile, terrainNeighbors } from '@/lib/game/terrainBoard';
import { toColRow } from '@/config/gridConfig';

/** Real scene and input; only the server response is simulated in this sandbox. */
function Playable({ seed }: { seed: string }) {
  const [round, setRound] = useState(0);
  const [stats, setStats] = useState({ energy: 100, carrots: 0, steps: 0 });
  const sceneRef = useRef<IslandScene | null>(null);
  return <main style={{ position: 'relative', height: '100vh', background: '#0d5f8c', display: 'grid', placeItems: 'center' }}>
    <PixiStage key={`${seed}:${round}`} width={960} height={540} background="#0d5f8c" prepare={loadAllAssets}
      setup={(stage, app) => {
        initTileTextures(app.renderer);
        const look = SEA_GRADIENT_LOOK;
        const sea = createSeaGradient(960, 540, { ...look, angle: look.angleDeg * Math.PI / 180 });
        stage.addChild(sea.view);
        const scenes = new SceneManager(app, stage);
        const island = generateIsland({ seed, contentSeed: `${seed}:sandbox` });
        let at = spawnTile(seed), energy = 100, carrots = 0, steps = 0;
        let busyUntil = 0;
        let disposed = false;
        const walked = new Set<number>([at]);
        const move = (index: number) => {
          const scene = sceneRef.current;
          if (!scene || energy <= 0 || performance.now() < busyUntil || !terrainNeighbors(seed, at).includes(index)) return;
          const tile = island.tiles.get(index);
          if (!tile) return;
          busyUntil = performance.now() + 350;
          at = index;
          steps++;
          if (!walked.has(index)) {
            walked.add(index);
            energy = Math.max(0, energy - (tile.content === 'bomb' ? 20 : 1));
            scene.revealTile(index, tile.content, tile.adjacent);
            if (tile.content === 'carrot' || tile.content === 'golden' || tile.content === 'chest') {
              const gain = tile.content === 'golden' ? 5 : tile.content === 'chest' ? 10 : 1;
              carrots += gain;
              scene.floatGain(index, gain, tile.content === 'golden');
            }
          }
          scene.moveRabbit('meadow-player', index, energy);
          setStats({ energy, carrots, steps });
        };
        void scenes.start(IslandScene, {
          seed, playerId: 'meadow-player', canvas: { width: 960, height: 540 },
          meadowLook: MEADOW_LOOK, onMoveIntent: move,
        }).then(() => {
          if (disposed) { scenes.destroyCurrent(); return; }
          const scene = scenes.currentScene as IslandScene;
          sceneRef.current = scene;
          const spawn = toColRow(at);
          // A partly explored clearing exposes the material under the real hints.
          for (const [index, tile] of island.tiles) {
            const p = toColRow(index);
            if (Math.max(Math.abs(p.col-spawn.col), Math.abs(p.row-spawn.row)) <= 4 && tile.content !== 'bomb') {
              scene.hintTile(index, tile.adjacent);
            }
          }
          scene.addRabbit('meadow-player', 'Clover', at, 0, energy);
          scene.container.label = 'meadow-playable-ready';
          setStats({ energy, carrots, steps });
        });
        return () => {
          disposed = true; sceneRef.current = null;
          scenes.destroyCurrent(); sea.destroy();
        };
      }} />
    <div style={{ position: 'absolute', top: 12, left: 12, right: 12, display: 'flex', justifyContent: 'space-between', gap: 12, pointerEvents: 'none', color: '#fff3cf', font: '14px var(--font-pixel), monospace' }}>
      <div style={{ background: '#3d492deb', padding: '10px 14px' }}>Énergie {stats.energy} · Carottes {stats.carrots} · Pas {stats.steps}</div>
      <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
        <button onClick={() => sceneRef.current?.recentre()}>Mon bunny</button>
        <button onClick={() => setRound(n => n+1)}>Recommencer</button>
      </div>
    </div>
    <p style={{ position: 'absolute', bottom: 8, margin: '0 12px', padding: '8px 12px', background: '#3d492deb', color: '#fff3cf', fontSize: 13 }}>
      {stats.energy ? 'Clique une case dorée pour avancer et creuser. Molette : zoom · Glisser : déplacer la vue.' : 'Plus d’énergie ! Clique sur Recommencer.'} Démo locale, sans sauvegarde.
    </p>
  </main>;
}
const meta: Meta<{ seed: string }> = {
  title: 'Island/Meadow playable', parameters: { layout: 'fullscreen' },
  globals: { viewport: { value: 'desktop', isRotated: false } },
  args: { seed: 'harbour-9' }, render: args => <Playable key={args.seed} {...args} />,
};
export default meta;
type Story = StoryObj<typeof meta>;
export const Explore: Story = { name: 'Jouer · bunny dans la clairière' };
