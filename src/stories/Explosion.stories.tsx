/**
 * The bomb going off, on the ground it goes off on.
 *
 * What ships today is ONE thing: a 14-frame 48px sprite played at 1.6x over
 * the tile, plus an 8-beat shake of the whole board. That is why it reads as
 * weak while farming — a blast is not a picture of fire, it is a sequence of
 * events the eye reads in order:
 *
 *   1. a FLASH, one or two frames, before anything else is legible. It is what
 *      says "this was sudden" — the sprite alone fades up over three frames,
 *      which reads as something igniting rather than detonating.
 *   2. a SHOCKWAVE leaving the centre, flat on the ground, on the isometric
 *      ellipse the tiles are drawn on. This is what gives the blast a SIZE:
 *      without it the sprite is 77px of fire on a 44px tile and nothing says
 *      how far the damage went.
 *   3. DEBRIS thrown out and falling back. Motion that outlives the fire is
 *      what stops the effect ending on a hard cut.
 *   4. SMOKE that lingers a beat after the fire is gone, so the tile does not
 *      snap from full brightness to a skull.
 *   5. the SHAKE, and the rabbit taking it — the current shake is symmetric
 *      noise around the camera, which reads as the screen wobbling rather than
 *      as something hitting the ground and the ground answering.
 *
 * All five now ship — the effect lives in `fx/Blast.ts` and `IslandScene` calls
 * it. This story stays the TUNING SURFACE: one control per layer, each of which
 * can be switched OFF, which the shipped call deliberately cannot do. `Shipped`
 * is the effect as it was BEFORE that work, kept as the thing to judge against;
 * `Real` plays the game's own code and should be indistinguishable from
 * `Proposed`.
 *
 * ## What to look for
 *
 *   - at `Shipped` (the old effect), does the blast read as bigger than the
 *     tile it is on? It does not, and most of it is behind the hill.
 *   - does the fire sit ON the tile, or float above it / puddle flat on it?
 *     (`lift` — an explosion whose middle is on the ground reads as a puddle.)
 *   - when the fire is gone, is there anything on that tile that says what
 *     happened, before the skull fades in a quarter-second later?
 *   - does the shake read as an IMPACT (one hard hit, decaying) or as a wobble?
 *   - the rabbit is standing one tile away on purpose: does the blast reach it?
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { AnimatedSprite, Container, Graphics, Sprite, Texture, type Application } from 'pixi.js';
import gsap from 'gsap';
import { PixiStage } from './PixiStage';
import { Tile } from '@/game/entities/Tile';
import { PlayerRabbit } from '@/game/entities/PlayerRabbit';
import { loadAllAssets, getExplosionTextures } from '@/game/services/AssetLoader';
import {
  initBlastTextures, playBlast, knockBack, impactShake, blastDepth,
  FIRE_SCALE, FIRE_FPS, FIRE_LIFT, SHAKE_PX,
} from '@/game/fx/Blast';
import { initTileTextures } from '@/game/services/TileTextures';
import { createTerrainBackground } from '@/game/services/TerrainBackground';
import { toColRow, toIndex, tilePos, tileDepth, HALF_W, HALF_H } from '@/config/gridConfig';
import { farmableTiles, levelTierAt, spawnTile, tierLift, tileScreenPos } from '@/lib/game/terrainBoard';
import { islandCam } from '@/game/scenes/islandCamera';

const WIDTH = 960;
const HEIGHT = 540;
const SEED = 'harbour-9';
/** The sea the game draws behind its island. */
const SEA = '#1eaac4';

interface Args {
  /* ---- the sprite, as it ships ---- */
  /** Frames per second the 14-frame sheet plays at. Shipped: 20. */
  fps: number;
  /** Scale on the 48px art. Shipped: 1.6 — i.e. 77px over a 44px tile. */
  scale: number;
  /** Pixels the sprite is lifted off the tile centre. Shipped: 20. */
  lift: number;

  /* ---- the layers that are missing ---- */
  /** White blow-out over the tile on the first frames. 0 = off (shipped). */
  flash: number;
  /** Ground ring leaving the centre, in tiles of radius. 0 = off (shipped). */
  shockwave: number;
  /** Chunks thrown out and falling back. 0 = off (shipped). */
  debris: number;
  /** Smoke puffs that outlive the fire. 0 = off (shipped). */
  smoke: number;
  /** Scorch mark burnt into the tile, 0..1 alpha. 0 = off (shipped). */
  scorch: number;

