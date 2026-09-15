/**
 * The moment the run ends: two steps, then the bomb.
 *
 * `FX/Explosion` is a tuning bench — it fires the blast on an empty tile, over
 * and over, so each layer can be judged on its own. This is the other question,
 * and the bench cannot answer it: does the blast read as happening TO SOMEBODY?
 *
 * A player does not watch an explosion. They watch their rabbit walk onto a
 * tile they chose, and the blast is the answer to that choice. So the beat that
 * matters is the one the bench has no way to show — the approach. Two steps is
 * the shortest walk that establishes the rabbit is MOVING and under its own
 * power, which is what makes the third tile land as a consequence rather than
 * as an effect going off near a sprite.
 *
 * ## What is being judged
 *
 *   - the rabbit is ON the tile, not beside it. The blast's own knockback
 *     (`fx/Blast.ts`) shoves a NEIGHBOUR away from the centre and springs it
 *     back; a rabbit standing on top has no direction to be shoved in, and
 *     returning to the tile that just exploded would say the blast moved
 *     nothing. It is thrown a whole cell BACK instead — see `victimKnock`.
 *   - the WHITE FLASH is what says the rabbit was struck. Without it the blast
 *     plays over the rabbit and the rabbit walks out of the fire unmarked,
 *     which reads as the two things happening in the same place rather than to
 *     each other.
 *   - the flash has to fire UNDER the fire, not after it. On the frame the
 *     sprite is at its brightest nothing is legible anyway; a flash that waits
 *     for the smoke is a second, separate event.
 *   - does the shockwave still read once there is a rabbit standing in it?
 *     That ring is the layer most at risk of being swallowed by the figure.
 *   - the rabbit has to LEAVE, not be teleported away. It lies there for a few
 *     seconds first (`hold`) so the aftermath can be read at all, then flickers
 *     out, leaving the scorch mark alone as the last thing on screen — see
 *     `blinkOut`, `VanishInstantly` and `QuickExit`.
 *
 * ## Why it is on the real island
 *
 * The same reason `FX/Explosion` is: the blast sorts against the terrain (see
 * `blastDepth`), the tile it goes off on is lifted onto a terrace, and a story
 * that staged this on flat ground would be showing an easier problem than the
 * one that ships.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Container } from 'pixi.js';
import gsap from 'gsap';
import { PixiStage } from './PixiStage';
import { Tile } from '@/game/entities/Tile';
import { PlayerRabbit } from '@/game/entities/PlayerRabbit';
import { loadAllAssets } from '@/game/services/AssetLoader';
import { initTileTextures } from '@/game/services/TileTextures';
import { createTerrainBackground } from '@/game/services/TerrainBackground';
import {
  initBlastTextures, playBlast, hitFlash, impactShake, blinkOutVisibleAt, SHAKE_PX,
} from '@/game/fx/Blast';
import { toColRow, tileDepth } from '@/config/gridConfig';
import {
  farmableTiles, levelTierAt, terrainNeighbors, tierLift, tileScreenPos,
} from '@/lib/game/terrainBoard';
import { islandCam } from '@/game/scenes/islandCamera';

const WIDTH = 960;
const HEIGHT = 540;
const SEED = 'harbour-9';
const SEA = '#1eaac4';

interface Args {
  /** Blink the rabbit to a white silhouette when the bomb goes off. */
  flash: boolean;
  /**
   * How many times it blinks.
   *
   * One long flash reads as a rendering fault; a few short ones read as damage.
   * Six carries past the fire and into the smoke, which is what keeps the
   * rabbit marked for the whole beat rather than only while it is hidden
   * inside the brightest part of the blast.
   */
  blinks: number;
  /** Seconds the rabbit waits on each tile before taking the next step. */
  beat: number;
  /** Throw the rabbit back onto the tile it stepped from. */
  knock: boolean;
  /** Peak board kick, in design px. */
  shakePx: number;
  /**
   * Seconds the rabbit LIES THERE after the blast, before it starts leaving.
   *
   * This is the beat the take was shortest on: at 0.7s the fire, the smoke and
   * the exit all ran together and there was no moment to actually look at what
   * the explosion had done. The aftermath — the scorch, the settling smoke, the
   * rabbit lying a cell back from a hole it did not survive — is the half of
   * the shot that says what happened, and it needs room.
   */
  hold: number;
  /**
   * Seconds the rabbit spends blinking out, once `hold` is over.
   *
   * 0 removes it: the rabbit is simply teleported back to the start, which is
   * what the take did first and what reads as a dropped frame rather than as
   * an exit.
   */
  fadeOut: number;
  /** Seconds before the whole thing replays. */
  every: number;
}

