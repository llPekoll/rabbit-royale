/**
 * The season board's podium: the top three, drawn rather than listed.
 *
 * A leaderboard is a list of near-identical lines, and the three rows that
 * matter most are the ones a player scans for first. Giving those three their
 * rabbit — the leader half again as big as the runners-up, wearing the crown —
 * turns the head of the list into a picture that can be read at a glance,
 * while the rest stays text. A face on every row would be a face on no row.
 *
 * The numbers live here, not in the component, because two places draw this:
 * `components/leaderboard-drawer.tsx` (what ships) and
 * `stories/CrownedRabbit.stories.tsx` (where it was tuned, and where it is
 * re-judged). Copies of geometry are how a mock and a product drift apart.
 *
 * Every value below was settled by looking at it at several widths, not by
 * arithmetic — see the story for what each one was before and why it moved.
 */

/**
 * Where the rabbit actually is inside idle frame 0 of a bunny sheet, in source
 * pixels: x 8..22, y 18..32. Measured off the sheets; all five are identical.
 *
 * Cropping to the ART rather than to the 32px cell is what stops the face
 * sitting in a pocket of empty space. `components/profile-menu.tsx` measures
 * the same window for the avatar picker.
 */
export const ART = { x: 8, y: 18, w: 14, h: 14 } as const;

/** How many rows from the top carry a face. Three, because that is a podium. */
export const PODIUM = 3;

/** Runners-up on the podium, as a multiple of the sheet's own pixels. */
export const PODIUM_SIZE = 2;

/**
 * How much bigger the leader is drawn than the two below them.
 *
 * 2.5, up from 2: at twice the size the leader was clearly first, but the row
 * still read as a bigger version of the same thing. The half-step is what makes
 * rank 1 a different KIND of row rather than a larger instance of one.
 *
 * Deliberately NOT the island's crown scale (2, see `PlayerRabbit`). The two
 * views do different jobs: on the island the leader is one rabbit among others
 * on a shared board and past 2 they crowd the tiles, which are the game; on the
 * board there is a whole row reserved for them and nothing to crowd.
 */
export const LEAD_RATIO = 2.5;

/** The leader's rabbit, in the same sheet multiples. */
export const LEAD_SIZE = PODIUM_SIZE * LEAD_RATIO;

/**
 * The face column's width: sized to the BIGGEST rabbit in it.
 *
 * One number for every podium row, so the names beside them still start on a
 * common left edge — a column that widened only on row 1 would stagger the
 * list.
 */
export const FACE_COL = ART.w * LEAD_SIZE;

/**
 * The panel width below which the podium shows no faces at all.
 *
 * The board is a slide-over on a phone, about 212px of list there, and a rank,
 * a name and a score already fill that. Squeezing a face column in beside them
 * did not degrade gracefully — it ran the names under the scores ("Thistl25000")
 * and flattened the leader's rabbit to a smear.
 *
 * Shrinking the faces was the first attempt and it was the wrong shape of fix:
 * the rabbits are decoration and the three columns are the board, so past a
 * point the honest move is to drop the decoration rather than to keep it at a
 * size where nothing else fits. Above this width the podium is drawn in full.
 *
 * A container query would be the precise tool, but this list is sized by a
 * fixed drawer whose two layouts are already a media query (see `WIDE` in
 * `leaderboard-drawer.tsx`), so the same breakpoint keeps one story.
 */
export const PODIUM_MIN_PANEL = 260;

/* ── The crown ────────────────────────────────────────────────────────────
   Derived, not guessed. The first pass hard-coded a `paddingTop` that LOOKED
   about right at one zoom and clipped the crown's points at another, because
   the padding and the crown's offset were two independent numbers describing
   one relationship. `crownBox` computes the row's headroom FROM the crown, so
   the two cannot drift apart. */

/** The crown art, shared with the island — see `assetKeys.CROWN`. */
export const CROWN_URL = '/assets/ui/crown.png';

/** The source art, so the aspect ratio comes from the file rather than a guess. */
const CROWN_SRC = { w: 29, h: 22 };

/**
 * The crown's width as a share of the rabbit's ART window.
 *
 * Sized to the HEAD, which is the part it sits on: the head rows span x 11..21
 * on the sheet — 11 source pixels against `ART.w`'s 14 — so a crown matched to
 * it is 11/14 of the window, and a touch wider so the band overhangs the skull
 * the way a crown does rather than balancing on top of it.
 *
 * Sized to the whole BODY it came out wider than the rabbit's shoulders, which
 * is what made it look like a hat two sizes too big.
 */
const CROWN_W_RATIO = (11 / ART.w) * 1.1;

/**
 * How far right of the ART window's centre the HEAD sits, in source pixels.
 *
 * On idle frame 0 the head rows (y 18..24) span x 11..21, centred on x=16,
 * while the ART window is x 8..22 and so centres on x=15: the window is cut to
 * the whole body, haunches included, and those stick out to the LEFT. One
 * source pixel is several on screen at the leader's size, and that is exactly
 * the lean that made the crown look badly placed.
 */
export const HEAD_DX = 1;

/**
 * The crown's jaunty lean, in degrees.
 *
 * Arena tilts its own by +15 and the reasoning carries: a crown square to the
 * pixel grid reads as a hat rather than as a crown. Negative here, so it leans
 * the other way — anticlockwise, dipping toward the rabbit's left. -8 was too
 * timid to read as deliberate at this size.
 */
export const CROWN_TILT = -14;

/**
 * How far the band sinks INTO the head, as a share of the crown's own height.
 *
 * A share rather than a pixel count: the bite is what makes the crown read as
 * worn, and a fixed 8px was a third of the band at one size and the whole of it
 * at another.
 */
const CROWN_BITE_RATIO = 0.45;

/**
 * The crown's drawn box on a rabbit at `size`, and the headroom the row needs.
 *
 * `rise` is measured on the ROTATED shape: the tilt swings the far corner up,
 * so a row sized to the upright height is a row the lean puts a crown point
 * back through the top of.
 */
export function crownBox(size: number): { w: number; h: number; bite: number; rise: number } {
  const w = ART.w * size * CROWN_W_RATIO;
  const h = (w / CROWN_SRC.w) * CROWN_SRC.h;
  const bite = h * CROWN_BITE_RATIO;
  const rad = (CROWN_TILT * Math.PI) / 180;
  const tilted = Math.abs(h * Math.cos(rad)) + Math.abs(w * Math.sin(rad));
  return { w, h, bite, rise: Math.ceil(tilted - bite) };
}
