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
import { useWalletLogin, WalletSessionProvider } from '@/components/use-wallet-login';
import { useGameSocket, type RunRecap } from '@/components/use-game-socket';
import { GameCanvas, type GameHandles } from '@/components/game-canvas';
import { WalletButton } from '@/components/wallet-button';
import { LeaderboardDrawer } from '@/components/leaderboard-drawer';
import { GoButton } from '@/components/go-button';
import { CarrotCounter } from '@/components/carrot-counter';
import { SoundButton } from '@/components/sound-button';
import { LoadingScreen } from '@/components/loading-screen';
import { EnergyBar } from '@/components/energy-bar';
import { CarrotField } from '@/components/carrot-field';
import { ShopButton, ShopPanel } from '@/components/shop-card';
import { LoreButton, LoreCodex } from '@/components/lore-codex';
import {
  BurrowCard, CardRow, CardNote, BurrowMeter, BurrowButton,
  CARROT, CHALK_DIM, DANGER, LAMP,
} from '@/components/burrow-chrome';
import { BitmapText, TitleText } from '@domin8/arcade-kit';
import { useShop, type ItemKind } from '@/components/use-shop';
import { useUsdcPay } from '@/components/use-usdc-pay';
import { RaidHud, TargetList } from '@/components/raid-panel';
import { useRaid } from '@/components/use-raid';
import { gardenProgress } from '@/lib/game/garden-growth';
import { burrowArt } from '@/config/burrowArt';
import { SCENE } from '@/game/keys';

