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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWalletLogin, WalletSessionProvider } from '@/components/use-wallet-login';
import { CarrotCurtain } from '@/components/carrot-curtain';
import { useGameSocket } from '@/components/use-game-socket';
import { Recap } from '@/components/run-recap';
import { ChestPrize } from '@/components/chest-prize';
import { GameCanvas, type GameHandles } from '@/components/game-canvas';
import { WalletButton } from '@/components/wallet-button';
import { LeaderboardDrawer, type Me } from '@/components/leaderboard-drawer';
import { BackButton } from '@/components/back-button';
import { PxButton, PxPanel, pxLabel } from '@/components/px';
import { CarrotPill } from '@/components/carrot-pill';
import { RaidedStamp, raidedNews, type RaidedNews } from '@/components/raided-stamp';
import { TopbarReserve } from '@/components/topbar-reserve';
import { SoundButton } from '@/components/sound-button';
import { LoadingScreen } from '@/components/loading-screen';
import { LogoBanner } from '@/components/logo-banner';
import { RunHud } from '@/components/run-hud';
import { CarrotField } from '@/components/carrot-field';
import { ShopPanel } from '@/components/shop-card';
import { EnergyPopup } from '@/components/energy-popup';
import { LoreCodex } from '@/components/lore-codex';
import { LoopBar } from '@/components/loop-bar';
import { NextStrip } from '@/components/next-strip';
import { HubIconButton } from '@/components/hub-icon-button';
import { nextAction } from '@/config/next-action';
import { LORE } from '@/config/lore';
import { KitRow } from '@/components/kit-row';
import { LoreCrawl } from '@/components/lore-crawl';
import { GardenCard } from '@/components/garden-card';
import { BurrowPanel } from '@/components/burrow-card-panel';
import { QuestCard } from '@/components/quest-card';
import { FirstRunCaption } from '@/components/first-run-caption';
import { RunCostNote } from '@/components/run-cost-note';
import { LevelUpStamp } from '@/components/level-up-stamp';
import { EruptionOverlay } from '@/components/eruption-overlay';
import { LootFly } from '@/components/loot-fly';
import { playUiSfx } from '@/game/services/SoundManager';
import { unlockedCount } from '@/config/lore';
import { QUEST_MARK, codexMark, type QuestBoard } from '@/config/quests';
import { TRAPS } from '@config/tuning';
import { useShop, type ItemKind } from '@/components/use-shop';
import type { PayTokenId } from '@/lib/pay/tokens';
import { useUsdcPay } from '@/components/use-usdc-pay';
import { RaidHud, TargetList } from '@/components/raid-panel';
import { useRaid, type RaidState } from '@/components/use-raid';
import { RaidVictory } from '@/components/raid-victory';
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
  /** What a run takes out of `energy`, and how long until there is that much. */
  runCost: number;
  nextRunInMs: number | null;
  /** Milliseconds of shield left, or null when raids can land right now. */
  shieldMs: number | null;
  yieldPerHour: number;
  /** The LIVE ceiling in hours — fertiliser included while a feeding runs. */
  capHours: number;
  gardenCapacity: number;
  /** What the garden holds right now, fertiliser included. */
  gardenCeiling: number;
  /** The two things you can pour on it: bottles held, window running. */
  boosts: {
    water: { held: number; activeMs: number | null };
    fertiliser: { held: number; activeMs: number | null };
  };
  upgradeCost: number | null;
  canUpgrade: boolean;
  next: { yieldPerHour: number } | null;
  /** Runs banked — zero means never been on an island. */
  runs: number;
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
/**
 * How long a finished raid stays on the defender's board — the rabbit's dance
 * on the field, or its collapse short of it — before the trip home.
 */
const RAID_OVER_MS = 2000;
/** How long the haul is announced in the burrow once home. */
const RAID_TOAST_MS = 4000;
/**
 * The page's own glass panels (toasts, the quest caption, the defence line,
 * the reconnect pill) in the codex's pixel frame. Their CSS classes still
 * place them; these two lines stop the old smooth chrome drawing under the
 * frame — a background under a translucent fill, and a radius the pixel
 * corners do not have.
 */
const PX_GLASS = { background: 'none', borderRadius: 0 } as const;

/** How a held crossing ended — see `waitForIsland`. */
type IslandArrival = 'ready' | 'refused' | 'late';

/** How long the run's haul sits over the DIG slab. Matches `.rr-home-haul`'s animation. */
const BROUGHT_HOME_MS = 4000;
/** How long a burrow toast stands under the pill before it clears itself. */
const NOTE_MS = 4000;
/**
 * The longest the carrot shutter stays shut waiting for an island. Past it
 * the crossing turns round with a reason: a black screen with no end is the
 * one answer worse than "try again".
 */