  /* ---- the board's answer ---- */
  /** Peak board kick in px. Shipped: 4. */
  shakePx: number;
  /** Decaying single impact (true) or the shipped symmetric 8-beat yoyo. */
  shakeDecay: boolean;
  /** Knock the neighbouring rabbit back and play its damage frames. */
  knockback: boolean;
  /**
   * Sort the fx on the TERRAIN's depth ruler instead of the shipped literals.
   *
   * Off is what the game does, and what it does is wrong — see `DepthBug`.
   */
  depthFix: boolean;

  /* ---- staging ---- */
  /**
   * Play THE GAME'S blast (`fx/Blast.ts`) instead of this story's per-layer
   * rebuild.
   *
   * The two are the same effect at the same numbers — the rebuild exists only
   * so each layer can be switched OFF, which the shipped call cannot do. This
   * is the arm that proves the story and the game have not drifted: if `Real`
   * and `Proposed` ever stop looking identical, one of them is lying.
   */
  real: boolean;
  /** Draw the island under it. Off = the fx alone, for judging the art. */
  board: boolean;
  /** Seconds between repeats, so the story loops without a click. */
  every: number;
}

/** The tile the bomb is under: near the middle of the island, in frame. */
function blastTile(): number {
  const land = farmableTiles(SEED);
  return land[Math.floor(land.length / 2)];
}

/**
 * A soft radial disc, built once as a texture.
 *
 * Drawn with `Graphics` per particle it would be a fresh geometry per puff;
 * the blast spawns dozens, and at that point the effect is paying for its own
 * frame drop on exactly the frame it needs.
 */
