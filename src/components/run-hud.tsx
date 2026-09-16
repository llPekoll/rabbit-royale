'use client';

/**
 * The thin bar over the board.
 *
 * It reports on WHOEVER the run belongs to, which is not always the person
 * reading it. A spectator has no rabbit on the island — `game.me` resolves by
 * the viewer's own id and is null for them — so the playing HUD would have
 * shown a spectator an empty energy bar and zero carrots, describing a run
 * nobody is having. Watching shows the WATCHED rabbit's numbers instead, and
 * says whose they are.
 *
 * Lives in its own file so it can be driven from a story. It used to be a
 * private function inside `page.tsx`, which meant the only way to see it react
 * to a socket event was to play the real game — and "the carrot counter does
 * not move" is exactly the kind of bug that hides there.
 */
import { Hearts } from './hearts';
import { useT } from '@/i18n/provider';
import { PxPanel } from './px';

/**
 * The strip's glass — the ground `.rr-overlay .rr-hud` gave it — now inside the
 * codex's pixel frame. The header keeps the class and the placement; the plate
 * carries the look and the row (`.rr-hud-plate`, px-top-floor.css).
 */
const GLASS = 'rgba(13, 17, 23, 0.82)';
import type { ClientRabbit } from './use-game-socket';

/**
 * What the HUD needs, narrowed from the socket hook.
 *
 * A structural type rather than `ReturnType<typeof useGameSocket>`: the HUD
 * reads four things, and a story that had to fake a whole socket hook to show
 * a number would not be worth writing.
 */
export interface HudGame {
  rabbits: Map<string, ClientRabbit>;
  me: ClientRabbit | null;
  warnStage: number;
}

export function RunHud({
  game, name, spectating, solo = false,
}: {
  game: HudGame;
  name: string;
  /** The watched player's id, or null while playing your own run. */
  spectating: string | null;
  /**
   * Nobody else can be seated here (the first island). The rabbit count is
   * a fact about the race, and "🐰 1" on a board nobody can join is a
   * number with nothing to mean.
   */
  solo?: boolean;
}) {
  const t = useT();
  const watched = spectating ? game.rabbits.get(spectating) ?? null : null;
  const subject = spectating ? watched : game.me;
  // The target may not be on the board yet (the snapshot is still in flight) or
  // may have just finished. Their name is still the honest label either way.
  const label = spectating ? (watched?.name ?? t.run.theirRun) : name;

  return (
    /* `watching` is a MODE of this strip, not decoration: it turns the row
       into two, so the label can say whose run this is in full. See the CSS. */
    <header className={`rr-hud${spectating ? ' watching' : ''}`}>
      <PxPanel color={GLASS} className="rr-hud-plate">
      {/* Hearts first: the run's life, one lost per bomb. Digging is free, so
          this is the only thing on the strip that can end the run. */}
      <Hearts energy={subject?.energy ?? 0} />
      {/* The run's haul is NOT here any more. It sat in this strip at the same
          size as the hearts, and read as a second life gauge: the one number
          that is about carrots, in the one panel that is about staying alive.
          It rides beside the carrot pill now (`CarrotPill.carrying`), next to
          the stock a walk home turns it into, smaller than the stock because
          it is not banked yet. */}
      {!solo && <span style={{ color: 'var(--muted)' }}>🐰 {game.rabbits.size}</span>}
      {game.warnStage > 0 && (
        <span style={{ color: 'var(--danger)' }}>🌋 {'!'.repeat(game.warnStage)}</span>
      )}
      {/* ONLY while watching. Says it in words, not just by the eye icon: a
          viewer who forgets they are watching reads every number here as their
          own, and that is the one reading this line exists to prevent.

          Playing your own run it said your own name — which the wallet chip in
          the topbar directly above is already saying, in the same face, about
          20px away. Two copies of the player's name is not a second reading,
          it is the strip spending its scarcest width on a fact nobody is
          asking about their own run. Dropped there, kept here, where it names
          somebody else. */}
      {/* Measured on a 412px phone: this label wants 254px, and the strip is
          392px with three counters and the gauge already in it, so it gets 136
          and the name comes out as "Ash...". Dropping the word "watching"
          saves about 70px and still does not fit -- there is no arrangement
          that puts a full name on one row at this width.

          So the strip takes a SECOND ROW instead (`.rr-hud.watching`), which is
          the right trade for this mode in particular: a spectator is not
          tapping tiles, so the board that second row costs buys nothing back
          during a watch, whereas a clipped name is worse every second it is on
          screen. Your own run keeps the single thin row, because that is when
          board is worth something. */}
      {spectating && (
        <small style={{ color: 'var(--crown)' }}>{t.run.watching(label)}</small>
      )}
      </PxPanel>
    </header>
  );
}
