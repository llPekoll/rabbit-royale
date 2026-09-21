/**
 * A raider crosses your homestead, and the burrow answers with lightning.
 *
 * This is Street Fighter's electrocution, which is the whole reason the pose
 * ships as TWO frames rather than as a sequence: the victim is not playing an
 * animation so much as being HELD in one, a flickering silhouette rattling in
 * place for as long as the current runs. What the effect has to get right is
 * not the bolt — that art already works, and `FX/Lightning bolt` covers it —
 * but the handover between the two, and there are three ways to lose it that
 * only the eye catches:
 *
 *   - the pose has to arrive ON THE LANDING. The strike opens with a flash and
 *     the bolt itself is a few frames behind it, so a rabbit that lights up on
 *     frame 0 reads as two effects that missed each other.
 *   - it has to be the SAME ANIMAL. The pose is 32x32 like every bunny sheet
 *     and is drawn at the game's own `RABBIT_SCALE` over the raider's own
 *     container, so it lands at exactly the rabbit's size, anchor and tile. Any
 *     other number and the swap reads as a sprite dropped onto a rabbit.
 *   - it has to END, and end in a RESULT. A shock that simply fades out leaves
 *     the raid where it was and makes the bolt look harmless, so the current
 *     stopping drops the rabbit: the death row plays and the body is left lying
 *     there a beat, because cutting on the last frame reads as a clipped
 *     animation rather than as a kill landing.
 *
 * All three are drawn on the REAL `BurrowScene`, with the real raider on the
 * real terraced ground, because a stand-in rectangle would answer none of them
 * — the question here is proportion against the board the game actually ships.
 *
 * `bun run storybook` (port 6007).
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { PixiStage } from './PixiStage';
import { BurrowScene } from '@/game/scenes/BurrowScene';
import { SceneManager } from '@/game/SceneManager';
import { loadAllAssets } from '@/game/services/AssetLoader';
import { initTileTextures } from '@/game/services/TileTextures';
import {
  entranceTile, shortestRaidPath, burrowNeighbors, walkableTiles, fieldTiles,
} from '@/game/burrow/board';
import { raiderView, distanceToField, trapClues } from '@/lib/game/raid';
import { ENERGY, RAID_RUN, TRAPS } from '@config/tuning';
import { burrowTileScreen } from '@/game/burrow/screen';

/**
 * The route a competent raider walks: from the door, always onto the neighbour
 * nearest the field.
 *
 * Built from `distanceToField` rather than picked by hand so the tile the bolt
 * lands on is one the game would really have put a raider on — walking the
 * gradient down is what the crossing IS, and `shortestRaidPath` counts the
 * steps of this same route.
 */
function raidRoute(seed: string): number[] {
  const dist = distanceToField(seed);
  const route = [entranceTile(seed)];
  const seen = new Set(route);
  for (;;) {
    const here = route[route.length - 1];
    const next = burrowNeighbors(seed, here)
      .filter((t) => !seen.has(t) && dist.has(t))
      .sort((a, b) => (dist.get(a) ?? Infinity) - (dist.get(b) ?? Infinity))[0];
    if (next === undefined || (dist.get(next) ?? Infinity) >= (dist.get(here) ?? Infinity)) break;
    route.push(next);
    seen.add(next);
  }
  return route;
}

const WIDTH = 960;
const HEIGHT = 540;

/** The homestead being raided — a real player-shaped id, as `Burrow/Board` uses. */
const SEED = 'sol:9xQeWvG816AUJHqBkAS8fcCQoFEQx7WVwCz1AKDsN5Tk';

