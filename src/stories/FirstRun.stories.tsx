/**
 * THE FIRST RUN, END TO END — the three lessons in the order they are taught.
 *
 *   1. THE NUMBERS. What a clue means, with the eight cells it counts lit.
 *   2. THE RED X. Prove a bomb, arm the mode, mark it, get energy back.
 *   3. THE CHEST. "Now go and get it" — the arrow, the walk, the prize.
 *
 * `FirstNumbers.stories` and `FirstFlag.stories` hold phases 1 and 2 on their
 * own, with every knob turned out for judging one idea at a time. THIS story
 * is the tutorial as a player meets it: one board, one continuous run, no
 * controls in the middle. The two kinds of story answer different questions —
 * "does this idea work?" against "does the sequence hold together?" — and the
 * second cannot be answered by looking at the first two in separate tabs.
 *
 * ## Why this order, and why the chest is last
 *
 * Each phase is the ground the next one stands on. The X lesson is unsayable
 * without the number ("only one tile is left" means nothing if the "1" does
 * not), and the chest is the only one of the three that asks the player to
 * LEAVE the spot they are standing on — which is a thing to ask once they can
 * read the ground they are crossing, not before.
 *
 * The chest is also where the real first island already ends: `run.ts` sets
 * `tutorialDone` on the first island's chest, and `fx/ChestPointer` already
 * plants the arrow over it. Phase 3 is therefore the one phase that is mostly
 * SHIPPED — what this story adds is the sentence that sends the player, at the
 * moment the X has just paid.
 *
 * ## What is real and what is staged
 *
 * Real: `Tile` (hints, highlights, the flag, the chest and its glow),
 * `PlayerRabbit`, `MarkBombButton`, `ChestPointer`, FLAG and ENERGY from
 * tuning. Staged: the server, and the board — dealt by hand in
 * `first-lesson/board.ts`.
 */
import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import gsap from 'gsap';
import { PixiStage } from './PixiStage';
import { MarkBombButton } from '@/components/mark-bomb-button';
import { ChestPointer } from '@/game/fx/ChestPointer';
import { loadAllAssets } from '@/game/services/AssetLoader';
import { ENERGY, FLAG } from '@config/tuning';
import { BOMB, CHEST, CLUE_RING, DUG, STAGE } from './first-lesson/board';
import { buildLessonBoard } from './first-lesson/stage';
import { LessonCaption, LessonFrame, LessonReadout } from './first-lesson/chrome';

/**
 * The run's beats, in teaching order.
 *
 * One flat list rather than three nested state machines: the whole point of
 * this story is that the tutorial is ONE arc, and a player never sees a seam
 * between "the numbers lesson" and "the X lesson".
 */
type Beat =
  /** PHASE 1 — the clue is explained, its eight cells lit. */
  | 'count'
  /** PHASE 2 — the bomb is proven and pulsing; the button is the next move. */
  | 'prove'
  /** PHASE 2 — armed: the caption now points at the tile. */
  | 'aim'
  /** PHASE 2 — the X landed and paid. */
  | 'paid'
  /** PHASE 3 — the arrow is up: go and get the box. */
  | 'fetch'
  /** PHASE 3 — the chest is open. The run is over and the recap would follow. */
  | 'done';

/** Which phase a beat belongs to — for the readout, so the arc is legible. */
const PHASE: Record<Beat, string> = {
  count: '1 · NUMBERS',
  prove: '2 · RED X',
  aim: '2 · RED X',
  paid: '2 · RED X',
  fetch: '3 · CHEST',
  done: '3 · CHEST',
};

interface Args {
  /** Draw the island art under the board. */
  background: boolean;
  /**
   * The safety net: during a taught moment, a wrong tap is refused rather than
   * billed. The first X in a player's life cannot be a loss.
   */
  net: boolean;
  /** Seconds per pulse, shared by the proven tile and the button. */
  pulseSeconds: number;
  /**
   * Energy the run opens on.
   *
   * NOT a full bar. At ENERGY.START the taught X pays +0 energy and 4 carrots
   * — right by FLAG.OVERFLOW_CARROTS, and useless as a lesson, because the bar
   * does not move at the one moment the player is told to watch it. On the
   * real island the fix is a few tiles of walking before the lesson; here it
   * is simply where the bar starts. See FirstFlag's `FullBar`.
   */
  energy: number;
}

/** What the taught X pays back. Meadow's rate — the first island's tier. */
const MEADOW_X_GAIN = 3;
/** What the tutorial's chest is worth, in carrots. Generous on purpose: the
 *  first recap should show a haul (FIRST_RUN.CARROT_DENSITY says the same). */
