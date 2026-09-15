'use client';

/**
 * THE LOOP BAR — DIG ▸ HOME ▸ RAID, on the floor of the burrow.
 *
 * WHAT IT REPLACES. Four doors (SHOP, BASE, RAIDING, STORY) and a GO FARM
 * slab beside them. The doors mixed a loop (raiding), a defence mode (base),
 * a store and a codex, and the one action that starts the game's main loop
 * sat apart from them all. Nothing on the floor said dig → bring it home →
 * raid → repeat, or why you would leave one for the next.
 *
 * WHAT IT IS. Three slabs in the order the GDD names the loop, with the
 * arrows drawn. Each carries its own STATE on its second line — the reason
 * to press it: DIG says what a run costs and what is in the bank, HOME says
 * what is standing in the garden and how long the shield holds, RAID names
 * the richest open burrow. The shop and the codex are not loops and moved to
 * the top bar as icons.
 *
 * DIG is the saturated one: it is still the one action the screen exists
 * for, and the mock's argument holds — the findable shape is the orange one.
 * HOME is the place you are standing in, so it is lit with the lamp's gold
 * rim rather than filled. RAID takes the danger red on its badge only.
 *
 * `away` slides the whole bar off the floor during trap placement, the same
 * curve GO FARM rode down (the camera pulls back at that moment).
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { CARROT_URL, CARROT_SIZE } from '@domin8/arcade-kit/game';
import { playUiSfx } from '@/game/services/SoundManager';
import type { QuestDoor } from '@/config/quests';

export type Loop = 'dig' | 'home' | 'raid';

export interface LoopBarProps {
  dig: {
    energy: number;
    maxEnergy: number;
    runCost: number;
    /** Time until a run's worth, null when there already is. */
    nextRunInMs: number | null;
  };
  home: {
    gardenReady: number;
    shieldMs: number | null;
    trapsLive: number;
    trapsPlaced: number;
  };
  raid: {
    /** Unshielded burrows. */
    open: number;
    /** The richest open burrow by what stands in its garden, if any. */
    best: { name: string; garden: number } | null;
    /** Bombs in the bag — the sabotage item. */
    bombs: number;
  };
  /** The door the active quest (or the next action) lives behind. */
  questDoor?: QuestDoor | null;
  /** Bumped when the quest moves to a new door — that slab pops once. */
  questPulseKey?: number;
  /**
   * The run that just banked. Shown ON the DIG slab — the carrots came from
   * there, and it is the next thing the player presses. Re-keyed per haul.
   */
  broughtHome?: { amount: number; key: number } | null;
  /**
   * When a run's worth of energy lands, on the wall clock (null when there
   * already is one). The DIG line counts down to it on its own, and
   * `onRunReady` fires when it arrives so the page can re-read the burrow.
   */
  nextRunAt?: number | null;
  onRunReady?(): void;
  away?: boolean;
  onDig(): void;
  onHome(): void;
  onRaid(): void;
}

/** Which slab a door lives on. */
export function loopOf(door: QuestDoor | null | undefined): Loop | null {
  switch (door) {
    case 'farm': return 'dig';
    case 'garden':
    case 'base': return 'home';
    case 'raid': return 'raid';
    default: return null;
  }
}

/* ── Palette: the GO FARM slab, the hub tile, the soil ─────────────────── */
const DIG_FACE = '#ed7b23';
const DIG_FACE_LIT = '#f4913f';
const DIG_LIP = '#ffc48c';
const DIG_SHADOW = '#652f09';
/** The DIG slab's state line: dark on the orange, ~5:1 where cream gave 2:1. */
const DIG_INK = '#3d1d06';
const TILE_TOP = '#4a3d2e';
const TILE_BOTTOM = '#332619';
const TILE_SHADOW = '#1b1009';
const INK = '#e9dabd';
const INK_DIM = '#a8977f';
const LAMP = '#ffd138';
const BADGE = '#e62132';
const DANGER_INK = '#ff8a7a';