interface Args {
  /** How long the current holds the rabbit, in milliseconds. */
  hold: number;
  /**
   * How many steps in the raider is when the bolt lands.
   *
   * The point of the control is PROPORTION: deep in the garden the strike has
   * the building behind it, at the door it has open ground, and the bolt is
   * large enough that the two do not look like the same effect.
   *
   * It is also what keeps the victim VISIBLE, which is not a given on generated
   * ground. This homestead grows a belt of full-height conifers across the
   * middle of the crossing, and they sort in front of a rabbit standing behind
   * them — correctly, since that is the depth cue the board is read by, and the
   * trees are why `reveal` calls the shape of the ground a secret worth walking
   * for. It does mean a strike aimed past step 3 goes off behind a tree. Steps
   * 0..3 are the stretch of this route with no tall prop in front of the
   * raider; beyond step 8 there are two.
   */
  step: number;
  /** The defender's burrow level — which silhouette the strike goes off against. */
  level: number;
  /** Seconds between repeats, so the story loops without a click. */
  every: number;
  /**
   * Camera zoom on the struck tile. 1 is the raid's own framing.
   *
   * At 1 the raider is ~15px tall in a 960px frame and the two-frame pose is a
   * smudge — which is the right shot for PLAYING a raid and useless for judging
   * the art in it. Anything above 1 pushes in on the tile the bolt lands on.
   */
  zoom: number;
  /**
   * How fast the scenery's wind runs, as a multiple of the game's own.
   *
   * 1 is what ships. The scenery is not tweened — `IslandView` swaps each
   * prop's TEXTURE every 130ms, with a per-cell phase so a gust travels the
   * field instead of everything turning at once — and that cadence is the catch
   * when filming: a recording that manages ~6fps is close enough to the sway's
   * ~7.7fps to beat against it, and the wind comes out as a judder rather than
   * as wind. Slowing it well below the capture rate gives each pose time to be
   * seen, so the scenery still breathes on the recording instead of flickering.
   *
   * 0 freezes it outright, for a shot where only the strike should move.
   */
  windScale: number;
}

