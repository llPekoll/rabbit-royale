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
 * THREE VERBS, THREE HUES: DIG the carrot's orange, DEFEND the garden's green,
 * RAID the danger red the rest of the game already uses. All three FILLED the
 * same way, so none of them looks picked. DIG stays the loudest — the most
 * saturated face and the only one carrying the carrot — because it is still
 * the one action the screen exists for. See the palette below for why the gold
 * ring that used to mark DEFEND had to go.
 *
 * `away` slides the whole bar off the floor during trap placement, the same
 * curve GO FARM rode down (the camera pulls back at that moment).
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { CARROT_URL, CARROT_SIZE } from '@domin8/arcade-kit/game';
import { LeafBadge } from './leaf-badge';
import { playUiSfx } from '@/game/services/SoundManager';
import type { QuestDoor } from '@/config/quests';
import { useT } from '@/i18n/provider';
import { formatWait, groupDigits } from '@/i18n/format';
import { PxButton, PxPanel } from './px';

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

/* ── Palette: ONE HUE PER VERB ─────────────────────────────────────────────
   COLOUR IS THE IDENTITY, AND NOTHING ELSE IS (Paul, 2026-09-16).
   DEFEND and RAID used to share one face (#4a3d2e) and were told apart by
   their ink and by a gold ring around DEFEND. Two problems, one cause: two of
   the three verbs were the same button, and a ring around a control means
   SELECTED in every interface anyone has ever used — so the floor announced a
   state DEFEND did not have. ("why is DEFEND seemingly highlighted with a
   yellow outline?")
   Now each verb owns a hue and all three are FILLED the same way. An outline
   is free to mean state again; the quest still points with its red "!".
   DIG stays the loudest — the most saturated face, and the only one carrying
   the carrot — because it is still the one action the screen exists for. */
const DIG_FACE = '#ed7b23';
const DIG_LIP = '#ffc48c';
const DIG_SHADOW = '#652f09';
/** The DIG slab's state line: dark on the orange, ~5:1 where cream gave 2:1. */
const DIG_INK = '#3d1d06';
/** DEFEND: the garden it exists to protect. */
const DEF_FACE = '#4f7a34';
const DEF_LIP = '#8fbf5f';
const DEF_SHADOW = '#22381a';
const DEF_INK = '#dcecc4';
/** RAID: the danger this game already paints red. Kept DARK deliberately —
    the quest badge is the painted red pill (leaf-badge.tsx), and a bright red
    face would have swallowed the one mark that says the quest points here. */
const RAID_FACE = '#8c2f38';
const RAID_LIP = '#d4676f';
const RAID_SHADOW = '#3d0e14';
const RAID_INK = '#f0c9c9';
/** The lamp's gold, now spent only on what is WORTH TAKING. */
const LAMP = '#ffd138';
/** The haul toast's glass — the island captions' ground. */
const GLASS = 'rgba(13, 17, 23, 0.82)';
const DANGER_INK = '#ff8a7a';

