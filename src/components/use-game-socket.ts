'use client';

/**
 * The socket client.
 *
 * Two consumers, deliberately split:
 *  - the SCENE gets tile reveals and rabbit movement, pushed straight in. Those
 *    fire many times a second and each one starts an animation; routing them
 *    through React state would re-render the page per dug tile and fight the
 *    engine's own tweens.
 *  - REACT state holds only what the HUD shows (energy, carrots, the recap),
 *    which changes rarely and belongs in the render tree.
 *
 * Nothing here is a second source of truth. Every tile this hook knows about
 * arrived in a `tile_revealed`; it never guesses what is under an unrevealed
 * one, because it genuinely does not know.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { TileContent } from '@/lib/game/types';
import type { IslandScene } from '@/game/scenes/IslandScene';
import { toIndex } from '@/config/gridConfig';
import { FLAG } from '@config/tuning';

export interface ClientRabbit {
  playerId: string;
  name: string;
  tile: number;
  energy: number;
  carrots: number;
  alive: boolean;
  crowned: boolean;
}

/** What the server sends when you land on an island. */
export interface IslandSnapshot {
  seed: string;
  warnStage: number;
  rabbits: ClientRabbit[];
  revealed: Array<{ tile: number; content: TileContent; adjacent: number }>;
  /**
   * Where the flock stands, by placement id.
   *
   * Sent because it is no longer derivable: sheep bolt when a rabbit gets
   * close, so the seed only says where they STARTED. A player joining a run in
   * progress needs the current picture — a sheep blocks its cell, so a stale
   * flock is a stale set of legal moves.
   */
  sheep?: Array<{ id: string; x: number; y: number }>;
  /**
   * The chests still buried, and how big each one is.
   *
   * The one kind of tile the server describes BEFORE it is dug (see
   * `publicView`): a chest is meant to be seen from across the island and
   * walked towards, so its position and tier are public while its contents are
   * not. Optional so a client stays compatible with a server that predates it.
   */
  chests?: Array<{ tile: number; tier: string }>;
  /**
   * Numbers the cascade has opened on UNDUG tiles — see `cascadeHints`.
   * Tile and count only; what the tile holds is still the server's secret.
   */
  hinted?: Array<{ tile: number; adjacent: number }>;
  /** Bombs under a red X — marked by a player and confirmed by the server. */
  flagged?: number[];
  /**
   * The tutorial island — a player's very first run, on ground dealt by hand
   * (see FIRST_RUN in tuning). The captions over the board run off this and
   * nothing else. Optional so an older server simply means "not the first".
   */
  first?: boolean;
  /**
   * What this crossing took out of the burrow's bar, and what is left there.
   *
   * Present only when a run was just PAID for — absent on a reconnect, which
   * is the same run continuing. The island says it once on arrival (see
   * `RunCostNote`), because the charge is the one change to the burrow that
   * happens while the player is looking somewhere else.
   */
  bank?: RunBank;
}

export interface RunBank {
  /** The bar after the charge. */
  energy: number;
  /** What the run took — ENERGY.RUN_COST as the server applied it. */
  cost: number;
  max: number;
}

/**
 * What a dig paid, as the server tells the digger.
 *
 * Mirrors `DigResult` on the server, narrowed to what the client acts on.
 */
/** The private answer to a red X — mirrors `FlagResult` on the server. */
export interface FlagResultMsg {
  tile: number;
  correct: boolean;
  energyDelta: number;
  carrotDelta: number;
  streak: number;
  item?: boolean;
}

