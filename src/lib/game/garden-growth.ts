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
import { BURROW, GARDEN } from '@config/tuning';
import PLOTS from '@/config/carrotPlots.json';

/**
 * Growth frames in the sprite sheet, sprout to harvest-ready.
 *
 * Counted from the atlas rather than written down, for the same reason the
 * frame RECTANGLES are read from it: a re-export that adds or drops a stage
 * would otherwise leave this number describing a sheet that no longer exists,
 * and `growthFrame` would clamp early — carrots stopping half-grown, with
 * nothing failing.
 */
export const STAGES = PLOTS.frames.length;

/** The top of the upgrade track, which the crop's density is scaled against. */
const MAX_BURROW_LEVEL = BURROW.MAX_LEVEL;

/**
 * How long one plot takes to play its full growth animation, in ms.
 *
 * The sum of the frames' own hold times, carried through from Aseprite by
 * `tools/plant_carrots.py`. It was a hand-written 1400 against a sheet the
 * artist timed at 12 x 100 = 1200, so every carrot grew about 17% slower than
 * drawn and each frame was held for an uneven number of ticks. Taking the
 * number from the art means the cycle plays at the speed it was animated at,
 * and re-timing it in Aseprite is enough to change the game.
 */
export const GROW_MS = PLOTS.growMs;

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
 * field, for a field of `REFERENCE_PLOTS` plants. Progress interpolates
 * between them.
 *
 * The empty end is deliberately not silence: a garden with nothing in it still
 * has to look like a garden rather than like a bug, so it ticks over slowly.
 */
export const SPAWN_GAP_MS = { empty: 2600, full: 240 } as const;

/**
 * The field size `SPAWN_GAP_MS` was tuned against: 12 cells at the lowest
 * density, which is the ~36 plants the painted field used to carry.
 *
 * The gaps are a per-PLOT pause, so on their own they make the time a field
 * takes to fill proportional to how many plants are in it — and once density
 * scaled with the burrow level, a level-20 field needed 17 seconds to look as
 * full as a level-1 one did in 8. That is backwards: the player who upgraded
 * is the one who waits longest to see the harvest they are being told they
 * already have. Scaling the gap by the field's size against this reference
 * keeps the FILL as the constant, which is what the eye actually reads.
 */
export const REFERENCE_PLOTS = 36;

/** Carrots per hour a garden makes at `level`. */
export function yieldPerHour(burrowLevel: number): number {
  return GARDEN.YIELD_PER_HOUR_BASE + GARDEN.YIELD_PER_LEVEL * (burrowLevel - 1);
}

/**
 * Carrots the garden holds when completely full.
 *
 * The visual ceiling has to be the ECONOMIC one, or a "full" field would pay
 * out differently from how it looks — so this is the ONLY place the ceiling is
 * computed. `lib/game/burrow.ts` reports this exact number to the HUD ("holds
 * 576") and `gardenProgress` divides by it to fill the field, which is what
 * makes the panel and the picture two readings of one quantity.
 *
 * It used to be worked out here AND in `burrowView`, with a `Math.floor` on
 * this copy only. The two agreed at every shipped level, which is exactly what
 * made it dangerous: the day a fractional yield arrived the field would have
 * hit "full" at a different number than the panel promised, and nothing would
 * have failed loudly.
 */
export function gardenCapacity(burrowLevel: number): number {
  return Math.floor(GARDEN.CAP_HOURS * yieldPerHour(burrowLevel));
}

/**
 * Plants drawn per field cell, at the LOWEST and the HIGHEST burrow.
 *
 * Three was a fixed number chosen to match the 35 plants the painted field
 * carried. It made a level-20 garden — which holds 2304 carrots against level
 * 1's 480, nearly five times as much — draw exactly the same crop as a level-1
 * one. Every other consequence of an upgrade is visible in the place (the fence
 * becomes railings, then a castle wall), so a field that never changes was the
 * one part of the burrow that quietly denied the player's progress.
 *
 * The range is deliberately narrow. The garden's fullness still has to be
 * readable at a glance, and that reading is `grownCount`'s share of the plots
 * standing — if a big burrow packed in ten times the plants, a quarter-full
 * level-20 field would carry more carrots than a FULL level-1 one and "how busy
 * does it look" would stop meaning anything on its own. Doubling says "this
 * garden is bigger" while leaving the share to say how full it is.
 */
export const PER_CELL = { min: 3, max: 6 } as const;

/**
 * How many plants to sow on each field cell at `burrowLevel`.
 *
 * Interpolated on CAPACITY rather than on the level number, because capacity is
 * what the field is a picture of: the panel promises "holds 576" and the crop
 * is that promise drawn. Levels are also not evenly spaced in carrots — the
 * first upgrade adds 96 to the ceiling and they all add the same 96 after it —
 * so pacing the art on the number the player actually reads keeps the two in
 * step at every level rather than only at the ends.
 */
export function plantsPerCell(burrowLevel: number): number {
  const lowest = gardenCapacity(1);
  const highest = gardenCapacity(MAX_BURROW_LEVEL);
  const span = highest - lowest;
  const t = span <= 0 ? 0 : (gardenCapacity(burrowLevel) - lowest) / span;
  const eased = Math.max(0, Math.min(1, t));
  return Math.round(PER_CELL.min + (PER_CELL.max - PER_CELL.min) * eased);
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
 *
 * `plots` is how many plants the field holds, and dividing by it against the
 * reference is what keeps a denser field filling in the same WALL-CLOCK time
 * rather than in proportion to its size — see `REFERENCE_PLOTS`. Left out, the
 * gap is the reference field's, which is what every caller wanted before
 * density varied.
 */
export function spawnGapMs(progress: number, plots = REFERENCE_PLOTS): number {
  const p = Math.max(0, Math.min(1, progress));
  const eased = p * p; // slow to get going, then rapidly busier
  const gap = SPAWN_GAP_MS.empty + (SPAWN_GAP_MS.full - SPAWN_GAP_MS.empty) * eased;
  const n = Math.max(1, plots);
  return gap * (REFERENCE_PLOTS / n);
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
