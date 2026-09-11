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
  game, name, spectating,
}: {
  game: HudGame;
  name: string;
  /** The watched player's id, or null while playing your own run. */
  spectating: string | null;
}) {
  const watched = spectating ? game.rabbits.get(spectating) ?? null : null;
  const subject = spectating ? watched : game.me;
  // The target may not be on the board yet (the snapshot is still in flight) or
  // may have just finished. Their name is still the honest label either way.
  const label = spectating ? (watched?.name ?? 'their run') : name;

  return (
    <header className="rr-hud">
      {/* Energy first and widest: it is the only resource, it falls with every
          dig, and it is what the player prices the next tile against. */}
      <EnergyBar energy={subject?.energy ?? 0} />
      <span style={{ color: 'var(--carrot)' }}>🥕 {subject?.carrots ?? 0}</span>
      <span style={{ color: 'var(--muted)' }}>🐰 {game.rabbits.size}</span>
      {game.warnStage > 0 && (
        <span style={{ color: 'var(--danger)' }}>🌋 {'!'.repeat(game.warnStage)}</span>
      )}
      {/* Says it in words, not just by the eye icon: a viewer who forgets they
          are watching reads every number here as their own. */}
      <small style={{ color: spectating ? 'var(--crown)' : 'var(--muted)' }}>
        {spectating ? `👁 watching ${label}` : label}
      </small>
    </header>
  );
}