export function LoopBar({
  dig, home, raid, questDoor = null, questPulseKey = 0, broughtHome = null, nextRunAt = null, onRunReady,
  away, onDig, onHome, onRaid,
}: LoopBarProps) {
  const t = useT();
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
  // Each line is PARTS, joined on screen with a middot entity (the bitmap
  // face has no middot glyph, so the character never appears in source) and
  // in the label with a comma.
  // Short parts: a slab is ~270px wide at the mock's window and the line
  // wraps to two rows at most (`line` below), so every part is a couple of
  // words. Verified on screen: "35/60 energy · a run takes 25" clipped.
  const digParts = [
    t.loop.energyOf(dig.energy, dig.maxEnergy),
    canDig
      ? t.loop.runCosts(dig.runCost)
      : t.loop.runIn(waitMs === null || waitMs <= 0 ? t.loop.aMoment : formatWait(waitMs, t.units)),
  ];
  const homeParts = [
    home.gardenReady > 0 ? t.loop.gardenPlus(groupDigits(home.gardenReady)) : t.loop.gardenEmpty,
    home.shieldMs !== null ? t.loop.shieldFor(formatWait(home.shieldMs, t.units)) : t.loop.noShield,
    t.loop.traps(home.trapsLive),
  ];
  const raidParts = [
    raid.best
      ? t.loop.leftOutside(raid.best.name, groupDigits(raid.best.garden))
      : raid.open > 0
        ? t.loop.burrowsOpen(raid.open)
        : t.loop.allShielded,
    // The bag JOINS the line instead of taking a row of its own. Each slab
    // holds one travelling row now, and a second row is exactly the vertical
    // space this change exists to hand back.
    ...(raid.bombs > 0 ? [t.loop.bombsInBag(raid.bombs)] : []),
  ];
  const digLine = digParts.join(', ');
  const homeLine = homeParts.join(', ');
  const raidLine = raidParts.join(', ');

  return (
    <nav
      className={`rr-loop-bar${away ? ' rr-loop-away' : ''}`}
      aria-label={t.loop.ariaGroup}
      aria-hidden={away || undefined}
      // A real boolean: React 19 takes `inert` as one, and the empty-string
      // spelling (for React 18) logged an error every time placing began.
      {...(away ? { inert: true } : {})}
    >
      {/* THE CODEX'S BUTTONS. Each slab is a `PxButton` in the colour it had:
          its face, its old shadow as the bevel, its old lip as the gloss. It
          stands in a CELL that rises into place on arrival (`.rr-toon-in-up`,
          staggered), so the slab's own transform stays free for the press
          squash, the wiggle after it, and the quest pop. These three are THE
          actions, so they wiggle. */}
      {/* DIG: the carrot slab, the one saturated shape on the floor. */}
      <div className="rr-loop-cell rr-toon-in-up" style={enter(0)}>
        <PxButton
          type="button"
          key={`dig:${pulse('dig')}`}
          className={`rr-loop-slab rr-loop-dig rr-ptf-fill${pulse('dig') ? ' rr-tab-pop' : ''}`}
          onClick={onDig}
          aria-label={t.loop.ariaDig(digLine)}
          color={DIG_FACE}
          shadowColor={DIG_SHADOW}
          highlightColor={DIG_LIP}
          textColor="#ffffff"
          wiggle
          style={slab}
        >
          <span style={face}>
            <span style={textCol}>
              {/* The verb keeps its white and gets the slab's own shadow under
                  it; the state line goes to DARK ink. Cream on this orange
                  measured 2:1, and the line is the one that says whether the
                  next run is affordable. */}
              <span style={{ ...verb, textShadow: `0 2px 0 ${DIG_SHADOW}` }}>{t.loop.dig}</span>
              <StateLine parts={digParts} color={DIG_INK} />
            </span>
          </span>
          {pointed === 'dig' && <LeafBadge height={20} className="rr-hub-badge rr-loop-corner" style={badgeSeat}>!</LeafBadge>}
        </PxButton>
        {/* NO GAUGE HERE ANY MORE. The energy medallion hung off this slab's
            left end (the dial board, 2026-09-19) and read as DIG's fuel; it
            is the one tank every loop draws on, so it hangs off the carrot
            pill now, beside the stock (carrot-pill.tsx, 2026-09-21). */}
        {/* The haul, standing on the slab it came from. In the cell, outside
            the slab's box (see `.rr-home-haul`), and transparent to the
            pointer, so it never takes a press meant for DIG. */}
        {broughtHome && (
          <span key={broughtHome.key} className="rr-home-haul" role="status">
            <PxPanel color={GLASS} className="rr-home-haul-plate">
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
              <span>{t.loop.broughtHome}</span>
            </PxPanel>
          </span>
        )}
      </div>

      <span className="rr-toon-in-up" style={{ ...arrow, ...enter(30) }} aria-hidden>▸</span>

      {/* DEFEND — burying traps in the floor you are standing on. It wears the
          garden's green: filled like the other two, with no ring around it. */}
      <div className="rr-loop-cell rr-toon-in-up" style={enter(60)}>
        <PxButton
          type="button"
          key={`home:${pulse('home')}`}
          className={`rr-loop-slab rr-loop-home rr-ptf-fill${pulse('home') ? ' rr-tab-pop' : ''}`}
          onClick={onHome}
          aria-label={t.loop.ariaDefend(homeLine)}
          color={DEF_FACE}
          shadowColor={DEF_SHADOW}
          highlightColor={DEF_LIP}
          textColor="#ffffff"
          wiggle
          style={slab}
        >
          <span style={face}>
            <span style={textCol}>
              {/* DEFEND, not HOME: the three slabs are three VERBS now, like DIG
                  and RAID. "HOME" named the place you were already standing in;
                  what the slab does is open the floor to bury traps. The class
                  and the `home` key keep their name — only the word changed. */}
              {/* The class is how the parchment skin re-inks it: on paper the
                  cream face and its dark drop shadow are both unreadable
                  (px-top-floor.css). */}
              <span className="rr-loop-verb" style={{ ...verb, textShadow: `0 2px 0 ${DEF_SHADOW}` }}>{t.loop.defend}</span>
              {/* The garden with something standing in it is the alarm: what is
                  out there is what a raider can take. */}
              <StateLine
                parts={homeParts}
                color={home.gardenReady > 0 ? DANGER_INK : DEF_INK}
                danger={home.gardenReady > 0}
              />
            </span>
          </span>
          {pointed === 'home' && <LeafBadge height={20} className="rr-hub-badge rr-loop-corner" style={badgeSeat}>!</LeafBadge>}
        </PxButton>
      </div>

      <span className="rr-toon-in-up" style={{ ...arrow, ...enter(90) }} aria-hidden>▸</span>

      {/* RAID — takes what others left outside. The badge is the count of
          doors that will open; the line is the one worth walking to. */}
      <div className="rr-loop-cell rr-toon-in-up" style={enter(120)}>
        <PxButton
          type="button"
          key={`raid:${pulse('raid')}`}
          className={`rr-loop-slab rr-loop-raid rr-ptf-fill${pulse('raid') ? ' rr-tab-pop' : ''}`}
          onClick={onRaid}
          aria-label={t.loop.ariaRaid(raidLine)}
          color={RAID_FACE}
          shadowColor={RAID_SHADOW}
          highlightColor={RAID_LIP}
          textColor="#ffffff"
          wiggle
          style={slab}
        >
          <span style={face}>
            <span style={textCol}>
              {/* The class is how the skull board sizes it on a short screen
                  (px-top-floor.css). The INK is left alone: that board's wood
                  is near-black, so the cream face and its dark shadow are
                  already right — unlike DEFEND, which had to go dark for
                  parchment. */}
              <span className="rr-loop-verb" style={{ ...verb, textShadow: `0 2px 0 ${RAID_SHADOW}` }}>{t.loop.raid}</span>
              {/* GOLD for the burrow worth walking to. The salmon this line used
                  to take is a shade of the face now, and read as nothing. */}
              <StateLine parts={raidParts} color={raid.best ? LAMP : RAID_INK} />
            </span>
          </span>
          {/* RED ONLY FOR NEWS. The quest pointing here is a "!" in red, like
              DIG and HOME. The number of open burrows is a standing count, so it
              takes the quiet chip — a red "20" read as twenty unread things,
              and the target list has nothing marked new to match it. */}
          {pointed === 'raid' ? (
            <LeafBadge height={20} className="rr-hub-badge rr-loop-corner" style={badgeSeat}>!</LeafBadge>
          ) : raid.open > 0 ? (
            <PxPanel color={CHIP} className="rr-raid-chip rr-loop-corner" style={{ ...badge, color: CHIP_INK }}>{raid.open}</PxPanel>
          ) : null}
        </PxButton>
      </div>

      {/* NO CLOSING ARROW after RAID. The loop used to end on a drawn
          circular arrow, meant as "and back to DIG"; in the bottom-right
          corner of a phone it read as a RELOAD button and got tapped as one
          (Paul, 2026-09-21). The two chevrons between the slabs already say
          the order. */}
    </nav>
  );
}

