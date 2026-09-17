/**
 * Your rabbit, at home, doing nothing in particular.
 *
 * The burrow is the screen a player looks at between runs, and until now the
 * one thing it never showed was the rabbit itself — you could see your fields,
 * your traps and your carrots, but the character the whole game is about only
 * existed on the island. So the homestead read as a property screen rather than
 * as somewhere somebody lives.
 *
 * This is deliberately NOT a game entity. It has no tile to defend, it cannot
 * be raided, tapped or stepped on, and nothing about it is sent to the server:
 * it wanders a few cells, stops to eat, and sits down again. The point is
 * occupancy — a burrow with a rabbit in it is a home, and one without is a map.
 *
 * It drives the real `PlayerRabbit` rather than a lookalike, so the hop, the
 * idle breath and the eat animation are the ones the island uses. A second,
 * simpler rabbit drawn just for this screen is how two rabbits end up looking
 * like two different animals.
 */
import type { Container } from 'pixi.js';
import { PlayerRabbit } from '../entities/PlayerRabbit';
import { walkableTiles, burrowNeighbors } from './board';
import { burrowTileScreen, burrowDepth } from './screen';
import { BURROW_COLS } from './generate';
import * as Keys from '@/config/assetKeys';

/**
 * How long between one idle action and the next, in ms.
 *
 * Slow, and deliberately so: this is scenery beside a UI the player is trying
 * to read. A rabbit that moves every second pulls the eye off the panel the
 * player actually opened, which is the failure mode for ambient life — it
 * stops being atmosphere and becomes a distraction.
 */
const BEAT_MIN_MS = 2600;
const BEAT_MAX_MS = 6200;

/**
 * How far it may stray from where it started, in cells.
 *
 * Kept close to the middle so it stays where the player can see it and out of
 * the corners where the chrome sits. It is a rabbit pottering about its own
 * yard, not one crossing the property.
 */
const ROAM = 3;

/** The odds a beat is a meal rather than a step. */
const EAT_CHANCE = 0.3;

/**
 * How much bigger than a raider this rabbit is drawn.
 *
 * The raider is sized so that four of them and a board full of cells fit one
 * screen; this one is alone on a homestead the camera is pulled back from, and
 * at the raider's scale it read as a speck of scenery rather than as YOU. The
 * burrow is a portrait of your place, and the rabbit is the subject of it.
 */
const HOME_SCALE = 1.8;

export class HomeRabbit {
  private rabbit: PlayerRabbit;
  private at: number;
  private home: number;
  private seed: string;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dead = false;

  constructor(parent: Container, seed: string, sheet: string = Keys.BUNNY_WHITE) {
    this.seed = seed;
    this.home = HomeRabbit.middleOf(seed);
    this.at = this.home;

    // The burrow's own projection, exactly as the raider takes it — the
    // homestead is on a different lattice from the island, and a rabbit built
    // with the island's default would stand in the wrong place entirely.
    this.rabbit = new PlayerRabbit(this.at, sheet, '', {
      at: (tile) => burrowTileScreen(seed, tile),
      depth: (tile) => burrowDepth(seed, tile) + 0.6,
    });
    // Through `setBaseScale`, not by writing `container.scale`: crowning
    // multiplies the base, so a season leader standing on their own homestead
    // keeps this size instead of silently dropping back to the island's.
    this.rabbit.setBaseScale(HOME_SCALE);
    // The crown marks you here; it does not also enlarge you. This rabbit is
    // already drawn big and stands alone, so doubling it again put it through
    // the treetops — and there is no one beside it for the size to mean
    // anything against.
    this.rabbit.setCrownGrows(false);
    parent.addChild(this.rabbit.container);
    this.schedule();
  }

  /**
   * The walkable cell nearest the middle of the plot.
   *
   * Two separate corrections, and both are needed. The middle is taken from
   * the walkable cells themselves rather than from the grid (see below), and
   * the cell RETURNED is the walkable one nearest that point — the true centre
   * is often a rock, a hole or the burrow mouth, none of which a rabbit can
   * stand on.
   */
  private static middleOf(seed: string): number {
    const walkable = walkableTiles(seed);
    if (walkable.length === 0) return 0;

    // The middle of the PLOT, not of the 19x19 grid it is cut from.
    //
    // The grid is a bounding box and the homestead is an irregular island
    // inside it, usually nowhere near the centre — so aiming at the grid's
    // middle parked the rabbit against whichever edge of the plot happened to
    // be closest to it. Averaging the walkable cells lands on the plot's own
    // centre of mass, which is what a player reads as "the middle".
    let sx = 0, sy = 0;
    for (const tile of walkable) {
      sx += tile % BURROW_COLS;
      sy += Math.floor(tile / BURROW_COLS);
    }
    const cx = sx / walkable.length;
    const cy = sy / walkable.length;

    let best = walkable[0];
    let bestD = Infinity;
    for (const tile of walkable) {
      const col = tile % BURROW_COLS;
      const row = Math.floor(tile / BURROW_COLS);
      const d = (col - cx) ** 2 + (row - cy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = tile;
      }
    }
    return best;
  }

  /** Chebyshev distance in cells — the grid the rabbit actually walks. */
  private static apart(a: number, b: number): number {
    const ac = a % BURROW_COLS, ar = Math.floor(a / BURROW_COLS);
    const bc = b % BURROW_COLS, br = Math.floor(b / BURROW_COLS);
    return Math.max(Math.abs(ac - bc), Math.abs(ar - br));
  }

  private schedule(): void {
    if (this.dead) return;
    const wait = BEAT_MIN_MS + Math.random() * (BEAT_MAX_MS - BEAT_MIN_MS);
    this.timer = setTimeout(() => this.beat(), wait);
  }

  /**
   * One idle action: eat where it stands, or take a single step.
   *
   * A step at a time rather than a path, because the rabbit has nowhere to be.
   * Wandering is the whole behaviour, so a destination would only make it look
   * like it was going somewhere and then stopping for no reason.
   */
  private beat(): void {
    if (this.dead) return;

    if (Math.random() < EAT_CHANCE) {
      this.rabbit.playEat();
      this.schedule();
      return;
    }

    // Only cells that keep it near home, so it never wanders off behind the
    // panels or out of frame.
    const options = burrowNeighbors(this.seed, this.at)
      .filter((tile) => HomeRabbit.apart(tile, this.home) <= ROAM);

    if (options.length > 0) {
      const to = options[Math.floor(Math.random() * options.length)];
      this.rabbit.moveTo(to);
      this.at = to;
    }
    this.schedule();
  }

  /** Wear the season's crown, or take it off. */
  setCrowned(on: boolean): void {
    this.rabbit.setCrowned(on);
  }

  /** Float the owner's name over them, as the island does. */
  setName(name: string, isMe = true): void {
    this.rabbit.setName(name, isMe);
  }

  destroy(): void {
    this.dead = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.rabbit.destroy();
  }
}