function formatWait(ms: number): string {
  const mins = Math.ceil(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest ? `${h}h ${rest}m` : `${h}h`;
}

export function LoopBar({
  dig, home, raid, questDoor = null, questPulseKey = 0, broughtHome = null, nextRunAt = null, onRunReady,
  away, onDig, onHome, onRaid,
}: LoopBarProps) {
  const pointed = loopOf(questDoor);
  const canDig = dig.energy >= dig.runCost;

  // The wait, counted down here rather than frozen at the server's last word.
  // A tick every 15s is plenty for a line rendered to the minute; the timeout
  // is what lands exactly on the moment, and asks for the fresh burrow.
  const [now, setNow] = useState(() => Date.now());
  const runReady = useRef(onRunReady);
  runReady.current = onRunReady;
  useEffect(() => {
    if (nextRunAt == null) return;
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    const land = setTimeout(() => {
      setNow(Date.now());
      runReady.current?.();
    }, Math.max(0, nextRunAt - Date.now()) + 250);
    return () => { clearInterval(tick); clearTimeout(land); };
  }, [nextRunAt]);
  const waitMs = nextRunAt == null ? dig.nextRunInMs : Math.max(0, nextRunAt - now);

  // A slab that BECOMES worth pressing pops and chimes once: DIG when a run
  // becomes affordable, HOME when the garden goes from empty to something to
  // take. Never on mount — only on the change, which is the news.
  const [readyKey, setReadyKey] = useState({ dig: 0, home: 0 });
  const was = useRef({ canDig, garden: home.gardenReady > 0 });
  useEffect(() => {
    const garden = home.gardenReady > 0;
    const digBecame = canDig && !was.current.canDig;
    const homeBecame = garden && !was.current.garden;
    was.current = { canDig, garden };
    if (!digBecame && !homeBecame) return;
    setReadyKey((k) => ({ dig: k.dig + (digBecame ? 1 : 0), home: k.home + (homeBecame ? 1 : 0) }));
    playUiSfx('chimeQuick');
  }, [canDig, home.gardenReady]);
  const pulse = (loop: Loop) => {
    const quest = pointed === loop && questPulseKey > 0 ? questPulseKey : 0;
    const ready = loop === 'dig' ? readyKey.dig : loop === 'home' ? readyKey.home : 0;
    return quest || ready ? `${quest}.${ready}` : 0;
  };
  const carrotH = 30;
  const carrotW = Math.round((CARROT_SIZE.width / CARROT_SIZE.height) * carrotH);

  // Each line is PARTS, joined on screen with a middot entity (the bitmap
  // face has no middot glyph, so the character never appears in source) and
  // in the label with a comma.
  // Short parts: a slab is ~270px wide at the mock's window and the line
  // wraps to two rows at most (`line` below), so every part is a couple of
  // words. Verified on screen: "35/60 energy · a run takes 25" clipped.
  const digParts = [
    `${dig.energy}/${dig.maxEnergy} energy`,
    canDig
      ? `run costs ${dig.runCost}`
      : `run in ${waitMs === null || waitMs <= 0 ? 'a moment' : formatWait(waitMs)}`,
  ];
  const homeParts = [
    home.gardenReady > 0 ? `garden +${home.gardenReady}` : 'garden empty',
    home.shieldMs !== null ? `shield ${formatWait(home.shieldMs)}` : 'no shield',
    `${home.trapsLive} trap${home.trapsLive === 1 ? '' : 's'}`,
  ];
  const raidParts = [
    raid.best
      ? `${raid.best.name} left ${raid.best.garden} outside`
      : raid.open > 0
        ? `${raid.open} burrow${raid.open === 1 ? '' : 's'} open`
        : 'every burrow is shielded',
  ];
  const digLine = digParts.join(', ');
  const homeLine = homeParts.join(', ');
  const raidLine = raidParts.join(', ');

  return (
    <nav
      className={`rr-loop-bar${away ? ' rr-loop-away' : ''}`}
      aria-label="Dig, home, raid"
      aria-hidden={away || undefined}
      // A real boolean: React 19 takes `inert` as one, and the empty-string
      // spelling (for React 18) logged an error every time placing began.
      {...(away ? { inert: true } : {})}
    >
      {/* DIG: the carrot slab, the one saturated shape on the floor. */}
      <button
        type="button"
        key={`dig:${pulse('dig')}`}
        className={`rr-loop-slab rr-loop-dig${pulse('dig') ? ' rr-tab-pop' : ''}`}
        onClick={onDig}
        aria-label={`Dig. ${digLine}`}
        style={{ ...slab, background: DIG_LIP }}
      >
        <span
          className="rr-loop-face"
          style={{
            ...face,
            background: `linear-gradient(180deg, ${DIG_FACE_LIT} 0%, ${DIG_FACE} 100%)`,
            boxShadow: `inset 0 -3px 0 ${DIG_SHADOW}`,
            color: '#ffffff',
          }}
        >
          <img
            className="rr-carrot-px"
            src={CARROT_URL}
            alt=""
            aria-hidden
            draggable={false}
            width={carrotW}
            height={carrotH}
            style={{ display: 'block', flexShrink: 0, transform: 'rotate(45deg)' }}
          />
          <span style={textCol}>
            {/* The verb keeps its white and gets the slab's own shadow under
                it; the state line goes to DARK ink. Cream on this orange
                measured 2:1, and the line is the one that says whether the
                next run is affordable. */}
            <span style={{ ...verb, textShadow: `0 2px 0 ${DIG_SHADOW}` }}>DIG</span>
            <span style={{ ...line, color: DIG_INK }}><Parts parts={digParts} /></span>
          </span>
        </span>
        {pointed === 'dig' && <span className="rr-hub-badge" style={badge} aria-hidden>!</span>}
        {/* The haul, standing on the slab it came from. Outside the slab's
            box (see `.rr-home-haul`) and transparent to the pointer, so it
            never takes a press meant for DIG. */}
        {broughtHome && (
          <span key={broughtHome.key} className="rr-home-haul" role="status">
            <span className="rr-home-haul-n">
              <img
                className="rr-carrot-px"
                src={CARROT_URL}
                alt=""
                aria-hidden
                draggable={false}
                width={Math.round((CARROT_SIZE.width / CARROT_SIZE.height) * 20)}
                height={20}
                style={{ display: 'block', transform: 'rotate(45deg)' }}
              />
              +{broughtHome.amount}
            </span>
            <span>brought home</span>
          </span>
        )}
      </button>

      <span style={arrow} aria-hidden>▸</span>

      {/* HOME — the place you are standing in: lit, not filled. Tapping it
          opens the floor to bury traps, which is the one thing HOME does that
          the column's cards do not. */}
      <button
        type="button"
        key={`home:${pulse('home')}`}
        className={`rr-loop-slab rr-loop-home${pulse('home') ? ' rr-tab-pop' : ''}`}
        onClick={onHome}
        aria-label={`Home: bury traps. ${homeLine}`}
        style={{ ...slab, background: TILE_SHADOW, boxShadow: `0 0 0 2px ${LAMP}` }}
      >
        <span
          className="rr-loop-face"
          style={{
            ...face,
            background: `linear-gradient(180deg, ${TILE_TOP} 0%, ${TILE_BOTTOM} 100%)`,
            boxShadow: `inset 0 -3px 0 ${TILE_SHADOW}`,
            color: INK,
          }}
        >
          <span style={textCol}>
            <span style={{ ...verb, color: LAMP }}>HOME</span>
            <span style={{ ...line, color: home.gardenReady > 0 ? DANGER_INK : INK_DIM }}><Parts parts={homeParts} /></span>
          </span>
        </span>
        {pointed === 'home' && <span className="rr-hub-badge" style={badge} aria-hidden>!</span>}
      </button>

      <span style={arrow} aria-hidden>▸</span>

      {/* RAID — takes what others left outside. The badge is the count of
          doors that will open; the line is the one worth walking to. */}
      <button
        type="button"
        key={`raid:${pulse('raid')}`}
        className={`rr-loop-slab rr-loop-raid${pulse('raid') ? ' rr-tab-pop' : ''}`}
        onClick={onRaid}
        aria-label={`Raid. ${raidLine}`}
        style={{ ...slab, background: TILE_SHADOW }}
      >
        <span
          className="rr-loop-face"
          style={{
            ...face,
            background: `linear-gradient(180deg, ${TILE_TOP} 0%, ${TILE_BOTTOM} 100%)`,
            boxShadow: `inset 0 -3px 0 ${TILE_SHADOW}`,
            color: INK,
          }}
        >
          <span style={textCol}>
            <span style={verb}>RAID</span>
            <span style={{ ...line, color: raid.best ? DANGER_INK : INK_DIM }}><Parts parts={raidParts} /></span>
            {raid.bombs > 0 && <span style={{ ...line, color: INK_DIM }}>{raid.bombs} bomb{raid.bombs === 1 ? '' : 's'} in the bag</span>}
          </span>
        </span>
        {/* RED ONLY FOR NEWS. The quest pointing here is a "!" in red, like
            DIG and HOME. The number of open burrows is a standing count, so it
            takes the quiet chip — a red "20" read as twenty unread things,
            and the target list has nothing marked new to match it. */}
        {pointed === 'raid' ? (
          <span className="rr-hub-badge" style={badge} aria-hidden>!</span>
        ) : raid.open > 0 ? (
          <span style={countChip} aria-hidden>{raid.open}</span>
        ) : null}
      </button>

      {/* The loop closes: a drawn arrow, not a glyph the pixel face lacks. */}
      <svg style={{ ...arrow, opacity: 0.6 }} width="18" height="18" viewBox="0 0 18 18" aria-hidden>
        <path d="M14 9a5 5 0 1 1-1.5-3.5" fill="none" stroke="#f5e6d3" strokeWidth="2" strokeLinecap="round" />
        <path d="M12 2v4h-4" fill="none" stroke="#f5e6d3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </nav>
  );
}

/** A slab's state line: its parts, a middot between them. */
function Parts({ parts }: { parts: string[] }) {
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>{i > 0 && <> &middot; </>}{p}</span>
      ))}
    </>
  );
}