function Scene({ hold, step, level, every, zoom, windScale }: Args) {
  return (
    <div>
      <PixiStage
        width={WIDTH}
        height={HEIGHT}
        background="#1eaac4"
        prepare={() => loadAllAssets()}
        setup={(stage, app) => {
          initTileTextures(app.renderer);
          const scenes = new SceneManager(app, stage);
          let scene: BurrowScene | null = null;
          let stopped = false;
          let camera: (() => void) | null = null;
          const timers = new Set<number>();

          const wait = (ms: number) =>
            new Promise<void>((resolve) => {
              const t = window.setTimeout(() => { timers.delete(t); resolve(); }, ms);
              timers.add(t);
            });

          // The raider's route in: the crossing a competent raider actually
          // walks, so the tile the bolt lands on is one the game would really
          // have put them on rather than a cell picked for the screenshot.
          const path = raidRoute(SEED);
          const at = path[Math.min(step, path.length - 1)] ?? entranceTile(SEED);
          const walked = path.slice(0, path.indexOf(at) + 1);

          /**
           * Put the raider on the board — ONCE.
           *
           * Separate from the strike below, and that separation is the whole
           * point: `setRaid` builds the raider and drops it in, so calling it
           * per repeat destroyed the rabbit and spawned a fresh one every
           * cycle. The board then stood EMPTY between strikes and the victim
           * appeared on the same frame as the bolt, which reads as the
           * lightning conjuring a rabbit rather than hitting one.
           */
          const enter = async () => {
            if (stopped || !scene) return;
            await scene.setRaid({
              view: raiderView(SEED, walked, new Map(), false),
              at,
              steps: [],
              seed: SEED,
              level,
              onStep: () => {},
            });
          };

          const strike = async () => {
            if (stopped || !scene) return;
            // A beat on the tile first: the rabbit has to be seen STANDING
            // there before it is hit, or there is no "before" to compare the
            // shock against. Long enough to read as a pause rather than as a
            // late frame — the spawn drop alone eats a good part of a second,
            // and what is left after it is what the eye actually gets.
            await wait(2000);
            if (stopped) return;
            await scene.electrocuteRaider(hold);
          };

          void scenes.start(BurrowScene, {
            seed: SEED,
            level,
            gardenProgress: 1,
            traps: [],
            placing: false,
            onToggle: () => {},
          }).then(async () => {
            scene = scenes.currentScene as BurrowScene;
            // Exposed as `Burrow/Board` exposes it, for the same reason: the
            // effect is a SEQUENCE, and driving the real scene from a script is
            // the only way to look at its middle without catching it by hand.
            (globalThis as { __BURROW_SCENE?: BurrowScene }).__BURROW_SCENE = scene;

            // Re-time the scenery by feeding the scene's per-frame tick a
            // scaled delta. Everything the STRIKE does is tweened by gsap or
            // played by its own sprite, so none of it rides on this tick and
            // none of it is affected — only the wind changes pace.
            if (windScale !== 1) {
              const tick = scene.update.bind(scene);
              scene.update = (delta: number) => tick(delta * windScale);
            }

            /* THE CAMERA.

               The scene owns its own — a raid frames the whole homestead, which
               is what a player choosing a route needs and the wrong shot for
               looking at a 32px pose. So this pushes in on the struck tile.

               Held on a ticker rather than set once, because the scene's camera
               TWEENS (see `applyCam`): a one-off scale would be dragged back to
               the board framing on the next frame of that tween. */
            if (zoom !== 1 && scene) {
              const target = burrowTileScreen(SEED, at);
              const view = scene.container;
              camera = () => {
                if (view.destroyed) return;
                view.scale.set(zoom);
                view.position.set(WIDTH / 2 - target.x * zoom, HEIGHT / 2 - target.y * zoom);
              };
              app.ticker.add(camera);
            }

            await enter();
            while (!stopped) {
              await strike();
              if (stopped) break;
              // Stand the raider back up FIRST, then wait out the gap.
              //
              // The raider is dead on the ground once `strike` returns, and it
              // stays that way: `setRaid` only builds a raider when there is
              // none and only moves the one it has when the TILE changes, so
              // calling it again on the same cell is a no-op and the corpse
              // simply lies there. Clearing the raid first is what actually
              // retires the body, so the next `enter` drops a fresh, living
              // rabbit in.
              //
              // Revived before the gap rather than after it, so the next take
              // opens on a rabbit that has been standing a while — the other
              // way round, the body lies there for the whole gap and the new
              // rabbit appears a beat before the bolt, which is no "before" at
              // all.
              await scene?.setRaid(null);
              if (stopped) break;
              await enter();
              if (stopped) break;
              await wait(every * 1000);
            }
          });

          return () => {
            stopped = true;
            if (camera) app.ticker.remove(camera);
            for (const t of timers) window.clearTimeout(t);
            delete (globalThis as { __BURROW_SCENE?: BurrowScene }).__BURROW_SCENE;
            scenes.destroyCurrent();
          };
        }}
      />
      <p style={{ color: '#8b949e', font: '12px ui-monospace, monospace', marginTop: 8 }}>
        {SEED.slice(0, 18)}… &middot; crossing {shortestRaidPath(SEED)} steps &middot; struck at step{' '}
        {step} &middot; held {hold}ms
      </p>
    </div>
  );
}

const meta: Meta<Args> = {
  title: 'FX/Electrocuted',
  render: (args) => <Scene key={JSON.stringify(args)} {...args} />,
  args: { hold: 1400, step: 3, level: 3, every: 3, zoom: 2.5, windScale: 1 },
  argTypes: {
    hold: { control: { type: 'range', min: 200, max: 4000, step: 100 } },
    step: { control: { type: 'range', min: 0, max: 20, step: 1 } },
    level: { control: { type: 'range', min: 1, max: 6, step: 1 } },
    every: { control: { type: 'range', min: 1, max: 10, step: 1 } },
    zoom: { control: { type: 'range', min: 1, max: 5, step: 0.25 } },
    windScale: { control: { type: 'range', min: 0, max: 2, step: 0.05 } },
  },
};
export default meta;

type Story = StoryObj<Args>;

/** The strike as it would land mid-raid: a few steps in, current held over a second. */
export const Default: Story = {};