const CHEST_CARROTS = 40;

function Scene({ background, net, pulseSeconds, energy }: Args) {
  const [armed, setArmed] = useState(false);
  const [beat, setBeat] = useState<Beat>('count');
  const [left, setLeft] = useState(energy);
  const [carrots, setCarrots] = useState(0);
  const [saved, setSaved] = useState(0);

  const onToggle = useCallback((on: boolean) => {
    setArmed(on);
    // Arming only means something during phase 2. Before, the number lesson
    // owns the board; after, the X is done and the button is ordinary again.
    setBeat((b) => (b === 'prove' && on ? 'aim' : b === 'aim' && !on ? 'prove' : b));
  }, []);

  useEffect(() => { sceneRef.current?.setArmed(armed); }, [armed]);
  useEffect(() => { sceneRef.current?.setBeat(beat); }, [beat]);

  return (
    <LessonFrame>
      <PixiStage
        width={STAGE.width}
        height={STAGE.height}
        background="#1eaac4"
        prepare={() => loadAllAssets()}
        setup={(stage, app) => {
          const scene = buildLessonBoard(stage, app, { background, chest: true });
          const { tiles, rabbit, board } = scene;

          /* ── Phase 1's gold ring ──────────────────────────────────────── */
          const litRing = (on: boolean) => {
            for (const index of CLUE_RING) tiles.get(index)?.setHighlight(on, false);
          };

          /* ── Phase 2's pulse ──────────────────────────────────────────── */
          const bombTile = tiles.get(BOMB);
          let breath: gsap.core.Tween | null = null;
          const setPulse = (on: boolean) => {
            breath?.kill();
            breath = null;
            if (!on || !bombTile) {
              bombTile?.setHighlight(false);
              bombTile?.setUnknownMark(false);
              return;
            }
            bombTile.setHighlight(true, true);
            bombTile.setUnknownMark(true);
            const tick = () => {
              bombTile.blink();
              breath = gsap.delayedCall(pulseSeconds, tick) as unknown as gsap.core.Tween;
            };
            tick();
          };

          /* ── Phase 3's arrow ──────────────────────────────────────────── */
          let pointer: ChestPointer | null = null;
          const setArrow = (on: boolean) => {
            if (on && !pointer) pointer = new ChestPointer(board, 'first-lesson', CHEST);
            if (!on && pointer) { pointer.destroy(); pointer = null; }
          };

          /**
           * THE HANDOVER BETWEEN PHASES, in one place.
           *
           * Each beat owns the board completely: exactly one thing is asking
           * to be looked at. Two overlapping invitations — a gold ring still
           * up while a red tile pulses — is how the shipped caption already
           * fails, and it would be worse here where three lessons run back to
           * back.
           */
          const dress = (b: Beat) => {
            litRing(b === 'count');
            if (b === 'prove' || b === 'aim') setPulse(true); else setPulse(false);
            setArrow(b === 'fetch');
          };

          sceneRef.current = {
            setBeat: dress,
            setArmed: (on) => {
              // During phase 2 exactly one tile is a legal answer, so exactly
              // one is lit. The ordinary ring — every markable tile red —
              // would bury the proven one among five identical diamonds.
              const teaching = beatRef.current === 'prove' || beatRef.current === 'aim';
              for (const [index, tile] of tiles) {
                if (DUG.includes(index)) continue;
                if (teaching && index !== BOMB) { tile.setHighlight(false); continue; }
                if (teaching && index === BOMB) continue; // the pulse owns it
                tile.setHighlight(on, true);
              }
            },
          };

          dress('count');

          for (const [index, tile] of tiles) {
            tile.onPress(() => {
              const phase = beatRef.current;
              const isArmed = armedRef.current;

              /* ── PHASE 1: read, then move on ──────────────────────────── */
              // Nothing is dug and nothing is spent: a player tapping around
              // while they read cannot blow themselves up on the tile phase 2
              // is about to point at.
              if (phase === 'count') { setBeatRef.current('prove'); return; }

              const teaching = phase === 'prove' || phase === 'aim';

              /* ── PHASE 2: the X ───────────────────────────────────────── */
              if (isArmed) {
                if (index === BOMB) {
                  tile.setUnknownMark(false);
                  tile.setFlag(true);
                  setArmedRef.current(false);
                  setLeftRef.current((e) => {
                    const room = ENERGY.MAX - e;
                    const gained = Math.min(room, MEADOW_X_GAIN);
                    setCarrotsRef.current((c) => c + FLAG.CARROTS_BASE
                      + (MEADOW_X_GAIN - gained) * FLAG.OVERFLOW_CARROTS);
                    return e + gained;
                  });
                  setBeatRef.current('paid');
                  // THE HANDOVER TO PHASE 3. A beat on the reward before the
                  // next ask: "+3 energy" has to be read as a result, not as
                  // the preamble to an errand. The arrow goes up after it.
                  gsap.delayedCall(2.2, () => {
                    if (beatRef.current === 'paid') setBeatRef.current('fetch');
                  });
                  return;
                }
                if (teaching && net) { tile.deny(); setSavedRef.current((n) => n + 1); return; }
                tile.deny();
                setArmedRef.current(false);
                setLeftRef.current((e) => Math.max(0, e - FLAG.LOSS));
                return;
              }

              // Walking onto the proven bomb is the failure the taught moment
              // exists to prevent, so the net catches it too.
              if (teaching && net && index === BOMB) {
                tile.deny();
                setSavedRef.current((n) => n + 1);
                return;
              }

              /* ── PHASE 3: the walk, and the box ───────────────────────── */
              if (index === CHEST && (phase === 'fetch' || phase === 'paid')) {
                tile.clearChest(true);
                setArrow(false);
                tile.revealContent('empty', 0, true);
                setLeftRef.current((e) => Math.max(0, e - ENERGY.DIG_COST));
                setCarrotsRef.current((c) => c + CHEST_CARROTS);
                rabbit.moveTo(index);
                setBeatRef.current('done');
                return;
              }

              /* ── An ordinary step ─────────────────────────────────────── */
              if (!tile.revealed) {
                tile.flash();
                tile.revealContent(index === BOMB ? 'bomb' : 'empty', 0, true);
                setLeftRef.current((e) => Math.max(0, e - ENERGY.DIG_COST));
                if (index === BOMB) setLeftRef.current((e) => Math.max(0, e - ENERGY.BOMB_LOSS));
              }
              rabbit.moveTo(index);
            });
          }

          return () => {
            breath?.kill();
            pointer?.destroy();
            sceneRef.current = null;
            scene.destroy();
          };
        }}
      />

      {/* ONE LINE AT A TIME, and every one of them under fourteen words —
          the island strip's own rule (config/first-run.ts). The arc is:
          what a number is → what it proves → what to do about it → what it
          paid → where to go now → what you got. */}
      <LessonCaption
        text={
          beat === 'count'
            ? 'This 1 means: one bomb hides in the 8 tiles around it. Tap to go on.'
            : beat === 'prove'
              ? 'Seven are already dug. So the bomb is the last one — press MARK A BOMB.'
              : beat === 'aim'
                ? 'Now tap the tile that is pulsing.'
                : beat === 'paid'
                  ? `Right! +${MEADOW_X_GAIN} energy. That is how you dig further.`
                  : beat === 'fetch'
                    ? 'Now go and take the chest. Whatever it holds goes home with you.'
                    : `+${CHEST_CARROTS} carrots. They are waiting at your burrow.`
        }
      />

      <div
        style={buttonHost}
        className={`rr-run-story${beat === 'prove' && !armed ? ' rr-teach-pulse' : ''}`}
      >
        <MarkBombButton armed={armed} onToggle={onToggle} />
      </div>

      <LessonReadout energy={left} carrots={carrots} beat={PHASE[beat]} caught={saved} />

      <Bridge
        armed={armed}
        beat={beat}
        setArmed={setArmed}
        setBeat={setBeat}
        setLeft={setLeft}
        setCarrots={setCarrots}
        setSaved={setSaved}
      />
      <style>{RUN_CSS(pulseSeconds)}</style>
    </LessonFrame>
  );
}