export interface MoveResult {
  dig?: {
    /** The tile that was dug. */
    tile?: number;
    /** What the tile held — the first-run captions read this. */
    content?: TileContent;
    /** What THIS rabbit was paid for it; 0 when someone else dug it first. */
    carrotDelta?: number;
    /**
     * `announced` is optional HERE and required on `ChestPrize`: a server that
     * predates the flag simply omits it, and the handler resolves that to the
     * old behaviour once rather than leaving every reader to wonder.
     */
    loot?: { kind: string; amount: number; announced?: boolean };
    /** A crown chest also gave up an RR Genesis piece. */
    nft?: boolean;
  };
  /**
   * The tutorial's chest was just opened — the run ends on a win.
   *
   * Read HERE rather than off `run_over` (which carries the same flag) because
   * the celebration belongs to the DIG: the rabbit jumps and the fanfare plays
   * the instant the box opens, while the recap is deliberately held back a
   * beat (RECAP_BEAT_MS) so the player sees it happen first.
   */
  tutorialDone?: boolean;
}

/**
 * What THIS rabbit has dug this run, by kind — the private tally.
 *
 * Counted from `move_result` (sent to the mover alone), never from
 * `tile_revealed` (sent to the island), so a stranger's bomb is not the
 * player's lesson. Reset on every island snapshot. The first-run captions are
 * the consumer: "your first dig", "your first bomb", "your first chest".
 */
export interface MyDigs {
  tiles: number;
  bombs: number;
  goldens: number;
  chests: number;
  /** Red Xs that were right — the first-run captions read it. */
  flags: number;
}

const NO_DIGS: MyDigs = { tiles: 0, bombs: 0, goldens: 0, chests: 0, flags: 0 };

/**
 * A chest's contents, waiting to be shown.
 *
 * `at` is a timestamp rather than a boolean flag so two identical drops in a
 * row are still two events — without it, opening a second bronze chest for the
 * same amount would leave the state untouched and the ceremony would not
 * replay.
 */
export interface ChestPrize {
  kind: string;
  amount: number;
  nft: boolean;
  /**
   * The chest was visible on the board before the dig.
   *
   * Drives WHICH celebration runs: a box the player could see and walked to
   * gets the full ceremony, a buried one gets the item flying up with its
   * name. See `DigResult.loot`.
   */
  announced: boolean;
  at: number;
}

/** One sheep's move, as `sheep_moved` reports it. */
export interface SheepMove {
  id: string;
  tile: number;
  /**
   * The cells it walked, in order, as tile indices — the last is `tile`.
   *
   * Optional only for the snapshot path, where a joiner is told where the
   * flock IS rather than how it got there; a live `sheep_moved` always carries
   * it, and the scene falls back to a straight hop to `tile` without it.
   */
  path?: number[];
  /** A panic sprint rather than a graze — the client plays it faster. */
  sprinting: boolean;
}

/**
 * A finished run, once its carrots are actually in Postgres.
 *
 * Not the same moment as `run_over`: that one is the RULE (the tank is empty,
 * the rabbit is out), and it is emitted alongside the write rather than after
 * it. This one is the RECEIPT, and it is the only point at which re-reading the
 * burrow is guaranteed to see the run. It also covers the exits `run_over` does
 * not — walking home with a full sack is the ordinary way to end a run, and it
 * never produced a recap at all.
 */
export interface Banked {
  carrots: number;
}

/**
 * How long the recap waits after the last heart.
 *
 * `run_over` lands in the same instant as `rabbit_died`, so the card used to
 * cover the rabbit's slump, the map draining to grey and the sting before any
 * of them had been seen. A cleared island needs no beat: the eruption already
 * held one (ERUPTION.SEQUENCE_MS).
 */
const RECAP_BEAT_MS = 900;

export interface RunRecap {
  carrots: number;
  tilesDug: number;
  bombsHit: number;
  durationMs: number;
  /** The island was dug out, and the run ended with it — not on a bomb. */
  cleared?: boolean;
  /**
   * The tutorial's chest was opened, which is what ends the first run.
   *
   * A third ending, next to "out of energy" and "the island is gone": the
   * player finished what the first island was for. The recap reads it to
   * congratulate rather than commiserate — see `run-recap`.
   */
  tutorialDone?: boolean;
}

/** Resolves the live scene, or null before Pixi has finished booting. */
type SceneGetter = () => IslandScene | null;