const ISLAND_WAIT_MS = 8000;

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
  /**
   * The quest board, read with the burrow — `/api/burrow` carries both, and
   * every response that hands back a burrow hands back the board beside it,
   * so the two can never be one fetch apart.
   */
  const [quest, setQuest] = useState<QuestBoard | null>(null);
  const [pending, setPending] = useState(false);
  /**
   * THE BURROW'S TOAST — one line under the carrot pill, and it clears itself.
   *
   * It was a `.rr-note` at the foot of the card column: grey on the moving sea
   * (1.4:1 measured), far from whatever was pressed, and it stayed until the
   * next message replaced it — a claimed quest's line was still there minutes
   * later, behind the energy dialog. Under the pill it sits beside the number
   * nearly every one of these lines is about, on the island captions' glass.
   *
   * A REFUSAL is a different kind of news from a harvest and now looks and
   * sounds like one: red, a buzz, and — when it is about carrots — the pill
   * itself shakes. `noteKey` re-pops the same sentence said twice.
   */
  const [note, setNoteText] = useState<string | null>(null);
  const [noteRefused, setNoteRefused] = useState(false);
  const [noteKey, setNoteKey] = useState(0);
  const [pillDenyKey, setPillDenyKey] = useState(0);
  const setNote = useCallback((next: string | null | ((n: string | null) => string | null)) => {
    // A functional update only ever CLEARS its own line (see the raid toast),
    // so it leaves the tone and the key alone.
    if (typeof next !== 'function') {
      setNoteRefused(false);
      if (next) setNoteKey((k) => k + 1);
    }
    setNoteText(next);
  }, []);
  const refuse = useCallback((text: string, aboutCarrots = false) => {
    setNoteText(text);
    setNoteRefused(true);
    setNoteKey((k) => k + 1);
    if (aboutCarrots) setPillDenyKey((k) => k + 1);
    playUiSfx('deny');
  }, []);
  useEffect(() => {
    if (!note) return;
    const shown = note;
    const done = setTimeout(() => setNoteText((n) => (n === shown ? null : n)), NOTE_MS);
    return () => clearTimeout(done);
  }, [note, noteKey]);
  // Bumped whenever carrots ARRIVE in the bank — a harvest, a run brought
  // home, a quest's reward: it replays the rising "+N" and re-keys the
  // figure so it pops as the carrots land.
  const [burstKey, setBurstKey] = useState(0);
  const [burstAmount, setBurstAmount] = useState(0);
  /**
   * Bumped on a HARVEST only. It used to be `burstKey` that emptied the
   * field on the board, which was right while harvest was the only burst —
   * and wrong the day a quest reward burst the counter and quietly mowed the
   * garden's art with it. The two are separate events now.
   */
  const [harvestKey, setHarvestKey] = useState(0);
  /** The active quest just became DONE — the card lights, the island says so. */
  const [questDoneKey, setQuestDoneKey] = useState(0);
  /** A quest's reward was just taken — confetti, and the next ask slides in. */
  const [questClaimKey, setQuestClaimKey] = useState(0);
  /** The active quest moved to a new door — that hub tile pops. */
  const [questPulseKey, setQuestPulseKey] = useState(0);
  /** One line over the island when a quest finishes out there. */
  const [questNote, setQuestNote] = useState<string | null>(null);
  /** The burrow just went up: the stamp over the screen. */
  const [levelUp, setLevelUp] = useState<{ level: number; key: number } | null>(null);
  /**
   * When a run's worth of energy lands, on the wall clock. The server sends a
   * DURATION as of its answer; pinned to now when that answer is set, so the
   * loop bar can count it down without asking again.
   */
  const nextRunAt = useMemo(
    () => (burrow?.nextRunInMs == null ? null : Date.now() + burrow.nextRunInMs),
    [burrow],
  );
  /** The run just banked, shown over the DIG slab that sends the next one. */
  const [broughtHome, setBroughtHome] = useState<{ amount: number; key: number } | null>(null);
  /** A chapter opened this session — the STORY tile pops. */
  const [lorePulseKey, setLorePulseKey] = useState(0);
  /** An item reward in flight to the bag. */
  const [flyItem, setFlyItem] = useState<{ kind: 'bomb' | 'shield'; qty: number; key: number } | null>(null);
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
  /** The viewer's season standing, for the carrot pill's rank line. */
  const [me, setMe] = useState<Me | null>(null);
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
    islandBuild.current = island.setIsland(game.islandSeed).then(() => {
      // The snapshot's rabbits and dug tiles were applied to the OLD board, so
      // they have to be replayed onto the new one.
      game.resync();
    });
  }, [ready, game.islandSeed, game]);

  /**
   * THE SHUTTER WAITS FOR THE ISLAND.
   *
   * The carrot iris used to open on a fixed beat after the cut, whatever the
   * server had answered by then. On a slow join — or a dropped socket — it
   * opened on the LAST island: its dug tiles, no rabbit, the old "Run over"
   * card. The crossing out now holds the shutter shut until an island snapshot
   * for THIS join has landed and its board is built, with a ceiling
   * (ISLAND_WAIT_MS) past which it turns round and says so.
   *
   * `islandSeen` is the newest snapshot whose board is ready, compared with
   * the count taken when the crossing began — so an answer that beats the
   * iris to the cut is not waited for twice. The seed effect above runs first
   * in the same commit, so a new seed's rebuild is already in `islandBuild`.
   */
  const islandBuild = useRef<Promise<void> | null>(null);
  const islandSeen = useRef(0);
  const islandWaiter = useRef<((result: IslandArrival) => void) | null>(null);
  const refusedRef = useRef(game.refused);
  refusedRef.current = game.refused;
  useEffect(() => {
    if (!game.islandKey) return;
    const key = game.islandKey;
    const done = () => {
      islandSeen.current = Math.max(islandSeen.current, key);
      islandWaiter.current?.('ready');
      islandWaiter.current = null;
    };
    if (islandBuild.current) void islandBuild.current.then(done, done);
    else done();
  }, [game.islandKey]);
  // A refused seat answers the join too: open, and let the refusal effect turn
  // the crossing round, rather than holding black until the ceiling.
  useEffect(() => {
    if (!game.refused) return;
    islandWaiter.current?.('refused');
    islandWaiter.current = null;
  }, [game.refused]);
  const waitForIsland = useCallback(
    (seenBefore: number, askedAt: number) => new Promise<IslandArrival>((resolve) => {
      if (islandSeen.current > seenBefore) { resolve('ready'); return; }
      const refused = refusedRef.current;
      if (refused && refused.at >= askedAt) { resolve('refused'); return; }
      const ceiling = setTimeout(() => { islandWaiter.current = null; resolve('late'); }, ISLAND_WAIT_MS);
      islandWaiter.current = (result) => { clearTimeout(ceiling); resolve(result); };
    }),
    [],
  );

  // Whether the player's rabbit has been panned out of frame — see
  // IslandScene.setRabbitInViewListener. Drives the "Find my rabbit" button.
  const [rabbitAway, setRabbitAway] = useState(false);
  useEffect(() => {
    const island = handles.current?.island;
    if (!ready || !island || where !== 'island') {
      setRabbitAway(false);
      return;
    }
    island.setRabbitInViewListener((inView) => setRabbitAway(!inView));
    return () => island.setRabbitInViewListener(null);
  }, [ready, where]);

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
      .then((d) => {
        if (d.burrow) setBurrow(d.burrow);
        if (d.quest) setQuest(d.quest);
      })
      .catch(() => {});
  }, [token, auth]);

  /**
   * The player's own bunny, for the raid's victory ceremony.
   *
   * The wallet chip already fetches this for the face on the button, but it
   * keeps it to itself, and the ceremony is raised from here. Rather than lift
   * that state through a component whose job is signing in, this reads the same
   * endpoint: `/api/auth/me` is a cheap authenticated row, fetched once per
   * session, and both callers want exactly one field off it.
   *
   * A null avatar is not a failure — `avatarSrc` falls back to the default
   * sheet — so this never blocks the ceremony on a request that did not land.
   */
  const [avatar, setAvatar] = useState<string | null>(null);
  useEffect(() => {
    if (!token) return;
    fetch('/api/auth/me', auth())
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.player && setAvatar(d.player.avatar ?? null))
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

  const act = async (action: 'harvest' | 'upgrade' | 'water' | 'fertilise' | 'shield') => {
    setPending(true);
    setNote(null);
    try {
      const res = await fetch('/api/burrow', auth({ method: 'POST', body: JSON.stringify({ action }) }))
        .then((r) => r.json());
      if (res.burrow) setBurrow(res.burrow);
      if (res.quest) setQuest(res.quest);
      if (res.harvested) {
        setNote(`+${res.harvested} 🥕`);
        setBurstAmount(res.harvested);
        setBurstKey((k) => k + 1);
        setHarvestKey((k) => k + 1);
        playUiSfx('coin');
      }
      else if (res.spent) {
        // The biggest purchase in the game gets the stage, not a toast: the
        // stamp over the screen, the sting, and the board's own building
        // popping (BurrowScene.setLevel → celebrateLevel).
        playUiSfx('match');
        if (res.burrow?.level) setLevelUp((l) => ({ level: res.burrow.level, key: (l?.key ?? 0) + 1 }));
      }
      else if (res.raised === 'shield') {
        setNote('Shield up. Raids bounce off.');
        // The shield came OUT OF THE BAG, and the bag is the shop's state, not
        // the burrow's — without this the kit row keeps drawing a shield the
        // server has already spent. The burrow response carries the new
        // `shieldMs`, so only the count needs re-fetching.
        void shop.refresh();
      }
      else if (res.poured === 'water') setNote('Watered. The garden fills faster.');
      else if (res.poured === 'fertiliser') setNote('Fed. The garden holds more.');
      else if (res.error === 'insufficient_carrots') refuse(`Need ${res.need - res.have} more 🥕`, true);
      else if (res.error === 'nothing_to_harvest') refuse('The garden is empty. Come back later.');
      else if (res.error === 'max_level') refuse('Your burrow is as deep as it goes.');
      // The two boost refusals. `boost_capped` is the one worth a sentence:
      // the press was declined to SAVE the bottle, which is the opposite of
      // what a silent failure would look like.
      else if (res.error === 'already_shielded') refuse('A shield is already up.');
      else if (res.error === 'none_held') refuse('None left. Chests drop them.');
      else if (res.error === 'boost_capped') refuse('Already topped up. Save it for later.');
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
    // Counted BEFORE the join goes out, so an answer faster than the iris
    // still counts as this crossing's island (see `waitForIsland`).
    const seenBefore = islandSeen.current;
    const askedAt = Date.now();
    if (next === 'island' && where === 'burrow' && !spectating) game.join();
    const holdForIsland = next === 'island' && !spectating;
    let arrival: IslandArrival = 'ready';
    setCrossing(true);
    void h
      .wipeTo(next === 'island' ? SCENE.island : SCENE.burrow, async () => {
        setWhere(next);
        if (holdForIsland) arrival = await waitForIsland(seenBefore, askedAt);
      })
      .finally(() => {
        setCrossing(false);
        // Nothing came. Turn round rather than open on a board with no rabbit
        // on it — and say why, or the trip home reads as the game giving up.
        if (arrival === 'late') {
          refuse('The island did not answer. Try again in a moment.');
          goToRef.current('burrow');
        }
      });
  }, [where, spectating, game, waitForIsland, refuse]);
  const goToRef = useRef(goTo);
  goToRef.current = goTo;

  /**
   * Enough for a run — a whole one, ENERGY.RUN_COST of it, which the server
   * takes at the crossing. Null burrow means "still loading", not "empty".
   */
  const hasEnergy = burrow === null || burrow.energy >= burrow.runCost;

  /**
   * THE LOOP'S OWN READINGS, for the bar and the NEXT strip.
   *
   * Open targets and the richest of them by what stands in their garden —
   * the raid's real purse — come from the same list the target picker
   * draws, so the slab's line and the list agree. The next action is only
   * computed once the quest arc is claimed; while it runs, the quest IS the
   * next action.
   */
  const openTargets = useMemo(() => raid.targets.filter((t) => !t.shielded), [raid.targets]);
  const bestTarget = useMemo(() => {
    const rich = openTargets
      .filter((t) => (t.garden ?? 0) > 0)
      .sort((a, b) => (b.garden ?? 0) - (a.garden ?? 0))[0];
    return rich ? { name: rich.name, garden: rich.garden ?? 0 } : null;
  }, [openTargets]);
  const next = useMemo(() => {
    if (!burrow || quest?.active) return null;
    return nextAction({
      energy: burrow.energy,
      runCost: burrow.runCost,
      nextRunInMs: burrow.nextRunInMs,
      gardenReady: burrow.gardenReady,
      gardenCapacity: burrow.gardenCapacity,
      shieldMs: burrow.shieldMs,
      trapsLive: shop.traps?.armed.length ?? 0,
      trapsPlaced: shop.traps?.placed.length ?? 0,
      targets: raid.targets.map((t) => ({ name: t.name, garden: t.garden ?? 0, shielded: t.shielded })),
    });
  }, [burrow, quest?.active, shop.traps, raid.targets]);
  /** A fresh chapter for the STORY icon's badge — the codex's own rule. */
  const freshChapter = useMemo(() => {
    const lifetime = burrow?.lifetime ?? 0;
    const open = unlockedCount(lifetime);
    return open > 0 && lifetime - LORE[open - 1].unlockAt < 500;
  }, [burrow?.lifetime]);

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
    if (ok) {
      handles.current?.burrow?.addTrap(tile);
      // The thud of it going into the ground; the scene throws the dust.
      playUiSfx('step');
    }
  }, [shop]);

  /**
   * How long until the next trap comes back, as the burrow column says it.
   *
   * Recomputed on render rather than ticked: the value only has to be right
   * when the player looks at it, and a countdown of its own would be a timer
   * running for every second the board is open to save a poll it already
   * makes. Same treatment as the shield card's.
   */
  // The full rearm window, so a REMAINING time can be turned back into a
  // fraction for the ramp. Read from tuning rather than sent per trap: it is
  // the same number for every trap, and the stagger is already baked into the
  // `readyAt` the server hands over.
  const REARM_TOTAL_MS = TRAPS.REARM_MS;

  const nextRearmLabel = useMemo(() => {
    const next = shop.traps?.rearming[0];
    if (!next) return null;
    return formatWait(new Date(next.readyAt).getTime() - Date.now());
  }, [shop.traps]);

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
      .then((d) => {
        if (d.burrow) setBurrow(d.burrow);
        if (d.quest) setQuest(d.quest);
      })
      .catch(() => {});
  }, [token, auth]);

  /**
   * Take the active quest's reward.
   *
   * The server recomputes the condition and writes the claim in one guarded
   * statement, so a double tap is answered `already_claimed` rather than paid
   * twice. The island's line for the quest is said HERE, once, as the toast:
   * the card is an instruction, and the story belongs to the moment the
   * reward lands, not to the card that asked for it.
   */
  const claimQuest = useCallback(async (id: string) => {
    if (!token) return;
    setPending(true);
    try {
      const res = await fetch('/api/quests', auth({ method: 'POST', body: JSON.stringify({ action: 'claim', id }) }))
        .then((r) => r.json());
      if (res.burrow) setBurrow(res.burrow);
      if (res.quest) setQuest(res.quest);
      if (res.line) setNote(res.line);
      if (res.claimed) {
        playUiSfx('match');
        setQuestClaimKey((k) => k + 1);
      }
      if (res.reward?.carrots) {
        setBurstAmount(res.reward.carrots);
        setBurstKey((k) => k + 1);
      }
      if (res.reward?.item) {
        // The item is in the bag; the flight is what says so — it used to
        // land in silence and only show up on the SHOP tile's badge.
        const item = res.reward.item as { kind: 'bomb' | 'shield'; qty: number };
        setFlyItem((f) => ({ ...item, key: (f?.key ?? 0) + 1 }));
        void shop.refresh();
      }
    } finally {
      setPending(false);
    }
  }, [token, auth, shop]);

  /**
   * THE QUEST'S TWO MOMENTS, detected from the board rather than reported
   * by the server: DONE is a property of the counters, and the page sees the
   * board before and after every refresh.
   *
   * Done: once per quest id, the first time the active card reads done —
   * the card lights (`questDoneKey`), a chime, and on the island one line
   * under the HUD, because the player is not looking at the card there.
   * Door: when the active quest changes to one that is not done, its door's
   * tile pops so the eye is sent where the next ask lives.
   */
  const lastDone = useRef<string | null>(null);
  const lastActive = useRef<string | null>(null);
  const activeId = quest?.active?.id ?? null;
  const activeDone = quest?.active?.done ?? false;
  const activeTitle = quest?.active?.title ?? '';
  useEffect(() => {
    if (activeId && activeDone && lastDone.current !== activeId) {
      lastDone.current = activeId;
      setQuestDoneKey((k) => k + 1);
      playUiSfx('chime');
      if (where === 'island') {
        setQuestNote(`Quest done: ${activeTitle}`);
        const t = setTimeout(() => setQuestNote(null), 5000);
        return () => clearTimeout(t);
      }
    }
  }, [activeId, activeDone, activeTitle, where]);
  useEffect(() => {
    if (activeId && lastActive.current && lastActive.current !== activeId && !activeDone) {
      setQuestPulseKey((k) => k + 1);
    }
    lastActive.current = activeId;
  }, [activeId, activeDone]);

  /**
   * A chapter OPENED this session: chime, and the STORY tile pops. Compared
   * against the previous read, so a returning player's already-open chapters
   * are not re-announced on load.
   */
  const lastOpen = useRef<number | null>(null);
  const openChapters = burrow ? unlockedCount(burrow.lifetime) : null;
  useEffect(() => {
    if (openChapters === null) return;
    if (lastOpen.current !== null && openChapters > lastOpen.current) {
      playUiSfx('chime');
      setLorePulseKey((k) => k + 1);
    }
    lastOpen.current = openChapters;
  }, [openChapters]);

  /**
   * Climbing a place on the season board: a quick chime. The pill's rank
   * line pops on its own (`rr-rank-pop`, keyed on the rank); this is the
   * sound to go with it. Only UP — falling a place is somebody else's news.
   */
  const lastRank = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    const now = me?.rank ?? null;
    const before = lastRank.current;
    if (before !== undefined && before !== null && now !== null && now < before) playUiSfx('chimeQuick');
    lastRank.current = now;
  }, [me?.rank]);

  /**
   * COMING HOME WITH CARROTS. The run's haul banks while the player is still
   * on the island (the recap), and the burrow's counter used to just READ
   * differently on arrival — the biggest number of the session changed as
   * quietly as a clock. The amount is parked when `banked` fires and spent
   * on the first render of the burrow after it: the burst, the pill's pop,
   * the coin. Deliberately not the harvest key: nothing was harvested.
   */
  const pendingHome = useRef(0);
  useEffect(() => {
    if (game.banked > 0 && game.bankedCarrots > 0) pendingHome.current = game.bankedCarrots;
  }, [game.banked, game.bankedCarrots]);
  useEffect(() => {
    if (where !== 'burrow' || crossing || !showCanvas || pendingHome.current <= 0) return;
    const amount = pendingHome.current;
    pendingHome.current = 0;
    setBurstAmount(amount);
    setBurstKey((k) => k + 1);
    // Over DIG, not at the foot of the card column. It used to be a `.rr-note`
    // there: grey on the moving sea (1.4:1 measured), 175px from the slab the
    // player reaches for next, and it never went away.
    setBroughtHome({ amount, key: Date.now() });
    playUiSfx('coin');
  }, [where, crossing, showCanvas]);
  // Clears itself — only itself: a newer haul re-keys it and owns the clock.
  useEffect(() => {
    if (!broughtHome) return;
    const { key } = broughtHome;
    const done = setTimeout(() => setBroughtHome((b) => (b?.key === key ? null : b)), BROUGHT_HOME_MS);
    return () => clearTimeout(done);
  }, [broughtHome]);

  /**
   * Tell the server something only the browser saw — the season board opened,
   * a chapter read. Fired on every open, and a repeat is a no-op server-side,
   * so the callers do not have to remember whether they already did.
   */
  const markQuest = useCallback((mark: string) => {
    if (!token) return;
    fetch('/api/quests', auth({ method: 'POST', body: JSON.stringify({ action: 'mark', mark }) }))
      .then((r) => r.json())
      .then((d) => { if (d.quest) setQuest(d.quest); })
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

  /**
   * A seat was granted, so the burrow just PAID for it — go and read the bar.
   *
   * The other missing half, and the mirror of the effect above. Energy leaves
   * the burrow at the crossing (`payForRun`, server/index.ts), while the only
   * refresh was keyed on `banked`, which the server sends when a run's carrots
   * are written — much later, and not at all for a run that banked nothing. So
   * the bar sat at its pre-run figure for the whole run, and a player who came
   * home empty-handed kept reading a full bank until something unrelated
   * re-fetched it. The energy really had been spent; only the number lied.
   *
   * `islandSeed` is the signal because the server sends the island snapshot
   * ONLY after the charge succeeds — a refused join gets `no_energy` instead,
   * which has its own refresh below. Watching the seed rather than a "joined"
   * flag also covers landing on a second island later in the same session.
   */
  useEffect(() => {
    if (!game.islandSeed) return;
    refreshBurrow();
  }, [game.islandSeed, refreshBurrow]);

  /**
   * A trap went into the ground (or came out), so the quest board may have
   * moved — "Bury something" and "Hold the door" both count placements, and
   * the board is read with the burrow. Keyed on the COUNT the shop hook
   * reports rather than wired into the placement handler, which is declared
   * above this refresher and cannot reach it.
   */
  const placedCount = shop.traps?.placed.length ?? null;
  useEffect(() => {
    if (placedCount === null) return;
    refreshBurrow();
  }, [placedCount, refreshBurrow]);

  /**
   * The same refresher, reachable from the finished-raid effect.
   *
   * That effect is keyed on the raid's ID ALONE, deliberately — it must fire
   * once per finished raid and survive the polls that re-render this page.
   * Putting `refreshBurrow` in its dependencies would re-run the whole ending
   * (ceremony, timers and all) every time that callback changed identity, so
   * the call goes through a ref instead.
   */
  const refreshBurrowRef = useRef(refreshBurrow);
  refreshBurrowRef.current = refreshBurrow;

  /**
   * The server would not seat us: the bar it holds is short of a run.
   *
   * The burrow's own gate (`hasEnergy`) asks the same question first, so this
   * is the answer to a STALE screen — a tab left open while another one spent
   * the bar, or a bar read before a refill lapsed. It is settled where the gate
   * would have settled it: back on the burrow, with the popup open, and the
   * bar re-read so the number in it is the server's.
   *
   * Waits for any crossing to finish before turning round, because the
   * refusal can land while the iris is still closing on the way OUT, and a
   * second wipe started inside the first is not a thing the curtain does.
   * Each refusal is spent once (`at`): re-running on a later crossing would
   * otherwise march the player home again for an answer they already had.
   */
  const spentRefusal = useRef(0);
  useEffect(() => {
    const r = game.refused;
    if (!r || r.at === spentRefusal.current || crossing) return;
    if (where === 'island') { goTo('burrow'); return; }
    spentRefusal.current = r.at;
    refreshBurrowRef.current();
    setEnergyOpen(true);
  }, [game.refused, where, crossing, goTo]);

  const buyWithCarrots = useCallback(async (kind: ItemKind) => {
    const res = await shop.buy(kind);
    if (res) {
      playUiSfx('chimeQuick');
      refreshBurrow();
    }
  }, [shop, refreshBurrow]);

  const buyWithUsdc = useCallback(async (kind: ItemKind) => {
    const res = await usdc.pay(kind, 1, payToken);
    if (res) {
      playUiSfx('chime');
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
    // A dropped socket cannot seat a rabbit: crossing then landed on the old
    // board with nothing to play (seen live). Say so, and stay home.
    if (game.dropped) { refuse('Reconnecting... try again in a moment.'); return; }
    goTo('island');
  }, [hasEnergy, goTo, game.dropped, refuse]);

  /**
   * A tap on the NEXT strip goes where the line points: the island, the
   * harvest, the trap floor, or the target list. The strip is a pointer, and
   * a pointer you cannot follow with the finger that read it is a label.
   */
  const onNextAction = useCallback(() => {
    switch (next?.door) {
      case 'farm': goFarm(); break;
      case 'garden': void act('harvest'); break;
      case 'base': startPlacing(); break;
      case 'raid': setPickingTarget(true); void raid.refresh(); break;
      default: break;
    }
    // `act` is a plain async function on the component, re-created per
    // render; listing it would re-create this handler every render for no
    // change in behaviour.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next?.door, goFarm, startPlacing, raid]);

  /**
   * THE FIRST TRIP IS NOT A CHOICE. A player who has never been on an island
   * starts on one — no GO FARM to find, no column of cards about a garden
   * they have not earned, and no burrow shown first, not even for the length
   * of a wipe. The first island is the tutorial (see FIRST_RUN in tuning),
   * and the burrow is what the recap sends them home to: seen AFTER the run,
   * when its carrot counter finally has something in it.
   *
   * Decided at the sign-in curtain's CUT, which is when the canvas mounts:
   * `firstTimer` is read there, the boot is told to open on the island
   * (`openOn`), the chrome flips to the island's in the same instant, and a
   * seat is asked for — the same three moves `goTo('island')` makes, minus
   * the iris, because the curtain IS the iris this time.
   *
   * `runs` comes from the server, so a player who played their first run on
   * another device is not sent again. If the bar has not been read by the
   * cut (a slow first fetch), the effect below is the fallback: it crosses
   * from the burrow the moment everything is standing, which shows the
   * burrow for one wipe rather than never — the lesser failure.
   */
  const firstTimer = burrow?.runs === 0;
  const firstTrip = useRef(false);
  const onCurtainCut = useCallback(() => {
    setShowCanvas(true);
    if (!firstTimer || firstTrip.current || spectating) return;
    firstTrip.current = true;
    setWhere('island');
    game.join();
  }, [firstTimer, spectating, game]);

  useEffect(() => {
    if (firstTrip.current) return;
    if (!showCanvas || arriving || !ready || crossing || spectating) return;
    if (where !== 'burrow' || !firstTimer) return;
    firstTrip.current = true;
    goFarm();
  }, [showCanvas, arriving, ready, crossing, spectating, where, firstTimer, goFarm]);

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
    // The ARMING state is part of the key, so a trap coming back up is a
    // change this effect notices. Keyed on the tile list alone it was not: the
    // set of mined tiles does not move when one of them rearms, and the board
    // would have gone on showing a greyed bomb until the next placement.
    const armed = new Set(shop.traps?.armed ?? tiles);
    // The REMAINING time rides in the key too, bucketed to the minute: the
    // scene ramps the opacity itself between polls, so a key that changed on
    // every millisecond would repaint constantly and one that ignored the
    // clock would never hand the scene a correction at all.
    const rearm = new Map(
      (shop.traps?.rearming ?? []).map((r) => [r.tile, new Date(r.readyAt).getTime()] as const),
    );
    const key = tiles
      .map((t) => {
        const at = rearm.get(t);
        if (at === undefined) return `${t}`;
        return `${t}~${Math.round((at - Date.now()) / 60_000)}`;
      })
      .join(',');
    if (drawnTraps.current === key) return;
    const had = drawnTraps.current
      ? drawnTraps.current.split(',').map((k) => Number(k.split('~')[0]))
      : [];
    drawnTraps.current = key;
    const now = new Set(tiles);
    // Gone from the server's list — lifted here. NOT a sprung trap any more:
    // that one keeps its tile and comes back on the arming clock, so it stays
    // on the board and is repainted below.
    for (const tile of had) if (!now.has(tile)) handles.current?.burrow?.removeTrap(tile);
    for (const tile of tiles) {
      handles.current?.burrow?.addTrap(tile, false, armed.has(tile));
      // Then hand over the server's clock. The scene ramps the opacity from
      // it, so a trap halfway back is DRAWN halfway back — which is the whole
      // readable form of "rearming": the bomb recharges in front of you.
      const at = rearm.get(tile);
      handles.current?.burrow?.setTrapRearm(
        tile,
        at === undefined
          ? null
          : { msLeft: Math.max(0, at - Date.now()), totalMs: REARM_TOTAL_MS },
      );
    }
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
      // The drawn-traps cache describes a BOARD, and `setRaid` replaces it.
      //
      // Entering a raid swaps in the defender's ground and leaving grows the
      // player's own back, and either way the scene's trap sprites went down
      // with the terrain they hung in. The cache below is a ref, so it
      // survives that teardown and would go on claiming the bombs it last drew
      // are still on screen — the sync effect then sees an unchanged key and
      // pushes nothing, leaving the board bare while the panel counts the
      // server's traps correctly. Emptied here rather than in the effect
      // because this is the call that invalidates it: the next run compares
      // against "nothing drawn" and re-adds every tile.
      drawnTraps.current = '';
      if (!raid.raid) return burrow.setRaid(null);
      const r = raid.raid;
      return burrow.setRaid({
        view: raid.raid.view,
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
        // Each raid step is heard, as a hop is on the island: the raid was
        // the one walk in the game with no sound under it.
        onStep: (tile) => { playUiSfx('step'); void stepRef.current(tile); },
      }).then(() => {
        // The raid is over: the rabbit says so on the board — a dance on the
        // field, a collapse short of it — before the trip home, which the
        // effect below makes by itself.
        if (r.finished) burrow.finishRaid(r.succeeded);
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

  /**
   * A finished raid goes home BY ITSELF.
   *
   * It used to end on a card with a "Back to the burrow" button, which made the
   * best moment of the raid — reaching the carrots — a form to dismiss. Now the
   * rabbit dances on the field (or collapses short of it) for `RAID_OVER_MS`,
   * and the player is carried home under the iris with the haul announced
   * there, on their own ground, where the carrot count it changed is.
   *
   * Keyed on the raid's ID rather than the payload, so the timer is set once
   * per finished raid and survives the polls that re-render the page.
   */
  const finishedRaidId = raid.raid?.finished ? raid.raid.raidId : null;
  const leaveRef = useRef(raid.leave);
  leaveRef.current = raid.leave;
  const finishedRaid = useRef(raid.raid);
  finishedRaid.current = raid.raid;
  /** How far the raid got — lands in the same answer as `finished`. */
  const finishedOutcome = useRef(raid.outcome);
  finishedOutcome.current = raid.outcome;

  /**
   * THE WIN GETS A CEREMONY; a loss keeps the quiet exit.
   *
   * Reaching the red tile is the whole raid, and it used to resolve the way a
   * form submits: a two-second dance, a line in the corner, and the player was
   * carried home. `RaidVictory` is the arcade's answer to that — the same
   * full-screen stage the hub's shop and the casino's chest raise, wearing the
   * island's blues.
   *
   * Held as its OWN state rather than read off `raid.raid`, for two reasons:
   *
   *   • `leave()` clears the raid, so a ceremony driven by `raid.raid.succeeded`
   *     would unmount itself the moment it took the player home — it has to
   *     outlive the thing that raised it.
   *   • It carries a SNAPSHOT of the haul. The screen behind is going back to
   *     the burrow while the stage is still up, and the numbers on it must not
   *     change under the player mid-celebration.
   *
   * `succeeded` off the raid row, not `outcome.reachedField`: the outcome only
   * rides the response that ended the raid, so it is gone by the next read,
   * while the row survives. The HUD used to key its headline off the outcome
   * and therefore answered "Out of energy" to a raid the player had just won;
   * it now reads `succeeded` too.
   */
  const [victory, setVictory] = useState<
    { raidId: string; defender: string; carrots: number; trapsSprung: number } | null
  >(null);

  useEffect(() => {
    if (!finishedRaidId) return;
    const r = finishedRaid.current;
    const won = r?.succeeded ?? false;
    // A loss says HOW FAR: a raid is scored by depth, and "nothing taken"
    // alone reads as nothing happened. The sting plays for the collapse.
    const haul = r
      ? r.carrotsLooted > 0
        ? `+${r.carrotsLooted.toLocaleString()} 🥕 stolen from ${r.defender.name}`
        : `Fell ${Math.round((finishedOutcome.current?.progress ?? 0) * 100)}% of the way to ${r.defender.name}'s field`
      : null;
    if (r && !won) playUiSfx('die');

    /**
     * The haul is in the database — go and read the total.
     *
     * The same missing half as banking a run: the burrow's counter is fetched,
     * not pushed, and a finished raid never re-fetched it. The carrots were
     * genuinely credited (the server adds the loot to the attacker's stock when
     * it settles) and the counter still showed the figure from before the raid,
     * until something unrelated happened to refresh it.
     *
     * It went unnoticed because the old ending announced the haul in a toast,
     * so a player was told what they had won even while the number behind the
     * toast disagreed. The ceremony replaces that toast, which would have left
     * the win with nothing but a stale counter.
     */
    refreshBurrowRef.current();

    // A WIN: the board plays its dance, then the stage comes up over it. The
    // trip home waits for the player to dismiss that — going home by itself
    // under a ceremony they are still reading is the interruption the stage
    // exists to avoid.
    if (won && r) {
      const ceremony = setTimeout(() => {
        setVictory({
          raidId: r.raidId,
          defender: r.defender.name,
          carrots: r.carrotsLooted,
          trapsSprung: r.trapsSprung,
        });
      }, RAID_OVER_MS);
      return () => clearTimeout(ceremony);
    }

    // A LOSS keeps what it had: the collapse on the field, then home by itself
    // with the news in a toast. There is nothing here to celebrate and a
    // full-screen stage saying so would be a punishment screen.
    const home = setTimeout(() => {
      leaveRef.current();
      if (haul) setNote(haul);
    }, RAID_OVER_MS);
    // The toast clears itself — but only ITSELF, so a harvest message that
    // replaced it in the meantime is left alone.
    const clear = setTimeout(() => {
      setNote((n) => (n === haul ? null : n));
    }, RAID_OVER_MS + RAID_TOAST_MS);
    return () => { clearTimeout(home); clearTimeout(clear); };
  }, [finishedRaidId]);

  // A sprung trap is played ONCE, on the event, rather than inferred from the
  // board redrawing — springing one is the moment a raid turns, and a tile that
  // merely redrew darker would not register.
  useEffect(() => {
    if (raid.sprung) handles.current?.burrow?.springTrap(raid.sprung.tile);
  }, [raid.sprung]);

  // A refused placement buzzes like every other refusal on this screen. Only
  // placing sets a note from the floor (`placeTrap` / `removeTrap`); purchase
  // receipts are set in the drawer, where `placing` is false.
  useEffect(() => {
    if (placing && shop.note) playUiSfx('deny');
  }, [placing, shop.note]);
  // The raid's refusals ("too far", a shielded door) are notes in its own
  // panels; the buzz is what makes them read as a no rather than as a tip.
  useEffect(() => {
    if (raid.note) playUiSfx('deny');
  }, [raid.note]);

  /**
   * THE BURROW'S CLOCKS KEEP RUNNING while it is on screen.
   *
   * The burrow was read after an action and never again, so a player looking
   * at it watched nothing happen: "run in 23m" stayed 23m, the garden never
   * filled, and a run's worth of energy arriving went unannounced. The DIG
   * line now counts down on its own (LoopBar `nextRunAt`) and fetches the
   * burrow the moment it lands; the rest is re-read once a minute, only while
   * the tab is actually visible.
   */
  useEffect(() => {
    if (!ready || where !== 'burrow' || crossing) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') refreshBurrow();
    }, 60_000);
    return () => clearInterval(id);
  }, [ready, where, crossing, refreshBurrow]);

  /**
   * RAIDED WHILE AWAY — said once, on the first look at the burrow.
   *
   * Being robbed overnight arrived as a smaller number and a badge on the
   * name chip: the story (who, how much) was two taps deep in the history.
   * The stamp tells it over the screen the first time the burrow is seen with
   * unread raids against it. Nothing is marked read here — the history tab
   * still owns that, so the badge stays until the player looks.
   */
  const [raided, setRaided] = useState<RaidedNews | null>(null);
  const raidedChecked = useRef(false);
  useEffect(() => { raidedChecked.current = false; }, [token]);
  useEffect(() => {
    if (!token || !ready || where !== 'burrow' || crossing || raidedChecked.current) return;
    raidedChecked.current = true;
    fetch('/api/player/history', auth())
      .then((r) => (r.ok ? r.json() : null))
      .then((h) => {
        const news = raidedNews(h?.raids);
        if (!news) return;
        setRaided(news);
        playUiSfx(news.carrots > 0 ? 'explosion' : 'chime');
      })
      .catch(() => {});
    // `auth` is rebuilt from the token, which is already a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, ready, where, crossing]);

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
    if (harvestKey > 0) handles.current?.burrow?.harvestGarden();
  }, [harvestKey]);

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
          // Read once at mount, which is the curtain's cut — the same
          // instant `onCurtainCut` flips `where`. The two agree by
          // construction: both read `firstTimer` on the same render.
          openOn={firstTimer ? SCENE.island : SCENE.burrow}
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
        onCut={onCurtainCut}
        onDone={() => setArriving(false)}
      />

      {/* Sound belongs to the app, not to a screen: it rides above both. */}
      <SoundButton />

      {/* THE TOP BAR, in the mock's three zones: the player at the left edge,
          the carrot pill centred over the board, and the season and sound
          controls at the right. The pill is `position: fixed` and places
          itself (see `.rr-carrot-pill`); the flow here is the two ends. */}
      <div className="rr-topbar">
        {/* Only with the rest of the screen's chrome. Signed out this chip says
            "Connect wallet" — the doorstep's own primary action — and the
            crawl's masthead fade (`.rr-crawl-mast`, z 2) paints over it while
            staying `pointer-events: none`, so it was an invisible, live copy of
            that button in the corner, and a second "Connect wallet" for a
            screen reader. */}
        {showCanvas && <WalletButton />}
        {/* The pill carries the rank line, so a player can see what it would
            take to climb without opening the season board. `me` is reported by
            that board's own poll — see LeaderboardDrawer.onMe. */}
        {showCanvas && (
          <CarrotPill
            stock={burrow?.stock ?? 0}
            fireKey={burstKey}
            gain={burstAmount}
            rank={me?.rank ?? null}
            toPass={me?.toPass ?? null}
            onAdd={() => setShopOpen(true)}
            denyKey={pillDenyKey}
            // The run's haul, on the island only and only your own: a
            // spectator's pill is still their own stock.
            carrying={where === 'island' && !spectating && !crossing ? game.me?.carrots ?? null : null}
          />
        )}
        {/* The right-hand end: the SHOP and the STORY, as icons beside the
            season board's trophy. Neither is a loop — a store and a codex — so
            neither belongs on the floor with DIG, HOME and RAID; up here they
            are reachable without being mistaken for a step of the game.
            THE TROPHY IS NOT IN THIS ROW: it pins itself to the corner
            (`.rr-lb-launch`, fixed at `--rr-edge`) so its own drawer can hide
            it. So the row reserves its square plus one gap on the right, and
            the three read as one evenly spaced group. The reserve used to be a
            flat 56 for a button that grew to 68, and the trophy sat 2px on top
            of the story. Derived now, so it cannot drift again. */}
        {showCanvas && where === 'burrow' && !placing ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--rr-pad-tight)',
            paddingRight: 'calc(var(--rr-icon) + var(--rr-pad-tight))',
          }}>
            <HubIconButton
              label="Shop"
              count={shop.shop?.traps.held ?? 0}
              onClick={() => setShopOpen(true)}
            >
              🛒
            </HubIconButton>
            <span key={lorePulseKey} className={lorePulseKey > 0 ? 'rr-tab-pop' : undefined} style={{ display: 'inline-flex' }}>
              <HubIconButton
                label="Story"
                badge={freshChapter ? 'NEW' : null}
                tone="news"
                onClick={() => setLoreOpen(true)}
              >
                📜
              </HubIconButton>
            </span>
          </div>
        ) : (
          <span aria-hidden style={{ width: 1 }} />
        )}
      </div>
      {/* Tells the island's overlay where this bar and the pill end. */}
      {showCanvas && <TopbarReserve />}

      {/* The board is furniture at the burrow and a distraction on the island:
          a run needs the whole frame, and a third of the screen given to a
          leaderboard is a third the player cannot dig in. It collapses to its
          tab while playing. */}
      {player && showCanvas && where === 'burrow' && !crossing && (
        <LeaderboardDrawer
          token={token}
          playerId={player.id}
          onSpectate={spectate}
          onMe={setMe}
          onOpen={() => markQuest(QUEST_MARK.LEADERBOARD)}
        />
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
              {/* The doorstep's two buttons in the codex's pixel bevel, in the
                  colours they had: the carrot one to press, the quiet one under
                  it. The front door wiggles when it is pressed. */}
              <PxButton
                className="rr-btn rr-play"
                onClick={login}
                disabled={busy}
                color="#ff8c42"
                shadowColor="#a8521c"
                textColor="#2a1206"
                wiggle
                style={{ height: 52 }}
              >
                <span style={{ ...pxLabel, fontSize: 18 }}>Connect wallet</span>
              </PxButton>
              <PxButton
                className="rr-btn ghost"
                onClick={playAsGuest}
                disabled={busy}
                color="#161b22"
                shadowColor="#0b0f14"
                textColor="#b1bac4"
                style={{ height: 44 }}
              >
                <span style={{ ...pxLabel, fontSize: 14 }}>{busy ? 'Digging in...' : 'Play as a guest'}</span>
              </PxButton>
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
              {/* NO SHIELD CARD. The badge over the homestead already says it.
                  
                  The card and the sign carried the same countdown, one in the
                  panel and one on the board, and the board's is the one the
                  player is looking at — it stands on the roof of the thing
                  being protected, which is the whole fact. A panel row
                  repeating it spent the column's scarcest space saying nothing
                  new. See `BurrowTerrain`'s `setShield` for the sign. */}

              {/* NO ENERGY CARD. The bar lives on the DIG slab of the loop
                  bar (see loop-bar.tsx): the number is read at the moment of
                  deciding to dig, and that moment is the slab, not a card
                  above the garden. The empty case still opens the popup. */}

              {/* THE NEXT THING TO DO, first. While the quest arc runs it is
                  the quest card (quest-card.tsx); once every reward is taken
                  it is the next-action line (config/next-action.ts) — the
                  strip never goes away, because a burrow with nothing
                  pointing anywhere is a column of readings. */}
              <div className="rr-toon-in" style={{ marginBottom: 10, ['--rr-toon-delay' as string]: '0ms' }}>
                {quest?.active ? (
                  <QuestCard
                    quest={quest.active}
                    pending={pending}
                    celebrateKey={questDoneKey}
                    claimKey={questClaimKey}
                    onClaim={() => void claimQuest(quest.active!.id)}
                  />
                ) : next && (
                  <NextStrip action={next} onClick={onNextAction} />
                )}
              </div>

              {/* The garden, in the mock's slab — see garden-card.tsx. HARVEST
                  is a full-width carrot button rather than a nine-slice the
                  colour of the panel behind it, which is what made the card's
                  only action its least visible element. */}
              <div className="rr-toon-in" style={{ marginBottom: 10, ['--rr-toon-delay' as string]: '70ms' }}>
                <GardenCard
                  ready={burrow?.gardenReady ?? 0}
                  yieldPerHour={burrow?.yieldPerHour ?? 0}
                  /* The LIVE ceiling, not the base one: the line reads "holds
                     N (Xh)" and both halves have to describe the same garden.
                     `gardenCapacity` is what the FIELD is drawn against and
                     deliberately ignores fertiliser — see `BurrowView`. */
                  capacity={burrow?.gardenCeiling ?? 0}
                  capHours={burrow?.capHours ?? 0}
                  pending={pending}
                  onHarvest={() => act('harvest')}
                />
              </div>

              {/* The burrow itself — its house, its rate, and what a raid
                  cannot take. This was "DIG DEEPER", which named an action the
                  game does not have over a picture of nothing; see
                  burrow-card-panel.tsx. */}
              <div className="rr-toon-in" style={{ ['--rr-toon-delay' as string]: '140ms' }}>
                <BurrowPanel
                  level={burrow?.level ?? 1}
                  stock={burrow?.stock ?? 0}
                  yieldPerHour={burrow?.yieldPerHour ?? 0}
                  upgradeCost={burrow?.upgradeCost ?? null}
                  canUpgrade={!!burrow?.canUpgrade}
                  pending={pending}
                  onUpgrade={() => act('upgrade')}
                />
              </div>

              </>
              )}

              {/* Placing takes over the screen, so the way into the shop
                  steps aside for the way out of placement.
                  
                  The way OUT is no longer here: "Done placing" was an
                  `rr-btn` stranded in a column that is dimmed and pushed aside
                  during placement, which put the exit in the least prominent
                  place on the screen. It is a floor slab at the centre now,
                  standing exactly where GO FARM does the rest of the time —
                  see the `FarmButton` at the bottom of this file. */}
              {/* Clear the board in one press.
                  
                  Rearranging a defence means lifting several bombs, and
                  tapping them off one diamond at a time on a 19x19 grid is
                  the chore that stands between a player and changing their
                  mind. The traps come back to the bag, exactly as lifting one
                  does, so this costs nothing but the gesture.
                  
                  Only offered when there is something to clear — a button
                  that does nothing is worse than no button. */}
              {placing && (shop.traps?.placed.length ?? 0) > 0 && (
                <PxButton
                  className="rr-btn ghost"
                  onClick={clearTraps}
                  color="#161b22"
                  shadowColor="#0b0f14"
                  textColor="#b1bac4"
                  style={{ height: 44 }}
                >
                  <span style={{ ...pxLabel, fontSize: 13 }}>Clear all mines</span>
                </PxButton>
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
              {/* The placing instruction, its refusals and the toast moved out
                  of the column to `.rr-toasts` under the pill — see `note`. */}

              {/* THE STATE OF THE DEFENCE, last line on the column.
                  
                  At the BOTTOM and always on — not only while placing. A
                  defender's first question on opening their burrow is whether
                  it is still guarded, and answering it only once they had
                  already decided to rearrange their bombs was answering it too
                  late. It sits under everything else because it is a status
                  line, not a control: nothing here is tapped.
                  
                  It reports what is STANDING, not what is buried — those
                  differ while traps rearm, and a board claiming 8/8 with five
                  of them down would be a lie told in the player's favour.
                  
                  The rearming half names its own cost, which is none: a player
                  who does not know the bombs come back free will go and buy
                  replacements for traps they never lost. */}
              {shop.traps && shop.traps.placed.length > 0 && (
                <PxPanel
                  color="rgba(13, 17, 23, 0.86)"
                  className={`rr-note${shop.traps.armed.length === 0 ? ' danger' : ''}`}
                  style={PX_GLASS}
                >
                  {shop.traps.armed.length} bomb{shop.traps.armed.length === 1 ? '' : 's'} live
                  {shop.traps.rearming.length > 0 && (
                    <>
                      {' '}&middot; {shop.traps.rearming.length} rearming
                      {nextRearmLabel && <> (next in {nextRearmLabel})</>}
                      {' '}&middot; costs you nothing
                    </>
                  )}
                </PxPanel>
              )}
            </>
          )}
        </section>
      ) : null}

      {/* THE FOUR DOORS, on the floor — outside the column on purpose.
          
          `.rr-burrow` carries `z-index: 1`, which makes it a stacking context:
          a row nested inside it can never rise above GO FARM, a sibling at the
          same z. On a short window GO's 400x100 box overlaps this corner and
          swallowed three of the four tiles. As a sibling the row's own z-index
          is measured against GO's and wins.
          
          Same conditions as the column above: not while placing, not during a
          raid or a crossing, and only once there is a board to stand on. */}
      {/* THE RAID KIT — ONLY WHILE YOU ARE WORKING ON THE BASE.
          
          It sat on the resting burrow first, on the reasoning that owning a
          bomb is a fact about you and a fact should be visible. That put six
          squares of raid gear on the screen whose job is the garden and the
          house, where not one of them could be used: the bombs and the mirage
          are thrown on somebody else's island, and the traps are buried in the
          mode this row now belongs to.
          
          So it appears with PLACING, which is the moment the kit is the thing
          being handled — the board is open, the traps are going into the
          ground, and what is in the bag is exactly what the screen is about.
          The rest of the time the burrow stays a place rather than a loadout.
          The garden's bottles are the exception and keep their corner: they
          are poured ON the burrow, so they belong to it. */}
      {!crossing && !shownRaid && where === 'burrow' && showCanvas && placing && burrow && (
        <KitRow
          held={shop.shop ? Object.fromEntries(
            shop.shop.items.map((i) => [i.kind, i.held]),
          ) : {}}
          shieldMs={burrow.shieldMs}
          /* Smoke is reported as days by `holdings`, and the shop's shelf is
             where that number already crosses the wire. */
          smokeDays={shop.shop?.items.find((i) => i.kind === 'smoke')?.held ?? 0}
          trapsPlaced={shop.shop?.traps.placed}
          trapsMaxPlaced={shop.shop?.traps.maxPlaced}
          onShield={() => act('shield')}
          water={burrow.boosts.water}
          fertiliser={burrow.boosts.fertiliser}
          onPour={(kind) => act(kind === 'water' ? 'water' : 'fertilise')}
          pending={pending}
        />
      )}

      {/* THE LOOP BAR — DIG ▸ HOME ▸ RAID — on the floor. See loop-bar.tsx.
          Slid away while placing rather than unmounted, on the same curve the
          camera pulls back on; the BACK slab takes the floor then. */}
      {showCanvas && where === 'burrow' && !shownRaid && !crossing && (
        burrow && <LoopBar
          dig={{
            energy: burrow.energy,
            maxEnergy: burrow.maxEnergy,
            runCost: burrow.runCost,
            nextRunInMs: burrow.nextRunInMs,
          }}
          home={{
            gardenReady: burrow.gardenReady,
            shieldMs: burrow.shieldMs,
            trapsLive: shop.traps?.armed.length ?? 0,
            trapsPlaced: shop.traps?.placed.length ?? 0,
          }}
          raid={{
            open: openTargets.length,
            best: bestTarget,
            bombs: shop.shop?.items.find((i) => i.kind === 'bomb')?.held ?? 0,
          }}
          questDoor={quest?.active?.door ?? next?.door ?? null}
          questPulseKey={questPulseKey}
          broughtHome={broughtHome}
          nextRunAt={nextRunAt}
          onRunReady={refreshBurrow}
          away={placing}
          onDig={goFarm}
          onHome={startPlacing}
          onRaid={() => { setPickingTarget(true); void raid.refresh(); }}
        />
      )}

      {raided && where === 'burrow' && !crossing && (
        <RaidedStamp news={raided} onDone={() => setRaided(null)} />
      )}

      {/* The socket fell over. Said, rather than leaving every tap to vanish. */}
      {showCanvas && game.dropped && !spectating && (
        <PxPanel color="rgba(13, 17, 23, 0.9)" className="rr-reconnecting" style={{ ...PX_GLASS, position: 'fixed' }}>
          <span role="status">Reconnecting...</span>
        </PxPanel>
      )}

      {/* THE BURROW'S TOASTS, under the carrot pill — see `note`. The placing
          instruction leads while placing (it is the only thing on screen that
          says what a tap will do, and how to take one back); a refused
          placement and the latest toast follow it. */}
      {showCanvas && where === 'burrow' && !shownRaid && !crossing && (note || (placing && shop.shop)) && (
        <div className="rr-toasts" aria-live="polite">
          {placing && shop.shop && (
            <PxPanel color="rgba(13, 17, 23, 0.86)" className="rr-toast rr-toast-hint" style={PX_GLASS}>
              {shop.shop.traps.held > 0
                ? <>Tap a tile to mine it, tap a mine to lift it &middot; {shop.shop.traps.held} left</>
                : <>No traps left &middot; tap a mine to lift it and bury it elsewhere</>}
            </PxPanel>
          )}
          {/* Outside the drawer, only a REFUSAL is worth showing: a receipt
              for a purchase the player just watched happen in the panel is
              noise on the burrow screen. */}
          {placing && shop.note && (
            <PxPanel key={shop.note} color="rgba(40, 14, 14, 0.9)" className="rr-toast refused" style={PX_GLASS}>
              {shop.note}
            </PxPanel>
          )}
          {note && (
            <PxPanel
              key={noteKey}
              color={noteRefused ? 'rgba(40, 14, 14, 0.9)' : 'rgba(13, 17, 23, 0.86)'}
              className={`rr-toast${noteRefused ? ' refused' : ''}`}
              style={PX_GLASS}
            >
              {note}
            </PxPanel>
          )}
        </div>
      )}

      {/* On the island the chrome is a thin HUD over the board, so it uses the
          overlay layer rather than the burrow's column. The condition mirrors
          the burrow branch above: the two are still the same either/or, split
          into siblings only so the launcher row can sit between them. */}
      {!crossing && !shownRaid && where !== 'burrow' && showCanvas && (
        <div className="rr-overlay">
          <RunHud game={game} name={player?.name ?? ''} spectating={spectating} solo={game.firstRun} />
          {/* The first run's one-line captions. Renders nothing on any island
              but the first, and never for a spectator — the tally it reads is
              the mover's own. */}
          {/* What the crossing just cost the burrow, said once. Above the
              first-run captions, so on the tutorial island the order reads
              "this is what it cost" then "this is what to do". */}
          {/* Not on the first island: a player who has never seen the burrow
              cannot read "35/60 left at the burrow", and the tutorial's own
              captions need the strip. The first recap states the bank. */}
          {!spectating && !game.firstRun && <RunCostNote bank={game.bank} seed={game.islandSeed} />}
          {!spectating && (
            <FirstRunCaption firstRun={game.firstRun} digs={game.digs} warnStage={game.warnStage} />
          )}
          {/* A quest finishing while the player is out here — the card is at
              home, so the island says it. */}
          {questNote && !spectating && (
            <PxPanel color="rgba(13, 17, 23, 0.86)" className="rr-caption rr-caption-quest" style={PX_GLASS}>
              <span role="status" aria-live="polite">{questNote}</span>
            </PxPanel>
          )}
          {/* The sky during the eruption; the scene sinks the island under it. */}
          {game.erupting !== null && <EruptionOverlay ms={game.erupting} />}
          {/* The way back to your own rabbit once a drag has lost it. The camera
              follows a STEP, and a rabbit panned off a phone screen has no tile
              in reach to step onto. Only while it is actually out of frame.
              Under the HUD rather than above BACK HOME: on a 360px phone the
              bottom band is shared with the lifted sound control, and the two
              overlapped. */}
          {rabbitAway && !spectating && (
            <PxButton
              type="button"
              className="rr-btn rr-recentre"
              onClick={() => handles.current?.island?.recentre()}
              color="#161b22"
              shadowColor="#0b0f14"
              textColor="#e6edf3"
              style={{ height: 40, width: 'auto' }}
            >
              <span style={{ ...pxLabel, fontSize: 12 }}>Find my rabbit</span>
            </PxButton>
          )}
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
              first={game.firstRun}
              // The burrow's bar as last read — refreshed at the crossing, so
              // it already carries this run's charge. What the next decision
              // (again, or home) is actually made against.
              bank={burrow ? { energy: burrow.energy, max: burrow.maxEnergy, cost: burrow.runCost } : null}
              onShop={goShopping}
              onHome={stopSpectating}
            />
          )}
          {/* A chest the local rabbit dug. Never for a spectator: `move_result`
              is private to the mover, so a viewer has no prize of their own and
              a take-over would interrupt them for somebody else's. */}
          {game.chestPrize && !spectating && (
            <ChestPrize prize={game.chestPrize} onDone={game.clearChestPrize} />
          )}
          {/* Leaving ALWAYS goes through `stopSpectating`, even when playing
              (where it is just `goTo`): a second exit path that forgot to clear
              the target would strand the session as a viewer with no way back
              into its own game. */}
          {/* THE SAME WAY BACK AS EVERY OTHER SCREEN, bottom-left.

              It was the big animated HOME arrow, centred on the floor, on the
              grounds that banking the haul is the run's main action. On a phone
              that reasoning cost more than it bought: the arrow's 400px box and
              its bouncing sprite sat in the middle of the bottom band, which is
              exactly where the island's near tiles are and where the thumb digs.
              Taps meant for a tile landed on HOME, and the bob kept pulling the
              eye off the board. Placement already solved this — its exit is the
              small soil slab in the corner — so the island uses it too, and the
              floor belongs to the board again. */}
          <BackButton
            label={spectating ? 'Stop watching' : 'Home'}
            onClick={stopSpectating}
          />
        </div>
      )}

      {/* NO GO FARM SLAB: DIG on the loop bar is that control now, with the
          bank and the run's cost written on it. It is never disabled and
          never hidden — an empty tank opens the popup that says so. */}

      {/* THE WAY OUT OF PLACEMENT, on the floor the loop bar vacates.
          
          The shared way back (`BackButton`), bottom-left like on every other
          screen that has one. The centre of the floor belongs to the kit while
          placing — the one set of controls this mode has.
          
          NOT given `away`, because it is unmounted rather than slid: the exit
          and the mode end together, and a button easing out after the board
          has already closed is a control outliving its screen. */}
      {!crossing && !shownRaid && where === 'burrow' && showCanvas && placing && (
        <BackButton label="Back" onClick={stopPlacing} />
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
          runCost={burrow?.runCost}
          nextRunInMs={burrow?.nextRunInMs ?? null}
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
          //
          // And `shop.usdcEnabled` alongside `payments`, because the two
          // answer different questions and only the second one is binding.
          // /api/config's `payments` is `Boolean(SOLANA_RPC_URL)` — whether the
          // BROWSER can build a transfer — while /api/shop's `usdcEnabled` is
          // whether a TREASURY is configured to receive one. A deployment with
          // an RPC and no treasury (which is every dev machine, and was this
          // one) satisfied the first and failed the second, so this popup put a
          // price in money on screen and the quote behind it could not be
          // issued. The Shed's own tiles already check the treasury and were
          // correct throughout; this door was the one taking the guess.
          onPayUsdc={
            payments && shop.shop?.usdcEnabled && !player.guest
              ? () => void payEnergyUsdc()
              : undefined
          }
          onOpenShop={() => { setEnergyOpen(false); shop.setNote(null); setShopOpen(true); }}
          onClose={() => { setEnergyOpen(false); shop.setNote(null); usdc.setError(null); }}
        />
      )}

      {/* The board is the Pixi scene behind this, so the HUD is deliberately
          thin — a raid is walked on the ground, not in a list. */}
      {player && shownRaid && (
        <RaidHud
          raid={shownRaid}
          busy={raid.busy}
          note={raid.note}
          onLeave={raid.leave}
        />
      )}
      {/* The way out mid-raid — the shared back button. See RaidHud. */}
      {player && shownRaid && !shownRaid.finished && (
        <BackButton label="Retreat" onClick={raid.leave} disabled={raid.busy} />
      )}

      {/* The raid's ceremony, over everything — including the board it was won
          on, which is still up behind it. Dismissing is what takes the player
          home, so the trip and the celebration cannot land on top of each
          other. */}
      {victory && (
        <RaidVictory
          key={victory.raidId}
          defender={victory.defender}
          carrots={victory.carrots}
          avatar={avatar}
          trapsSprung={victory.trapsSprung}
          onDone={() => {
            setVictory(null);
            leaveRef.current();
            // No toast on the way home: the stage just spent a full screen
            // saying what was taken, and repeating it in the corner would read
            // as a second, smaller announcement of the same thing.
          }}
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
          // `usdcEnabled` as well as `payments` — see the EnergyPopup above for
          // why the two are not the same question. Belt on top of the Row's own
          // check, so the panel and the popup are gated identically rather than
          // one of them relying on a deeper component to catch it.
          onPayUsdc={
            payments && shop.shop?.usdcEnabled && !player.guest ? buyWithUsdc : undefined
          }
          payToken={payToken}
          onPayTokenChange={setPayToken}
          payStage={usdc.stage}
          note={shop.note}
          error={usdc.error}
          onClose={() => { setShopOpen(false); shop.setNote(null); usdc.setError(null); }}
        />
      )}

      {/* The level-up stamp, over everything, once per upgrade. */}
      {levelUp && (
        <LevelUpStamp key={levelUp.key} level={levelUp.level} onDone={() => setLevelUp(null)} />
      )}

      {/* A quest's item reward flying into the bag. Same flight as a buried
          chest's drop, so a shield from a quest and a shield from the ground
          are one object arriving the same way. */}
      {flyItem && (
        <LootFly
          key={flyItem.key}
          src={QUEST_ITEM_ART[flyItem.kind].src}
          aspect={QUEST_ITEM_ART[flyItem.kind].aspect}
          label={flyItem.kind.toUpperCase()}
          amount={flyItem.qty}
          fireKey={flyItem.key}
          onDone={() => setFlyItem(null)}
        />
      )}

      {player && loreOpen && (
        <LoreCodex
          lifetime={burrow?.lifetime ?? 0}
          onClose={() => setLoreOpen(false)}
          onRead={(id) => markQuest(codexMark(id))}
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

/** The art a quest's item reward flies in as — the same icons the chest uses. */
const QUEST_ITEM_ART = {
  bomb: { src: '/assets/ui/icons/bolt.webp', aspect: 29 / 24 },
  shield: { src: '/assets/ui/icons/shield.webp', aspect: 1 },
} as const;

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
