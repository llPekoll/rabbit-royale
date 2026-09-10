/**
 * The carrot iris's timings, shared by its two implementations.
 *
 * There are two, and they are not a duplication to be tidied away. The Pixi
 * iris (game/fx/CarrotWipe) covers everything drawn on the canvas; but the
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
 */
export const WIPE_CLOSE_MS = 580;
export const WIPE_OPEN_MS = 680;

/**
 * The beat of full black between them.
 *
 * Long enough to be a deliberate pause rather than a stutter — this is where
 * the scene swap hides, and a cut the eye can rest on for a moment reads as
 * intentional where a flicker reads as a hitch.
 */
export const WIPE_HOLD_MS = 500;

/**
 * The hole at its widest, as a multiple of the screen's diagonal.
 *
 * Over 1 because the carrot is a narrow shape: an aperture whose HEIGHT covers
 * the diagonal still leaves corners of screen outside its WIDTH, and those
 * would stay black at the moment the wipe is supposed to be fully open.
 */
export const WIPE_OPEN_SCALE = 2.6;

/** The silhouette the hole is cut from. Alpha only — see AssetLoader. */
export const WIPE_MASK_URL = '/assets/fx/carrot-mask.webp';