function softDisc(app: Application, color: number): Texture {
  const g = new Graphics();
  const R = 32;
  // Concentric rings rather than a shader: cheap, and this is a pixel-art
  // game, so a crunchy falloff is not a defect here.
  for (let i = 8; i >= 1; i--) {
    g.circle(R, R, (R * i) / 8).fill({ color, alpha: 0.12 });
  }
  const tex = app.renderer.generateTexture(g);
  g.destroy();
  return tex;
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

        /** One sorted container for board + everything on the island, as the scene has it. */
        const world = new Container();
        world.sortableChildren = true;
        stage.addChild(world);
        cleanups.push(() => world.destroy({ children: true }));

        const smokeTex = softDisc(app, 0x2b2b33);
        const flashTex = softDisc(app, 0xffffff);
        cleanups.push(() => { smokeTex.destroy(true); flashTex.destroy(true); });

        const index = blastTile();

        /**
         * THE GAME'S camera, pointed at the tile the bomb is under.
         *
         * Not decoration: the island is ~3840px across and the canvas is 960,
         * so without this the board — and the blast on it — sits entirely off
         * frame and the story shows nothing but terrain. The scene solves the
         * same shot through `islandCam`; borrowing it means the blast is judged
         * at the SIZE the player actually sees it, which is the whole question
         * ("is it big enough?") this story exists to answer.
         */
        const cam = islandCam(SEED, WIDTH, HEIGHT, tileScreenPos(SEED, index));
        world.scale.set(cam.scale);
        world.position.set(cam.x, cam.y);

        const { x: bx, y: by } = tilePos(index);
        const lift = tierLift(SEED, index);

        /**
         * The blast's depth on the TERRAIN's ruler.
         *
         * The terrain sorts every block by `isoDepth` = (col + row) * 16 + tier
         * — hundreds by mid-island — and `Tile` matches it (`tileDepth * 16`).
         * The shipped explosion is added to that same sorted container at a
         * LITERAL zIndex of 55, which is the depth of a cell three steps from
         * the island's back corner: everywhere else, the ground is drawn OVER
         * the fire. That is not a subtle sorting nit, it is most of why the
         * blast reads as weak — half of it is behind the hill it went off on.
         *
         * `depthFix` puts the fx where the tile is and offsets INSIDE that
         * cell, which is the same thing `Tile` does with its own children.
         */
        const { col: bcol, row: brow } = toColRow(index);
        const tileTier = levelTierAt(SEED, bcol, brow);
        const base = tileDepth(index) * 16 + tileTier;
        /** zIndex for a layer, at `over` steps above the tile it sits on. */
        const z = (shipped: number, over: number) =>
          args.depthFix ? base + over : shipped;
        /** Where the bomb actually sits: the tile's top face, not the grid plane. */
        const groundY = by - lift;

        const timers = new Set<number>();
        const after = (ms: number, fn: () => void) => {
          const t = window.setTimeout(() => { timers.delete(t); fn(); }, ms);
          timers.add(t);
        };
        cleanups.push(() => { for (const t of timers) window.clearTimeout(t); });

        let rabbit: PlayerRabbit | null = null;

        // ---- the fire, exactly as IslandScene.playExplosion draws it -------
        const fire = () => {
          const textures = getExplosionTextures();
          if (textures.length === 0) return;
          const boom = new AnimatedSprite(textures);
          boom.anchor.set(0.5);
          boom.position.set(bx, groundY - args.lift);
          boom.scale.set(args.scale);
          boom.zIndex = z(55, 6);
          boom.animationSpeed = args.fps / 60;
          boom.loop = false;
          boom.onComplete = () => { world.removeChild(boom); boom.destroy(); };
          world.addChild(boom);
          boom.play();
        };

        // ---- 1. the flash -------------------------------------------------
        // Two frames of blow-out BEFORE the fire is legible. The sprite's own
        // first frames fade up, which reads as ignition; this is what makes it
        // read as detonation.
        const flash = () => {
          if (args.flash <= 0) return;
          const f = new Sprite(flashTex);
          f.anchor.set(0.5);
          f.position.set(bx, groundY - args.lift);
          f.zIndex = z(58, 7);
          f.blendMode = 'add';
          f.scale.set(args.flash);
          f.alpha = 0.9;
          world.addChild(f);
          gsap.to(f, {
            alpha: 0, duration: 0.14, ease: 'power2.in',
            onComplete: () => { world.removeChild(f); f.destroy(); },
          });
          gsap.to(f.scale, { x: args.flash * 1.6, y: args.flash * 1.6, duration: 0.14 });
        };

        // ---- 2. the shockwave ---------------------------------------------
        // Flat on the ground, on the ISOMETRIC ellipse — a circle here would
        // read as a ring standing up in the air rather than as the ground
        // answering. Radius is given in tiles so it can be compared against
        // the board it is expanding over.
        const shockwave = () => {
          if (args.shockwave <= 0) return;
          const ring = new Graphics();
          ring.zIndex = z(41, 1); // over the tile face, under anything on it
          ring.position.set(bx, groundY);
          world.addChild(ring);
          const max = args.shockwave * HALF_W * 2;
          const state = { r: 6, a: 0.85 };
          gsap.to(state, {
            r: max, a: 0, duration: 0.45, ease: 'power2.out',
            onUpdate: () => {
              ring.clear();
              ring.ellipse(0, 0, state.r, state.r * (HALF_H / HALF_W));
              ring.stroke({ color: 0xfff1c4, alpha: state.a, width: 3 });
            },
            onComplete: () => { world.removeChild(ring); ring.destroy(); },
          });
        };

        // ---- 3. the debris ------------------------------------------------
        // Thrown out and FALLING BACK, so the motion outlives the fire and the
        // effect does not end on a hard cut when the sheet runs out.
        const debris = () => {
          for (let i = 0; i < args.debris; i++) {
            const chunk = new Graphics();
            const size = 2 + Math.random() * 3;
            chunk.rect(-size / 2, -size / 2, size, size)
              .fill({ color: Math.random() < 0.4 ? 0x8a5a2b : 0x4b3a22 });
            chunk.position.set(bx, groundY - 6);
            chunk.zIndex = z(56, 6);
            world.addChild(chunk);

            const dir = Math.random() * Math.PI * 2;
            const dist = 18 + Math.random() * 46;
            // Iso-squashed travel: the ground is drawn at 2:1, so a chunk
            // thrown "north" must cover half the pixels of one thrown "east"
            // or it reads as skidding across the screen rather than the field.
            const dx = Math.cos(dir) * dist;
            const dy = Math.sin(dir) * dist * (HALF_H / HALF_W);
            const rise = 22 + Math.random() * 26;
            const t = 0.45 + Math.random() * 0.35;
            gsap.to(chunk, { x: bx + dx, duration: t, ease: 'none' });
            // Up then down on separate tweens — one tween to the landing point
            // would draw a straight line, which is the one shape a thrown thing
            // never travels in.
            gsap.timeline()
              .to(chunk, { y: groundY - 6 - rise, duration: t * 0.4, ease: 'power2.out' })
              .to(chunk, { y: groundY + dy, duration: t * 0.6, ease: 'power2.in' });
            gsap.to(chunk, {
              alpha: 0, duration: 0.25, delay: t,
              onComplete: () => { world.removeChild(chunk); chunk.destroy(); },
            });
          }
        };

        // ---- 4. the smoke -------------------------------------------------
        // Lingers a beat AFTER the fire, so the tile does not snap from full
        // brightness to a skull. This is also what covers the gap the skull's
        // 0.25s delay leaves today.
        const smoke = () => {
          for (let i = 0; i < args.smoke; i++) {
            const puff = new Sprite(smokeTex);
            puff.anchor.set(0.5);
            puff.position.set(bx + (Math.random() - 0.5) * 22, groundY - 4);
            puff.zIndex = z(54, 5);
            puff.alpha = 0.55;
            const s = 0.4 + Math.random() * 0.4;
            puff.scale.set(s);
            world.addChild(puff);
            gsap.to(puff, {
              y: puff.y - (26 + Math.random() * 26),
              x: puff.x + (Math.random() - 0.5) * 24,
              alpha: 0,
              duration: 0.9 + Math.random() * 0.6,
              delay: i * 0.05,
              ease: 'power1.out',
              onComplete: () => { world.removeChild(puff); puff.destroy(); },
            });
            gsap.to(puff.scale, { x: s * 2.2, y: s * 2.2, duration: 1.2, delay: i * 0.05 });
          }
        };

        // ---- 5. the scorch ------------------------------------------------
        // What is LEFT. Burnt into the tile face on the iso diamond, under the
        // skull that fades in over it.
        let scorchMark: Graphics | null = null;
        const scorch = () => {
          if (args.scorch <= 0) return;
          scorchMark?.destroy();
          const g = new Graphics();
          g.ellipse(0, 0, HALF_W * 0.8, HALF_H * 0.8).fill({ color: 0x1a1209, alpha: args.scorch });
          g.position.set(bx, groundY);
          g.zIndex = z(40, 0);
          g.alpha = 0;
          world.addChild(g);
          scorchMark = g;
          gsap.to(g, { alpha: 1, duration: 0.3, delay: 0.1 });
        };

        // ---- the board's answer -------------------------------------------
        const shake = () => {
          gsap.killTweensOf(world.position);
          // Kick by a constant on SCREEN, not in board space — the world is
          // scaled by the camera, so a fixed offset in its own coordinates
          // would be a harder jolt the further in the camera is. Same reason
          // `IslandScene.shakeScreen` divides by the container's scale.
          const px = args.shakePx / world.scale.x;
          if (px <= 0) return;
          if (args.shakeDecay) {
            // One hard hit that decays. An impact has a LOUDEST moment; the
            // shipped yoyo is the same amplitude eight times, which is what
            // makes it read as a wobble instead of as a blow.
            const beats = 8;
            const tl = gsap.timeline({
              onComplete: () => world.position.set(cam.x, cam.y),
            });
            for (let i = 0; i < beats; i++) {
              const a = px * (1 - i / beats);
              const s = i % 2 === 0 ? 1 : -1;
              tl.to(world.position, {
                x: cam.x + a * s, y: cam.y + a * 0.6 * s, duration: 0.045, ease: 'none',
              });
            }
            tl.to(world.position, { x: cam.x, y: cam.y, duration: 0.05 });
          } else {
            // Exactly what IslandScene.shakeScreen does today.
            gsap.to(world.position, {
              x: cam.x + px, y: cam.y + px * 0.6,
              duration: 0.05, repeat: 7, yoyo: true, ease: 'none',
              onComplete: () => world.position.set(cam.x, cam.y),
            });
          }
        };

        const hitRabbit = () => {
          if (!args.knockback || !rabbit) return;
          rabbit.playDamage();
          const c = rabbit.container;
          const home = { x: c.x, y: c.y };
          gsap.killTweensOf(c);
          // Shoved AWAY from the blast, then pulled back — the rabbit is the
          // only thing on screen that can say the blast had a direction.
          const ang = Math.atan2(c.y - groundY, c.x - bx);
          gsap.timeline()
            .to(c, {
              x: home.x + Math.cos(ang) * 14,
              y: home.y + Math.sin(ang) * 8 - 10,
              duration: 0.12, ease: 'power2.out',
            })
            .to(c, { x: home.x, y: home.y, duration: 0.3, ease: 'bounce.out' });
        };

        /** One blast: every layer, in the order the eye reads them. */
        const blast = () => {
          if (gone) return;
          if (args.real) {
            const hurt = args.knockback ? rabbit : null;
            const cancel = playBlast(world, SEED, index, {
              onShockwave: hurt
                ? (origin) => { hurt.playDamage(); knockBack(hurt.container, origin); }
                : undefined,
            });
            cleanups.push(cancel);
            impactShake(world, cam, args.shakePx);
            return;
          }
          flash();
          fire();
          shockwave();
          shake();
          // Debris and smoke start a frame or two IN, after the flash has
          // cleared — thrown on frame 0 they are lost inside the white.
          after(60, debris);
          after(120, smoke);
          after(150, scorch);
          after(80, hitRabbit);
        };

        const start = () => {
          // Fire on demand as well as on the loop. A blast lasts under a
          // second and the loop is seconds apart, so a screenshot taken at a
          // wall-clock delay lands on empty grass far more often than on the
          // effect — the frames that matter here are simply not catchable
          // otherwise. This is the handle a capture script drives.
          (globalThis as { __BLAST__?: () => void }).__BLAST__ = blast;
          cleanups.push(() => {
            delete (globalThis as { __BLAST__?: () => void }).__BLAST__;
          });
          blast();
          const loop = window.setInterval(blast, args.every * 1000);
          cleanups.push(() => window.clearInterval(loop));
        };

        if (!args.board) { start(); return () => cleanups.forEach((fn) => fn()); }

        void createTerrainBackground(world, SEED, { decoScale: 0.4 }).then((bg) => {
          if (gone) { bg.destroy(); return; }
          cleanups.push(() => bg.destroy());
          const ticker = (t: { deltaMS: number }) => bg.update(t.deltaMS);
          app.ticker.add(ticker);
          cleanups.push(() => app.ticker.remove(ticker));

          // A dug island around the blast, so the bomb goes off on a board a
          // player would recognise rather than on a field of face-down tiles.
          for (const i of farmableTiles(SEED)) {
            const { col, row } = toColRow(i);
            const tile = new Tile(i, undefined, tierLift(SEED, i), levelTierAt(SEED, col, row));
            world.addChild(tile.container);
            tile.mountVeil((veil) => bg.mountVeil(i, veil));
            const b = toColRow(index);
            const dist = Math.max(Math.abs(col - b.col), Math.abs(row - b.row));
            // The blast tile and its surroundings are already dug: the game
            // reveals the tile and fires the blast on the same frame, so by the
            // time there is fire on screen the ground under it is face-up.
            if (dist <= 3) tile.revealContent('empty', dist === 1 ? 1 : 0, false);
          }

          // The rabbit stands ONE TILE from the blast — the farming case. A
          // rabbit on the bomb is the death screen, which is a different shot.
          const b = toColRow(index);
          const near = toIndex(b.col + 1, b.row);
          rabbit = new PlayerRabbit(farmableTiles(SEED).includes(near) ? near : spawnTile(SEED));
          world.addChild(rabbit.container);
          cleanups.push(() => rabbit?.destroy());

          start();
        });

        return () => cleanups.forEach((fn) => fn());
      }}
    />
  );
}