const slab: CSSProperties = {
  position: 'relative',
  display: 'block',
  flex: '1 1 0',
  minWidth: 0,
  height: 'clamp(52px, 10.4svh, 80px)',
  padding: 0,
  border: 'none',
  borderRadius: 14,
  overflow: 'visible',
  pointerEvents: 'auto',
  boxSizing: 'border-box',
};

const face: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  height: 'calc(100% - 4px)',
  padding: '0 14px',
  boxSizing: 'border-box',
  borderRadius: 14,
  position: 'absolute',
  top: 0,
  left: 0,
  transition: 'transform 90ms ease-out',
  textAlign: 'left',
};

const textCol: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  minWidth: 0,
};

const verb: CSSProperties = {
  fontFamily: 'var(--font-pixel), ui-monospace, monospace',
  fontSize: 'clamp(13px, 2.2svh, 18px)',
  letterSpacing: '0.1em',
  lineHeight: 1,
};

/**
 * The state line: up to TWO rows, never an ellipsis. A slab's line is the
 * reason to press it, and a reason cut off at "a run take..." is no reason.
 */
const line: CSSProperties = {
  fontFamily: 'var(--font-pixel), ui-monospace, monospace',
  fontSize: 'clamp(9px, 1.5svh, 11px)',
  lineHeight: 1.25,
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 2,
  overflow: 'hidden',
  overflowWrap: 'anywhere',
};

const arrow: CSSProperties = {
  color: '#f5e6d3',
  fontSize: 18,
  flexShrink: 0,
  textShadow: '0 2px 0 rgba(0,0,0,0.4)',
};

const badge: CSSProperties = {
  position: 'absolute',
  right: -6,
  top: -6,
  minWidth: 22,
  height: 22,
  padding: '0 6px',
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: BADGE,
  color: '#ffffff',
  borderRadius: 11,
  fontFamily: 'var(--font-pixel), ui-monospace, monospace',
  fontSize: 11,
  boxShadow: '0 2px 0 rgba(0,0,0,0.4)',
};

/** A standing number on a slab: the badge's shape in dark and cream, not red. */
const countChip: CSSProperties = {
  ...badge,
  background: '#2a1810',
  color: '#fde7bd',
  border: '2px solid #6b4526',
};