/** Why the server would not seat the player, as `error_msg` reports it. */
export interface JoinRefusal {
  code: 'no_energy';
  /** The burrow's bar as the server read it. */
  energy: number;
  /** What a run costs out of it. */
  need: number;
  /** Time until the bar holds a run's worth, or null if it already does. */
  nextRunInMs: number | null;
  /** Bumped per refusal, so two identical answers are still two events. */
  at: number;
}

export function useGameSocket(
  token: string | null,
  playerId: string | null,
  spectate?: string | null,
) {
  const socketRef = useRef<Socket | null>(null);
  const sceneRef = useRef<SceneGetter>(() => null);
  /** Events that arrived before the scene existed, replayed once it does. */
  const pendingRef = useRef<Array<(s: IslandScene) => void>>([]);

  const [wsUrl, setWsUrl] = useState<string | null>(null);
  /**
   * The last island snapshot, kept so it can be replayed.
   *
   * The scene may be rebuilt AFTER the snapshot arrives — a new island re-cuts
   * the coastline and clears the board — and the tiles and rabbits it carried
   * would otherwise be lost with the old board.
   */
  const snapshotRef = useRef<IslandSnapshot | null>(null);
  const [islandSeed, setIslandSeed] = useState<string | null>(null);
  const [rabbits, setRabbits] = useState<Map<string, ClientRabbit>>(new Map());
  const [warnStage, setWarnStage] = useState(0);
  const [recap, setRecap] = useState<RunRecap | null>(null);
  const [connected, setConnected] = useState(false);
  /**
   * Bumped by every island snapshot, including one for the SAME seed. The
   * crossing's shutter waits for it (page.tsx `waitForIsland`): the seed alone
   * cannot say "the server answered this join", because a rejoin can land on
   * the island it left.
   */
  const [islandKey, setIslandKey] = useState(0);
  /**
   * The socket was up and fell over (not closed by us). `connected` alone
   * cannot say it: it is also false before the first connect, and a banner
   * saying "reconnecting" during the boot would be a lie.
   */
  const [dropped, setDropped] = useState(false);
  /** The recap held back for its beat — see RECAP_BEAT_MS. */
  const recapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Bumped each time a run's carrots land in the database.
   *
   * A counter rather than the amount, because the amount is not what the
   * consumer needs: it re-reads the burrow for the authoritative total, and two
   * runs that happened to bank the same number must still be two events.
   */
  const [banked, setBanked] = useState(0);
  /**
   * The last chest worth a ceremony, or null once it has been shown.
   *
   * Held here rather than pushed at the scene because the reveal is a DOM
   * take-over (the kit's `ChestReveal`), not something Pixi draws — and because
   * the page decides when the player is free to watch it.
   */
  const [chestPrize, setChestPrize] = useState<ChestPrize | null>(null);
  /** The last time the server turned a `join` down, or null. */
  const [refused, setRefused] = useState<JoinRefusal | null>(null);
  /** Whether the island on screen is the player's first — see `IslandSnapshot.first`. */
  const [firstRun, setFirstRun] = useState(false);
  /** This rabbit's own digs on this island — see `MyDigs`. */
  const [digs, setDigs] = useState<MyDigs>(NO_DIGS);
  /** What the current run cost the burrow, or null when nothing was charged. */
  const [bank, setBank] = useState<RunBank | null>(null);
  /** Carrots the last `banked` event carried — what the burrow celebrates on arrival. */
  const [bankedCarrots, setBankedCarrots] = useState(0);
  /** The island is going down: the server's beat before the recap, in ms. */
  const [erupting, setErupting] = useState<number | null>(null);

  /**
   * Whether the player has ASKED for a seat and not given it up.
   *
   * The socket used to ask for one the moment it connected, wherever the
   * player was. That was free while a seat cost nothing; now that joining
   * PAYS for a run (ENERGY.RUN_COST), a page opened on the burrow must not
   * quietly buy an island the player never crossed to — and then a second
   * one when they do, because the first seat was still held.
   *
   * So the ask is remembered here and sent whenever there is a socket to
   * send it on. That covers both halves of the problem at once:
   *  - `join` pressed before the socket exists (the WS URL is fetched, and on
   *    a slow day the player reaches the arrow first) is not dropped on the
   *    floor — it goes out on `connect`. Without this the player crossed to
   *    an island with no rabbit and a HUD reading zero.
   *  - a reconnect mid-run re-asks, and the server seats it for free (it is
   *    the same run); a socket rebuilt at the end of a spectate, or a page
   *    opened on the burrow, asks for nothing.
   *
   * A ref, not state: `connect` fires on every reconnect and has to read the
   * intent THEN, without tearing the socket down each time it changes.
   * Cleared by `leave` and by the end of a run — a blip during the recap must
   * not buy the next run on its own.
   */
  const wantSeat = useRef(false);

  /** Apply to the scene now, or queue it until the scene exists. */
  const toScene = useCallback((fn: (s: IslandScene) => void) => {
    const scene = sceneRef.current();
    if (scene) fn(scene);
    else pendingRef.current.push(fn);
  }, []);

  const bindScene = useCallback((getter: SceneGetter) => {
    sceneRef.current = getter;
    const scene = getter();
    if (!scene) return;
    // Drain whatever arrived while Pixi was still loading its atlases — without
    // this, the tiles dug during the boot would stay face-down forever.
    const queued = pendingRef.current;
    pendingRef.current = [];
    for (const fn of queued) fn(scene);
  }, []);

  // The WS URL is fetched, not baked: see /api/config for why.
  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((c) => setWsUrl(c.wsUrl || window.location.origin))
      .catch(() => setWsUrl(window.location.origin));
  }, []);

  useEffect(() => {
    if (!token || !wsUrl) return;
    const socket = io(wsUrl, { auth: { token }, transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setDropped(false);
      if (spectate) {
        // Watching, not playing: whatever seat was wanted before is not.
        wantSeat.current = false;
        socket.emit('spectate', { playerId: spectate });
      } else if (wantSeat.current) {
        // A seat asked for before this socket existed, or held before it
        // dropped — see `wantSeat`.
        socket.emit('join');
      }
    });
    socket.on('disconnect', (reason: string) => {
      setConnected(false);
      // Our own `disconnect()` (sign-out, a token change) is not a drop.
      setDropped(reason !== 'io client disconnect');
    });

    // The server refused a move — see `IslandScene.moveRejected`.
    socket.on('move_rejected', ({ reason }: { reason: Parameters<IslandScene['moveRejected']>[0] }) => {
      toScene((s) => s.moveRejected(reason));
    });

    /**
     * The server said no to a seat.
     *
     * Only `no_energy` is surfaced as state: it is the one refusal the player
     * can act on (wait, or buy), and the burrow has a dialog for exactly that.
     * The rest are logged and left — they are bugs or expired sessions, and
     * the page already handles a dead session on its own.
     */
    socket.on('error_msg', (e: { code?: string; energy?: number; need?: number; nextRunInMs?: number | null }) => {
      if (e?.code === 'no_energy') {
        setRefused({
          code: 'no_energy',
          energy: e.energy ?? 0,
          need: e.need ?? 0,
          nextRunInMs: e.nextRunInMs ?? null,
          at: Date.now(),
        });
        return;
      }
      console.warn('[rr-ws]', e?.code ?? 'error');
    });

    socket.on('island', (snap: IslandSnapshot) => {
      snapshotRef.current = snap;
      setRefused(null);
      setIslandSeed(snap.seed);
      setIslandKey((k) => k + 1);
      setWarnStage(snap.warnStage);
      setRecap(null);
      setFirstRun(snap.first === true);
      setDigs(NO_DIGS);
      setBank(snap.bank ?? null);
      setErupting(null);
      toScene((s) => s.resetEruption());
      setRabbits(new Map(snap.rabbits.map((r) => [r.playerId, r])));
      // A joiner lands mid-run on an island others have been digging, so the
      // snapshot carries what is already uncovered.
      toScene((s) => {
        for (const t of snap.revealed) s.revealTile(t.tile, t.content, t.adjacent);
        for (const f of snap.flagged ?? []) s.flagBomb(f, false);
        for (const h of snap.hinted ?? []) s.hintTile(h.tile, h.adjacent);
        // Chests are drawn before they are dug — they DROP in here, which reads
        // as the island being dealt to the player who just joined it.
        s.showChests(snap.chests ?? [], true);
        snap.rabbits.forEach((r, i) => s.addRabbit(r.playerId, r.name, r.tile, i, r.energy, r.crowned));
        // Where the flock is NOW. The seed only says where it started, and a
        // joiner arrives after it has bolted around for a while.
        for (const one of snap.sheep ?? []) s.moveSheep(one.id, toIndex(one.x, one.y));
      });
    });

    socket.on('tile_revealed', (t: { tile: number; content: TileContent; adjacent: number }) => {
      toScene((s) => s.revealTile(t.tile, t.content, t.adjacent));
    });

    /**
     * The cascade opened numbers on undug ground — a zero was dug somewhere.
     * Shared like a reveal: everyone on the island reads the same numbers.
     */
    socket.on('hints_revealed', (p: { tiles: Array<{ tile: number; adjacent: number }> }) => {
      toScene((s) => { for (const h of p.tiles) s.hintTile(h.tile, h.adjacent); });
    });

    /** Somebody's red X was RIGHT: the bomb is marked for the whole island. */
    socket.on('bomb_flagged', (p: { tile: number }) => {
      toScene((s) => s.flagBomb(p.tile));
    });

    /**
     * A rabbit's energy or carrots changed WITHOUT a step — an X paid or cost.
     * `rabbit_moved` would replay a hop onto the tile they are standing on.
     */
    socket.on('rabbit_energy', (p: { playerId: string; energy: number; carrots: number }) => {
      setRabbits((prev) => {
        const was = prev.get(p.playerId);
        if (!was) return prev;
        return new Map(prev).set(p.playerId, { ...was, energy: p.energy, carrots: p.carrots });
      });
      if (p.playerId === playerId) toScene((s) => s.setEnergy(p.energy));
    });

    /**
     * What MY red X was worth — private, like `move_result`. The energy is
     * said on the tile in the bar's own yellow, the carrots beside it; a wrong
     * one is said in red, and the scene shakes its head.
     */
    socket.on('flag_result', (r: FlagResultMsg) => {
      if (r.correct) setDigs((d) => ({ ...d, flags: d.flags + 1 }));
      // Gold once the STREAK has reached the bounty's ceiling — read off the
      // streak, not the sum, which also carries any overflow (OVERFLOW_CARROTS).
      const capAt = Math.ceil((FLAG.CARROTS_MAX - FLAG.CARROTS_BASE) / FLAG.CARROTS_STEP) + 1;
      toScene((s) => s.flagAnswered(r.tile, r.correct, r.energyDelta, r.carrotDelta, r.streak >= capAt));
    });

    /** The X was refused (known ground, out of reach, stunned): a plain "no". */
    socket.on('flag_rejected', () => {
      toScene((s) => s.moveRejected('blocked'));
    });

    /**
     * The private half of a dig — sent to the mover alone.
     *
     * `tile_revealed` goes to the whole island, because uncovering ground is a
     * shared fact. What the tile PAID is not: only the first digger is credited,
     * and a chest's contents are theirs. So the ceremony is driven from here,
     * never from `tile_revealed`, or every rabbit on the island would watch a
     * take-over for a prize somebody else won.
     */
    socket.on('move_result', (r: MoveResult) => {
      if (r.dig) {
        const c = r.dig.content;
        // The gain, said on the tile — for the digger alone, which is who
        // this event reaches. See `IslandScene.floatGain`.
        if (r.dig.tile !== undefined && (r.dig.carrotDelta ?? 0) > 0) {
          const { tile, carrotDelta } = r.dig;
          toScene((s) => s.floatGain(tile, carrotDelta!, c === 'golden'));
        }
        setDigs((d) => ({
          ...d,
          tiles: d.tiles + 1,
          bombs: d.bombs + (c === 'bomb' ? 1 : 0),
          goldens: d.goldens + (c === 'golden' ? 1 : 0),
          chests: d.chests + (c === 'chest' ? 1 : 0),
        }));
      }
      // The jump and the fanfare, on the beat the box opens — see
      // `IslandScene.celebrateChest`. Before the loot early-return below,
      // which skips a plain carrot payout: the tutorial's chest is bronze and
      // pays exactly that, so anything after it would never run.
      if (r.tutorialDone) toScene((s) => s.celebrateChest());
      if (!r.dig?.loot) return;
      // Carrots already land on the rabbit and animate on the tile — a
      // full-screen ceremony for a handful of them would stop the run dead
      // several times a minute. Only items and pieces earn the take-over.
      if (r.dig.loot.kind === 'carrots' && !r.dig.nft) return;
      setChestPrize({
        ...r.dig.loot,
        nft: r.dig.nft === true,
        // A server older than this client sends no flag. Treating that as
        // announced keeps the ceremony it used to play, rather than silently
        // demoting every chest on a version skew.
        announced: r.dig.loot.announced !== false,
        at: Date.now(),
      });
    });

    /**
     * Numbers on already-dug ground changed.
     *
     * A mirage landing, or lifting. The client is deliberately NOT told which
     * it is, or that the numbers are false at all: being told you are being
     * lied to defeats the item, and finding out is the whole point. It just
     * redraws the tiles it is given.
     */
    /**
     * A lightning strike landed on this island.
     *
     * Played BEFORE the reveals that follow it: the bolt is the cause and the
     * opened ground is the consequence, and a flash arriving after its own
     * result reads as a delayed effect rather than as a strike.
     */
    socket.on('lightning_struck', (p: { target: number; tiles: number[] }) => {
      toScene((s) => s.playLightning(p.target, p.tiles));
    });

    socket.on('hints_changed', (p: { tiles: Array<{ tile: number; adjacent: number }> }) => {
      toScene((s) => { for (const t of p.tiles) s.setHint(t.tile, t.adjacent); });
    });

    /**
     * The flock moved, as the SERVER decided it.
     *
     * The client does not run the flight rules — it plays what it is told,
     * exactly like `rabbit_moved`. A sheep blocks its cell, so a browser that
     * chose its own sheep positions would disagree with the server about which
     * moves are legal, and the player would get a move refused for no visible
     * reason.
     */
    socket.on('sheep_moved', (p: { sheep: SheepMove[] }) => {
      toScene((s) => {
        for (const one of p.sheep) s.walkSheep(one.id, one.path ?? [one.tile], one.sprinting);
      });
    });

    socket.on('rabbit_moved', (r: ClientRabbit) => {
      setRabbits((prev) => new Map(prev).set(r.playerId, r));
      toScene((s) => s.moveRabbit(r.playerId, r.tile, r.energy));
    });

    socket.on('rabbit_joined', (r: ClientRabbit) => {
      setRabbits((prev) => {
        const next = new Map(prev).set(r.playerId, r);
        toScene((s) => s.addRabbit(r.playerId, r.name, r.tile, next.size - 1, r.energy, r.crowned));
        return next;
      });
    });

    socket.on('rabbit_left', ({ playerId: gone, grace }: { playerId: string; grace: boolean }) => {
      // Someone in the reconnect window is refreshing, not gone. Blinking their
      // rabbit out and straight back in is worse than leaving it standing.
      if (grace) return;
      setRabbits((prev) => {
        const next = new Map(prev);
        next.delete(gone);
        return next;
      });
      toScene((s) => s.removeRabbit(gone));
    });

    socket.on('bomb_hit', (
      { playerId: hit, tile, stunMs }:
      { playerId: string; tile: number; stunMs?: number },
    ) => {
      // The server sends how long the stun still has to run; the deadline is
      // put on OUR clock here, so a skewed client still darkens the ring for
      // the right length of time.
      const until = stunMs === undefined ? undefined : Date.now() + stunMs;
      toScene((s) => s.bombHit(hit, tile, until));
    });

    // The server's name for it is historical: the run ended because the tank
    // hit zero, which is the only way a run ever ends. The rabbit is spent,
    // not killed — see `exhaustRabbit`.
    socket.on('rabbit_died', ({ playerId: spent }: { playerId: string }) => {
      toScene((s) => s.exhaustRabbit(spent));
    });

    socket.on('volcano', ({ stage }: { stage: number }) => {
      setWarnStage(stage);
      // Felt as well as read: the ground rumbles harder at each stage.
      toScene((s) => s.rumble(stage));
    });
    /**
     * The island is sinking. The server holds this beat (ERUPTION.SEQUENCE_MS)
     * before banking and sending `run_over`; the scene plays the sink and the
     * page darkens the sky over it. Never handled before — four seconds of a
     * still board, then a recap.
     */
    socket.on('eruption', ({ durationMs }: { islandId: string; durationMs: number }) => {
      setErupting(durationMs);
      toScene((s) => s.playEruption(durationMs));
    });
    socket.on('run_over', (r: RunRecap) => {
      // The seat is spent. A reconnect from the recap must not ask again —
      // that would start, and pay for, a run the player has not chosen.
      wantSeat.current = false;
      if (recapTimer.current) clearTimeout(recapTimer.current);
      if (r.cleared) {
        toScene((s) => s.celebrateClear());
        setRecap(r);
        return;
      }
      recapTimer.current = setTimeout(() => {
        recapTimer.current = null;
        setRecap(r);
      }, RECAP_BEAT_MS);
    });
    // The carrots are in Postgres NOW, so whatever shows the total may go and
    // read it. See `Banked`: this is deliberately not `run_over`.
    socket.on('banked', (b: Banked) => {
      setBankedCarrots(b?.carrots ?? 0);
      setBanked((n) => n + 1);
    });

    return () => {
      if (recapTimer.current) clearTimeout(recapTimer.current);
      recapTimer.current = null;
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, wsUrl, spectate, toScene]);

  /**
   * Paint the last snapshot onto the board again.
   *
   * Called after the scene has switched island: `setIsland` clears the tiles
   * and rabbits, so what the server already told us has to be re-applied.
   */
  const resync = useCallback(() => {
    const snap = snapshotRef.current;
    const scene = sceneRef.current();
    if (!snap || !scene) return;
    for (const t of snap.revealed) scene.revealTile(t.tile, t.content, t.adjacent);
    for (const f of snap.flagged ?? []) scene.flagBomb(f, false);
    for (const h of snap.hinted ?? []) scene.hintTile(h.tile, h.adjacent);
    // No drop on a resync: these chests were already standing there, and
    // replaying the arrival would announce something that did not happen.
    scene.showChests(snap.chests ?? [], false);
    snap.rabbits.forEach((r, i) => scene.addRabbit(r.playerId, r.name, r.tile, i, r.energy, r.crowned));
  }, []);

  /** Ask to step onto a tile. The server decides whether it happens. */
  /**
   * X MODE: the next tap on the ring MARKS a tile instead of stepping onto it.
   *
   * One-shot — it drops after a single X, right or wrong. A mode that stayed
   * armed would turn the very next "walk there" into a bet the player did not
   * mean to place, and a wrong X costs energy. The scene is told so the ring
   * can show what an X may land on; the decision to send `flag` rather than
   * `move` is made HERE, so the tap path through the page stays one path.
   */
  const [flagMode, setFlagModeState] = useState(false);
  const flagModeRef = useRef(false);
  /** Set for a moment when X mode was armed with nothing around to mark. */
  const [flagNothing, setFlagNothing] = useState(false);
  const flagNothingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (flagNothingTimer.current) clearTimeout(flagNothingTimer.current); }, []);
  const setFlagMode = useCallback((on: boolean) => {
    let markable = -1;
    toScene((s) => { markable = s.setFlagMode(on); });
    // Every tile around the rabbit is already dug, read or marked: there is
    // nothing an X could mean. Arming anyway lit an empty ring and explained
    // nothing, so the mode refuses, and says why for a few seconds.
    if (on && markable === 0) {
      toScene((s) => { s.setFlagMode(false); });
      flagModeRef.current = false;
      setFlagModeState(false);
      setFlagNothing(true);
      if (flagNothingTimer.current) clearTimeout(flagNothingTimer.current);
      flagNothingTimer.current = setTimeout(() => setFlagNothing(false), 3000);
      return;
    }
    setFlagNothing(false);
    flagModeRef.current = on;
    setFlagModeState(on);
  }, [toScene]);

  const moveTo = useCallback((tile: number) => {
    if (flagModeRef.current) {
      socketRef.current?.emit('flag', { tile });
      setFlagMode(false);
      return;
    }
    socketRef.current?.emit('move', { tile });
  }, [setFlagMode]);

  const restart = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit('restart');
    socket.once('restarting', () => { wantSeat.current = true; socket.emit('join'); });
  }, []);

  /**
   * Give up the seat and BANK the run.
   *
   * Going back to the burrow does not close this socket — the burrow needs it
   * too — so without telling the server, the rabbit just sat on the island
   * holding its carrots until the island was reaped, and they were lost. The
   * server banks on `leave`, so carrying a sack home is worth exactly what
   * running the tank dry is.
   */
  const leave = useCallback(() => {
    wantSeat.current = false;
    socketRef.current?.emit('leave');
  }, []);

  /**
   * Take a seat on an island — the counterpart to `leave`.
   *
   * `join` used to be emitted only from the `connect` handler, which made it
   * reachable exactly once per socket. But the socket SURVIVES the walk to the
   * burrow (the burrow needs it), and `leave` gives the seat up on the way
   * out — so the second trip out to farm arrived with no rabbit on the server
   * and no way to ask for one: every tap was dropped, silently, until the page
   * was reloaded. Each crossing now pairs with the `leave` that opened it.
   */
  const join = useCallback(() => {
    // Remembered even when there is no socket yet: `connect` sends it. A
    // socket that exists but is between reconnects also gets it on `connect`,
    // and a live one gets it now. NEVER BOTH, and that takes the `connected`
    // check: socket.io does not drop an emit made on a socket that is still
    // connecting, it buffers it and flushes it on `connect` — the same instant
    // the handler above asks again. Two joins then reached the server side by
    // side, and a first-timer (whose first island is created on the ask) was
    // dealt two of them and shown both, one over the other.
    wantSeat.current = true;
    const socket = socketRef.current;
    if (socket?.connected) socket.emit('join');
    // A new crossing never shows the last run's card. It was cleared only when
    // the next island ARRIVED, so a DIG on a dropped socket landed on the old
    // board with "Run over" still up (seen live).
    if (recapTimer.current) clearTimeout(recapTimer.current);
    recapTimer.current = null;
    setRecap(null);
  }, []);

  const me = playerId ? rabbits.get(playerId) ?? null : null;
  return {
    islandSeed, islandKey, rabbits, me, warnStage, recap, banked, bankedCarrots, connected, dropped, refused,
    firstRun, digs, bank, erupting,
    chestPrize, clearChestPrize: () => setChestPrize(null),
    moveTo, restart, join, leave, bindScene, resync, flagMode, setFlagMode, flagNothing,
  };
}
