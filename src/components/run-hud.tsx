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
import { EnergyBar } from './energy-bar';
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

/**
 * The strike, as the strip offers it.
 *
 * `held` is how many lightnings are in the bag; `aiming` is whether the next
 * tap on the board fires one instead of digging. The strip only shows the
 * count and takes the toggle — WHAT the tap hits is the scene's business
 * (`IslandScene.setAiming`), and the server's after that.
 */
export type HudAimMode = 'strike' | 'plant' | null;

export interface HudArm {
  /** Lightnings in the bag. */
  lightning: number;
  /** Bombs in the bag. */
  bombs: number;
  /** Which of the two the next tap fires, if either. */
  aiming: HudAimMode;
  /** Arm this one — or disarm it, if it was the one armed. */
  onToggle(mode: 'strike' | 'plant'): void;
}

/** One armable item on the strip: the count, and whether it is the armed one. */
function ArmButton({
  glyph, held, armed, title, onClick,
}: { glyph: string; held: number; armed: boolean; title: string; onClick(): void }) {
  return (
    <button
      type="button"
      className={`rr-hud-arm${armed ? ' aiming' : ''}`}
      onClick={onClick}
      disabled={held <= 0}
      aria-pressed={armed}
      title={title}
      style={{
        font: 'inherit',
        color: armed ? '#ffd45c' : held > 0 ? 'inherit' : 'var(--muted)',
        background: armed ? 'rgba(255, 212, 92, 0.18)' : 'transparent',
        border: `1px solid ${armed ? '#ffd45c' : 'rgba(255,255,255,0.25)'}`,
        borderRadius: 4,
        padding: '0 6px',
        cursor: held > 0 ? 'pointer' : 'default',
      }}
    >
      {glyph} {held}
    </button>
  );
}

export function RunHud({
  game, name, spectating, arm,
}: {
  game: HudGame;
  name: string;
  /** The watched player's id, or null while playing your own run. */
  spectating: string | null;
  /** The bolt and the bomb. Absent while watching, and on the first island. */
  arm?: HudArm;
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
      {/* Energy first, and ON ITS OWN — outside the glass plate. It is the
          run's fuel since the red X: it moves on every dig and it is the one
          reading checked before each step, so it gets the width to show a
          single point. It was three hearts, then a 70px gauge sharing the
          plate with two counters (Paul, 2026-09-17: "sors la de son panel,
          car elle est trop petite"). */}
      <EnergyBar energy={subject?.energy ?? 0} />
      {/* THE BOLT AND THE BOMB, in a plate of their own — NOT in the one
          below, which only exists when the volcano or a watch has something
          to say and would take the two buttons down with it the rest of the
          time. Shown even at zero, so the player learns the items exist from
          the one screen they are used on rather than from the shop's copy;
          at zero they are disabled, and the shop is where it says to go.
          Armed, a button reads as a MODE — the next tap strikes or buries
          instead of digging — which is why it changes colour rather than
          merely pressing in. */}
      {arm && (
        <PxPanel color={GLASS} className="rr-hud-plate rr-hud-arm-plate">
          <ArmButton
            glyph={"\u26A1"}
            held={arm.lightning}
            armed={arm.aiming === 'strike'}
            title={t.run.strike}
            onClick={() => arm.onToggle('strike')}
          />
          <ArmButton
            glyph={"\u{1F4A3}"}
            held={arm.bombs}
            armed={arm.aiming === 'plant'}
            title={t.run.plant}
            onClick={() => arm.onToggle('plant')}
          />
          {arm.aiming && (
            <span style={{ color: '#ffd45c' }}>
              {arm.aiming === 'strike' ? t.run.aiming : t.run.aimingPlant}
            </span>
          )}
        </PxPanel>
      )}
      {/* The plate only exists when it has something to SAY: the volcano's
          warning, or whose run this is. The head-count that used to sit here
          ("🐰 1") is gone — the other rabbits are on the board, where they
          can be counted by looking, and a lone "1" read as a mystery stat. */}
      {(game.warnStage > 0 || spectating) && (
      <PxPanel color={GLASS} className="rr-hud-plate">
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
      )}
    </header>
  );
}
