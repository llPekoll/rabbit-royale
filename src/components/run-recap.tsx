'use client';

import type { CSSProperties } from 'react';
import { NineSlicePanel, PanelTitle } from '@domin8/arcade-kit';
import { PX, PxButton, pxLabel } from './px';
import type { RunRecap } from './use-game-socket';
import { FIRST_RUN_RECAP } from '@/config/first-run';

/**
 * The end of a run, and the way out of it.
 *
 * EVERY run ends the same way: `resolveMove` kills the rabbit when, and only
 * when, its energy hits zero (see the `energy <= 0` check in `run.ts`). A bomb
 * does not end a run — it takes 8 energy and can be survived. So "Run over"
 * and "the tank is empty" are THE SAME EVENT, and the refill is always the
 * offer that matches the screen.
 *
 * This used to be decided from the BURROW's energy instead, which is a
 * different resource entirely — a right of entry, regenerating 12/hour to a
 * ceiling of 60, while a run's own bar starts at 30 and is spent digging. The
 * two never agreed, and the burrow's figure is not even debited by a run, so
 * the empty-tank branch this file was written for could not fire: the recap
 * offered "Again" to a player who had just run dry, which is the one thing
 * they cannot do.
 *
 * The choice is real and two-sided — buy a refill and keep digging now, or go
 * home and let the garden fill the bar for free. Both are shown, and going
 * home is the plain one: the shop is never the only door out of an empty tank,
 * or the wait becomes a toll.
 */
export function Recap({
  recap, onShop, onHome, first = false, bank = null,
}: {
  recap: RunRecap;
  onShop: () => void;
  onHome: () => void;
  /**
   * The first run ever. The card adds one line pointing home, because the
   * burrow is a place the player has not been told exists yet — the first
   * island opens straight from sign-in, and "Back to the burrow" alone names
   * a door without saying what is behind it.
   */
  first?: boolean;
  /**
   * The burrow's bar, and what a run takes from it. SHOWN, never decided on:
   * whether the run is over is the hearts' business (see above), but whether
   * there is another run in the bank is exactly the question this card's two
   * buttons ask, and the number was nowhere on the island until now.
   */
  bank?: { energy: number; max: number; cost: number } | null;
}) {
  // Two endings since the island became a level: the hearts ran out, or the
  // island did. The second is a win, and the card has to read like one — the
  // refill offer would be nonsense under "Island cleared".
  const cleared = !!recap.cleared;
  return (
    /* The codex's frame in the dark glass this card always sat on over the
       board. Margins live in px-dialogs.css (`.rr-recap`), where a short
       screen can tighten them. */
    <NineSlicePanel
      color={GLASS}
      pixelScale={PX}
      className="rr-card rr-recap"
      style={{ textAlign: 'center' }}
    >
      <h2 className="rr-recap-title">
        <PanelTitle>{cleared ? 'ISLAND CLEARED!' : 'RUN OVER'}</PanelTitle>
      </h2>
      <p className="rr-recap-stats">
        {/* The separator before the duration was missing, so a 3-bomb, 214s
            run printed "💣 3 214s" — which reads as one four-digit number. */}
        🥕 {recap.carrots} &middot; {recap.tilesDug} dug &middot; 💣 {recap.bombsHit}
        {' '}&middot; {formatRunTime(recap.durationMs)}
      </p>

      {/* Why there is no "Again", said plainly — a button that vanished with
          no explanation reads as a broken screen. */}
      <p className="rr-note">
        {cleared ? 'Every tile worth digging is dug. The volcano took the rest.' : 'Out of hearts.'}
        {first && <> {FIRST_RUN_RECAP}</>}
      </p>
      {/* The bar at home, beside what the next crossing would take from it —
          the figure both buttons below are really about. */}
      {bank && (
        <p className="rr-note" style={{ color: '#ffd138' }}>
          ⚡ {bank.energy}/{bank.max} at the burrow &middot; a run takes {bank.cost}
        </p>
      )}
      <div className="rr-recap-actions">
      {!cleared && (
        // The loud one: it wiggles when pressed.
        <PxButton color={BTN} textColor={INK} wiggle onClick={onShop} style={wide}>
          <span style={btnText}>Get more energy</span>
        </PxButton>
      )}
      {/* Leaving was always possible — the arrow below does it — but a player
          who has just finished is deciding between two things, and only one of
          them was written down. */}
      {/* HOME, the loop's own word for it, and what home is FOR: the haul is
          banked already, and stacking it (harvest, upgrade, bury) is the next
          verb. "Back to the burrow" named a door without saying what was
          behind it. */}
      {/* A ghost button was a transparent face on the card — so its face is
          the card's own glass, with the muted ink it always had. */}
      <PxButton
        className={cleared ? undefined : 'rr-btn ghost'}
        color={cleared ? BTN : GLASS}
        textColor={cleared ? INK : MUTED}
        onClick={onHome}
        style={wide}
      >
        <span style={btnText}>Home &middot; stack it</span>
      </PxButton>
      </div>
    </NineSlicePanel>
  );
}

/* ── The recap's colours, as they were ─────────────────────────────────── */
/** The card: the overlay's dark glass (rgba(13,17,23,.82) over the board). */
const GLASS = '#0d1117';
/** A plain button: the app's panel face, bright ink. */
const BTN = '#161b22';
const INK = '#e6edf3';
const MUTED = '#8b949e';
const wide: CSSProperties = { width: '100%' };
const btnText: CSSProperties = { ...pxLabel, fontSize: 13 };


/**
 * How long the run lasted, in minutes and seconds.
 *
 * Raw seconds are fine for a stopwatch and wrong for a result: "214s" makes
 * the reader do the division, and session length is the thing this game asks
 * players to get better at — so it is stated in the unit they think in.
 * Under a minute stays in seconds, where "47s" is already the natural form.
 */
function formatRunTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total}s`;
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}m ${secs}s`;
}
