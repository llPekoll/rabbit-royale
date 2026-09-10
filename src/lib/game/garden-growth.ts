/**
 * How grown the garden LOOKS, and when each plot animates.
 *
 * The burrow already knows what the garden is worth — `gardenYield` turns time
 * since the last harvest into carrots. This turns the same fact into a picture:
 * the field fills in as the carrots accumulate, and empties the moment they are
 * collected.
 *
 * The key decision is WHAT progress drives. A carrot parked on a growth frame
 * proportional to `gardenReady` would be correct and completely dead: the
 * garden fills over twelve hours, so on any human timescale every sprite is
 * frozen and the animation is never seen. So progress does NOT set a frame.
 * Instead every plot plays its whole sprout-to-ripe animation as a one-shot,
 * and progress sets HOW OFTEN a plot does that — a nearly empty field pops one
 * carrot now and then, a filling field is busy with them. Motion is the thing
 * the player actually sees, so motion is what carries the information.
 *
 * Two clocks feed it, and they answer different questions:
 *
 *  - Signed in, it is the REAL garden: `gardenReady / capacity`. A full field
 *    means a full harvest waiting, and harvesting visibly empties it. A higher
 *    burrow level fills it faster because it genuinely produces faster.
 *  - Signed out there is no garden and no row to read, so the field runs a slow
 *    decorative LOOP. It is scenery on a waiting screen: alive, but not
 *    implying the viewer owns a farm, and needing no server.
 *
 * Pure and time-injected, so the visuals are testable without waiting 12 hours.
 */
import { GARDEN } from '@config/tuning';

/** Growth frames in the sprite sheet, sprout to harvest-ready. */
export const STAGES = 12;

/** How long one plot takes to play its full growth animation, in ms. */
export const GROW_MS = 1400;

/**
 * One turn of the idle loop, in ms.
 *
 * Long enough that the field is not a flickering distraction behind the UI,
 * short enough that someone waiting on the sign-in screen sees it move — a
 * cycle they never see complete reads as a still image.
 */
export const IDLE_CYCLE_MS = 120_000;

/**
 * Seconds between one plot sprouting and the next, at an EMPTY and a FULL
 * field. Progress interpolates between them.
 *
 * The empty end is deliberately not silence: a garden with nothing in it still
 * has to look like a garden rather than like a bug, so it ticks over slowly.
 */
export const SPAWN_GAP_MS = { empty: 2600, full: 240 } as const;

/**
 * Carrots the garden holds when completely full.
 *
 * The visual ceiling has to be the ECONOMIC one, or a "full" field would pay
 * out differently from how it looks.
 */
export function gardenCapacity(burrowLevel: number): number {
  const perHour = GARDEN.YIELD_PER_HOUR_BASE + GARDEN.YIELD_PER_LEVEL * (burrowLevel - 1);
  return Math.floor(GARDEN.CAP_HOURS * perHour);
}

/** How full the field is, 0..1, from the real garden. */
export function gardenProgress(gardenReady: number, burrowLevel: number): number {
  const cap = gardenCapacity(burrowLevel);
  if (cap <= 0) return 0;
  return Math.max(0, Math.min(1, gardenReady / cap));
}

/** The decorative loop's position, 0..1, for a viewer with no garden. */
export function idleProgress(elapsedMs: number, cycleMs = IDLE_CYCLE_MS): number {
  if (cycleMs <= 0) return 0;
  const t = ((elapsedMs % cycleMs) + cycleMs) % cycleMs;
  return t / cycleMs;
}

/**
 * How long to wait before starting the next plot's animation.
 *
 * Shrinks as the field fills, so the field's BUSYNESS is the readout: you can
 * tell a nearly-ripe garden from a just-harvested one across the room, without
 * reading a number. Eased so the change is felt over the whole range rather
 * than all at once near the top.
 */
export function spawnGapMs(progress: number): number {
  const p = Math.max(0, Math.min(1, progress));
  const eased = p * p; // slow to get going, then rapidly busier
  return SPAWN_GAP_MS.empty + (SPAWN_GAP_MS.full - SPAWN_GAP_MS.empty) * eased;
}

/**
 * How many plots stand grown, once the field has settled.
 *
 * A plot that finished its animation STAYS ripe — that is the harvest sitting
 * there waiting. So progress also decides how much of the field is standing,
 * not just how fast it fills.
 *
 * Never quite zero: a freshly harvested garden still shows a couple of shoots
 * coming up. At a literal zero the field is not "empty", it is INERT — nothing
 * sprouts, nothing moves, and the picture reads as a failed asset load rather
 * than as a garden you just cleared. The floor is what keeps it a place.
 */
export function grownCount(progress: number, plots: number): number {
  const p = Math.max(0, Math.min(1, progress));
  return Math.max(p > 0 ? 1 : MIN_LIVE_PLOTS, Math.round(p * plots));
}

/** Shoots kept alive on a completely empty garden — see `grownCount`. */
export const MIN_LIVE_PLOTS = 2;

/**
 * The frame a plot shows, `msSinceSprout` into its animation.
 *
 * Clamps at the last frame rather than looping: a grown carrot stays grown
 * until it is harvested, and a field that kept restarting would read as
 * decoration rather than as a crop.
 */
export function growthFrame(msSinceSprout: number, growMs = GROW_MS): number {
  if (msSinceSprout <= 0) return 0;
  const t = Math.min(1, msSinceSprout / growMs);
  return Math.min(STAGES - 1, Math.floor(t * STAGES));
}