/**
 * Three tiles in a line, ending on the bomb: [start, middle, bomb].
 *
 * Solved BACKWARDS from the bomb through `terrainNeighbors`, which is the
 * board's own idea of a legal step — picking three cells by arithmetic would
 * happily walk the rabbit through a cliff face or across a cell a tree is
 * standing on, and both exist on this seed.
 *
 * Prefers a straight line (the same neighbour direction twice) so the walk
 * reads as deliberate rather than as a stagger.
 */
function approach(): [number, number, number] | null {
  const all = farmableTiles(SEED);
  const land = new Set(all);

  /**
   * The bomb tile has to be one nothing stands IN FRONT OF.
   *
   * The first pick here was simply the middle of the list, and it landed in a
   * pocket below a terrace: the rabbit standing on it sorted at 586 while the
   * grass and cliff face of the row in front sat at 594-611, so the victim of
   * the blast was drawn behind the ledge and the take ended on an empty tile.
   * That is correct iso sorting, not a bug — it is just an unusable camera
   * angle for this shot.
   *
   * Depth is `(col + row) * 16`, so EVERY cell with a greater `col + row` is in
   * front — not just the diagonal one. The three that can actually cover a
   * standing sprite are (col+1, row), (col, row+1) and (col+1, row+1); a cell
   * is clear only when none of them is on a higher terrace. Checking just the
   * diagonal was the first attempt and it still picked an occluded tile, since
   * the ledge was on (col+1, row).
   */
  const tierOf = (t: number) => {
    const { col, row } = toColRow(t);
    return levelTierAt(SEED, col, row);
  };
  const unobstructed = (t: number) => {
    const { col, row } = toColRow(t);
    const mine = levelTierAt(SEED, col, row);
    return levelTierAt(SEED, col + 1, row) <= mine
      && levelTierAt(SEED, col, row + 1) <= mine
      && levelTierAt(SEED, col + 1, row + 1) <= mine;
  };
  // Nearest the middle of the island first, so the shot stays framed, but only
  // among the cells that are actually visible from the camera's angle.
  const midIndex = Math.floor(all.length / 2);
  const bomb = [...all]
    .filter((t) => unobstructed(t) && tierOf(t) >= 0)
    .sort((a, c) => Math.abs(all.indexOf(a) - midIndex) - Math.abs(all.indexOf(c) - midIndex))
    [0] ?? all[midIndex];

  // Sorted so the walk crosses the SCREEN rather than running down it.
  //
  // Iso projection is `x = (col - row) * HALF_W`, so a step along the col == row
  // diagonal moves the sprite straight down and leaves `x` untouched — which is
  // exactly the approach that reads worst: the rabbit appears to be descending
  // in place. Preferring the largest change in `col - row` picks the two steps
  // that travel furthest across the frame.
  const spread = (t: number) => {
    const c = toColRow(t);
    const b = toColRow(bomb);
    return Math.abs((c.col - c.row) - (b.col - b.row));
  };
  const mids = terrainNeighbors(SEED, bomb)
    .filter((t) => land.has(t))
    .sort((a, c) => spread(c) - spread(a));
  for (const mid of mids) {
    // The direction taken to get from `mid` to `bomb`, continued one more cell
    // back — so start → mid → bomb is one straight walk.
    const b = toColRow(bomb);
    const m = toColRow(mid);
    const backCol = m.col - (b.col - m.col);
    const backRow = m.row - (b.row - m.row);
    const start = terrainNeighbors(SEED, mid).find((t) => {
      const c = toColRow(t);
      return c.col === backCol && c.row === backRow && land.has(t);
    });
    if (start !== undefined) return [start, mid, bomb];
  }
  // No straight run available on this seed's middle: any legal two steps will
  // still show the beat, so a bent path is better than no story.
  for (const mid of mids) {
    const start = terrainNeighbors(SEED, mid).find((t) => land.has(t) && t !== bomb);
    if (start !== undefined) return [start, mid, bomb];
  }
  return null;
}

