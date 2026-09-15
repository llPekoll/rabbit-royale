/**
 * LANDSCAPE ONLY, ON A PHONE.
 *
 * The board is held sideways — the Android shell already pins the activity to
 * `sensorLandscape`, and players of this kind of game expect it. A phone
 * browser held upright used to get a portrait layout of its own: a stacked
 * loop bar, a squeezed column, a board scaled for a canvas nobody plays on.
 * It is refused instead: the page shows <RotateGate/> and the Pixi app keeps
 * the landscape layout it already has (Application.ts `resize`), so turning
 * the phone back is instant rather than a re-frame.
 *
 * `pointer: coarse` is what makes it a PHONE rule: a desktop window dragged
 * tall and narrow is not a device anyone rotates, and keeps its layout.
 *
 * One string for both sides of the rule — globals.css repeats it verbatim in a
 * media query, and test/rotate-gate.test.ts holds the two together.
 */
export const PORTRAIT_GATE_QUERY = '(orientation: portrait) and (pointer: coarse)';
