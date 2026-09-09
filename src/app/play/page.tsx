'use client';

/**
 * The run.
 *
 * The board is Pixi (see GameCanvas); this page is the HUD over it and the
 * socket wiring under it. Server events are pushed straight into the scene
 * rather than through React state — a re-render per dug tile would fight the
 * animations the engine is already running.
 */
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useWalletLogin } from '@/components/use-wallet-login';
import { useGameSocket, type RunRecap } from '@/components/use-game-socket';
import { GameCanvas } from '@/components/game-canvas';
import { EnergyBar } from '@/components/energy-bar';
import { Nav } from '@/components/nav';
import type { IslandScene } from '@/game/scenes/IslandScene';

export default function Play() {
  return (
    <Suspense fallback={null}>
      <PlayScreen />
    </Suspense>
  );
}

function PlayScreen() {
  const { player, token, busy, error, login } = useWalletLogin();
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

  if (!player) {
    return (
      <main className="rr-page" style={{ justifyContent: 'center', textAlign: 'center' }}>
        <div style={{ fontSize: 56 }}>🐰</div>
        <h1>Sign in</h1>
        <p style={{ color: 'var(--muted)' }}>
          Your wallet is your account. Nothing to remember, nothing to lose.
        </p>
        <button onClick={login} disabled={busy}>
          {busy ? 'Waiting for wallet…' : 'Connect wallet'}
        </button>
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
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
        <Nav />
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
