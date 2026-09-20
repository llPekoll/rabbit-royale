'use client';

/**
 * The strip under the HUD that speaks during the first run.
 *
 * ONE LINE, and only on the tutorial island (`game.firstRun`). It names what
 * the player just did — the first dig, the first bomb, the heart back — from
 * the mover's own tally, so a stranger's bomb is never the player's lesson.
 * On every later island it renders nothing at all: the first run is the
 * tutorial, and a tutorial that follows you around is a nag.
 *
 * The line FADES on a clock, except the first one, which holds until the
 * first dig — "tap a tile" has to stay up for as long as nothing has been
 * tapped. Fading rather than stacking because a strip that fills up with
 * everything the island ever said stops being read at all.
 */
import { useEffect, useState } from 'react';
import { firstRunBeat, type FirstRunBeatId, type FirstRunState } from '@/config/first-run';
import { useT } from '@/i18n/provider';
import { PxPanel } from './px';
import type { MyDigs } from './use-game-socket';

/** How long a non-sticky beat stays on screen. */
const CAPTION_MS = 4500;

export interface FirstRunCaptionProps {
  firstRun: boolean;
  digs: MyDigs;
  warnStage: number;
  /**
   * X mode is armed right now — what the `aim` beat fires on.
   *
   * The only piece of state here that is not a tally, because the X is the one
   * lesson about a MODE rather than about something that has happened: the
   * caption has to hand over from the button ("press MARK A BOMB") to the
   * board ("now tap the tile") at the moment the mode actually flips.
   */
  armed?: boolean;
}

export function useFirstRunCaption({ firstRun, digs, warnStage, armed }: FirstRunCaptionProps): string | null {
  const t = useT();
  const state: FirstRunState = { ...digs, warnStage, armed };
  const beat = firstRun ? firstRunBeat(state) : null;
  const key = beat?.id ?? null;
  /**
   * The beat's ID is held, not its words.
   *
   * Holding the sentence meant the caption on screen was whatever language was
   * current when the beat fired, and it would sit there in the old language
   * after a switch. The id is language-independent; the words are looked up on
   * every render, so the line follows the choice immediately.
   */
  const [shown, setShown] = useState<FirstRunBeatId | null>(null);

  useEffect(() => {
    if (!beat) { setShown(null); return; }
    setShown(beat.id);
    if (beat.sticky) return;
    const timer = setTimeout(() => setShown((cur) => (cur === beat.id ? null : cur)), CAPTION_MS);
    return () => clearTimeout(timer);
    // Keyed on the BEAT, not on the tally: another carrot dug while "the
    // number counts the bombs" is up must not restart its clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, firstRun]);

  return shown ? t.firstRun[shown] : null;
}

export function FirstRunCaption(props: FirstRunCaptionProps) {
  const text = useFirstRunCaption(props);
  if (!text) return null;
  return (
    // `.rr-caption` still places it; the plank under it is the Woodland
    // notice, painted by the runtime (see woodland/runtime.css).
    <PxPanel color="rgba(13, 17, 23, 0.86)" className="rr-caption">
      <span role="status" aria-live="polite">{text}</span>
    </PxPanel>
  );
}
