/**
 * Street Fighter's electrocution, on a rabbit.
 *
 * The victim is not so much playing an animation as being HELD in one: a bolt
 * lands on them, their own art is swapped for a two-frame skeleton that
 * flickers and rattles for as long as the current runs, and then the current
 * stops and they drop. The parts, in the order they are felt:
 *
 *   - the BOLT, the island's own 195x220 strike, foot-anchored on the tile so
 *     the splash lands at the feet rather than over the head.
 *   - the POSE, swapped in a few frames later: the strike opens with a flash
 *     and the bolt arrives after it, and a rabbit that lights up before it is
 *     hit reads as two effects that missed each other.
 *   - the RATTLE, a couple of pixels either side — what says the rabbit is
 *     being held rather than merely lit.
 *   - the DROP. Fatal, the death row plays and the body is left lying a beat;
 *     survivable, the rabbit flinches and gets back up.
 *
 * Shared between the burrow (a raider struck by the defender) and the island
 * (a rival struck by a strike item) because it is the same animal at the same
 * size on both boards: the pose is 32x32 like the bunny sheets and is drawn at
 * `RABBIT_SCALE` inside the rabbit's own container, so it lands exactly where
 * the rabbit is. The two scenes differ only in WHERE the bolt is drawn and how
 * it sorts, which is what the caller passes in.
 */
import { AnimatedSprite, type Container } from 'pixi.js';
import gsap from 'gsap';
import { RABBIT_SCALE } from '@/config/gridConfig';
import type { PlayerRabbit } from '../entities/PlayerRabbit';
import {
  getElectrocutedTextures, getLightningBoltTextures, loadElectrocutedSheet, LIGHTNING_BOLT_FOOT,
} from '../services/AssetLoader';
import { playUiSfx } from '../services/SoundManager';

/**
 * How long a killed rabbit's body stays on the ground, in ms.
 *
 * After the death row has finished, not including it. Long enough to register
 * as a body rather than as the tail of an animation, short enough that the
 * board is not waiting on a corpse — the bolt, the shock and the fall together
 * already run past two seconds.
 */
export const DEATH_HOLD_MS = 900;

/** The bolt's size against the rabbit — half its art, as `FX/Lightning bolt`
 *  settles it: at 1:1 the strike stands three rabbits tall. */
const BOLT_SCALE = 0.5;
const BOLT_FPS = 24;
/** The frame the bolt actually LANDS on — the pose is swapped in then. */
const BOLT_LANDS_FRAME = 5;

export interface ElectrocuteOptions {
  rabbit: PlayerRabbit;
  /** Where the bolt stands: the rabbit's tile, in `layer`'s coordinates. */
  x: number;
  y: number;
  /** Where the bolt is drawn, and how it sorts there. */
  layer: Container;
  boltDepth: number;
  /** How long the current holds the rabbit, in ms. */
  holdMs: number;
  /** Whether it kills. See the note above on the two endings. */
  fatal: boolean;
  /**
   * Pending waits, so a scene tearing down mid-shock can cut them: the effect
   * is a chain of awaits across more than two seconds, and one left running
   * would wake to a rabbit that no longer exists.
   */
  timers: Set<number>;
  /** Whether the rabbit is still the one this started on. Checked after every wait. */
  alive: () => boolean;
}

function wait(ms: number, timers: Set<number>): Promise<void> {
  return new Promise((resolve) => {
    const t = window.setTimeout(() => { timers.delete(t); resolve(); }, ms);
    timers.add(t);
  });
}

/** Resolves once the current has stopped and the rabbit has dropped (or got up). */
export async function electrocute(o: ElectrocuteOptions): Promise<void> {
  const { rabbit, timers } = o;
  await loadElectrocutedSheet();
  if (!o.alive() || rabbit.container.destroyed) return;

  const boltTextures = getLightningBoltTextures();
  if (boltTextures.length > 0) {
    const bolt = new AnimatedSprite(boltTextures);
    bolt.anchor.set(0.5, LIGHTNING_BOLT_FOOT);
    bolt.position.set(o.x, o.y);
    bolt.scale.set(BOLT_SCALE);
    bolt.zIndex = o.boltDepth;
    bolt.animationSpeed = BOLT_FPS / 60;
    bolt.loop = false;
    bolt.onComplete = () => { if (!bolt.destroyed) bolt.destroy(); };
    o.layer.addChild(bolt);
    bolt.play();
  }

  playUiSfx('explosion');

  const pose = getElectrocutedTextures();
  if (pose.length === 0) return;

  const shock = new AnimatedSprite(pose);
  /*
   * Lined up on the RABBIT, not on the tile.
   *
   * Both sheets draw their art down to the bottom edge of a 32x32 cell, so the
   * naive reading is that both should anchor at 1 and stand on the same ground.
   * They should not, because `PlayerRabbit` anchors its sprite at 0.9: the
   * rabbit the player watches already sits a tenth of its frame — a little
   * over 4px — off the tile's centre, and that is the convention every other
   * sprite on the board is placed against. So the pose anchors at 1 and copies
   * that offset; anchored at 0.9 like the rabbit it would be offset by a tenth
   * of a sprite twice as tall (the pose's sparks fill the cell, 30px against
   * the idle frame's 14) and sit visibly off the animal it stands in for.
   */
  shock.anchor.set(0.5, 1);
  shock.y = 32 * RABBIT_SCALE * 0.1;
  shock.scale.set(RABBIT_SCALE);
  shock.animationSpeed = 16 / 60; // fast enough to buzz, slow enough to read as two poses
  shock.loop = true;

  const rattle = gsap.timeline({ repeat: -1, yoyo: true });

  await wait((BOLT_LANDS_FRAME / BOLT_FPS) * 1000, timers);
  if (!o.alive() || rabbit.container.destroyed) { rattle.kill(); shock.destroy(); return; }

  // The rabbit's own art goes dark rather than being destroyed: the rabbit is
  // still the scene's, still standing on its tile, and has to come back.
  rabbit.hideSprite(true);
  rabbit.container.addChild(shock);
  shock.play();
  // In the container's units, so a crowned (and therefore larger) rabbit
  // rattles by the same share of its size.
  rattle.to(shock, { x: 2, duration: 0.04, ease: 'none' });

  await wait(o.holdMs, timers);

  rattle.kill();
  if (!shock.destroyed) { shock.stop(); shock.destroy(); }
  if (rabbit.container.destroyed) return;
  rabbit.hideSprite(false);

  if (!o.fatal) {
    // Survived: the flinch, and back on its feet — `playDamage` alone would
    // leave the rabbit on the row's empty tail, invisible where it stands.
    rabbit.playDamage();
    rabbit.recoverFromDamage();
    return;
  }

  // Killed: the death row, which ends on a full frame (the body flat on the
  // ground) and so holds by itself — then LEFT there a beat, because an effect
  // that cuts the instant its last frame arrives reads as a clipped animation
  // rather than as a death landing.
  await new Promise<void>((resolve) => {
    let settled = false;
    const done = () => { if (!settled) { settled = true; resolve(); } };
    rabbit.playDeath(done);
    // A floor under the animation's own callback: the row is six frames at
    // 8fps, and if the sheet ever fails to load `playAnim` returns without
    // playing and `onComplete` would never come.
    const t = window.setTimeout(() => { timers.delete(t); done(); }, 1200);
    timers.add(t);
  });
  await wait(DEATH_HOLD_MS, timers);
}