/**
 * The Pixi scene is built ONCE, so its tap handler would close over the first
 * render's state and setters forever. These refs are what it reads and calls
 * instead, written on every render by `Bridge`.
 */
const armedRef = { current: false };
const beatRef = { current: 'count' as Beat };
const sceneRef: {
  current: { setArmed(on: boolean): void; setBeat(b: Beat): void } | null;
} = { current: null };
const setArmedRef = { current: ((_on: boolean) => {}) as (on: boolean) => void };
const setBeatRef = { current: ((_b: Beat) => {}) as (b: Beat) => void };
const setLeftRef = {
  current: ((_f: (e: number) => number) => {}) as (f: (e: number) => number) => void,
};
const setCarrotsRef = {
  current: ((_f: (c: number) => number) => {}) as (f: (c: number) => number) => void,
};
const setSavedRef = {
  current: ((_f: (n: number) => number) => {}) as (f: (n: number) => number) => void,
};

function Bridge({ armed, beat, setArmed, setBeat, setLeft, setCarrots, setSaved }: {
  armed: boolean;
  beat: Beat;
  setArmed: (on: boolean) => void;
  setBeat: (b: Beat) => void;
  setLeft: (f: (e: number) => number) => void;
  setCarrots: (f: (c: number) => number) => void;
  setSaved: (f: (n: number) => number) => void;
}) {
  armedRef.current = armed;
  beatRef.current = beat;
  setArmedRef.current = setArmed;
  setBeatRef.current = setBeat;
  setLeftRef.current = setLeft;
  setCarrotsRef.current = setCarrots;
  setSavedRef.current = setSaved;
  return null;
}