/**
 * A slab's state line: ONE row, and it TRAVELS when it does not fit.
 *
 * It used to wrap to two rows (`-webkit-line-clamp: 2`). That cost every slab
 * a second row of height on a 400px-tall screen, and it still ran out of room
 * when three facts went long — on the Seeker, DEFEND's third fact landed alone
 * against the slab's bevel. One row that travels says all of it and gives the
 * row back (Paul, 2026-09-16: "on economise de la place sur mobile car on en a
 * cruellement besoin").
 *
 * IT ONLY MOVES WHEN IT OVERRUNS. A line that fits sits still: text sliding
 * for no reason is harder to read than text that does not. The overrun is
 * MEASURED, not guessed, and measured again whenever the line changes (the
 * energy count ticks down on its own) or the slab is resized.
 *
 * One SPEED rather than one duration, so a long line does not race a short
 * one, and it rests at both ends — the pauses are where it is actually read.
 *
 * Under `prefers-reduced-motion` it returns to the two-row clamp (see
 * `.rr-loop-line` in globals.css). Cutting the line off for those players to
 * spare them the movement would trade one problem for a worse one: this line
 * is the reason to press the slab.
 */
function StateLine({ parts, color, danger = false }: { parts: string[]; color: string; danger?: boolean }) {
  const box = useRef<HTMLSpanElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  const [over, setOver] = useState(0);
  // The joined text is the measuring trigger: the parts array is rebuilt every
  // render, so depending on it directly would re-run this on every tick.
  const joined = parts.join(' . ');

  useEffect(() => {
    const b = box.current;
    const t = text.current;
    if (!b || !t) return;
    const measure = () => {
      const d = Math.max(0, Math.ceil(t.scrollWidth - b.clientWidth));
      // A pixel of slack: sub-pixel text metrics would otherwise flip this
      // between 0 and 1 forever, and each flip is a re-render.
      setOver((was) => (Math.abs(was - d) > 1 ? d : was));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(b);
    ro.observe(t);
    return () => ro.disconnect();
  }, [joined]);

  return (
    <span
      ref={box}
      /* `danger` is carried as a CLASS as well as a colour: on the parchment
         skin the sheet has to re-ink this line (light paper, dark type) while
         still letting the alarm read as an alarm. A colour alone cannot be
         overridden selectively. */
      className={`rr-loop-line${danger ? ' rr-loop-danger' : ''}`}
      /* The colour twice: as `color`, and as `--rr-line-ink` for the RAID
         board, where the Woodland runtime paints every span in the slab's
         ink with `!important` and an inline colour cannot win. The sheet
         reads the variable back (px-top-floor.css), so the gold of a burrow
         worth walking to still shows there. */
      style={{ ...line, color, ['--rr-line-ink' as string]: color }}
    >
      <span
        ref={text}
        className={over > 0 ? 'rr-loop-line-run' : undefined}
        style={
          over > 0
            ? ({
                ['--rr-scroll' as string]: `${over}px`,
                /* ~26px a second, plus the rests at each end. */
                ['--rr-scroll-ms' as string]: `${1400 + over * 38}ms`,
              } as CSSProperties)
            : undefined
        }
      >
        <Parts parts={parts} />
      </span>
    </span>
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

/** The entrance's stagger, per piece: the whole floor is up in ~0.5s. */
function enter(ms: number): CSSProperties {
  return { ['--rr-toon-delay' as string]: `${ms}ms` } as CSSProperties;
}

/** Size only: the look is `PxButton`'s. The cell gives it its share of the bar. */
const slab: CSSProperties = {
  width: '100%',
  minWidth: 0,
  /* THE FLOOR CAME DOWN 52 -> 44 once the state line stopped taking two rows
     (Paul, 2026-09-16: "on economise de la place sur mobile car on en a
     cruellement besoin"). Dropping a row freed CONTENT height, not screen
     height — the slab's height is set here, so the room came back only when
     this number did. Measured on the Seeker: 27px of content in a 52px slab,
     so 44 (the project's touch floor, and never below it) still leaves 17px of
     air. Only the floor moved, which is why this touches phones alone: at
     768px tall, 10.4svh is already ~80 and the clamp never reaches its floor. */
  /* 48, not 44: at 44 the state line sat 0.6px off the bevel on a 397px
     screen. Paul's floor is 2px of air inside every frame.
     The clamp lives in globals.css as `--rr-loop-h`: the burrow column's
     bottom reserve measures against it, and a height typed twice drifts. */
  height: 'var(--rr-loop-h, clamp(52px, 10.4svh, 80px))',
  padding: 0,
  pointerEvents: 'auto',
};

/**
 * The slab's contents over its face (`.rr-ptf-fill` stretches the kit's
 * content box to the face). The kit's button type is uppercase, bold and
 * tracked; the state lines are the web pixel face in their own case, so this
 * resets all three.
 */
const face: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  /* The one image-to-label gap: the carrot to the verb beside it. */
  gap: 'var(--rr-pad)',
  width: '100%',
  height: '100%',
  /* SIDES ONLY, and this is the one button that cannot take the vertical pad.
     `.rr-ptf-fill` already centres this box optically on the face, and the
     slab is 52px on the Seeker holding a verb over a two-line state line —
     measured at 38.5px of type in a 42px box. Another 12px of vertical pad
     would crop the second line, which is the line that says whether the next
     run is affordable. The air above and below is the centring; the full pad
     each side is the same inset every other surface takes. */
  padding: '0 var(--rr-pad)',
  boxSizing: 'border-box',
  textAlign: 'left',
  textTransform: 'none',
  letterSpacing: 'normal',
  fontWeight: 400,
  whiteSpace: 'normal',
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
 * The state line's TYPE only. One row, never an ellipsis — the row itself, and
 * how it travels when it overruns, is `.rr-loop-line` in globals.css; see
 * `StateLine` above for why it moves at all.
 */
const line: CSSProperties = {
  fontFamily: 'var(--font-pixel), ui-monospace, monospace',
  fontSize: 'clamp(9px, 1.5svh, 11px)',
  lineHeight: 1.25,
};

const arrow: CSSProperties = {
  color: '#f5e6d3',
  fontSize: 18,
  flexShrink: 0,
  textShadow: '0 2px 0 rgba(0,0,0,0.4)',
};

/** A standing number's chip: the badge's shape in dark and cream, not red. */
const CHIP = '#2a1810';
const CHIP_INK = '#fde7bd';

/**
 * WHERE THE ALERT BADGE SITS, and nothing about how it looks.
 *
 * The "!" pointers wear the painted red pill now (leaf-badge.tsx), the same
 * one the story button's NEW wears — they are the same thing, an alert, and
 * they were the kit's flat chip in the same red. `LeafBadge` owns its padding,
 * minimum width and figure size, because that geometry is what keeps the
 * pill's painted ends the right shape; handing it the full `badge` object
 * below would override all three (a spread style wins) and squash the art.
 */
const badgeSeat: CSSProperties = {
  /* The offsets live in the stylesheet: `.rr-loop-corner` (px-top-floor.css)
     reaches back out of the slab's inset content box to the plank's corner,
     and an inline right/top here would beat it. */
  position: 'absolute',
  pointerEvents: 'none',
};

/**
 * The corner badge, as a small pixel panel. Hung off the slab's top-right
 * corner: the content box starts one button-pixel down (`.rr-ptf-fill`), so
 * the offset reaches back up by that much.
 */
const badge: CSSProperties = {
  /* The offsets live in the stylesheet: `.rr-loop-corner` (px-top-floor.css)
     reaches back out of the slab's inset content box to the plank's corner,
     and an inline right/top here would beat it. */
  position: 'absolute',
  minWidth: 22,
  /* The game's chip inset, as on every other badge. */
  padding: '2px var(--rr-pad-tight)',
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#ffffff',
  fontFamily: 'var(--font-pixel), ui-monospace, monospace',
  fontSize: 11,
  lineHeight: 1,
  letterSpacing: 'normal',
  pointerEvents: 'none',
};
