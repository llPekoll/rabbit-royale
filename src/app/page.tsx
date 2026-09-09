'use client';

/**
 * The whole game, on one page.
 *
 * There is no route change between the burrow and the island. Both are Pixi
 * scenes inside ONE application, built together behind the loading screen and
 * then swapped — crossing between them used to rebuild the app from nothing,
 * re-decoding every texture and dropping the WebGL context on a move a player
 * makes constantly. You pay once, at the start, and never again.
 *
 * React draws the chrome over that canvas and nothing else: the scenes are
 * driven through the handles the canvas hands back, never through state.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useWalletLogin } from '@/components/use-wallet-login';
import { useGameSocket, type RunRecap } from '@/components/use-game-socket';
import { GameCanvas, type GameHandles } from '@/components/game-canvas';
import { WalletButton } from '@/components/wallet-button';
import { LeaderboardDrawer } from '@/components/leaderboard-drawer';
import { GoButton } from '@/components/go-button';
import { CarrotCounter } from '@/components/carrot-counter';
import { LoadingScreen } from '@/components/loading-screen';
import { EnergyBar } from '@/components/energy-bar';
import { SCENE } from '@/game/keys';

interface Burrow {
  level: number;
  maxLevel: number;
  hp: number;
  maxHp: number;
  stock: number;
  gardenReady: number;
  energy: number;
  maxEnergy: number;
  nextEnergyInMs: number | null;
  yieldPerHour: number;
  capHours: number;
  gardenCapacity: number;
  upgradeCost: number | null;
  canUpgrade: boolean;
  next: { hp: number; yieldPerHour: number } | null;
}

/** Which of the two places is on screen. Not a route: a scene swap. */
type Where = 'burrow' | 'island';

