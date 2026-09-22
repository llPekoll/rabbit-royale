/**
 * Marche sur les bombes toi-même — le vrai `resolveMove`, sur une carte
 * minée, zoomée sur le lapin.
 *
 * `Island/Meadow playable` se joue aussi, mais son serveur est un bouchon —
 * il enlève 20 d'énergie et ne bouge pas le lapin, donc la seule chose qu'on
 * ne peut PAS y voir, c'est justement où la bombe laisse le joueur.
 *
 * Ici le bac à sable appelle `resolveMove` — la fonction que le serveur
 * appelle, pas une copie — et passe le `dig.knockback` qui en sort à
 * `scene.bombHit()`, exactement la paire que le socket branche en vrai. Donc
 * l'atterrissage affiché EST celui d'une partie.
 *
 * ## Ce qu'on regarde
 *
 *   - le lapin FINIT DANS LE CRATÈRE, sur la case qu'il vient de taper. Un
 *     pas, qui a coûté une bombe. Avant il était jeté une case en arrière :
 *     le cratère se retrouvait entre le joueur et son lapin, et le souffle
 *     avait l'air de l'avoir déplacé de DEUX cases.
 *   - il se pose au CENTRE de son losange, pas à cheval sur un coin. L'arc
 *     du vol est une animation ; la case, elle, est posée à l'atterrissage
 *     (`setPosition` dans `playKnockback`), donc une deuxième bombe qui
 *     interrompt la première ne peut plus le laisser entre deux cases.
 *   - la couronne jaune se rallume autour de là où il est vraiment, et le
 *     tap suivant passe.
 *
 * ## Pour le mettre à l'épreuve
 *
 * Monte `bombes` à fond et enchaîne : deux explosions rapprochées sont le cas
 * qui cassait, parce que la seconde coupe le vol de la première.
 */
import { useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { PixiStage } from './PixiStage';
import { IslandScene } from '@/game/scenes/IslandScene';
import { SceneManager } from '@/game/SceneManager';
import { loadAllAssets } from '@/game/services/AssetLoader';
import { initTileTextures } from '@/game/services/TileTextures';
import { createSeaGradient } from '@/game/fx/SeaGradient';
import { SEA_GRADIENT_LOOK } from '@/config/waterLook';
import { generateIsland } from '@/lib/game/island';
import { resolveMove, spawnRabbit } from '@/lib/game/run';
import { spawnTile } from '@/lib/game/terrainBoard';
import { makeShape, toColRow } from '@/config/gridConfig';
import { mulberry32 } from '@/lib/game/rng';
import { BOMB, ENERGY } from '@config/tuning';

const W = 960;
const H = 540;

/** Combien de bombes : la densité vient du palier, via les carottes à vie. */
const DENSITY: Record<string, number> = {
  'Meadow · 14%': 0,
  'Thicket · 17%': 7_500,
  'Ashland · 20%': 22_500,
  'Caldera · 24%': 45_500,
};

interface Args {
  seed: string;
  /** Le palier, donc la densité de bombes. Plus c'est haut, plus vite on en trouve. */
  bombes: keyof typeof DENSITY | string;
  /**
   * Zoom de départ, en multiples du zoom de jeu.
   *
   * La caméra du jeu cadre pour qu'on lise les chiffres sous ses pieds ; pour
   * juger un atterrissage il faut voir la case de départ ET celle d'arrivée
   * dans le même coup d'œil, donc on serre un peu plus par défaut.
   */
  zoom: number;
  /**
   * Ouvrir le terrain autour du spawn, comme une partie déjà entamée.
   *
   * Sur une île vierge tout est gris et on creuse à l'aveugle : c'est honnête
   * mais lent quand on cherche un cas précis. Les indices rendent les bombes
   * déductibles, donc trouvables exprès.
   */
  indices: boolean;
}

/**
 * Le verdict d'un atterrissage : le lapin doit finir DANS le cratère.
 *
 * La règle tient en une ligne depuis que la case d'arrivée est la case
 * creusée, donc il n'y a plus qu'une chose à vérifier — et c'est celle qui se
 * voyait le plus mal en jouant : le lapin est-il bien sur la case qu'il vient
 * de taper ?
 */
function verdictOf(bomb: number, landing: number) {
  return landing === bomb
    ? { text: 'dans le cratère', bad: false }
    : { text: 'PAS SUR LA CASE CREUSÉE', bad: true };
}

function Playable({ seed, bombes, zoom, indices }: Args) {
  const [round, setRound] = useState(0);
  const [hud, setHud] = useState<{ energy: number; carrots: number; bombs: number }>(
    { energy: ENERGY.START, carrots: 0, bombs: 0 },
  );
  const [last, setLast] = useState<string | null>(null);
  const [worst, setWorst] = useState<{ text: string; bad: boolean } | null>(null);
  const sceneRef = useRef<IslandScene | null>(null);

  return (
    <main style={{ position: 'relative', height: '100vh', background: '#0d5f8c', display: 'grid', placeItems: 'center' }}>
      <PixiStage
        key={`${seed}:${bombes}:${zoom}:${indices}:${round}`}
        width={W}
        height={H}
        background="#0d5f8c"
        prepare={loadAllAssets}
        setup={(stage, app) => {
          initTileTextures(app.renderer);
          const look = SEA_GRADIENT_LOOK;
          const sea = createSeaGradient(W, H, { ...look, angle: look.angleDeg * Math.PI / 180 });
          stage.addChild(sea.view);

          const scenes = new SceneManager(app, stage);
          const shape = makeShape(seed);
          // `contentSeed` distinct de `seed` : on rejoue la même côte avec un
          // autre champ de mines à chaque Recommencer, sinon on apprend la
          // carte par cœur et on ne tombe plus sur rien.
          const island = generateIsland({
            seed,
            contentSeed: `${seed}:bombes:${round}`,
            lifetimeCarrots: DENSITY[bombes] ?? 0,
          });
          // Le lapin du MOTEUR : c'est lui que `resolveMove` déplace, et la
          // scène ne fait que suivre. L'inverse (une position dans la story,
          // recopiée dans le moteur) est exactement ce qui laisse les deux
          // diverger sans qu'on le voie.
          const me = spawnRabbit('bomb-player', 'Clover', ENERGY.START, seed);
          const rng = mulberry32(1);
          let disposed = false;
          let busyUntil = 0;
          let bombs = 0;

          const move = (index: number) => {
            const scene = sceneRef.current;
            if (!scene || !me.alive || performance.now() < busyUntil) return;
            const from = me.tile;
            const out = resolveMove(island, me, index, shape, rng, Date.now());
            if (!out.ok) return;
            busyUntil = performance.now() + 350;

            if (out.dig) scene.revealTile(out.dig.tile, out.dig.content, out.dig.adjacent);
            for (const h of out.dig?.hinted ?? []) scene.hintTile(h.tile, h.adjacent);

            const knock = out.dig?.knockback;
            if (knock) {
              // Le couple exact que le hook socket joue : `bombHit` déplace le
              // lapin, rallume la couronne et recadre. Pas de `moveRabbit` en
              // plus — en vrai le `rabbit_moved` qui suit porte la même case
              // et se fait avaler par le vol.
              bombs += 1;
              scene.bombHit('bomb-player', knock.tile, Date.now() + BOMB.STUN_MS);
              const v = verdictOf(out.dig!.tile, knock.tile);
              const a = toColRow(from);
              const l = toColRow(knock.tile);
              const line = `${v.text} · (${a.col},${a.row}) → (${l.col},${l.row})`;
              setLast(line);
              setWorst((w) => (w?.bad && !v.bad ? w : { text: line, bad: v.bad }));
            } else {
              scene.moveRabbit('bomb-player', out.tile, out.energy);
              if ((out.dig?.carrotDelta ?? 0) > 0) {
                scene.floatGain(out.dig!.tile, out.dig!.carrotDelta, out.dig!.content === 'golden');
              }
            }
            setHud({ energy: out.energy, carrots: out.carrots, bombs });
          };

          void scenes.start(IslandScene, {
            seed,
            playerId: 'bomb-player',
            canvas: { width: W, height: H },
            onMoveIntent: move,
          }).then(() => {
            if (disposed) { scenes.destroyCurrent(); return; }
            const scene = scenes.currentScene as IslandScene;
            sceneRef.current = scene;
            if (indices) {
              // Les chiffres autour du spawn, jamais sur une bombe — la même
              // règle que la cascade : elle n'écrit pas sur une mine.
              const s = toColRow(me.tile);
              for (const [i, t] of island.tiles) {
                const p = toColRow(i);
                const d = Math.max(Math.abs(p.col - s.col), Math.abs(p.row - s.row));
                if (d <= 4 && t.content !== 'bomb') scene.hintTile(i, t.adjacent);
              }
            }
            scene.addRabbit('bomb-player', 'Clover', me.tile, 0, me.energy);
            // Serrer APRÈS que la scène ait cadré : `zoomAt` compose avec la
            // caméra de jeu au lieu de la remplacer, donc la vue reste celle
            // qui shippe, juste rapprochée.
            if (zoom !== 1) scene.zoomView(zoom);
            scene.container.label = 'bomb-playable-ready';
            // Same bargain as `__PIXI_APP__` in `PixiStage`: a probe can drive
            // the real scene instead of hunting for a bomb by clicking. A
            // knockback is a 1-in-4 tile on a board the size of a thumbnail,
            // so "click until one goes off" is not a check that can be run.
            (globalThis as { __BOMB_SCENE__?: IslandScene }).__BOMB_SCENE__ = scene;
            setHud({ energy: me.energy, carrots: me.carrots, bombs });
          });

          return () => {
            disposed = true;
            sceneRef.current = null;
            scenes.destroyCurrent();
            sea.destroy();
          };
        }}
      />

      <div style={{ position: 'absolute', top: 12, left: 12, right: 12, display: 'flex', justifyContent: 'space-between', gap: 12, pointerEvents: 'none', color: '#fff3cf', font: '14px var(--font-pixel), monospace' }}>
        <div style={{ background: '#3d492deb', padding: '10px 14px' }}>
          Énergie {hud.energy} · Carottes {hud.carrots} · Bombes {hud.bombs}
        </div>
        <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
          <button onClick={() => sceneRef.current?.recentre()}>Mon bunny</button>
          <button onClick={() => { setLast(null); setWorst(null); setRound((n) => n + 1); }}>Recommencer</button>
        </div>
      </div>

      {(last || worst) && (
        <div style={{ position: 'absolute', top: 64, left: 12, padding: '8px 12px', background: '#3d492deb', color: '#fff3cf', font: '13px ui-monospace, monospace', pointerEvents: 'none' }}>
          {last && (
            <div style={{ color: worst?.bad && last === worst.text ? '#ff5f7a' : '#fff3cf' }}>
              dernière : {last}
            </div>
          )}
          {worst?.bad && <div style={{ color: '#ff5f7a', fontWeight: 700 }}>⚠ pire : {worst.text}</div>}
          {worst && !worst.bad && <div style={{ opacity: 0.7 }}>aucun atterrissage fautif</div>}
        </div>
      )}

      <p style={{ position: 'absolute', bottom: 8, margin: '0 12px', padding: '8px 12px', background: '#3d492deb', color: '#fff3cf', fontSize: 13 }}>
        {hud.energy > 0
          ? 'Clique une case dorée pour avancer et creuser. Molette : zoom · Glisser : déplacer la vue. Va vers la côte pour chercher les atterrissages difficiles.'
          : 'Plus d’énergie ! Clique sur Recommencer.'}{' '}
        Vraies règles (`resolveMove`), sans serveur ni sauvegarde.
      </p>
    </main>
  );
}

const meta: Meta<Args> = {
  title: 'Island/Bomb playable',
  parameters: { layout: 'fullscreen' },
  globals: { viewport: { value: 'desktop', isRotated: false } },
  args: {
    seed: 'harbour-9',
    bombes: 'Caldera · 24%',
    zoom: 1.6,
    indices: true,
  },
  argTypes: {
    seed: { control: 'text' },
    bombes: { control: 'select', options: Object.keys(DENSITY) },
    zoom: { control: { type: 'range', min: 1, max: 3, step: 0.1 } },
  },
  render: (args) => <Playable key={JSON.stringify(args)} {...args} />,
};
export default meta;

type Story = StoryObj<Args>;

/**
 * Carte minée au maximum, zoomée, indices ouverts : on tombe sur une bombe en
 * quelques pas et on voit où elle jette.
 */
export const Jouer: Story = { name: 'Jouer · marcher sur les bombes' };

/**
 * Zoom serré au maximum, sur une case.
 *
 * Pour regarder le vol lui-même — l'arc, la culbute, l'écrasement à
 * l'atterrissage — plutôt que la case choisie.
 */
export const TresZoome: Story = { name: 'Très zoomé', args: { zoom: 2.6 } };

/**
 * Sans indices : l'île vierge, on creuse à l'aveugle.
 *
 * C'est la vraie expérience d'un début de partie, et la bombe arrive sans
 * qu'on l'ait cherchée — ce qui est la seule façon de juger si la surprise se
 * lit bien.
 */
export const ALAveugle: Story = { name: 'À l’aveugle', args: { indices: false } };

/**
 * Densité de départ (Meadow, 14 %), zoom de jeu.
 *
 * Ce que voit vraiment un nouveau joueur : les bombes sont rares, et
 * l'atterrissage est un événement au lieu d'être une routine.
 */
export const CommeEnJeu: Story = {
  name: 'Comme en jeu',
  args: { bombes: 'Meadow · 14%', zoom: 1, indices: false },
};
