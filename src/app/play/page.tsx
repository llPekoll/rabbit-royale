'use client';

/**
 * The run.
 *
 * The board is Pixi (see GameCanvas); this page is the HUD over it and the
 * socket wiring under it. Server events are pushed straight into the scene
 * rather than through React state — a re-render per dug tile would fight the
 * animations the engine is already running.
 */
import { Suspense, useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useWalletLogin } from '@/components/use-wallet-login';
import { useGameSocket, type RunRecap } from '@/components/use-game-socket';
import { GameCanvas } from '@/components/game-canvas';
import { EnergyBar } from '@/components/energy-bar';
import { WalletButton } from '@/components/wallet-button';
import { GoButton } from '@/components/go-button';
import type { IslandScene } from '@/game/scenes/IslandScene';

export default function Play() {
  return (
    <Suspense fallback={null}>
      <PlayScreen />
    </Suspense>
  );
}

function PlayScreen() {
  const { player, token } = useWalletLogin();
  const router = useRouter();
  const params = useSearchParams();
  // Set when arriving from the leaderboard's "watch": the run belongs to
  // someone else and every control is off.
  const spectating = params.get('spectate');

  const sceneRef = useRef<IslandScene | null>(null);
  const game = useGameSocket(token, player?.id ?? null, spectating);

  // Feed the engine. The scene is not React state on purpose — see the file
  // comment — so events are applied through a ref.
  useEffect(() => {
    game.bindScene(() => sceneRef.current);
  }, [game]);

  const onMoveIntent = useCallback((tileIndex: number) => {
    if (spectating) return; // watching, not playing
    game.moveTo(tileIndex);
  }, [game, spectating]);

  // Signed out, the island has nothing to show: send them home, where the one
  // thing to do is connect. No second sign-in screen to keep in step.
  if (!player) {
    return (
      <main className="rr-home">
        <div className="rr-topbar"><WalletButton /></div>
        <div className="rr-empty">
          <div style={{ fontSize: 56 }}>🐰</div>
          <p style={{ color: 'var(--muted)' }}>Connect your wallet to play.</p>
        </div>
        <GoButton dir="up" label="Back to the burrow" onClick={() => router.push('/')} />
      </main>
    );
  }

  return (
    <>
      {game.islandSeed && (
        <GameCanvas
          seed={game.islandSeed}
          playerId={player.id}
          onMoveIntent={onMoveIntent}
          onSceneReady={(s) => { sceneRef.current = s; }}
        />
      )}

      <div className="rr-overlay">
        <Hud game={game} name={player.name} spectating={spectating} />
        <div style={{ flex: 1 }} />
        {game.recap && <Recap recap={game.recap} onAgain={game.restart} />}
        {/* The way back. The run keeps going behind it — the server holds the
            seat for RECONNECT_GRACE_MS, and carrots are banked at pickup, so
            glancing at the burrow costs nothing. */}
        <GoButton
          dir="up"
          label={spectating ? 'Stop watching' : 'To the burrow'}
          onClick={() => router.push('/')}
        />
      </div>
    </>
  );
}

function Hud({
  game, name, spectating,
}: {
  game: ReturnType<typeof useGameSocket>;
  name: string;
  spectating: string | null;
}) {
  const me = game.me;
  return (
    <header className="rr-hud">
      {/* Energy first and widest: it is the only resource, it falls with every
          dig, and it is what the player prices the next tile against. */}
      <EnergyBar energy={me?.energy ?? 0} />
      <span style={{ color: 'var(--carrot)' }}>🥕 {me?.carrots ?? 0}</span>
      <span style={{ color: 'var(--muted)' }}>🐰 {game.rabbits.size}</span>
      {game.warnStage > 0 && (
        <span style={{ color: 'var(--danger)' }}>🌋 {'!'.repeat(game.warnStage)}</span>
      )}
      {spectating ? (
        <strong style={{ color: 'var(--crown)' }}>👁</strong>
      ) : (
        <small style={{ color: 'var(--muted)' }}>{name}</small>
      )}
    </header>
  );
}

function Recap({ recap, onAgain }: { recap: RunRecap; onAgain: () => void }) {
  return (
    <div className="rr-card" style={{ textAlign: 'center' }}>
      <h2 style={{ margin: '0 0 4px' }}>Run over</h2>
      <p style={{ color: 'var(--muted)', margin: '0 0 10px' }}>
        🥕 {recap.carrots} · {recap.tilesDug} dug · 💣 {recap.bombsHit} ·{' '}
        {(recap.durationMs / 1000).toFixed(0)}s
      </p>
      <button onClick={onAgain} style={{ width: '100%' }}>Again</button>
    </div>
  );
}