function Scene(args: Args) {
  return (
    <PixiStage
      width={WIDTH}
      height={HEIGHT}
      background={SEA}
      prepare={() => loadAllAssets()}
      setup={(stage, app) => {
        initTileTextures(app.renderer);
        initBlastTextures(app.renderer);

        const cleanups: Array<() => void> = [];
        let gone = false;
        cleanups.push(() => { gone = true; });

        const world = new Container();
        world.sortableChildren = true;
        stage.addChild(world);
        cleanups.push(() => world.destroy({ children: true }));

        const path = approach();
        if (!path) return () => cleanups.forEach((fn) => fn());
        const [start, mid, bomb] = path;

        // The game's own camera, on the tile that is about to go off — so the
        // whole walk is in frame and the blast is judged at the size a player
        // actually sees it. See the note in FX/Explosion.
        const cam = islandCam(SEED, WIDTH, HEIGHT, tileScreenPos(SEED, bomb));
        world.scale.set(cam.scale);
        world.position.set(cam.x, cam.y);

        const timers = new Set<number>();
        const after = (ms: number, fn: () => void) => {
          const t = window.setTimeout(() => { timers.delete(t); fn(); }, ms);
          timers.add(t);
        };
        cleanups.push(() => { for (const t of timers) window.clearTimeout(t); });

        let rabbit: PlayerRabbit | null = null;
        /** The terrain, kept so the take can fade what the rabbit stands behind. */
        let terrain: { fadeBehind(x: number, y: number): void } | null = null;

        /**
         * Fade the scenery the rabbit is standing behind, for the cell it is on.
         *
         * `IslandScene` calls this on every step and the story did not, which
         * is why the rabbit "disappeared" after the blast: it was lying on its
         * landing cell behind an opaque bush, present and visible in the scene
         * graph the whole time. Fading is exactly what the game does about
         * that, so the fix is to do what the game does rather than to move the
         * bush or re-sort the rabbit over it.
         */
        const faceCell = (tile: number) => {
          const { col, row } = toColRow(tile);
          terrain?.fadeBehind(col, row);
        };

        /**
         * The victim's knock: THROWN BACK onto the tile it came from.
         *
         * `knockBack` in `fx/Blast.ts` is for a neighbour — a shove away from
         * the centre that springs back to where it started, which is right for
         * a near miss. It is wrong here twice over: a rabbit standing ON the
         * centre has no direction to be shoved in, and returning to the tile
         * that just exploded says the blast moved nothing.
         *
         * Landing a whole cell back is what reads as being HIT. It also leaves
         * the board in the state the rules would leave it in — the rabbit is
         * off the bomb — so the shot ends on something true rather than on a
         * rabbit standing in its own crater.
         *
         * An ARC, not a hop: `moveTo` plays the walk cycle, and a rabbit that
         * walks backwards out of an explosion is doing it under its own power.
         * The tween is on the container while the sprite keeps playing
         * `damage`, so the figure is limp and the motion is the blast's.
         */
        const victimKnock = (c: Container, from: number, to: number) => {
          const a = tileScreenPos(SEED, from);
          const b = tileScreenPos(SEED, to);
          gsap.killTweensOf(c);
          // Re-sorted for the cell it LANDS on, straight away: the depth is
          // per-cell and a rabbit thrown a row back would otherwise spend the
          // whole flight sorting against the tile it left.
          const { col, row } = toColRow(to);
          c.zIndex = tileDepth(to) * 16 + levelTierAt(SEED, col, row) + 8;
          const flight = 0.42;
          // Horizontal at a constant rate, vertical as up-then-down — the same
          // split the debris uses, and for the same reason: one tween to the
          // landing point draws a straight line, which is the one shape a
          // thrown thing never travels in.
          gsap.to(c, { x: b.x, duration: flight, ease: 'none' });
          gsap.timeline()
            .to(c, { y: Math.min(a.y, b.y) - 34, duration: flight * 0.4, ease: 'power2.out' })
            .to(c, { y: b.y, duration: flight * 0.6, ease: 'power2.in' })
            // Lands hard and settles, rather than arriving neatly on the cell.
            .to(c, { y: b.y - 7, duration: 0.09, ease: 'power2.out' })
            .to(c, { y: b.y, duration: 0.22, ease: 'bounce.out' });
        };

        /**
         * Flicker away: alternating visibility that speeds up, then gone.
         *
         * Driven off one clock the same way `hitFlash` is, and for the same
         * reason — a chain of scheduled toggles is the shape that failed twice
         * there (every step collapsing onto one frame, then latching). The
         * state being a pure function of the clock leaves no ordering to get
         * wrong.
         *
         * ACCELERATING rather than even: a constant flicker reads as a fault,
         * one that tightens reads as something losing its grip.
         */
        const blinkOut = (c: Container, seconds: number) => {
          if (seconds <= 0) { c.visible = false; return; }
          const clock = { t: 0 };
          gsap.to(clock, {
            t: 1,
            duration: seconds,
            ease: 'none',
            onUpdate: () => { c.visible = blinkOutVisibleAt(clock.t); },
            onComplete: () => { c.visible = false; },
          });
        };

        /** One full take: stand, step, step, die. */
        const run = () => {
          if (gone || !rabbit) return;
          const r = rabbit;
          r.cancelMove();
          gsap.killTweensOf(r.container);
          // Back from wherever the last take left it — `blinkOut` hides the
          // container, so a take that did not restore this would run the whole
          // walk invisibly.
          r.container.visible = true;
          r.container.alpha = 1;
          r.setPosition(start);
          faceCell(start);

          const stepTo = (tile: number, then: () => void) => {
            after(args.beat * 1000, () => {
              if (gone) return;
              r.moveTo(tile, then);
              // On departure rather than on arrival: the hop is 200ms and the
              // cover has to be gone before the rabbit is inside it.
              faceCell(tile);
            });
          };

          stepTo(mid, () => {
            stepTo(bomb, () => {
              // Landed on it. The bomb answers the step it was reached by, so
              // the blast goes off on the frame the hop finishes — not after a
              // pause, which would read as the rabbit noticing it first.
              if (gone) return;
              const cancel = playBlast(world, SEED, bomb);
              cleanups.push(cancel);
              impactShake(world, cam, args.shakePx);
              r.playDamage();
              if (args.knock) {
                victimKnock(r.container, bomb, mid);
                // Thrown back onto `mid`, so whatever stands over THAT cell is
                // what has to get out of the way for the hold.
                faceCell(mid);
              }
              // UNDER the fire rather than after it — the flash is what marks
              // the rabbit, and it has to be spent while there is still a
              // blast on screen for it to belong to.
              if (args.flash) hitFlash(r.container, args.blinks);

              // ...and then LEAVE, rather than being teleported back to the
              // start on the next loop.
              //
              // The take used to end with the rabbit standing on `mid` in its
              // damage pose until `run` snapped it back, which reads as a
              // dropped frame rather than as an exit. Blinking out is the
              // read every game in this genre uses for "this one is done":
              // it says the rabbit was removed by what just happened, and it
              // gives the scorch mark a beat alone to be the last thing on
              // screen.
              after(args.fadeOut > 0 ? args.hold * 1000 : 0, () => {
                if (gone) return;
                blinkOut(r.container, args.fadeOut);
              });
            });
          });
        };

        void createTerrainBackground(world, SEED, { decoScale: 0.4 }).then((bg) => {
          if (gone) { bg.destroy(); return; }
          cleanups.push(() => bg.destroy());
          terrain = bg;
          const ticker = (t: { deltaMS: number }) => bg.update(t.deltaMS);
          app.ticker.add(ticker);
          cleanups.push(() => app.ticker.remove(ticker));

          // A dug pocket around the walk: the rabbit is crossing ground it has
          // already cleared, which is what a run looks like by the time it
          // finds a bomb. The bomb's own tile stays face-DOWN — that is the
          // whole point, it is the one the player cannot see into.
          const b = toColRow(bomb);
          for (const i of farmableTiles(SEED)) {
            const { col, row } = toColRow(i);
            const tile = new Tile(i, undefined, tierLift(SEED, i), levelTierAt(SEED, col, row));
            world.addChild(tile.container);
            tile.mountVeil((veil) => bg.mountVeil(i, veil));
            const dist = Math.max(Math.abs(col - b.col), Math.abs(row - b.row));
            if (i !== bomb && dist <= 3) {
              tile.revealContent('empty', dist === 1 ? 1 : 0, false);
            }
          }

          rabbit = new PlayerRabbit(start, undefined, SEED);
          world.addChild(rabbit.container);
          cleanups.push(() => rabbit?.destroy());

          // Replayable on demand as well as on the loop: the whole take is
          // over in about two seconds and a screenshot taken at a wall-clock
          // delay lands between runs far more often than on the blast.
          (globalThis as { __TAKE__?: () => void }).__TAKE__ = run;
          cleanups.push(() => {
            delete (globalThis as { __TAKE__?: () => void }).__TAKE__;
          });

          run();
          const loop = window.setInterval(run, args.every * 1000);
          cleanups.push(() => window.clearInterval(loop));
        });

        return () => cleanups.forEach((fn) => fn());
      }}
    />
  );
}