/**
 * The strike at the size the GAME draws it: the raid's own framing, no zoom.
 *
 * This is the shot that settles proportion, and the only one that can — at 2.5x
 * the bolt is impressive because it is magnified. Here the raider is ~15px, the
 * bolt stands about two of them, and the question is whether the strike still
 * reads as lightning hitting a rabbit at the size a player will ever see it.
 */
export const GameScale: Story = { args: { zoom: 1 } };

/**
 * Caught at the DOOR, on the entrance tile.
 *
 * Open ground behind it, so this is the shot that judges the bolt against the
 * board alone — nothing but terrain to hide a mismatch in scale.
 */
export const AtTheDoor: Story = { args: { step: 0 } };

/**
 * Deep in the garden, against the biggest silhouette the burrow grows.
 *
 * The comparison that matters for size: a strike that reads well over grass can
 * still swallow the building it is supposed to be defending.
 *
 * The raider is PARTLY BEHIND THE TREES here, and deliberately so — this is
 * what the far end of a real crossing looks like, and the bolt has to survive
 * it. What is being judged is the strike against the building, not the victim,
 * and `Default` is the story that shows the victim whole.
 */
export const AtTheField: Story = { args: { step: 20, level: 6 } };

/**
 * The current held far too long — four seconds of it.
 *
 * Kept because it is the failure that looks like a feature for the first
 * second: two frames alternating with nothing else moving stops reading as
 * pain and starts reading as a stuck sprite, and where that line falls is a
 * judgement no test makes.
 */
export const HeldTooLong: Story = { args: { hold: 4000, every: 6 } };

/**
 * A brief zap — a quarter of a second, barely past the bolt itself.
 *
 * The other end of the same judgement: short enough and the pose never
 * registers at all, and the whole effect collapses back into the bolt art that
 * was already there.
 */
export const QuickZap: Story = { args: { hold: 250 } };


/* ── HOLD THE DOOR: a raid, from the DEFENDER's chair ──────────────────────
   Every story above is a camera pointed at an effect. This one is the game:
   a bot walks in off the entrance and makes for the carrot field, and the
   screen belongs to the player defending against it.

   Two defences, which is the whole of the tactical choice:

     - BURY A BOMB on a cell it has not reached yet. Cheap, limited
       (`TRAPS.MAX_PLACED`), and it only pays if the bot actually steps there
       — so it is a bet on the route rather than an answer to it.
     - CALL THE LIGHTNING on the rabbit itself. Certain, immediate, and on a
       cooldown, so it cannot simply be spammed the moment the bot appears.

   The bot is deliberately not clever: it walks the gradient toward the field,
   one step at a time, the way `raidRoute` above says a competent raider walks.
   A defender should lose to a route they could have read, not to a die roll.

   Energy is the game's own (`RAID_RUN`, `TRAPS`): 26 to spend, 1 a step, 8 a
   trap. That is what makes a bomb worth burying — four of them stop a crossing
   dead, and the numbers here are the ones the live game is balanced on. */

/** How long the strike takes to come back, in ms. */
const STRIKE_COOLDOWN_MS = 6000;
/** How long the bot waits between steps. */
const BOT_STEP_MS = 1100;

type Outcome = 'raiding' | 'won' | 'lost';

interface DefendArgs {
  /** Bombs the defender may have on the board at once. */
  bombs: number;
  /** The defender's burrow level. */
  level: number;
  /** Milliseconds between the bot's steps — its pace, and the player's clock. */
  botStepMs: number;
  /** Scenery wind speed — see `windScale` above. */
  windScale: number;
}

