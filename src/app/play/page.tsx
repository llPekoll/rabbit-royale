'use client';

/**
 * The play screen.
 *
 * Phase 1's definition of done is "5 runs in the browser without a bug", so
 * everything here serves that: sign in, land on an island, move, read the HUD,
 * die, restart with R. No menus, no lobby, no settings.
 */
import { useEffect } from 'react';
import { useWalletLogin } from '@/components/use-wallet-login';
import { useGameSocket } from '@/components/use-game-socket';
import { IslandCanvas } from '@/components/island-canvas';
import type { Direction } from '@/lib/game/types';

const KEY_TO_DIR: Record<string, Direction> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
  z: 'up', q: 'left', // AZERTY
};

export default function Play() {
  const { player, token, busy, error, login } = useWalletLogin();
  const game = useGameSocket(token, player?.id ?? null);
  const { move, restart, recap } = game;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // R restarts instantly — the fastest possible retry loop is what makes a
      // run-based game tunable during a playtest (BUILD-PLAN phase 1).
      if (e.key === 'r' || e.key === 'R') return restart();
      const dir = KEY_TO_DIR[e.key];
      if (!dir) return;
      e.preventDefault();
      move(dir);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move, restart]);

  if (!player) {
    return (
      <main style={{ maxWidth: 420, margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 56 }}>🐰</div>
        <h1>Sign in</h1>
        <p style={{ color: 'var(--muted)' }}>
          Your wallet is your account. Nothing to remember, nothing to lose.
        </p>
        <button onClick={login} disabled={busy} style={{ marginTop: 16, padding: '14px 28px' }}>
          {busy ? 'Waiting for wallet…' : 'Connect wallet'}
        </button>
        {error && <p style={{ color: 'var(--danger)', marginTop: 16 }}>{error}</p>}
      </main>
    );
  }

  return (
    <main style={{ padding: 12 }}>
      <Hud game={game} name={player.name} />

      {game.island ? (
        <div style={{ overflow: 'auto', marginTop: 12 }}>
          <IslandCanvas
            island={game.island}
            rabbits={game.rabbits}
            meId={player.id}
            warnStage={game.warnStage}
          />
        </div>
      ) : (
        <p style={{ textAlign: 'center', color: 'var(--muted)', marginTop: 64 }}>
          {game.connected ? 'Finding an island…' : 'Connecting…'}
        </p>
      )}

      <DPad onMove={move} />

      {game.erupting && <Overlay title="🌋 The island is sinking" subtitle="Hold on…" />}

      {recap && (
        <Overlay
          title="Run over"
          subtitle={`🥕 ${recap.carrots} carrots · ${recap.tilesDug} tiles dug · 💣 ${recap.bombsHit} · ${(recap.durationMs / 1000).toFixed(0)}s`}
          action={{ label: 'Again (R)', onClick: restart }}
        />
      )}
    </main>
  );
}

function Hud({ game, name }: { game: ReturnType<typeof useGameSocket>; name: string }) {
  const me = game.me;
  return (
    <header style={{
      display: 'flex', gap: 16, justifyContent: 'center', alignItems: 'center',
      padding: '10px 14px', background: 'var(--panel)', border: '1px solid var(--border)',
      borderRadius: 10, flexWrap: 'wrap',
    }}>
      <strong>{name}</strong>
      <span title="Energy">⚡ {me?.energy ?? '–'}</span>
      <span title="Carrots this run" style={{ color: 'var(--carrot)' }}>🥕 {me?.carrots ?? 0}</span>
      <span style={{ color: 'var(--muted)' }}>{game.island?.tier}</span>
      <span style={{ color: 'var(--muted)' }}>🐰 {game.rabbits.size}</span>
      {game.warnStage > 0 && (
        <span style={{ color: 'var(--danger)' }}>🌋 {'!'.repeat(game.warnStage)}</span>
      )}
    </header>
  );
}

/** Touch controls. The Seeker is a phone — a keyboard is the fallback, not the plan. */
function DPad({ onMove }: { onMove: (d: Direction) => void }) {
  const btn = (label: string, dir: Direction) => (
    <button
      onPointerDown={(e) => { e.preventDefault(); onMove(dir); }}
      style={{ width: 64, height: 64, fontSize: 22 }}
    >
      {label}
    </button>
  );
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(3, 64px)', gap: 8,
      justifyContent: 'center', marginTop: 20,
    }}>
      <div /> {btn('↑', 'up')} <div />
      {btn('←', 'left')} <div /> {btn('→', 'right')}
      <div /> {btn('↓', 'down')} <div />
    </div>
  );
}

function Overlay({ title, subtitle, action }: {
  title: string;
  subtitle?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'grid', placeItems: 'center',
      background: 'rgba(13,17,23,0.86)', textAlign: 'center', padding: 24,
    }}>
      <div>
        <h2 style={{ margin: 0 }}>{title}</h2>
        {subtitle && <p style={{ color: 'var(--muted)' }}>{subtitle}</p>}
        {action && <button onClick={action.onClick} style={{ padding: '12px 28px' }}>{action.label}</button>}
      </div>
    </div>
  );
}
