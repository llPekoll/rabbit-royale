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
import { RunHud } from '@/components/run-hud';
import { CarrotField } from '@/components/carrot-field';
import { ShopButton, ShopPanel, ProtectButton } from '@/components/shop-card';
import { EnergyPopup } from '@/components/energy-popup';
import { LoreButton, LoreCodex } from '@/components/lore-codex';
import { LoreCrawl } from '@/components/lore-crawl';
import {
  BurrowCard, CardRow, CardNote, BurrowMeter, BurrowButton,
  CARROT, CHALK_DIM, DANGER,
} from '@/components/burrow-chrome';
import { BitmapText } from '@domin8/arcade-kit';
import { useShop, type ItemKind } from '@/components/use-shop';
import type { PayTokenId } from '@/lib/pay/tokens';
import { useUsdcPay } from '@/components/use-usdc-pay';
import { RaidHud, TargetList, RaidButton } from '@/components/raid-panel';
import { useRaid, type RaidState } from '@/components/use-raid';
import { gardenProgress } from '@/lib/game/garden-growth';
import { burrowArt } from '@/config/burrowArt';
import { SCENE } from '@/game/keys';

interface Burrow {
  level: number;
  maxLevel: number;
  stock: number;
  /** Lifetime carrots — never reset, never stolen. Opens the codex. */
  lifetime: number;
  gardenReady: number;
  energy: number;
  maxEnergy: number;
  nextEnergyInMs: number | null;
  /** Milliseconds of shield left, or null when raids can land right now. */
  shieldMs: number | null;
  yieldPerHour: number;
  capHours: number;
  gardenCapacity: number;
  upgradeCost: number | null;
  canUpgrade: boolean;
  next: { yieldPerHour: number } | null;
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
   * The raid the SCREEN currently belongs to — not the one the server has
   * granted.
   *
   * `raid.raid` lands the instant the fetch answers, and every piece of chrome
   * gated on it swapped right there: your burrow column vanished and the
   * raid's HUD appeared over your own garden, and only THEN did the iris start
   * closing. The carrot swiped over a change the player had already watched
   * happen — reported as "ca change de scene apres ya l'opercule qui swipe",
   * and the same bug the sign-in curtain already fixed with `showCanvas`.
   *
   * The iris is a Pixi object on the stage, so it cannot cover DOM at all: the
   * chrome has to swap ITSELF at the midpoint. This is what the render reads,
   * and `draw` flips it under full black alongside the board.
   */
  const [shownRaid, setShownRaid] = useState<RaidState | null>(null);
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
   * The "out of energy" popup — see energy-popup.tsx.
   *
   * Its own state rather than a mode of `shopOpen`: the Shed answers "what is
   * for sale", this answers "I pressed GO and nothing happened", and folding
   * the second into the first is how the second question stopped being asked.
   */
  const [energyOpen, setEnergyOpen] = useState(false);
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
  /**
   * The live `step`, reachable without depending on it.
   *
   * The Pixi cells capture their handler once, when the board is drawn. Wiring
   * `raid.step` in directly would put a value that changes identity on every
   * render into the drawing effect's dependencies — and that effect rebuilds
   * the defender's terrain, so the board would be destroyed and regrown
   * underneath the player's finger. The ref is always current, so the cells
   * can hold a stable function that calls the latest one.
   */
  const stepRef = useRef(raid.step);
  stepRef.current = raid.step;

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
    // And the way back OUT asks for a new seat, because the way in gave the old
    // one up. Not needed on the very first trip — the socket's `connect` joins
    // once — but harmless there: the server answers a join it already granted
    // with the same island snapshot.
    if (next === 'island' && where === 'burrow' && !spectating) game.join();
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
   * A tile was tapped while placing: a bare one takes a bomb, a mined one
   * gives it back.
   *
   * One handler for both because it is one gesture — tap to arm, tap again to
   * change your mind — and the scene already knows which way round it is (it
   * drew the marker), so nothing here has to work it out a second time.
   *
   * The marker is drawn, and removed, only AFTER the server accepts it. An
   * optimistic one would show a defence that is not there, which on a
   * defensive mechanic is the worst possible lie to tell a player — and the
   * lie is just as bad in reverse, a tile that looks clear still holding a
   * bomb the server never lifted.
   */
  const onToggleTrap = useCallback(async (tile: number, mined: boolean) => {
    if (mined) {
      const ok = await shop.removeTrap(tile);
      if (ok) handles.current?.burrow?.removeTrap(tile);
      return;
    }
    const ok = await shop.placeTrap(tile);
    if (ok) handles.current?.burrow?.addTrap(tile);
  }, [shop]);