function DefendScene({ bombs, level, botStepMs, windScale }: DefendArgs) {
  const [energy, setEnergy] = useState<number>(ENERGY.MAX);
  const [placed, setPlaced] = useState<number[]>([]);
  const [outcome, setOutcome] = useState<Outcome>('raiding');
  const [armed, setArmed] = useState(true);
  const [log, setLog] = useState<string[]>([]);

  return (
    <div>
      <PixiStage
        width={WIDTH}
        height={HEIGHT}
        background="#1eaac4"
        prepare={() => loadAllAssets()}
        setup={(stage, app) => {
          initTileTextures(app.renderer);
          const scenes = new SceneManager(app, stage);
          let scene: BurrowScene | null = null;
          let stopped = false;
          const timers = new Set<number>();

          const wait = (ms: number) => new Promise<void>((resolve) => {
            const t = window.setTimeout(() => { timers.delete(t); resolve(); }, ms);
            timers.add(t);
          });

          const note = (line: string) => setLog((prev) => [line, ...prev].slice(0, 7));

          /* THE RAID'S STATE.
             Held here because the SERVER holds it in the real game: where the
             bot stands, what it has spent, what it has set off. The scene is
             told what is true; it decides none of it. */
          let at = entranceTile(SEED);
          const walked = new Set([at]);
          const mines = new Set<number>();
          const sprung = new Set<number>();
          let left = ENERGY.MAX;
          let done: Outcome = 'raiding';
          let canStrike = true;

          const dist = distanceToField(SEED);

          const draw = () => scene?.setRaid({
            // The DEFENDER is watching, so there is no fog to keep: it is
            // their own ground and they know where everything is. The clues
            // are still handed over, because they are what the bot's route is
            // read against — a bomb buried next to the rabbit shows as a 1.
            view: raiderView(SEED, walkableTiles(SEED), trapClues(SEED, mines), false),
            at,
            steps: [],
            seed: SEED,
            level,
            onStep: () => {},
          });

          const finish = (how: Outcome, why: string) => {
            if (done !== 'raiding') return;
            done = how;
            setOutcome(how);
            note(why);
            scene?.finishRaid(how === 'lost');
          };

          /* THE BOT.
             Walks the gradient toward the field — the same route `raidRoute`
             solves above — paying a step and any trap it lands on. It never
             backtracks, which is what makes burying a bomb ahead of it a real
             bet: the cell it is walking towards is readable. */
          const botStep = async () => {
            if (stopped || done !== 'raiding') return;
            const next = burrowNeighbors(SEED, at)
              .filter((t) => !walked.has(t) && dist.has(t))
              .sort((a, b) => (dist.get(a) ?? 99) - (dist.get(b) ?? 99))[0];
            if (next === undefined) return finish('lost', 'The raider is boxed in — it never reached the field');

            at = next;
            walked.add(next);
            left -= RAID_RUN.STEP_COST;

            if (mines.has(next) && !sprung.has(next)) {
              sprung.add(next);
              left -= TRAPS.DRAIN;
              scene?.springTrap(next);
              note(`Bomb went off on ${next} — ${TRAPS.DRAIN} energy`);
            }

            setEnergy(Math.max(0, left));
            await draw();
            if (stopped) return;

            if (left <= 0) return finish('lost', 'The raider ran out of energy');
            if (fieldTiles(SEED).includes(next)) {
              return finish('won', 'The raider reached your carrots');
            }
          };

          void scenes.start(BurrowScene, {
            seed: SEED,
            level,
            gardenProgress: 1,
            traps: [],
            placing: false,
            onToggle: () => {},
          }).then(async () => {
            scene = scenes.currentScene as BurrowScene;
            (globalThis as { __BURROW_SCENE?: BurrowScene }).__BURROW_SCENE = scene;
            if (windScale !== 1) {
              const tick = scene.update.bind(scene);
              scene.update = (delta: number) => tick(delta * windScale);
            }

            /* DEFENCE ONE: the lightning, on a cooldown. */
            scene.setRaiderTap(() => {
              if (stopped || done !== 'raiding' || !canStrike) return;
              canStrike = false;
              setArmed(false);
              note('Lightning called down on the raider');
              void (async () => {
                await scene?.electrocuteRaider(1400);
                if (stopped) return;
                finish('lost', 'The raider was struck down');
                await wait(STRIKE_COOLDOWN_MS);
                if (stopped) return;
                canStrike = true;
                setArmed(true);
              })();
            });

            /* DEFENCE TWO: burying a bomb, on any cell the bot has not
               reached. `setPlacing` is what puts the grid up — the same
               placement surface the burrow screen uses, so this is the real
               interface rather than a story's stand-in. */
            scene.setToggleHandler((tile: number, alreadyMined: boolean) => {
              if (stopped || done !== 'raiding') return;
              if (alreadyMined) {
                mines.delete(tile);
                scene?.removeTrap(tile);
                setPlaced([...mines]);
                return;
              }
              if (mines.size >= bombs) { note(`No bombs left (${bombs} on the board)`); return; }
              if (walked.has(tile)) { note('The raider has already crossed that cell'); return; }
              mines.add(tile);
              scene?.addTrap(tile);
              setPlaced([...mines]);
              note(`Bomb buried on ${tile}`);
              void draw();
            });
            // This screen is the DEFENDER's: keeps the placement grid up under
            // the raid, and shows the bombs already buried. Set before the
            // first `draw`, which is where the grid is decided.
            scene.setDefending(true);
            scene.setPlacing(true);

            await draw();

            // The bot starts after a beat, so the defender sees the board it
            // is about to be attacked on before it moves.
            await wait(1200);
            while (!stopped && done === 'raiding') {
              await botStep();
              if (stopped || done !== 'raiding') break;
              await wait(botStepMs);
            }
          });

          return () => {
            stopped = true;
            for (const t of timers) window.clearTimeout(t);
            if (scene) scene.setRaiderTap(null);
            delete (globalThis as { __BURROW_SCENE?: BurrowScene }).__BURROW_SCENE;
            scenes.destroyCurrent();
          };
        }}
      />
      <div style={{ color: '#c9d1d9', font: '13px ui-monospace, monospace', marginTop: 8 }}>
        <strong>
          {outcome === 'raiding' ? 'UNDER ATTACK'
            : outcome === 'won' ? 'YOUR CARROTS ARE GONE'
            : 'BURROW HELD'}
        </strong>
        {' · '}raider energy {energy}/{ENERGY.MAX}
        {' · '}bombs {placed.length}/{bombs}
        {' · '}strike {armed ? 'READY' : 'recharging'}
      </div>
      <p style={{ color: '#8b949e', font: '12px ui-monospace, monospace', marginTop: 4 }}>
        Tap a cell to bury a bomb ahead of it · tap the RABBIT to call lightning · pinch to zoom
      </p>
      <ul style={{ color: '#8b949e', font: '12px ui-monospace, monospace', paddingLeft: 16 }}>
        {log.map((line, i) => <li key={`${line}-${i}`}>{line}</li>)}
      </ul>
    </div>
  );
}

/**
 * Defend your burrow against a bot that is raiding it.
 *
 * The screen the other stories are missing: they all watch a raid from the
 * attacker's side, or from nobody's. Here the homestead is YOURS, the rabbit
 * crossing it is not, and the two defences — a bomb buried ahead of its route,
 * or the lightning called down on it — are the game.
 *
 * It is also the only place the strike can be judged as a MECHANIC rather than
 * as art: on a cooldown, against a bot spending real energy on real ground, the
 * question stops being "does the bolt look good" and becomes "is calling it the
 * right move yet, or should the next bomb go on the cell after next".
 */
export const Defend: StoryObj<DefendArgs> = {
  render: (args) => <DefendScene key={JSON.stringify(args)} {...args} />,
  args: { bombs: TRAPS.MAX_PLACED, level: 3, botStepMs: BOT_STEP_MS, windScale: 1 },
  argTypes: {
    bombs: { control: { type: 'range', min: 1, max: 12, step: 1 } },
    level: { control: { type: 'range', min: 1, max: 6, step: 1 } },
    botStepMs: { control: { type: 'range', min: 300, max: 3000, step: 100 } },
    windScale: { control: { type: 'range', min: 0, max: 2, step: 0.05 } },
  },
};
