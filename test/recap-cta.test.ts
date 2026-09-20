/**
 * THE RECAP'S LAST BUTTON, on a run that was WON.
 *
 * A cleared island (and the tutorial's chest) leaves exactly one thing to
 * press. Three things were wrong with it, all reported on 2026-09-20:
 *
 *  · it wore the card's own glass and muted grey — the palette this app uses
 *    for a DISABLED control ("on dirait que c'est disable"), on the one screen
 *    where it is the only live thing;
 *  · nothing pointed at it ("a la fin aussi mets-la bien au centre");
 *  · and it waited for ever ("avec un timer aussi").
 *
 * A LOSING recap is deliberately untouched: it holds a real decision — buy a
 * refill, or go home and let the garden fill the bar for free — and a
 * countdown on a decision is a decision taken for the player.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const RECAP = readFileSync('src/components/run-recap.tsx', 'utf8');
const CSS = readFileSync('src/app/globals.css', 'utf8');
const DIALOGS = readFileSync('src/app/px-dialogs.css', 'utf8');

describe('the won recap', () => {
  it('gives HOME the loud face, not the ghost one', () => {
    // The `won` branch must pick the button face and bright ink; the ghost
    // face belongs to the case where HOME is the quiet alternative.
    expect(RECAP).toMatch(/color=\{won \? BTN : GLASS\}/);
    expect(RECAP).toMatch(/textColor=\{won \? INK : MUTED\}/);
    expect(RECAP).toMatch(/wiggle=\{won\}/);
  });

  it('carries NO chevron — the card is already one live control', () => {
    /**
     * It was drawn over the note and the bank line rather than above the
     * button: the card is a column in flow, so a chevron anchored absolutely
     * to the button's top landed on the text above it (Paul, 2026-09-20).
     * An arrow earns its place over MARK A BOMB, where the button competes
     * with a busy board; on a dialog with one button it is decoration
     * covering words.
     */
    expect(RECAP).not.toMatch(/PixelArrow/);
    expect(CSS).not.toMatch(/\.rr-recap-arrow/);
  });

  it('sits in the MIDDLE of the screen', () => {
    /**
     * Three rules set this card's bottom margin, and the one that WON is the
     * three-class selector in px-dialogs — not the one in globals. Setting
     * `margin-block: auto` on the looser selector changed nothing, and the
     * card stayed on the floor with 536px of slack above it (measured on an
     * 800px viewport). Fixed where it is actually decided.
     */
    /**
     * Auto margins were tried TWICE and could not work: the card is one flex
     * item among several, and they leave no free space for `auto` to claim —
     * measured live at the end of the tutorial, computed margin 0 and the card
     * at 700-900 in a 900px viewport. Taking it out of the column is what
     * finally centred it (350/350, measured).
     *
     * `!important` because NineSlicePanel writes `position: relative` INLINE,
     * which beats any selector — without it `top: 50%` resolved against the
     * flow position and put the card 955px down a 900px screen.
     */
    expect(DIALOGS).toMatch(/position: fixed !important;/);
    expect(DIALOGS).toMatch(/transform: translate\(-50%, -50%\);/);
  });

  it('does not let the run keep talking over its own ending', () => {
    // The captions are flex items too: with them mounted the card had no slack
    // to centre in, and a strip still saying "the island is the clock" under a
    // card reporting the run is the board talking over itself.
    const PAGE = readFileSync('src/app/page.tsx', 'utf8');
    expect(PAGE).toMatch(/!spectating && !game\.recap && \(\s*<FirstRunCaption/);
    expect(PAGE).toMatch(/questNote && !spectating && !game\.recap/);
  });

  it('counts down and leaves on its own', () => {
    expect(RECAP).toMatch(/const AUTO_HOME_SECONDS = \d+;/);
    expect(RECAP).toMatch(/useAutoHome\(won \? onHome : null\)/);
  });

  it('counts from a DEADLINE, so a backgrounded tab does not stall it', () => {
    // Decrementing per tick drifts when the browser throttles timers: come
    // back to the tab and the card is still sitting on "4".
    expect(RECAP).toMatch(/const until = Date\.now\(\) \+ AUTO_HOME_SECONDS \* 1000;/);
    expect(RECAP).toMatch(/Math\.ceil\(\(until - Date\.now\(\)\) \/ 1000\)/);
  });

  it('navigates OUTSIDE the state updater', () => {
    // An updater must be pure; React runs it twice in StrictMode, which
    // called `onHome` twice on a single expiry.
    const fn = RECAP.slice(RECAP.indexOf('function useAutoHome'));
    expect(fn).not.toMatch(/setLeft\(\(n\) => \{[\s\S]*?goRef\.current/);
  });

  it('never counts down a LOSING recap', () => {
    // `won ? onHome : null` is the whole rule: no target, no timer.
    expect(RECAP).toMatch(/useAutoHome\(won \? onHome : null\)/);
    expect(RECAP).toMatch(/if \(!go\) \{ setLeft\(null\); return; \}/);
  });

  it('shows the count rather than vanishing silently', () => {
    expect(RECAP).toMatch(/secondsLeft !== null && secondsLeft > 0/);
    // ASCII only — the kit's bitmap face cannot draw a middle dot, and
    // `pixel-font-glyphs` is what caught it.
    expect(RECAP).not.toMatch(/countdown\}> \u00b7/);
  });
});

describe('the eruption stands down when the run ends', () => {
  const HOOK = readFileSync('src/components/use-game-socket.ts', 'utf8');

  it('clears `erupting` on run_over', () => {
    /**
     * It was only ever cleared on the NEXT snapshot, so on a cleared island
     * "THE ISLAND SINKS" went on pulsing over the board behind the recap — a
     * banner announcing a thing that had already finished, under a card
     * reporting it. Paul, 2026-09-20: "ca tourne en fond".
     */
    const handler = HOOK.slice(HOOK.indexOf("socket.on('run_over'"));
    expect(handler.slice(0, 1400)).toMatch(/setErupting\(null\);/);
  });
});