export default function Home() {
  const { player, token } = useWalletLogin();
  const [where, setWhere] = useState<Where>('burrow');
  const [burrow, setBurrow] = useState<Burrow | null>(null);
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // Bumped on every successful harvest: it replays the rising "+N" and
  // re-keys the figure so it pops as the carrots land.
  const [burstKey, setBurstKey] = useState(0);
  const [burstAmount, setBurstAmount] = useState(0);
  const [ready, setReady] = useState(false);

  // The Pixi handles. A ref, not state: they are used to DRIVE the canvas, and
  // putting them in state would re-render the tree that owns it.
  const handles = useRef<GameHandles | null>(null);

  const game = useGameSocket(token, player?.id ?? null, null);

  useEffect(() => {
    game.bindScene(() => handles.current?.island ?? null);
  }, [game]);

  // A new island reaches the LIVE scene. Remounting the canvas for it raced the
  // socket and lost — see GameCanvas.
  const shownSeed = useRef<string | null>(null);
  useEffect(() => {
    const island = handles.current?.island;
    if (!ready || !island || !game.islandSeed) return;
    if (shownSeed.current === game.islandSeed) return;
    shownSeed.current = game.islandSeed;
    void island.setIsland(game.islandSeed).then(() => {
      // The snapshot's rabbits and dug tiles were applied to the OLD board, so
      // they have to be replayed onto the new one.
      game.resync();
    });
  }, [ready, game.islandSeed, game]);

  const auth = useCallback(
    (init?: RequestInit) => ({
      ...init,
      headers: { ...init?.headers, 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    }),
    [token],
  );

  useEffect(() => {
    if (!token) return;
    fetch('/api/burrow', auth())
      .then((r) => r.json())
      .then((d) => d.burrow && setBurrow(d.burrow))
      .catch(() => {});
  }, [token, auth]);

  const act = async (action: 'harvest' | 'upgrade') => {
    setPending(true);
    setNote(null);
    try {
      const res = await fetch('/api/burrow', auth({ method: 'POST', body: JSON.stringify({ action }) }))
        .then((r) => r.json());
      if (res.burrow) setBurrow(res.burrow);
      if (res.harvested) {
        setNote(`+${res.harvested} 🥕`);
        setBurstAmount(res.harvested);
        setBurstKey((k) => k + 1);
      }
      else if (res.spent) setNote(`Burrow deepened: ${res.spent} 🥕`);
      else if (res.error === 'insufficient_carrots') setNote(`Need ${res.need - res.have} more 🥕`);
      else if (res.error === 'nothing_to_harvest') setNote('The garden is empty. Come back later.');
      else if (res.error === 'max_level') setNote('Your burrow is as deep as it goes.');
    } finally {
      setPending(false);
    }
  };

  /** Cross to the other place. A swap, so it is instant. */
  const goTo = useCallback((next: Where) => {
    handles.current?.show(next === 'island' ? SCENE.island : SCENE.burrow);
    setWhere(next);
  }, []);

  /** Enough to dig with. Null burrow means "still loading", not "empty". */
  const hasEnergy = burrow === null || burrow.energy > 0;

  const onMoveIntent = useCallback((tile: number) => game.moveTo(tile), [game]);
  const onPlaceTrap = useCallback(() => {}, []);

  return (
    <main className="rr-home">
      {/* One canvas, both scenes, mounted as soon as there is a player.
          Deliberately NOT gated on the island's seed: the burrow is playable
          without a game server, and waiting for one deadlocked the boot —
          nothing asks the server for an island until the scene exists, and the
          scene was waiting for the island. The seed only decides which ground
          the island is painted on, so a placeholder until the server answers
          costs nothing. */}
      {player && (
        <GameCanvas
          seed={game.islandSeed ?? player.id}
          playerId={player.id}
          onMoveIntent={onMoveIntent}
          onPlaceTrap={onPlaceTrap}
          onReady={(h) => { handles.current = h; setReady(true); }}
        />
      )}

      {/* Signed out there is no canvas, so the burrow painting stands in. */}
      {!player && (
        <div
          className="rr-home-art"
          style={{ backgroundImage: `url(${BURROW_ART})` }}
          aria-hidden
        />
      )}

      <div className="rr-topbar">
        {/* The one number worth carrying on every screen, top-right beside the
            wallet — where a balance lives. */}
        {player && (
          <CarrotCounter stock={burrow?.stock ?? 0} fireKey={burstKey} gain={burstAmount} />
        )}
        <WalletButton />
      </div>

      {/* The board is furniture at the burrow and a distraction on the island:
          a run needs the whole frame, and a third of the screen given to a
          leaderboard is a third the player cannot dig in. It collapses to its
          tab while playing. */}
      {player && where === 'burrow' && (
        <LeaderboardDrawer token={token} playerId={player.id} />
      )}

      {where === 'burrow' ? (
        <section className="rr-burrow">
          {!player ? (
            <div className="rr-empty">
              {/* The game's own logo, not an emoji and not the title set in a
                  UI font: this is the first thing a new player sees, and the
                  wordmark already says "Rabbit Royale" — so it replaces both. */}
              <img
                className="rr-logo"
                src={LOGO}
                alt="Rabbit Royale"
                width={365}
                height={78}
              />
              <p style={{ color: 'var(--muted)', margin: 0 }}>The Cursed Crown</p>
              <p style={{ color: 'var(--muted)', maxWidth: 300 }}>
                Connect your wallet to claim a burrow. Nothing to remember, nothing to lose.
              </p>
            </div>
          ) : (
            <>
              <h1 className="rr-burrow-title">Your burrow</h1>

              <div className="rr-card">
                <div className="rr-row">
                  <span>Hit points</span>
                  <span>{burrow?.hp ?? '-'} / {burrow?.maxHp ?? '-'}</span>
                </div>
                <div className="rr-meter">
                  <i style={{ width: `${burrow ? (burrow.hp / burrow.maxHp) * 100 : 0}%` }} />
                </div>
                {/* Repair is free and time-based, always. Charging for it would
                    turn every raid into a bill and kill the revenge loop. */}
                <small style={{ color: 'var(--muted)' }}>Repairs itself over time. Always free.</small>
              </div>

              <div className="rr-card">
                <div className="rr-row">
                  <span>&#9889; Energy</span>
                  <span style={{ color: hasEnergy ? 'var(--carrot)' : 'var(--danger)' }}>
                    {burrow?.energy ?? 0} / {burrow?.maxEnergy ?? 0}
                  </span>
                </div>
                <div className="rr-meter">
                  <i
                    style={{
                      width: `${burrow ? (burrow.energy / burrow.maxEnergy) * 100 : 0}%`,
                      background: hasEnergy ? 'var(--carrot)' : 'var(--danger)',
                    }}
                  />
                </div>
                {/* Empty is the state that needs explaining: without a return
                    time the player cannot tell a broken game from a wait. */}
                <small style={{ color: 'var(--muted)' }}>
                  {!hasEnergy
                    ? `Out of energy. Next in ${formatWait(burrow?.nextEnergyInMs ?? null)}.`
                    : burrow?.nextEnergyInMs === null
                      ? 'Full.'
                      : `+1 in ${formatWait(burrow?.nextEnergyInMs ?? null)}.`}
                </small>
              </div>

              <div className="rr-card">
                <div className="rr-row">
                  <span>&#127793; Garden</span>
                  <span style={{ color: 'var(--carrot)' }}>+{burrow?.gardenReady ?? 0}</span>
                </div>
                {/* The RATE, not just the pile: "+0" alone reads as broken. */}
                <small style={{ color: 'var(--muted)', display: 'block', marginBottom: 8 }}>
                  {burrow?.yieldPerHour ?? '-'} 🥕/hour &middot; holds {burrow?.gardenCapacity ?? '-'}
                  {' '}({burrow?.capHours ?? '-'}h)
                </small>
                <button
                  style={{ width: '100%' }}
                  disabled={pending || !burrow?.gardenReady}
                  onClick={() => act('harvest')}
                >
                  Harvest
                </button>
              </div>

              <div className="rr-card">
                <div className="rr-row">
                  <span>Dig deeper &middot; level {burrow?.level ?? '-'}</span>
                  <span style={{ color: 'var(--muted)' }}>
                    {burrow?.upgradeCost === null ? 'Max' : `${burrow?.upgradeCost ?? '-'} 🥕`}
                  </span>
                </div>
                {/* What the price buys. A cost with no stated benefit is a
                    number the player has no way to judge. */}
                {burrow?.next && (
                  <small style={{ color: 'var(--muted)', display: 'block', marginBottom: 8 }}>
                    level {burrow.level + 1}: {burrow.next.hp} HP &middot;{' '}
                    {burrow.next.yieldPerHour} 🥕/hour
                  </small>
                )}
                <button
                  style={{ width: '100%' }}
                  disabled={pending || !burrow?.canUpgrade}
                  onClick={() => act('upgrade')}
                >
                  Upgrade
                </button>
              </div>

              {note && <p className="rr-note">{note}</p>}
            </>
          )}
        </section>
      ) : (
        /* On the island the chrome is a thin HUD over the board, so it uses the
           overlay layer rather than the burrow's column. */
        <div className="rr-overlay">
          <Hud game={game} name={player?.name ?? ''} />
          <div style={{ flex: 1 }} />
          {game.recap && <Recap recap={game.recap} onAgain={game.restart} />}
          <GoButton dir="up" label="To the burrow" onClick={() => goTo('burrow')} />
        </div>
      )}

      {player && where === 'burrow' && (
        // Disabled rather than hidden: the way onto the island should stay
        // visible so its absence reads as "not yet", not as "gone".
        <GoButton
          dir="down"
          label="Go farm"
          onClick={() => goTo('island')}
          disabled={!hasEnergy}
        />
      )}

      {/* Signed out there is nothing to load; signed in, wait for both scenes. */}
      <LoadingScreen ready={!player || ready} label="Waking the warren" />
    </main>
  );
}

function Hud({ game, name }: { game: ReturnType<typeof useGameSocket>; name: string }) {
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
      <small style={{ color: 'var(--muted)' }}>{name}</small>
    </header>
  );
}

function Recap({ recap, onAgain }: { recap: RunRecap; onAgain: () => void }) {
  return (
    <div className="rr-card" style={{ textAlign: 'center' }}>
      <h2 style={{ margin: '0 0 4px' }}>Run over</h2>
      <p style={{ color: 'var(--muted)', margin: '0 0 10px' }}>
        🥕 {recap.carrots} &middot; {recap.tilesDug} dug &middot; 💣 {recap.bombsHit}{' '}
        {(recap.durationMs / 1000).toFixed(0)}s
      </p>
      <button onClick={onAgain} style={{ width: '100%' }}>Again</button>
    </div>
  );
}

/**
 * A wait, in the coarsest unit that is still honest.
 *
 * "23m" rather than "23m 14s": the player is deciding whether to wait or close
 * the tab, and a ticking second-hand invites them to watch it.
 */
function formatWait(ms: number | null): string {
  if (ms === null) return 'a moment';
  const mins = Math.ceil(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

/** The burrow, painted. Stands in for the canvas before sign-in. */
const BURROW_ART = '/assets/island/burrow_generated.webp';
const LOGO = '/assets/ui/RR-Logo_Banner.webp';
