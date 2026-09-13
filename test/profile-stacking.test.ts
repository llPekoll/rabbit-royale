/**
 * The profile panel has to be able to rise above the season board.
 *
 * It could not, and the failure was silent: clicking the chip opened the panel
 * exactly where the board already was, at the same edge and the same width, so
 * the button "did nothing". Two separate causes, both worth pinning down —
 * neither shows up in a unit test of the component, and both are the kind of
 * CSS a later edit reintroduces without noticing.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const CSS = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
const MENU = readFileSync(new URL('../src/components/profile-menu.tsx', import.meta.url), 'utf8');

describe('profile panel stacking', () => {
  it('is portalled out of the topbar', () => {
    // The chip lives in `.rr-topbar`, which is positioned and therefore forms a
    // stacking context: a panel rendered inside it is capped by the topbar's
    // own z-index no matter how high its own goes.
    expect(MENU).toMatch(/createPortal\(/);
    expect(MENU).toMatch(/document\.body/);
  });

  it('sits above the season board', () => {
    const z = (sel: string) => {
      const block = CSS.slice(CSS.indexOf(sel));
      // The window was 400 chars and the board's rule outgrew it when the
      // panel was rewritten to float — the `z-index` was still there, just
      // further down past the comment explaining the new box. Widened rather
      // than trimmed: what this test is about is the ORDER of two numbers, and
      // it should not also be a limit on how well a rule is documented.
      const m = block.slice(0, 1200).match(/z-index:\s*(\d+)/);
      return m ? Number(m[1]) : NaN;
    };
    expect(z('.rr-profile {')).toBeGreaterThan(z('.rr-lb {'));
  });

  it('does not let a blanket rule stamp a z-index onto the overlays', () => {
    // `.rr-home > *:not(.rr-home-art) { z-index: 1 }` flattened the board AND
    // the panel to 1 and made the topbar a stacking context. Overlays position
    // themselves; only flow content needs lifting off the artwork.
    expect(CSS).not.toMatch(/\.rr-home\s*>\s*\*:not\(\.rr-home-art\)/);
  });

  /**
   * The wide-screen rules that needed the `:not(.rr-profile)` guard are gone.
   *
   * Two of them existed: `.rr-lb { transform: none }`, which pinned the board
   * open above 860px, and a `padding-right` gutter that made room for it. The
   * board now opens only when its trophy button is pressed and floats over the
   * water instead of taking a column of the page, so neither rule survives —
   * and the profile panel has nothing left to be excluded from.
   *
   * What still has to hold is the thing those guards protected: the profile
   * panel must not be pinned open by anything the BOARD does.
   */
  it('is not pinned open by any board rule', () => {
    expect(CSS).not.toMatch(/\.rr-lb\s*\{\s*transform:\s*none/);
    expect(CSS).not.toMatch(/padding-right: calc\(330px/);
  });

  it('can always be dismissed', () => {
    // On a wide screen the board's chrome hides the [x], so a scrim and Escape
    // are what keep this from being a trap.
    expect(CSS).toMatch(/\.rr-profile-scrim/);
    expect(MENU).toMatch(/rr-profile-scrim/);
    expect(MENU).toMatch(/'Escape'/);
  });
});