const meta: Meta<Args> = {
  title: 'FX/Explosion',
  render: (args) => <Scene key={JSON.stringify(args)} {...args} />,
  args: {
    // These are the SHIPPED numbers — see IslandScene's EXPLOSION_* constants.
    fps: 20,
    scale: 1.6,
    lift: 20,
    flash: 0,
    shockwave: 0,
    debris: 0,
    smoke: 0,
    scorch: 0,
    shakePx: 4,
    shakeDecay: false,
    knockback: false,
    depthFix: false,
    real: false,
    board: true,
    every: 2.5,
  },
  argTypes: {
    fps: { control: { type: 'range', min: 4, max: 40, step: 1 } },
    scale: { control: { type: 'range', min: 0.6, max: 5, step: 0.1 } },
    lift: { control: { type: 'range', min: 0, max: 60, step: 1 } },
    flash: { control: { type: 'range', min: 0, max: 4, step: 0.1 } },
    shockwave: { control: { type: 'range', min: 0, max: 6, step: 0.25 } },
    debris: { control: { type: 'range', min: 0, max: 40, step: 1 } },
    smoke: { control: { type: 'range', min: 0, max: 20, step: 1 } },
    scorch: { control: { type: 'range', min: 0, max: 1, step: 0.05 } },
    shakePx: { control: { type: 'range', min: 0, max: 24, step: 1 } },
    every: { control: { type: 'range', min: 1, max: 8, step: 0.5 } },
  },
};
export default meta;