/** The button's breath, and the story's own placement for it — see FirstFlag. */
const RUN_CSS = (seconds: number) => `
/* !important because PxButton writes position:fixed as an INLINE style, which
   beats any selector however specific. In the app that fixed position is the
   phone's corner; here it has to be the game's frame. */
.rr-run-story .rr-mark-btn.rr-mark-btn {
  position: absolute !important;
  right: 16px !important;
  bottom: 16px !important;
  left: auto !important;
  top: auto !important;
}
.rr-run-story .rr-mark-hint.rr-mark-hint {
  position: absolute !important;
  right: 16px !important;
  bottom: 76px !important;
  left: auto !important;
  top: auto !important;
}
.rr-teach-pulse .rr-mark-btn {
  animation: rr-teach-beat ${seconds}s steps(1, end) infinite;
}
@keyframes rr-teach-beat {
  0%, 60% { transform: translateY(0); filter: none; }
  30% { transform: translateY(-4px); filter: brightness(1.5); }
}
@media (prefers-reduced-motion: reduce) {
  .rr-teach-pulse .rr-mark-btn { animation: none; }
}
`;

const buttonHost: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  ['--rr-back-h' as string]: '52px',
  ['--rr-pad' as string]: '12px',
  ['--rr-btn-pad' as string]: '8px 14px',
};

const meta: Meta<Args> = {
  title: 'First run/0 Whole run',
  render: (args) => <Scene key={JSON.stringify(args)} {...args} />,
  parameters: { layout: 'fullscreen' },
  args: {
    background: true,
    net: true,
    pulseSeconds: 0.9,
    energy: 80,
  },
  argTypes: {
    pulseSeconds: { control: { type: 'range', min: 0.3, max: 2, step: 0.1 } },
    energy: { control: { type: 'range', min: 0, max: ENERGY.MAX, step: 5 } },
  },
};
export default meta;

type Story = StoryObj<Args>;

/**
 * THE WHOLE TUTORIAL. Play it start to finish:
 *
 *  1. Read the number. Tap anywhere.
 *  2. Press MARK A BOMB, then tap the pulsing tile.
 *  3. Follow the arrow and tap the chest.
 *
 * What to judge — and this is what the two single-phase stories cannot show:
 *  · Does it feel like ONE run, or like three exercises back to back?
 *  · The seams: the gold ring going out as the red pulse comes up, and the
 *    arrow arriving two seconds after the X pays. Too fast? Too slow?
 *  · Is "+3 energy" read as a reward before "go and take the chest" asks for
 *    something new, or do the two lines tread on each other?
 *  · By the chest, is the player still being taught, or playing?
 */
export const Playable: Story = {};

/**
 * NO NET — the same run with nothing forgiven.
 *
 * A wrong X costs 15 and a wrong step onto the proven bomb costs 30 plus the
 * stun. Worth playing once, badly and on purpose, to see what the tutorial
 * feels like for a player who does not follow it.
 */
export const NoNet: Story = { args: { net: false } };

/**
 * OPENING ON A FULL BAR — the case the real run actually deals.
 *
 * A run starts at ENERGY.START, which is the ceiling, so the taught X pays no
 * energy at all: the caption says "+3 energy" while the bar sits at 100/100
 * and the overflow quietly becomes carrots (FLAG.OVERFLOW_CARROTS).
 *
 * This is the single strongest argument for making the player WALK a few
 * tiles before the X lesson on the real first island.
 */
export const FullBar: Story = { args: { energy: ENERGY.START } };