const meta: Meta<Args> = {
  title: 'FX/Bomb walk',
  render: (args) => <Scene key={JSON.stringify(args)} {...args} />,
  args: {
    flash: true,
    blinks: 6,
    beat: 0.45,
    knock: true,
    shakePx: SHAKE_PX,
    hold: 3.5,
    fadeOut: 1.1,
    // The whole take end to end: two beats + two hops + the blast + `hold` +
    // `fadeOut`, and then a breath on the empty tile before it replays. A loop
    // shorter than its own take restarts over the ending it is meant to show.
    every: 9,
  },
  argTypes: {
    blinks: { control: { type: 'range', min: 1, max: 14, step: 1 } },
    beat: { control: { type: 'range', min: 0.1, max: 1.5, step: 0.05 } },
    shakePx: { control: { type: 'range', min: 0, max: 24, step: 1 } },
    hold: { control: { type: 'range', min: 0, max: 8, step: 0.25 } },
    fadeOut: { control: { type: 'range', min: 0, max: 3, step: 0.1 } },
    every: { control: { type: 'range', min: 3, max: 20, step: 0.5 } },
  },
};
export default meta;

type Story = StoryObj<Args>;

/** Two steps, then the bomb — the whole beat, as it should play. */
export const Default: Story = {};

/**
 * The blinking pushed hard, to find the ceiling.
 *
 * Somewhere past this the flash stops reading as damage and starts reading as
 * a strobe; the point of the arm is to see where.
 */