type Story = StoryObj<Args>;

/**
 * The effect as it was BEFORE this work: the sheet at 1.6x, lifted 20px, the
 * 8-beat yoyo shake, and a literal `zIndex` that put most of it under the
 * island. Nothing else. Kept as the baseline every other story here is judged
 * against — and as the answer to "why did it feel weak".
 */
export const Shipped: Story = {};

/**
 * The DEPTH BUG, on the shipped effect and nothing else.
 *
 * The same blast as `Shipped`, with the fx sorted on the terrain's own ruler
 * instead of the literal `zIndex = 55` the scene uses. Nothing about the art,
 * the timing or the scale changes — and the fire stops being drawn underneath
 * the island. Compare the two side by side before touching any of the other
 * controls: it is the cheapest fix on this page and the largest single
 * difference, because today most of every blast is simply not visible.
 */
export const DepthBug: Story = { args: { depthFix: true } };

/** Just the flash added, so its contribution can be read on its own. */
export const Flash: Story = { args: { depthFix: true, flash: 1.4 } };

/** Just the shockwave — the layer that gives the blast a radius. */
export const Shockwave: Story = { args: { depthFix: true, shockwave: 2.5 } };

/** Just the debris — the motion that outlives the 0.7s of fire. */
export const Debris: Story = { args: { depthFix: true, debris: 18 } };

