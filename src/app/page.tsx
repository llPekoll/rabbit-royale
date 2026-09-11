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
import { CarrotCurtain } from '@/components/carrot-curtain';
import { useGameSocket } from '@/components/use-game-socket';
import { Recap } from '@/components/run-recap';
import { GameCanvas, type GameHandles } from '@/components/game-canvas';
import { WalletButton } from '@/components/wallet-button';
import { LeaderboardDrawer } from '@/components/leaderboard-drawer';
import { GoButton } from '@/components/go-button';
import { CarrotCounter } from '@/components/carrot-counter';
import { SoundButton } from '@/components/sound-button';
import { LoadingScreen } from '@/components/loading-screen';
import { LogoBanner } from '@/components/logo-banner';
import { EnergyBar } from '@/components/energy-bar';
import { CarrotField } from '@/components/carrot-field';
import { ShopButton, ShopPanel } from '@/components/shop-card';
import { LoreButton, LoreCodex } from '@/components/lore-codex';
import { LoreCrawl } from '@/components/lore-crawl';
import {
  BurrowCard, CardRow, CardNote, BurrowMeter, BurrowButton,
  CARROT, CHALK_DIM, DANGER, LAMP,
} from '@/components/burrow-chrome';
import { BitmapText, TitleText } from '@domin8/arcade-kit';
import { useShop, type ItemKind } from '@/components/use-shop';
import type { PayTokenId } from '@/lib/pay/tokens';
import { useUsdcPay } from '@/components/use-usdc-pay';
import { RaidHud, TargetList, RaidButton } from '@/components/raid-panel';
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
  const { player, token, busy, error: signInError, login, playAsGuest } = useWalletLogin();
  const [where, setWhere] = useState<Where>('burrow');
  /**
   * Whose run is being watched, or null to play your own.
   *
   * State, NOT a URL. The game is one page and two Pixi scenes, so going to the
   * island is a wipe rather than a navigation — there is no route to hang a
   * query string on, and the id this would carry is `sol:<address>`, which has
   * no business in an address bar, in history, or in a screenshot.
   *
   * Changing it re-opens the socket (see useGameSocket's deps), which is what
   * makes the switch between playing and watching a single assignment.
   */
  const [spectating, setSpectating] = useState<string | null>(null);
  const [burrow, setBurrow] = useState<Burrow | null>(null);
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // Bumped on every successful harvest: it replays the rising "+N" and
  // re-keys the figure so it pops as the carrots land.
  const [burstKey, setBurstKey] = useState(0);
  const [burstAmount, setBurstAmount] = useState(0);
  const [ready, setReady] = useState(false);
  /**
   * The sign-in crossing: shutter running, and who the screen belongs to.
   *
   * Signing in swaps a DOM screen for the canvas, and that swap is the first
   * cut a new player ever sees — so it gets the same carrot iris as every
   * other change of place. `arriving` runs the curtain; `showCanvas` says
   * which of the two screens OWNS THE FRAME, and it flips at the curtain's
   * midpoint rather than when `player` lands.
   *
   * Every piece of chrome that belongs to one screen or the other reads
   * `showCanvas`, never `player` — that was the bug: `player` arrives the
   * instant the wallet answers, so the sign-in column, the lore and the
   * burrow's panels all swapped BEFORE the shutter had closed, and the iris
   * then played over a change the player had already watched happen. `player`
   * still gates anything that genuinely needs a session (a token, an id).
   */
  const [arriving, setArriving] = useState(false);
  const [showCanvas, setShowCanvas] = useState(false);
  /** True while the burrow board is showing trappable tiles. */
  const [placing, setPlacing] = useState(false);
  /**
   * Whether a raid was up on the previous render.
   *
   * A ref, not state: it exists only to tell "a raid began or ended" apart from
   * "the raider took a step", and re-rendering on it would be a render per dug
   * tile for a value nothing draws.
   */
  const wasRaiding = useRef(false);
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
  /**
   * The rail every purchase settles on, chosen once for the whole shop.
   *
   * Session state rather than a stored preference: a player's holdings change,
   * and the shop offers only what this deployment can take anyway.
   */
  const [payToken, setPayToken] = useState<PayTokenId>('usdc');
  /** The RPC the browser builds a USDC transfer against — served at runtime so
   *  one image runs on any network (see api/config). */
  /** Whether the money route is switched on. The RPC itself is relayed
   *  server-side, so the browser never sees a provider URL. */
  const [payments, setPayments] = useState(false);

  // The Pixi handles. A ref, not state: they are used to DRIVE the canvas, and
  // putting them in state would re-render the tree that owns it.
  const handles = useRef<GameHandles | null>(null);

  const game = useGameSocket(token, player?.id ?? null, spectating);
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
    // Leaving the island ENDS the run, so the seat is given up and the carrots
    // are banked. Every route home goes through here (the arrow, a raid, the
    // recap, giving up a spectate), which is why it lives in the crossing
    // rather than on one button: a run banked from only some exits is the bug
    // this fixes, one door further along.
    if (next === 'burrow' && where === 'island' && !spectating) game.leave();
    setCrossing(true);
    void h
      .wipeTo(next === 'island' ? SCENE.island : SCENE.burrow, () => setWhere(next))
      .finally(() => setCrossing(false));
  }, [where, spectating, game]);

  /** Enough to dig with. Null burrow means "still loading", not "empty". */
  const hasEnergy = burrow === null || burrow.energy > 0;

  /**
   * A tile was tapped on the island.
   *
   * Dropped outright while spectating. The server already refuses a spectator's
   * move (they have no rabbit on the board), but the SCENE flashes the tile the
   * instant it is tapped, before any answer comes back — so without this a
   * viewer would see their taps light up someone else's board and nothing ever
   * happen, which reads as a broken game rather than as a rule.
   */
  const onMoveIntent = useCallback((tile: number) => {
    if (spectating) return;
    game.moveTo(tile);
  }, [game, spectating]);
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
    const h = handles.current;
    if (!h) return;
    // Behind the iris, like every other change of screen. The camera's own
    // pull-back still runs — it just runs in the dark, so the player is handed
    // the wide shot rather than watching it travel. `crossing` hides the
    // burrow's column for the duration, exactly as a crossing to the island does.
    setCrossing(true);
    void h
      .wipeOver(() => { setPlacing(true); h.burrow?.setPlacing(true); })
      .finally(() => setCrossing(false));
  }, []);

  const stopPlacing = useCallback(() => {
    const h = handles.current;
    // The bare path matters here: this is also the tidy-up when leaving the
    // burrow (see the effect below), and that already runs inside a wipe.
    // Nesting a second iris in the first would close the shutter twice.
    if (!h || where !== 'burrow') {
      setPlacing(false);
      handles.current?.burrow?.setPlacing(false);
      return;
    }
    setCrossing(true);
    void h
      .wipeOver(() => { setPlacing(false); h.burrow?.setPlacing(false); })
      .finally(() => setCrossing(false));
  }, [where]);

  /**
   * Leave the island for the shop, in one press.
   *
   * The recap offers this to a player whose tank is empty, and the shop is a
   * drawer over the BURROW — so it has to cross first and open on arrival.
   *
   * The open cannot happen here. `goTo` flips `where` at the wipe's midpoint,
   * so at this instant we are still on the island — and the effect that clears
   * the burrow's overlays whenever `where` is not 'burrow' would close the
   * drawer we just opened, on the very next render. Opening it early would
   * also mount it over the island for the length of the crossing. So the
   * intent is parked and spent on arrival, below.
   */
  const [shopOnArrival, setShopOnArrival] = useState(false);
  const goShopping = useCallback(() => {
    setShopOnArrival(true);
    goTo('burrow');
  }, [goTo]);

  /**
   * Watch someone else's run.
   *
   * Two things in one press, in this order: name the target, then cross. The
   * assignment re-opens the socket as a spectator (the server puts the viewer
   * in the target's island room without giving them a rabbit), and the wipe
   * takes the screen to the island the way "Go farm" already does. Setting the
   * target first means the snapshot is on its way while the shutter is closing
   * rather than after it opens.
   *
   * No energy is spent and no run is started: watching is free, which is what
   * makes it the front door to sabotage rather than a cost to pay before one.
   */
  const spectate = useCallback((targetId: string) => {
    if (targetId === player?.id) return;   // watching yourself is just playing
    setSpectating(targetId);
    goTo('island');
  }, [player?.id, goTo]);

  /**
   * Stop watching and go home.
   *
   * Clearing the target re-opens the socket as a player again, so leaving a
   * spectated run cannot strand the session in viewer mode — the state that
   * made you a spectator is the only state that keeps you one.
   */
  const stopSpectating = useCallback(() => {
    setSpectating(null);
    goTo('burrow');
  }, [goTo]);

  // Arrived. Spend the intent once — `where` is the burrow now, so the
  // clearing effect above has already run and will not undo this.
  useEffect(() => {
    if (!shopOnArrival || where !== 'burrow') return;
    setShopOnArrival(false);
    setSpectating(null);
    setShopOpen(true);
  }, [shopOnArrival, where]);

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
    const res = await usdc.pay(kind, 1, payToken);
    if (res) {
      await shop.refresh();
      refreshBurrow();
    }
  }, [usdc, shop, refreshBurrow, payToken]);

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

    const draw = () => {
      if (!raid.raid) { burrow.setRaid(null); return; }
      burrow.setRaid({
        view: raid.raid.view,
        at: raid.raid.tile,
        // A finished raid offers no steps: the board stays readable, but the
        // walk is over and tapping it must do nothing.
        steps: raid.raid.finished ? [] : raid.raid.steps,
        onStep: (tile) => void raid.step(tile),
      });
    };

    // This effect runs on EVERY step — the payload changes each time a tile is
    // dug. Only the two ends are a change of place: arriving on a stranger's
    // ground, and coming home from it. Wiping the steps too would put a
    // half-second shutter between a tap and its answer, which is the one thing
    // a minesweeper must never do.
    const inRaid = raid.raid !== null;
    const crossed = inRaid !== wasRaiding.current;
    wasRaiding.current = inRaid;

    const h = handles.current;
    if (!crossed || !h) { draw(); return; }
    setCrossing(true);
    void h.wipeOver(draw).finally(() => setCrossing(false));
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

  /**
   * Signing out puts the app back on the doorstep — every screen, not just the
   * ones drawn from `player`.
   *
   * `where` is the one piece of state that outlived a session: it is not
   * derived from the player, so logging out on the island left it on 'island'
   * and the signed-out screen kept the island's HUD and its "To the burrow"
   * arrow floating over the sign-in art. Everything else here is the same
   * class of leftover — a shop drawer, a half-picked raid target, a codex
   * scrolled to chapter four — all of which would still be open behind the
   * login screen and would reappear, mid-flow, for whoever signs in next.
   *
   * The canvas handles go with them: the scenes are unmounted with the player
   * (no `player`, no <GameCanvas/>), so a stale ref would let a control call
   * `wipeTo` on a Pixi app that no longer exists.
   */
  /**
   * Signing in: run the iris, and hand the screen over at its midpoint.
   *
   * Deliberately NOT gated on the canvas being ready. Boot takes as long as it
   * takes (assets, two scenes), and holding the shutter shut until it finished
   * would turn a flourish into an indefinite black screen. The curtain runs to
   * its own beat; the canvas mounts at the midpoint and boots behind it, which
   * is the same bargain the burrow/island crossing already makes.
   */
  useEffect(() => {
    if (!player || showCanvas || arriving) return;
    setArriving(true);
  }, [player, showCanvas, arriving]);

  useEffect(() => {
    if (player) return;
    // Signing out is the same crossing in reverse, and it is instant: the
    // canvas is torn down with the player, so there is nothing to wipe over.
    setShowCanvas(false);
    setArriving(false);
    setWhere('burrow');
    setCrossing(false);
    setShopOpen(false);
    setPickingTarget(false);
    setLoreOpen(false);
    setShopOnArrival(false);
    // Or the next player to sign in inherits the watch and lands on a
    // stranger's island with no idea why.
    setSpectating(null);
    setPlacing(false);
    setBurrow(null);
    setNote(null);
    setPending(false);
    handles.current = null;
    shownSeed.current = null;
    setReady(false);
  }, [player]);

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
      {player && showCanvas && (
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
      {!showCanvas && (
        <div className="rr-home-art" aria-hidden>
          <div
            className="rr-home-art-img"
            style={{ backgroundImage: `url(${BURROW_ART})` }}
          />
          {/* No garden to report on, so it runs its decorative loop. */}
          <CarrotField className="rr-home-art-crop" progress={null} />
        </div>
      )}

      {/* The story, told to whoever has not signed in yet. It is the only thing
          on this screen that is not a request — see lore-crawl.tsx. */}
      {!showCanvas && <LoreCrawl />}

      {/* The wordmark, at the TOP of the screen and in its own fixed layer.
          It used to ride in the sign-in column at the bottom, under the crawl's
          near edge; up here it is the masthead the crawl rises towards, which
          is the arrangement the effect has always implied. Fixed rather than in
          flow because the column below it scrolls and a title that scrolls away
          on a short phone stops being a title. */}
      {!showCanvas && (
        <div className="rr-masthead">
          <LogoBanner />
        </div>
      )}

      {/* Over everything, including the fixed overlays. See .rr-curtain. */}
      <CarrotCurtain
        play={arriving}
        onCut={() => setShowCanvas(true)}
        onDone={() => setArriving(false)}
      />

      {/* Sound belongs to the app, not to a screen: it rides above both. */}
      <SoundButton />

      <div className="rr-topbar">
        {/* The one number worth carrying on every screen, top-right beside the
            wallet — where a balance lives. */}
        {showCanvas && (
          <CarrotCounter stock={burrow?.stock ?? 0} fireKey={burstKey} gain={burstAmount} />
        )}
        <WalletButton />
      </div>

      {/* The board is furniture at the burrow and a distraction on the island:
          a run needs the whole frame, and a third of the screen given to a
          leaderboard is a third the player cannot dig in. It collapses to its
          tab while playing. */}
      {player && showCanvas && where === 'burrow' && !crossing && (
        <LeaderboardDrawer token={token} playerId={player.id} onSpectate={spectate} />
      )}

      {/* THREE states, not two. `crossing` renders neither screen's chrome:
          the burrow's column is held back until the iris has finished opening
          (mounted at the midpoint it sits on a black canvas for the whole
          opening — the chrome arriving before the place), and the island's HUD
          must not take its place while the shutter is over the burrow. So a
          crossing shows the wipe and nothing else.

          `|| !showCanvas` is a belt on top of the reset above: before the
          curtain hands the frame over there is no canvas and no run, so the
          island branch has nothing to draw over — it would put a HUD and a
          "To the burrow" arrow on the sign-in screen.
          The effect already puts `where` back; this makes the wrong screen
          unreachable rather than merely un-entered. */}
      {/* The burrow column is about YOUR burrow — its HP, its garden, its
          upgrade. During a raid the board underneath belongs to somebody else,
          and leaving the column up put your own 400/400 and a HARVEST button
          over a castle you are trying to rob. The raid has its own thin HUD
          (RaidHud) that describes the place you are actually standing in. */}
      {crossing || raid.raid ? null : where === 'burrow' || !showCanvas ? (
        <section className="rr-burrow">
          {!showCanvas ? (
            <div className="rr-empty">
              {/* The wordmark is NOT here any more — it is the masthead above,
                  so what is left at the bottom is only the ask. The subtitle
                  goes with the logo for the same reason it always did: it names
                  the chapter the crawl is reading. */}
              {/* Two buttons and nothing else. The prose that used to sit
                  between them ("Dig now, no wallet needed...") explained the
                  choice; the labels now say it, and a doorstep that argues
                  with you is a doorstep you read instead of walk through. The
                  crawl above is the only copy on this screen.

                  The wallet leads and the guest run follows it — the reverse
                  of what shipped before, where PLAY was primary on the grounds
                  that a signature is a steep price for a game you have not
                  played yet. That reasoning still holds; this ordering is a
                  deliberate call that the wallet is the front door. */}
              <button className="rr-btn rr-play" onClick={login} disabled={busy}>
                Connect wallet
              </button>
              <button className="rr-btn ghost" onClick={playAsGuest} disabled={busy}>
                {busy ? 'Digging in...' : 'Play as a guest'}
              </button>
              {signInError && <p className="rr-warn">{signInError}</p>}
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
                  {/* The way OUT of your own burrow and into someone else's.
                      The target list, the raid HUD and the whole crossing were
                      already built and wired — nothing ever called
                      `setPickingTarget(true)`, so the entire attacking half of
                      the game was unreachable from the UI. This is the door.

                      Above the codex and below the shop: the shop is what you
                      came to the burrow to do, raiding is what you leave it
                      for, and the story is what you stay for. */}
                  <RaidButton
                    targets={raid.targets}
                    onOpen={() => { setPickingTarget(true); void raid.refresh(); }}
                  />
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
          <Hud game={game} name={player?.name ?? ''} spectating={spectating} />
          {/* Pushes the recap and the arrow to the bottom. Explicitly
              transparent to input: it covers the whole board, and the CSS
              above only re-enables pointers on the controls. */}
          <div style={{ flex: 1, pointerEvents: 'none' }} />
          {/* A spectator has no run of their own to recap, and nothing on this
              card would be about them — `restart` would start a run they never
              asked for. The watched player's run simply ends and the viewer is
              still watching. */}
          {game.recap && !spectating && (
            <Recap
              recap={game.recap}
              energy={burrow?.energy ?? null}
              onAgain={game.restart}
              onShop={goShopping}
              onHome={stopSpectating}
            />
          )}
          {/* Leaving ALWAYS goes through `stopSpectating`, even when playing
              (where it is just `goTo`): a second exit path that forgot to clear
              the target would strand the session as a viewer with no way back
              into its own game. */}
          <GoButton
            dir="up"
            label={spectating ? 'Stop watching' : 'To the burrow'}
            onClick={stopSpectating}
          />
        </div>
      )}

      {showCanvas && where === 'burrow' && !raid.raid && !crossing && (
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
          // No wallet, no paid rail — the shop does not offer it rather than
          // offering it and failing at the quote. The carrot side of every
          // shelf is untouched: everything money buys is also earnable, so a
          // guest's shop is smaller, not poorer.
          onPayUsdc={payments && !player.guest ? buyWithUsdc : undefined}
          payToken={payToken}
          onPayTokenChange={setPayToken}
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

      {/* Nothing to load until the canvas owns the frame; after that, wait for
          both scenes. Keyed on `showCanvas` rather than `player` so it does not
          throw a loading screen over the sign-in art while the curtain is still
          closing — the boot it reports on has not started yet at that point. */}
      <LoadingScreen ready={!showCanvas || ready} label="Waking the warren" />
    </main>
  );
}

/**
 * The thin bar over the board.
 *
 * It reports on WHOEVER the run belongs to, which is not always the person
 * reading it. A spectator has no rabbit on the island — `game.me` resolves by
 * the viewer's own id and is null for them — so the playing HUD would have
 * shown a spectator an empty energy bar and zero carrots, describing a run
 * nobody is having. Watching shows the WATCHED rabbit's numbers instead, and
 * says whose they are.
 */
function Hud({
  game, name, spectating,
}: {
  game: ReturnType<typeof useGameSocket>;
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
/** The game's own carrot, so the figure is marked in the art rather than in an
 *  emoji the system font draws in a style nothing else on screen shares. */
const CARROT_MARK = '/assets/misc/carrote_silouhette.png';