  /**
   * Lift every bomb off the board at once.
   *
   * The markers come off only for the tiles the SERVER says it cleared — the
   * same rule as lifting one. Clearing a board and being told so is a change
   * the player must be able to trust: a marker removed optimistically would
   * show an undefended burrow that is still mined, or the reverse.
   */
  const clearTraps = useCallback(async () => {
    const cleared = await shop.clearTraps();
    if (!cleared) return;
    for (const tile of cleared) handles.current?.burrow?.removeTrap(tile);
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
    // No iris here, on purpose — the camera IS the transition.
    //
    // Placement used to go behind the carrot wipe like every change of screen,
    // and read as a black flash for what is not a change of screen at all: the
    // same burrow, seen from further back. `setPlacing` already tweens the
    // camera from the home shot to the board shot (see BurrowScene.moveCamera),
    // so the pull-back the shutter was hiding is exactly the thing to show.
    setPlacing(true);
    handles.current?.burrow?.setPlacing(true);
  }, []);

  const stopPlacing = useCallback(() => {
    // The same bare path whether the player is done or is leaving the burrow
    // altogether (see the effect below): the camera eases back in, and nothing
    // else needs to happen in the dark.
    setPlacing(false);
    handles.current?.burrow?.setPlacing(false);
  }, []);

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
    // The popup, not the whole Shed. This intent is only ever set by the
    // recap's "Get more energy", which is one question with one answer — the
    // stall's seven shelves were the old best approximation of it, and the
    // shed is still one press away inside the popup.
    setEnergyOpen(true);
  }, [shopOnArrival, where]);

  /** A purchase changed the carrot stock, so the burrow panel is stale too. */
  const refreshBurrow = useCallback(() => {
    if (!token) return;
    fetch('/api/burrow', auth())
      .then((r) => r.json())
      .then((d) => d.burrow && setBurrow(d.burrow))
      .catch(() => {});
  }, [token, auth]);

  /**
   * A run ended and its carrots are in the database — go and read the total.
   *
   * THE missing half of banking. The server credits a run from every exit, but
   * the burrow's counter is fetched, not pushed, and nothing re-fetched it once
   * a run was over: the carrots were genuinely in Postgres and the HUD still
   * showed the figure from before the run, so "playing does not add to my
   * counter" was true of everything the player could actually see.
   *
   * Keyed on `game.banked`, which the server sends AFTER the write. Firing on
   * `run_over` instead would race its own UPDATE and could re-read the old
   * total — and it would miss walking home, which is the common way to finish.
   *
   * Deliberately not `burstKey`: that one also empties the burrow's garden
   * (see the harvest effect below), and a run's carrots come from the island,
   * not from the field outside the door.
   */
  useEffect(() => {
    if (!game.banked) return;
    refreshBurrow();
  }, [game.banked, refreshBurrow]);

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

  /**
   * GO FARM on an empty tank.
   *
   * The arrow used to be `disabled` here, which answered the only tap on the
   * screen with silence — the player had no way to tell an empty bar from a
   * broken button, and the refill was reachable only through the recap, which
   * a player who walked home never sees. Now the press is always ANSWERED:
   * with the island if there is energy, and with the reason if there is not.
   */
  const goFarm = useCallback(() => {
    if (!hasEnergy) { setEnergyOpen(true); return; }
    goTo('island');
  }, [hasEnergy, goTo]);

  /**
   * A refill bought from the popup.
   *
   * It CLOSES on success, because the popup is a question and the answer is
   * now a full bar — leaving it up would make the player dismiss a dialog
   * about a problem they have just solved. It stays up on a refusal, which is
   * where the note it shows belongs.
   */
  const buyEnergy = useCallback(async () => {
    const res = await shop.buy('energy');
    if (!res) return;
    refreshBurrow();
    setEnergyOpen(false);
  }, [shop, refreshBurrow]);

  const payEnergyUsdc = useCallback(async () => {
    const res = await usdc.pay('energy', 1, payToken);
    if (!res) return;
    await shop.refresh();
    refreshBurrow();
    setEnergyOpen(false);
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

  // The shield sign over the burrow, ticking.
  //
  // `shieldMs` arrives from a poll and is stale the instant it lands, so a
  // sign fed only by the fetch would sit on one number for a whole polling
  // interval and then jump. The deadline is computed ONCE per payload and the
  // countdown is derived from the clock, which keeps it honest across a tab
  // that was backgrounded — a timer counting itself down would drift or pause.
  useEffect(() => {
    if (!ready) return;
    const handle = handles.current?.burrow;
    if (!handle) return;
    if (burrow?.shieldMs == null) {
      handle.setShield(null);
      return;
    }
    const until = Date.now() + burrow.shieldMs;
    const tick = () => {
      const left = until - Date.now();
      handle.setShield(left > 0 ? left : null);
      return left;
    };
    if (tick() <= 0) return;
    // Once a minute: the sign is rendered to the minute, so a faster tick
    // would redraw the same plaque over and over.
    const id = setInterval(() => {
      if (tick() <= 0) clearInterval(id);
    }, 60_000);
    return () => clearInterval(id);
  }, [ready, burrow?.shieldMs]);

  // The backdrop follows the level, so an upgrade is visible in the PLACE and
  // not only in the panel: the fence around your field becomes railings, then a
  // castle wall. Keyed on the level alone — the burrow object changes on every
  // poll, and the scene skips the reload when the art is already the right one.
  useEffect(() => {
    if (!ready || !burrow) return;
    void handles.current?.burrow?.setLevel(burrow.level);
  }, [ready, burrow?.level]);

  // The traps on the ground, SYNCHRONISED with the server's list.
  //
  // Both directions, which is the whole point. This used to only ever add, and
  // that made lifting a bomb impossible in a way that looked like the tap
  // doing nothing: the tap removed the marker, the response refreshed the
  // list, this effect ran again and drew the bomb straight back. The board
  // healed itself faster than the eye could see the gap.
  //
  // Keyed on the tile LIST rather than on the state object, which is replaced
  // on every poll: identical lists mean there is nothing to reconcile.
  const drawnTraps = useRef('');
  useEffect(() => {
    const tiles = shop.traps?.placed;
    if (!ready || !tiles) return;
    const key = tiles.join(',');
    if (drawnTraps.current === key) return;
    const had = drawnTraps.current ? drawnTraps.current.split(',').map(Number) : [];
    drawnTraps.current = key;
    const now = new Set(tiles);
    // Gone from the server's list — lifted here, or sprung by a raider.
    for (const tile of had) if (!now.has(tile)) handles.current?.burrow?.removeTrap(tile);
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

    // AWAITED, and the promise handed back to the shutter.
    //
    // `setRaid` rebuilds the ground it is about to draw on — a raid is crossed
    // on the DEFENDER's homestead, so the terrain is destroyed and grown again
    // from their seed. That is the slowest thing either end of a raid does, and
    // returning before it finished told the iris the cut was already made: the
    // shutter reopened on the OLD board and the new one popped in a frame or
    // two later, in full view. The whole point of a shutter is that the swap
    // happens behind it, so the midpoint has to last as long as the swap does.
    const draw = () => {
      // The CHROME rides the midpoint with the board.
      //
      // Both halves of the screen have to turn over at the same instant, and
      // that instant is under full black. The board is Pixi and the HUD is DOM,
      // so nothing but this shared call can keep them in step — the iris covers
      // the canvas and cannot cover the DOM at all.
      setShownRaid(raid.raid);
      if (!raid.raid) return burrow.setRaid(null);
      return burrow.setRaid({
        view: raid.raid.view,
        walked: raid.raid.walked,
        at: raid.raid.tile,
        // Whose ground to draw. A raid is crossed on the DEFENDER's homestead,
        // grown from their id — the same seed the server validated the step
        // against.
        seed: raid.raid.defender.id,
        level: raid.raid.defender.level,
        // A finished raid offers no steps: the board stays readable, but the
        // walk is over and tapping it must do nothing.
        steps: raid.raid.finished ? [] : raid.raid.steps,
        // Through a REF, so this effect does not depend on the callback.
        // `step` changes identity whenever the hook re-renders, and depending
        // on it here rebuilt the defender's terrain mid-raid.
        onStep: (tile) => void stepRef.current(tile),
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
    if (!crossed || !h) { void draw(); return; }
    setCrossing(true);
    void h.wipeOver(draw).finally(() => setCrossing(false));
    // ONLY the raid payload.
    //
    // `raid` (the whole hook object) used to be in here, and it was a new
    // object on every render — so this effect re-ran constantly and each run
    // called `setRaid`, which destroys the defender's terrain and grows it
    // back. That is why a raid showed the player's OWN island: the rebuild was
    // still in flight when the next one cancelled it, so the ground on screen
    // was whatever the last finished build happened to be. It is also why taps
    // did nothing — every diamond they hit had already been destroyed.
  }, [ready, raid.raid]);

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
    setEnergyOpen(false);
    if (where !== 'burrow') goTo('burrow');
  }, [raid.raid, where, goTo]);

  // Leaving the burrow leaves placement mode with it: coming back to a screen
  // still showing a grid you forgot you opened is a small mystery every time.
  useEffect(() => {
    if (where === 'burrow') return;
    if (placing) stopPlacing();
    setShopOpen(false);
    // The popup belongs to the burrow's arrow, so it leaves with the screen —
    // the recap on the island has its own way of asking the same question.
    setEnergyOpen(false);
  }, [where, placing, stopPlacing]);

  /**
   * Signing out puts the app back on the doorstep — every screen, not just the
   * ones drawn from `player`.
   *
   * `where` is the one piece of state that outlived a session: it is not
   * derived from the player, so logging out on the island left it on 'island'
   * and the signed-out screen kept the island's HUD and its "Back home"
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
    setEnergyOpen(false);
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
          onToggleTrap={onToggleTrap}
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
          "Back home" arrow on the sign-in screen.
          The effect already puts `where` back; this makes the wrong screen
          unreachable rather than merely un-entered. */}
      {/* The burrow column is about YOUR burrow — its HP, its garden, its
          upgrade. During a raid the board underneath belongs to somebody else,
          and leaving the column up put your own 400/400 and a HARVEST button
          over a castle you are trying to rob. The raid has its own thin HUD
          (RaidHud) that describes the place you are actually standing in. */}
      {crossing || shownRaid ? null : where === 'burrow' || !showCanvas ? (
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
              {/* While placing, the column steps out of the way.
                  
                  HP, energy, the garden and the upgrade are all readings of a
                  burrow you are not currently managing — and the column is
                  ~400px of a board that has to be TAPPED, cell by cell, over
                  its whole width. The cards were covering the left third of
                  the ground the player is being asked to mine, which on a
                  narrow window is most of the useful island.
                  
                  The instruction and "Done placing" stay: they are the two
                  things placement itself needs. */}
              {!placing && (
              <>
              {/* SHIELD, where HIT POINTS used to be.
                  
                  The HP bar promised a fortress the game does not have: traps
                  are what a raider fights, and the damage roll changed neither
                  his loot nor his progress. The one thing HP ever decided was
                  how soon the next raid could land — so that is what the card
                  says now, in the only unit the player can act on: time.
                  
                  It renders ONLY while the shield holds. An always-present
                  "not shielded" row would be a permanent reminder of a thing
                  the player cannot buy or build, which is the same mistake as
                  the gauge it replaced. */}
              {burrow?.shieldMs != null && (
                <BurrowCard>
                  <CardRow
                    label="SHIELD"
                    value={formatWait(burrow.shieldMs)}
                    tone={CARROT}
                  />
                  <CardNote>
                    You were raided. Raids bounce off until it runs out.
                  </CardNote>
                </BurrowCard>
              )}

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
                {/* Only the states that TELL the player something get a line.
                    Empty needs a return time — without one they cannot tell a
                    broken game from a wait — and a refill in progress needs its
                    countdown. A FULL bar explains itself, so the note was a
                    caption on a picture that was already clear, and the row it
                    sat on is better spent on the board. */}
                {burrow?.nextEnergyInMs !== null && (
                  <CardNote>
                    {!hasEnergy
                      ? `Out of energy. Next in ${formatWait(burrow?.nextEnergyInMs ?? null)}.`
                      : `+1 in ${formatWait(burrow?.nextEnergyInMs ?? null)}.`}
                  </CardNote>
                )}
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
                    number the player has no way to judge.
                    
                    It used to quote "X HP" first. That was the upgrade's
                    headline benefit and it bought nothing — HP defended
                    nothing — so the garden rate, which is real, is now the
                    whole of the offer. */}
                {burrow?.next && (
                  <CardNote>
                    level {burrow.level + 1}: {burrow.next.yieldPerHour} carrots/hour
                  </CardNote>
                )}
                <BurrowButton
                  disabled={pending || !burrow?.canUpgrade}
                  onClick={() => act('upgrade')}
                >
                  UPGRADE
                </BurrowButton>
              </BurrowCard>
              </>
              )}

              {/* Placing takes over the screen, so the way into the shop
                  steps aside for the way out of placement. */}
              {placing ? (
                <>
                  <button className="rr-btn" onClick={stopPlacing}>
                    Done placing
                  </button>
                  {/* Clear the board in one press.
                      
                      Rearranging a defence means lifting several bombs, and
                      tapping them off one diamond at a time on a 19x19 grid is
                      the chore that stands between a player and changing their
                      mind. The traps come back to the bag, exactly as lifting
                      one does, so this costs nothing but the gesture.
                      
                      Only offered when there is something to clear — a button
                      that does nothing is worse than no button. */}
                  {(shop.traps?.placed.length ?? 0) > 0 && (
                    <button className="rr-btn ghost" onClick={clearTraps}>
                      Clear all mines
                    </button>
                  )}
                </>
              ) : (
                <>
                  <ShopButton shop={shop.shop} onOpen={() => setShopOpen(true)} />
                  {/* Straight to the board. Burying a bomb and buying one are
                      two errands, and only the shopping one had a door: to
                      rearrange your own ground you had to open the shed and
                      find "Move them" inside a dialog selling you things. A
                      defender editing their burrow is not shopping.

                      Directly under the shop, because that is where the state
                      it reports used to be read. */}
                  <ProtectButton shop={shop.shop} onPlace={startPlacing} />
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
                  board itself cannot say what a tap will cost. It has to name
                  the way BACK too: a gold marker does not look like a button,
                  so a player who misplaced one has no way to guess that
                  tapping it again is what lifts it.

                  With an empty shed the sentence drops the half it cannot
                  deliver. Lifting still works — that is the whole reason the
                  board opens at zero — and telling someone to mine a tile when
                  every tap will be refused is worse than saying nothing. */}
              {placing && shop.shop && (
                <p className="rr-note">
                  {shop.shop.traps.held > 0
                    ? <>Tap a tile to mine it, tap a mine to lift it &middot; {shop.shop.traps.held} left</>
                    : <>No traps left &middot; tap a mine to lift it and bury it elsewhere</>}
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
          <RunHud game={game} name={player?.name ?? ''} spectating={spectating} />
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
              onShop={goShopping}
              onHome={stopSpectating}
            />
          )}
          {/* Leaving ALWAYS goes through `stopSpectating`, even when playing
              (where it is just `goTo`): a second exit path that forgot to clear
              the target would strand the session as a viewer with no way back
              into its own game. */}
          <GoButton
            dir="down"
            label={spectating ? 'Stop watching' : 'Back home'}
            onClick={stopSpectating}
          />
        </div>
      )}

      {showCanvas && where === 'burrow' && !shownRaid && !crossing && (
        // Never disabled, and never hidden. It is the one control anchored to
        // this screen, and a dead arrow was the game's worst answer to its
        // most common dead end — an empty tank now opens the popup that says
        // so and offers the way out. It still waits out a crossing with the
        // rest of the burrow's chrome.
        //
        // `away` while placing rather than unmounting it: farming is not on
        // offer while you are mining the board, but the camera is pulling back
        // in that same moment, and the button rides down with it on the same
        // curve (see .rr-go-away). Unmounted, it would blink out halfway
        // through the zoom.
        <GoButton dir="down" label="Go farm" onClick={goFarm} away={placing} />
      )}

      {/* The small "out of energy" dialog. Above the shop in the tree and
          independent of it: the Shed can be opened FROM here, and when it is
          this one steps aside rather than stacking behind it. */}
      {player && energyOpen && (
        <EnergyPopup
          shop={shop.shop}
          stock={burrow?.stock ?? 0}
          energy={burrow?.energy ?? 0}
          maxEnergy={burrow?.maxEnergy ?? 0}
          nextEnergyInMs={burrow?.nextEnergyInMs ?? null}
          busy={shop.busy}
          // The same rail the Shed is set to, because `payEnergyUsdc` quotes on
          // it — the price shown and the price charged are one choice.
          payToken={payToken}
          payStage={usdc.stage}
          note={shop.note}
          error={usdc.error}
          onBuy={() => void buyEnergy()}
          // Same rule as the Shed: no wallet, no money route — the popup
          // offers one price instead of offering two and failing at the quote.
          onPayUsdc={payments && !player.guest ? () => void payEnergyUsdc() : undefined}
          onOpenShop={() => { setEnergyOpen(false); shop.setNote(null); setShopOpen(true); }}
          onClose={() => { setEnergyOpen(false); shop.setNote(null); usdc.setError(null); }}
        />
      )}

      {/* The board is the Pixi scene behind this, so the HUD is deliberately
          thin — a raid is walked on the ground, not in a list. */}
      {player && shownRaid && (
        <RaidHud
          raid={shownRaid}
          outcome={raid.outcome}
          busy={raid.busy}
          note={raid.note}
          onLeave={raid.leave}
        />
      )}

      {player && pickingTarget && !shownRaid && (
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