/** Just the smoke and the scorch — what is left on the tile afterwards. */
export const Aftermath: Story = { args: { depthFix: true, smoke: 8, scorch: 0.55 } };

/** Just the shake, reshaped into one decaying impact instead of a wobble. */
export const ImpactShake: Story = { args: { depthFix: true, shakeDecay: true, shakePx: 9 } };

/**
 * Every layer on, at a first-pass mix. The candidate to copy back into
 * `IslandScene.playExplosion` once the numbers here settle.
 */
export const Proposed: Story = {
  args: {
    scale: 2.2,
    flash: 1.4,
    shockwave: 2.5,
    debris: 18,
    smoke: 8,
    scorch: 0.55,
    shakePx: 9,
    shakeDecay: true,
    knockback: true,
    depthFix: true,
  },
};

/**
 * THE GAME'S blast, through `fx/Blast.ts` — the call `IslandScene` makes.
 *
 * Should be indistinguishable from `Proposed`. It is the regression guard: the
 * story rebuilds the effect layer by layer so each can be turned off, and a
 * rebuild that drifts from the thing it illustrates stops being evidence.
 */
export const Real: Story = { args: { real: true, knockback: true, shakePx: SHAKE_PX } };

/** The full mix with no island under it, for judging the fx art alone. */
export const NoBoard: Story = {
  args: { ...Proposed.args, board: false },
};

/**
 * Slowed right down, to read the ORDER of events — flash, fire, wave, debris,
 * smoke. If the order is wrong it is wrong at 20fps too; it is just invisible.
 */
export const Slow: Story = {
  args: { ...Proposed.args, fps: 5, every: 6 },
};
