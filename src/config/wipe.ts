/**
 * The carrot iris's timings, shared by its two implementations.
 *
 * There are two, and they are not a duplication to be tidied away. The Pixi
 * iris (game/fx/ShapeWipe) covers everything drawn on the canvas; but the
 * sign-in screen is DOM, and it UNMOUNTS the moment a player appears — a
 * shutter living inside the canvas cannot cover the arrival of the canvas
 * itself. So that one crossing is cut in CSS instead.
 *
 * What must not diverge is the RHYTHM. Two irises with different beats would
 * read as two different effects, and the first one a new player ever sees is
 * the sign-in cut — so it is the one that sets the expectation for the rest.
 * Hence one file, imported by both, rather than two sets of numbers that agree
 * for exactly as long as nobody edits either.
 *
 * The DOM side cannot import from game/fx directly: that module pulls in Pixi
 * and gsap, and the page must not drag the engine into its own bundle just to
 * read four numbers.
 */

/**
 * How long each half takes.
 *
 * Brisk, but not hurried: this sits between a press and the thing the player
 * asked for, so it reads as punctuation rather than as a wait.
 *
 * The opening is the slower of the two on purpose: closing is the game taking
 * the screen away, and that should feel decisive; opening is handing the new
 * one over, and that can afford to be generous.
 *
 * "Half" means the half before the swap and the half after it, which is what
 * both effects have in common — the iris shutting then opening, the curtain
 * covering then uncovering on one continuous pass. Sharing the pair is what
 * keeps the variants on one beat even though only one of them reverses.
 */
export const WIPE_CLOSE_MS = 580;
export const WIPE_OPEN_MS = 680;

/**
 * The beat of full black between them — FOR THE IRISES ONLY.
 *
 * Long enough to be a deliberate pause rather than a stutter — this is where
 * the scene swap hides, and a cut the eye can rest on for a moment reads as
 * intentional where a flicker reads as a hitch.
 *
 * The CURTAIN does not use it, and that is not an oversight. An iris has one
 * hole and has to come back out through its own middle, so it necessarily
 * stops at the bottom of its travel and the only question is how long for. A
 * band has a far side to leave by: it passes straight over, hiding the swap in
 * the moment its solid core spans the screen, and never stops at all. See
 * `game/fx/CurtainWipe`. Holding it there would add a pause the shape does not
 * call for — which is what it used to do, and what it read as was waiting.
 */
export const WIPE_HOLD_MS = 500;

/**
 * The silhouettes the hole can be cut from. Alpha only — see AssetLoader.
 *
 * Three rather than one so the crossing does not become wallpaper: a signature
 * shape seen on every single transition stops reading as a flourish and starts
 * reading as a loading screen. Which one a given crossing uses is decided by
 * `game/fx/RandomWipe`.
 *
 * The carrot is a hand-drawn silhouette (tools/gen_carrot_mask.py) because the
 * kit's carrot sprite carries its shape in shading and came out a blob; the
 * other two are derived from the game's own sprites (tools/gen_wipe_masks.py)
 * because ears and a fuse are holes in an alpha channel and survive the trip.
 */
export const WIPE_MASK_URLS = {
  carrot: '/assets/fx/carrot-mask.webp',
  bunny: '/assets/fx/bunny-mask.webp',
  bomb: '/assets/fx/bomb-mask.webp',
} as const;

export type WipeShape = keyof typeof WIPE_MASK_URLS;

/**
 * The hole at its widest, as a multiple of the screen's diagonal — PER SHAPE.
 *
 * Over 1 in every case because a silhouette is not its bounding box: an
 * aperture whose box covers the diagonal still has screen showing through the
 * gaps beside the shape itself, and those stay black at the moment the wipe is
 * supposed to be fully open.
 *
 * How much over is a property of the individual drawing, which is why this is
 * three numbers and not one. The carrot fills 36% of its box (a slim root lying
 * on a diagonal), the skull 72%, the bomb 64% — so the carrot needs its box
 * blown up nearly three times the diagonal before its narrow part clears the
 * corners, while the other two are stockier and get there sooner.
 *
 * MEASURED, not guessed: each number is the smallest that leaves no uncovered
 * pixel at any aspect ratio the game can be played at (tall phone, wide
 * desktop, square), plus headroom. Eyeballing these is how they were wrong
 * before — an aperture "looks" open well before it actually clears the corners,
 * because the black that is left sits in the margins where nothing is drawn.
 *
 * They are a property of the ART, so a retouched mask can invalidate them. The
 * fuse added to the bomb is exactly that: it made the drawing taller without
 * making its BODY wider, and since the hole is sized by height, the body's
 * share of it shrank and 1.15 went from clear to leaving 17% of the screen
 * black at full open. Re-measure after editing a mask.
 *
 * One number for all three was the first cut of this, and it was wrong in the
 * direction that matters: sized for the carrot, the stocky shapes spent the
 * whole close far too big to read as anything, which defeats the point of
 * having them. An aperture is only a shape during the moment it is SMALL.
 */
export const WIPE_OPEN_SCALE: Record<WipeShape, number> = {
  carrot: 2.85,
  bunny: 1.9,
  bomb: 2.3,
};

/**
 * The carrot alone, for the DOM iris over the sign-in screen.
 *
 * That cut does NOT join the rotation, on purpose: it is the first thing a new
 * player ever sees, and the one place the game gets to state what its shape is.
 * Variety is for the crossings that repeat.
 */
export const WIPE_MASK_URL = WIPE_MASK_URLS.carrot;
