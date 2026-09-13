'use client';

/**
 * THE SHIELD CARD — how long raids keep bouncing off.
 *
 * WHY IT MOVED. This was the last panel still wearing `BurrowCard`, the game's
 * nine-slice wooden frame, while the three cards under it had become the mock's
 * rounded slabs. That was not only a visual mismatch: the wooden card sizes
 * itself from its CONTENTS, so on the Seeker (890x400) it took 130px — a third
 * of the screen — and pushed the burrow card and the whole launcher row out of
 * the viewport. The story never showed it, because a fresh guest in the story
 * has no shield; the app does, and that is where it was caught.
 *
 * IT IS THE SHORTEST CARD. 11svh against energy's 12.4 and the garden's 14.5:
 * it carries a heading, a countdown and one line of explanation, with no bar,
 * no strip and no button. A card sized like its neighbours would be mostly
 * empty, and this one appears UNANNOUNCED (only while a shield holds) — so the
 * space it takes is space the player did not ask for.
 */
import { HubCard, HubRow, headingText, valueText, subText, SUB_CLASS } from './hub-card';

const SHIELD_ART = '/assets/ui/icons/shield.webp';

/** The game's own wait formatter, matching the rest of the burrow column. */
function formatWait(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

export function ShieldCard({ ms }: { ms: number }) {
  return (
    <HubCard ratio={11} art={SHIELD_ART} artHeight="52cqh">
      <HubRow>
        <span style={headingText}>SHIELD</span>
        <span style={valueText}>{formatWait(ms)}</span>
      </HubRow>
      {/* Hides on a short card like every other sub-line. What it explains —
          that raids bounce — is already carried by the heading and the
          countdown beside it. */}
      <p className={SUB_CLASS} style={subText}>
        You were raided. Raids bounce off until it runs out.
      </p>
    </HubCard>
  );
}