export const HeavyFlash: Story = { args: { blinks: 12 } };

/**
 * The same take with NO white flash, for contrast.
 *
 * The blast is identical; only the mark on the rabbit is gone. It is the
 * clearest way to see what the flash is buying — without it the rabbit stands
 * in a fire that does not appear to touch it.
 */
export const NoFlash: Story = { args: { flash: false } };

/** A long single blink instead of three short ones — reads as a glitch. */
export const OneLongBlink: Story = { args: { blinks: 1 } };

/**
 * The rabbit stays planted on the bomb: no throw.
 *
 * Kept because it is the tempting simplification — the blast is already loud,
 * so why move the figure — and it is wrong twice. A rabbit that does not budge
 * reads as standing behind the explosion rather than in it, and it ends the
 * shot standing in its own crater, which is not a state the rules can produce.
 */
export const NoKnock: Story = { args: { knock: false } };

/**
 * No flicker: the rabbit is simply gone on the next frame.
 *
 * What the take did before the exit was added, kept for contrast. It reads as a
 * dropped frame rather than as the rabbit being taken out — there is no moment
 * where the screen says "this one is finished", so the eye keeps expecting it
 * to get back up.
 */
export const VanishInstantly: Story = { args: { fadeOut: 0 } };

/**
 * The short hold the take had first: barely half a second on the ground.
 *
 * Kept because it is what "the explosion is over too fast to read" actually
 * looks like — the fire, the smoke and the exit all land on top of each other
 * and the aftermath never gets a frame of its own.
 */
export const QuickExit: Story = { args: { hold: 0.7, every: 6 } };

/** Walked slowly, to separate the approach from the blast. */
export const SlowApproach: Story = { args: { beat: 1.1, every: 11 } };