interface Burrow {
  level: number;
  maxLevel: number;
  hp: number;
  maxHp: number;
  stock: number;
  /** Lifetime carrots — never reset, never stolen. Opens the codex. */
  lifetime: number;
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

/**
 * The session is created HERE, above both consumers.
 *
 * The page and the wallet chip each call `useWalletLogin`, and before this it
 * was a plain hook: two independent copies of the same session. Logging out
 * through the chip emptied only the chip's copy, leaving a signed-out player
 * looking at their own burrow. One provider, one session.
 */
export default function Home() {
  return (
    <WalletSessionProvider>
      <Burrow />
    </WalletSessionProvider>
  );
}

function Burrow() {
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
  /** True while the burrow board is showing trappable tiles. */
  const [placing, setPlacing] = useState(false);
  /**
   * True from the moment a crossing starts until the iris is fully open again.
   *
   * The burrow's column is held back by this. Not the island's HUD: that one
   * has to change AT the midpoint (it is drawn over the board it describes),
   * and it is a thin bar rather than a stack of panels.
   */
  const [crossing, setCrossing] = useState(false);
  /** The shop is a drawer over the burrow, not a card in it. */
  const [shopOpen, setShopOpen] = useState(false);
  /** True while the target list is up. A live raid is state on `raid` itself. */
  const [pickingTarget, setPickingTarget] = useState(false);
  /** The codex reads over the burrow the same way the shop sells over it. */
  const [loreOpen, setLoreOpen] = useState(false);
  /** The RPC the browser builds a USDC transfer against — served at runtime so
   *  one image runs on any network (see api/config). */
  /** Whether the money route is switched on. The RPC itself is relayed
   *  server-side, so the browser never sees a provider URL. */
  const [payments, setPayments] = useState(false);

  // The Pixi handles. A ref, not state: they are used to DRIVE the canvas, and
  // putting them in state would re-render the tree that owns it.
  const handles = useRef<GameHandles | null>(null);

  const game = useGameSocket(token, player?.id ?? null, null);
  const shop = useShop(token);
  const usdc = useUsdcPay(token, payments);
  const raid = useRaid(token);

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

  // Runtime config, once. `payments: false` means the money route is off, and
  // the shop hides its USDC buttons rather than offering a payment that cannot
  // complete. The RPC URL itself is never sent here — the browser talks to
  // /api/rpc, which relays server-side so the API key stays put.
  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((d) => setPayments(Boolean(d.payments)))
      .catch(() => {});
  }, []);

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

  /**
   * Cross to the other place, behind the carrot iris.
   *
   * The swap itself is still instant — both scenes are resident, nothing is
   * rebuilt. What the wipe buys is that nobody SEES the instant: the shutter
   * closes on a carrot, the scene changes at full black, and it opens on the
   * other place. React's own chrome flips at the same midpoint, so the HUD
   * never appears over the screen it does not belong to.
   */
  const goTo = useCallback((next: Where) => {
    const h = handles.current;
    if (!h) return;
    // TWO moments, not one, because the two halves of the chrome want opposite
    // things.
    //
    // `setWhere` rides the MIDPOINT: called any earlier it would flip the
    // overlay while the iris was still closing, popping the island's HUD over
    // the burrow for the length of the wipe.
    //
    // The burrow's own column waits for the shutter to be fully OPEN. It is a
    // heavy stack of panels, and mounting it at the midpoint put the whole
    // column on screen over a canvas that was still pitch black — the panels
    // arrived before the place they belong to. `wipeTo` resolves exactly when
    // the aperture finishes opening, so that is when the column is allowed in.
    setCrossing(true);
    void h
      .wipeTo(next === 'island' ? SCENE.island : SCENE.burrow, () => setWhere(next))
      .finally(() => setCrossing(false));
  }, []);

  /** Enough to dig with. Null burrow means "still loading", not "empty". */
  const hasEnergy = burrow === null || burrow.energy > 0;

  const onMoveIntent = useCallback((tile: number) => game.moveTo(tile), [game]);
  /**
   * A tile was tapped while placing.
   *
   * The marker is drawn only AFTER the server accepts it — an optimistic one
   * would show a defence that is not there, which on a defensive mechanic is
   * the worst possible lie to tell a player.
   */
  const onPlaceTrap = useCallback(async (tile: number) => {
    const ok = await shop.placeTrap(tile);
    if (ok) handles.current?.burrow?.addTrap(tile);
  }, [shop]);

  /**
   * Start placing traps.
   *
   * Closes the shop on the way: the ground being mined is the burrow board,
   * which the drawer is covering. Leaving the panel open would ask the player
   * to tap a tile they cannot see.
   */
  const startPlacing = useCallback(() => {
    setShopOpen(false);
    setPlacing(true);
    handles.current?.burrow?.setPlacing(true);
  }, []);

  const stopPlacing = useCallback(() => {
    setPlacing(false);
    handles.current?.burrow?.setPlacing(false);
  }, []);

  /** A purchase changed the carrot stock, so the burrow panel is stale too. */
  const refreshBurrow = useCallback(() => {
    if (!token) return;
    fetch('/api/burrow', auth())
      .then((r) => r.json())
      .then((d) => d.burrow && setBurrow(d.burrow))
      .catch(() => {});
  }, [token, auth]);

  const buyWithCarrots = useCallback(async (kind: ItemKind) => {
    const res = await shop.buy(kind);
    if (res) refreshBurrow();
  }, [shop, refreshBurrow]);

  const buyWithUsdc = useCallback(async (kind: ItemKind) => {
    const res = await usdc.pay(kind);
    if (res) {
      await shop.refresh();
      refreshBurrow();
    }
  }, [usdc, shop, refreshBurrow]);

  // The field in the burrow scene follows the real garden. Pushed on every
  // burrow refresh rather than read by the scene, because the scene has no
  // business knowing about fetches — it renders what it is told.
  useEffect(() => {
    if (!ready || !burrow) return;
    handles.current?.burrow?.setGardenProgress(
      gardenProgress(burrow.gardenReady, burrow.level),
    );
  }, [ready, burrow]);

  // The backdrop follows the level, so an upgrade is visible in the PLACE and
  // not only in the panel: the fence around your field becomes railings, then a
  // castle wall. Keyed on the level alone — the burrow object changes on every
  // poll, and the scene skips the reload when the art is already the right one.
  useEffect(() => {
    if (!ready || !burrow) return;
    void handles.current?.burrow?.setLevel(burrow.level);
  }, [ready, burrow?.level]);

  // The traps already on the ground, drawn once the board exists.
  //
  // Keyed on the tile LIST rather than on the state object, which is replaced
  // on every refresh: `addTrap` ignores a tile it has already drawn, so a
  // re-run is harmless, but re-running it on every poll is work for nothing.
  const drawnTraps = useRef('');
  useEffect(() => {
    const tiles = shop.traps?.placed;
    if (!ready || !tiles) return;
    const key = tiles.join(',');
    if (drawnTraps.current === key) return;
    drawnTraps.current = key;
    for (const tile of tiles) handles.current?.burrow?.addTrap(tile, false);
  }, [ready, shop.traps]);

  /**
   * The raid, pushed into the burrow scene.
   *
   * The scene is TOLD what to draw and works nothing out: the server decides
   * which tiles a raider may see, what their numbers are and where they may
   * step. A client that computed its own view could compute the trap positions
   * too, which is the whole reason raids are worth defending against.
   */
  useEffect(() => {
    const burrow = handles.current?.burrow;
    if (!ready || !burrow) return;

    if (!raid.raid) {
      burrow.setRaid(null);
      return;
    }
    burrow.setRaid({
      view: raid.raid.view,
      at: raid.raid.tile,
      // A finished raid offers no steps: the board stays readable, but the walk
      // is over and tapping it must do nothing.
      steps: raid.raid.finished ? [] : raid.raid.steps,
      onStep: (tile) => void raid.step(tile),
    });
  }, [ready, raid.raid, raid]);

  // A sprung trap is played ONCE, on the event, rather than inferred from the
  // board redrawing — springing one is the moment a raid turns, and a tile that
  // merely redrew darker would not register.
  useEffect(() => {
    if (raid.sprung) handles.current?.burrow?.springTrap(raid.sprung.tile);
  }, [raid.sprung]);

  // Raiding happens ON the burrow board, so entering one crosses to that scene
  // and closes everything that was covering it.
  useEffect(() => {
    if (!raid.raid) return;
    setPickingTarget(false);
    setShopOpen(false);
    if (where !== 'burrow') goTo('burrow');
  }, [raid.raid, where, goTo]);

  // Leaving the burrow leaves placement mode with it: coming back to a screen
  // still showing a grid you forgot you opened is a small mystery every time.
  useEffect(() => {
    if (where === 'burrow') return;
    if (placing) stopPlacing();
    setShopOpen(false);
  }, [where, placing, stopPlacing]);

  // A harvest empties the field NOW, on the action, rather than waiting for the
  // next refresh to notice the number fell — collecting has to have an
  // immediate consequence on the place, not just on a counter.
  useEffect(() => {
    if (burstKey > 0) handles.current?.burrow?.harvestGarden();
  }, [burstKey]);

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

      {/* Signed out there is no canvas, so the burrow painting stands in — with
          its field GROWING on top of it rather than painted into it. Someone on
          this screen is waiting (for a wallet, for a decision), and a place that
          is visibly alive is worth more here than anywhere else in the game. */}
      {!player && (
        <div className="rr-home-art" aria-hidden>
          <div
            className="rr-home-art-img"
            style={{ backgroundImage: `url(${BURROW_ART})` }}
          />
          {/* No garden to report on, so it runs its decorative loop. */}
          <CarrotField className="rr-home-art-crop" progress={null} />
        </div>
      )}

      {/* Sound belongs to the app, not to a screen: it rides above both. */}
      <SoundButton />

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
      {player && where === 'burrow' && !crossing && (
        <LeaderboardDrawer token={token} playerId={player.id} />
      )}

      {/* THREE states, not two. `crossing` renders neither screen's chrome:
          the burrow's column is held back until the iris has finished opening
          (mounted at the midpoint it sits on a black canvas for the whole
          opening — the chrome arriving before the place), and the island's HUD
          must not take its place while the shutter is over the burrow. So a
          crossing shows the wipe and nothing else. */}
      {crossing ? null : where === 'burrow' ? (
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
              {/* The heading in the kit's TITLE face — the same one every
                  panel in the arcade wears. It was a UI-font <h1>, which is
                  the giveaway that the chrome came from somewhere else. */}
              <div className="rr-burrow-head">
                <TitleText scale={1.6} style={{ color: LAMP }}>YOUR BURROW</TitleText>
              </div>

              <BurrowCard>
                <CardRow
                  label="HIT POINTS"
                  value={`${burrow?.hp ?? '-'}/${burrow?.maxHp ?? '-'}`}
                />
                <BurrowMeter
                  value={burrow?.hp ?? 0}
                  max={burrow?.maxHp ?? 1}
                  label="Burrow hit points"
                />
                {/* Repair is free and time-based, always. Charging for it would
                    turn every raid into a bill and kill the revenge loop. */}
                <CardNote>Repairs itself over time. Always free.</CardNote>
              </BurrowCard>

              <BurrowCard>
                <CardRow
                  label="ENERGY"
                  value={`${burrow?.energy ?? 0}/${burrow?.maxEnergy ?? 0}`}
                  tone={hasEnergy ? CARROT : DANGER}
                />
                {/* The gauge picks a SPRITE SET, never a hex — empty is the
                    danger art, the same reading the run's own bar gives. */}
                <BurrowMeter
                  value={burrow?.energy ?? 0}
                  max={burrow?.maxEnergy ?? 1}
                  tone={hasEnergy ? 'carrot' : 'danger'}
                  label="Energy"
                />
                {/* Empty is the state that needs explaining: without a return
                    time the player cannot tell a broken game from a wait. */}
                <CardNote>
                  {!hasEnergy
                    ? `Out of energy. Next in ${formatWait(burrow?.nextEnergyInMs ?? null)}.`
                    : burrow?.nextEnergyInMs === null
                      ? 'Full.'
                      : `+1 in ${formatWait(burrow?.nextEnergyInMs ?? null)}.`}
                </CardNote>
              </BurrowCard>

              <BurrowCard>
                <CardRow
                  label="GARDEN"
                  value={
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <BitmapText scale={1.25} style={{ color: CARROT }}>
                        {`+${burrow?.gardenReady ?? 0}`}
                      </BitmapText>
                      <img className="pixelated rr-carrot-mark" src={CARROT_MARK} alt="" aria-hidden />
                    </span>
                  }
                />
                {/* The RATE, not just the pile: "+0" alone reads as broken. */}
                <CardNote>
                  {burrow?.yieldPerHour ?? '-'}/hour &middot; holds {burrow?.gardenCapacity ?? '-'}
                  {' '}({burrow?.capHours ?? '-'}h)
                </CardNote>
                <BurrowButton
                  disabled={pending || !burrow?.gardenReady}
                  onClick={() => act('harvest')}
                >
                  HARVEST
                </BurrowButton>
              </BurrowCard>

              <BurrowCard>
                <CardRow
                  label={`DIG DEEPER - LVL ${burrow?.level ?? '-'}`}
                  value={burrow?.upgradeCost === null ? 'MAX' : `${burrow?.upgradeCost ?? '-'}`}
                  tone={burrow?.canUpgrade ? CARROT : CHALK_DIM}
                />
                {/* What the price buys. A cost with no stated benefit is a
                    number the player has no way to judge. */}
                {burrow?.next && (
                  <CardNote>
                    level {burrow.level + 1}: {burrow.next.hp} HP &middot;{' '}
                    {burrow.next.yieldPerHour}/hour
                  </CardNote>
                )}
                <BurrowButton
                  disabled={pending || !burrow?.canUpgrade}
                  onClick={() => act('upgrade')}
                >
                  UPGRADE
                </BurrowButton>
              </BurrowCard>

              {/* Placing takes over the screen, so the way into the shop
                  steps aside for the way out of placement. */}
              {placing ? (
                <button className="rr-btn" onClick={stopPlacing}>
                  Done placing
                </button>
              ) : (
                <>
                  <ShopButton shop={shop.shop} onOpen={() => setShopOpen(true)} />
                  {/* Under the shop on purpose: the shop is what a player came
                      to the burrow to DO, the codex is what they stay for. */}
                  <LoreButton
                    lifetime={burrow?.lifetime ?? 0}
                    onOpen={() => setLoreOpen(true)}
                  />
                </>
              )}

              {/* While placing, this is the only instruction on screen — the
                  board itself cannot say what a tap will cost. */}
              {placing && shop.shop && (
                <p className="rr-note">
                  Tap a tile to mine it &middot; {shop.shop.traps.held} left
                </p>
              )}

              {/* Outside the drawer, only a REFUSAL is worth showing: a receipt
                  for a purchase the player just watched happen in the panel is
                  noise on the burrow screen. */}
              {placing && shop.note && <p className="rr-shop-pay">{shop.note}</p>}

              {note && <p className="rr-note">{note}</p>}
            </>
          )}
        </section>
      ) : (
        /* On the island the chrome is a thin HUD over the board, so it uses the
           overlay layer rather than the burrow's column. */
        <div className="rr-overlay">
          <Hud game={game} name={player?.name ?? ''} />
          {/* Pushes the recap and the arrow to the bottom. Explicitly
              transparent to input: it covers the whole board, and the CSS
              above only re-enables pointers on the controls. */}
          <div style={{ flex: 1, pointerEvents: 'none' }} />
          {game.recap && <Recap recap={game.recap} onAgain={game.restart} />}
          <GoButton dir="up" label="To the burrow" onClick={() => goTo('burrow')} />
        </div>
      )}

      {player && where === 'burrow' && !raid.raid && !crossing && (
        // Disabled rather than hidden: the way onto the island should stay
        // visible so its absence reads as "not yet", not as "gone". It still
        // waits out a crossing with the rest of the burrow's chrome — it is
        // the one control anchored to that screen.
        <GoButton
          dir="down"
          label="Go farm"
          onClick={() => goTo('island')}
          disabled={!hasEnergy}
        />
      )}

      {/* The board is the Pixi scene behind this, so the HUD is deliberately
          thin — a raid is walked on the ground, not in a list. */}
      {player && raid.raid && (
        <RaidHud
          raid={raid.raid}
          outcome={raid.outcome}
          busy={raid.busy}
          note={raid.note}
          onLeave={raid.leave}
        />
      )}

      {player && pickingTarget && !raid.raid && (
        <TargetList
          targets={raid.targets}
          busy={raid.busy}
          note={raid.note}
          onEnter={(id) => void raid.enter(id)}
          onClose={() => { setPickingTarget(false); raid.setNote(null); }}
        />
      )}

      {player && shopOpen && (
        <ShopPanel
          shop={shop.shop}
          busy={shop.busy}
          onBuy={buyWithCarrots}
          onPayUsdc={payments ? buyWithUsdc : undefined}
          payStage={usdc.stage}
          note={shop.note}
          error={usdc.error}
          onPlaceTraps={startPlacing}
          onClose={() => { setShopOpen(false); shop.setNote(null); usdc.setError(null); }}
        />
      )}

      {player && loreOpen && (
        <LoreCodex
          lifetime={burrow?.lifetime ?? 0}
          onClose={() => setLoreOpen(false)}
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
// The BARE-soil cut of the art: the crop is drawn live over it by CarrotField,
// so it has to not already be in the picture. See tools/plant_carrots.py.
//
// Level 1 deliberately: nobody is signed in, so there is no burrow whose level
// this could show, and the starter homestead is the honest picture to greet a
// new player with.
const BURROW_ART = burrowArt(1);
const LOGO = '/assets/ui/RR-Logo_Banner.webp';
/** The game's own carrot, so the figure is marked in the art rather than in an
 *  emoji the system font draws in a style nothing else on screen shares. */
const CARROT_MARK = '/assets/misc/carrote_silouhette.png';
