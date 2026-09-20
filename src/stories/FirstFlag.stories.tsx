/**
 * PHASE 2 — WHAT THE RED X DOES.
 *
 * The second of the two lessons the first island has to teach. Phase 1 is the
 * numbers (`FirstNumbers.stories`), and this one is built on it: "mark the
 * bomb" means nothing to a player who cannot read the clue that proves where
 * it is. Both phases stand on the same hand-dealt board
 * (`first-lesson/board.ts`), so they can be judged as one tutorial.
 *
 * ## Why this phase is harder than phase 1
 *
 * Every other rule of the run is learned by accident. You walk, you step on a
 * bomb, the caption names what just happened. The X cannot be learned that
 * way: nobody arms a mode at random, so it is the one mechanic that has to be
 * PROVOKED. Today it is provoked by a sentence — "Sure where a bomb is? Press
 * the red X" — which asks the player to make five jumps at once: notice the
 * button, understand that it ARMS instead of acting, look away from it at the
 * board, know WHICH tile, and accept that a wrong guess costs 15.
 *
 * The button has already been redrawn once for this (mark-bomb-button.tsx
 * quotes Paul on 2026-09-17: "il n'y a pas de bouton pour se mettre en mode X
 * rouge" — it was on screen). Redrawing it again would not help, because the
 * failure is not legibility. It is that a two-step gesture is taught in one
 * step, with nothing tying the button to the board.
 *
 * ## What is under test
 *
 *  1. THE PULSE. The proven tile beats red on the board and the button beats
 *     in time with it. Two objects on the same rhythm is what ties the corner
 *     of the screen to a cell in the middle of it; no sentence does that work.
 *  2. THE TWO-BEAT CAPTION. The line follows `armed`, because the gesture has
 *     two beats: "that tile is a bomb" points at the BUTTON, and once armed
 *     "now tap it" points at the TILE.
 *  3. THE NET. During the taught moment a wrong tap is REFUSED rather than
 *     billed. The first X in a player's life cannot be a loss. The second one
 *     can, and that is `Unguided`.
 *
 * ## What is real and what is staged
 *
 * Real: `Tile` (its flag, its "?", its deny), `MarkBombButton` (the shipped
 * component, its armed face and its keyboard X), FLAG and ENERGY from tuning.
 * Staged: the server, and the board.
 */
import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import gsap from 'gsap';
import { PixiStage } from './PixiStage';
import { MarkBombButton } from '@/components/mark-bomb-button';
import { loadAllAssets } from '@/game/services/AssetLoader';
import { ENERGY, FLAG } from '@config/tuning';
import { BOMB, DUG, STAGE } from './first-lesson/board';
import { buildLessonBoard } from './first-lesson/stage';
import { LessonCaption, LessonFrame, LessonReadout } from './first-lesson/chrome';

/** The phase's beats. */
type Beat =
  /** The proven tile is pulsing; the player has not armed yet. */
  | 'prove'
  /** Armed: the caption now points at the tile. */
  | 'aim'
  /** The X landed. Energy came back. */
  | 'paid'
  /** Free play — the net is off and the ring is ordinary. */
  | 'free';

interface Args {
  /** Draw the island art under the board. Off to judge the pulse's contrast. */
  background: boolean;
  /**
   * THE NET: during the taught moment, a tap on any tile but the proven one is
   * refused instead of billed.
   *
   * Turn it off to feel what shipping without it costs: the first X a player
   * ever places can be −15 and a reset streak, which teaches that reading the
   * board is dangerous — the exact opposite of the lesson.
   */
  net: boolean;
  /** The red pulse on the proven tile, and the button beating with it. */
  pulse: boolean;
  /** The caption that follows `armed` — off to read the shipped single line. */
  twoBeat: boolean;
  /** Seconds per pulse. The button and the tile share it. */
  pulseSeconds: number;
  /** Energy the run opens on. */
  energy: number;
}

/** What the taught X pays back. Meadow's rate — the first island's tier. */
const MEADOW_X_GAIN = 3;

function Scene({ background, net, pulse, twoBeat, pulseSeconds, energy }: Args) {
  const [armed, setArmed] = useState(false);
  const [beat, setBeat] = useState<Beat>('prove');
  const [left, setLeft] = useState(energy);
  const [carrots, setCarrots] = useState(0);
  /** Wrong taps the net caught — the number that says whether it was needed. */
  const [saved, setSaved] = useState(0);

  /**
   * Arming moves the beat, and only forward: once the X is placed, arming
   * again is ordinary play and must not drag the caption back to the lesson.
   */
  const onToggle = useCallback((on: boolean) => {
    setArmed(on);
    setBeat((b) => (b === 'prove' && on ? 'aim' : b === 'aim' && !on ? 'prove' : b));
  }, []);

  /** Told to the scene whenever the mode flips, so the ring can follow. */
  useEffect(() => { sceneRef.current?.setArmed(armed); }, [armed]);

  const taught = beat === 'prove' || beat === 'aim';

  return (
    <LessonFrame>
      <PixiStage
        width={STAGE.width}
        height={STAGE.height}
        background="#1eaac4"
        prepare={() => loadAllAssets()}
        setup={(stage, app) => {
          const scene = buildLessonBoard(stage, app, { background });
          const { tiles, rabbit } = scene;

          /* THE PULSE. The proven tile breathes red, and the button breathes
           * with it (`.rr-mark-btn` picks up the same keyframes below). This is
           * the one thing that ties the corner of the screen to a cell in the
           * middle of it. */
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
            // The board's OWN "?" — the mark it already puts on a tile the ring
            // offers but nobody has read (`Tile.setUnknownMark`). On the proven
            // tile it is the thing the other red diamonds do not have, so the
            // lesson survives arming.
            bombTile.setUnknownMark(true);
            // Driven by `blink`, the tile's own one-shot flash re-tinted red by
            // `setHighlight(_, risky)` — the same picture the ring paints when
            // X mode is armed, so the pulse cannot drift from what ships.
            const tick = () => {
              bombTile.blink();
              breath = gsap.delayedCall(pulseSeconds, tick) as unknown as gsap.core.Tween;
            };
            tick();
          };

          sceneRef.current = {
            setArmed: (on) => {
              /**
               * DURING THE LESSON THE RING STAYS DARK — everything but the
               * proven tile.
               *
               * Lighting the whole ring is right in a real run and wrong here,
               * and the story is what showed it: armed, six identical red
               * diamonds appeared and the "?" on the proven one stopped being
               * findable, while the caption said "tap the tile that is
               * pulsing". The taught moment has exactly one correct answer, so
               * it lights exactly one tile. The ordinary ring comes back once
               * the lesson is over, which is `Unguided`.
               */
              const teaching = pulse && (beatRef.current === 'prove' || beatRef.current === 'aim');
              for (const [index, tile] of tiles) {
                if (DUG.includes(index)) continue;
                if (teaching && index !== BOMB) { tile.setHighlight(false); continue; }
                tile.setHighlight(on, true);
              }
              if (pulse) setPulse(true);
            },
          };

          if (pulse) setPulse(true);

          for (const [index, tile] of tiles) {
            // `onPress` is the shipped hook (a `pointerdown` on the tile's own
            // fog sprite) and the only one that actually fires: a listener on
            // the CONTAINER never sees the press, because the fog is what
            // carries the hit area. The real scene binds here too.
            tile.onPress(() => {
              const isArmed = armedRef.current;
              const phase = beatRef.current;
              const teaching = phase === 'prove' || phase === 'aim';

              /* ── An X ─────────────────────────────────────────────────── */
              if (isArmed) {
                if (index === BOMB) {
                  tile.setUnknownMark(false);
                  tile.setFlag(true);
                  setPulse(false);
                  sceneRef.current?.setArmed(false);
                  setArmedRef.current(false);
                  setBeatRef.current('paid');
                  // Right: energy back, capped, and the overflow paid as
                  // carrots — FLAG.OVERFLOW_CARROTS, the rule that makes a
                  // right X always pay something even on a full bar.
                  setLeftRef.current((e) => {
                    const room = ENERGY.MAX - e;
                    const gained = Math.min(room, MEADOW_X_GAIN);
                    setCarrotsRef.current((c) => c + FLAG.CARROTS_BASE
                      + (MEADOW_X_GAIN - gained) * FLAG.OVERFLOW_CARROTS);
                    return e + gained;
                  });
                  return;
                }
                // Wrong tile. THE NET: during the lesson this is refused, not
                // billed. Outside it, it costs what it costs.
                if (teaching && net) {
                  tile.deny();
                  setSavedRef.current((n) => n + 1);
                  return;
                }
                tile.deny();
                setArmedRef.current(false);
                sceneRef.current?.setArmed(false);
                setLeftRef.current((e) => Math.max(0, e - FLAG.LOSS));
                return;
              }

              /* ── A step ───────────────────────────────────────────────── */
              // Stepping on the proven bomb during the lesson is the failure
              // the whole moment exists to prevent, so the net catches it too:
              // the tile refuses and keeps pulsing. Not a punishment — the
              // board saying "that one, but not like that".
              if (teaching && net && index === BOMB) {
                tile.deny();
                setSavedRef.current((n) => n + 1);
                return;
              }
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
            sceneRef.current = null;
            scene.destroy();
          };
        }}
      />

      {/* THE CAPTION. Two beats when `twoBeat` is on: the first points at the
          button, the second at the tile. Every line is under twelve words,
          which is the strip's own rule (config/first-run.ts). */}
      <LessonCaption
        text={!twoBeat
          ? 'Sure where a bomb is? Press the red X and mark it: energy back.'
          : beat === 'prove'
            ? 'Seven are already dug. So the bomb is the last one — press MARK A BOMB.'
            : beat === 'aim'
              ? 'Now tap the tile that is pulsing.'
              : beat === 'paid'
                ? `Right! +${MEADOW_X_GAIN} energy. That is how you dig further.`
                : 'Read a bomb, mark it, dig on.'}
      />

      {/* The shipped button, in a host that pins it to the game's frame. */}
      <div
        style={buttonHost}
        className={`rr-flag-story${pulse && taught && !armed ? ' rr-teach-pulse' : ''}`}
      >
        <MarkBombButton armed={armed} onToggle={onToggle} />
      </div>

      <LessonReadout energy={left} carrots={carrots} beat={beat} caught={saved} />

      <Bridge
        armed={armed}
        beat={beat}
        setArmed={setArmed}
        setBeat={setBeat}
        setLeft={setLeft}
        setCarrots={setCarrots}
        setSaved={setSaved}
      />
      <style>{PULSE_CSS(pulseSeconds)}</style>
    </LessonFrame>
  );
}

/**
 * The Pixi scene is built ONCE, so its tap handler would close over the first
 * render's state and setters forever. These refs are what it reads and calls
 * instead, written on every render by `Bridge`.
 */
const armedRef = { current: false };
const beatRef = { current: 'prove' as Beat };
const sceneRef: { current: { setArmed(on: boolean): void } | null } = { current: null };
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

/**
 * The button's breath, on the tile's clock — and the story's own placement.
 *
 * `.rr-mark-btn` ships as `position: fixed` with `right`/`bottom` written in
 * `max(var(--rr-pad), env(safe-area-inset-right))`. In the app that is the
 * phone's corner; in a story frame the `env()` half resolves against the
 * BROWSER, and the button landed in the top-left over the caption whatever
 * containing block it was given. So the story pins it to the game's frame
 * itself, which is the placement the app gets from its own layout.
 */
const PULSE_CSS = (seconds: number) => `
/* !important because PxButton writes position:fixed as an INLINE style, which
   beats any selector however specific. In the app that fixed position is the
   phone's corner; here it has to be the game's frame. */
.rr-flag-story .rr-mark-btn.rr-mark-btn {
  position: absolute !important;
  right: 16px !important;
  bottom: 16px !important;
  left: auto !important;
  top: auto !important;
}
.rr-flag-story .rr-mark-hint.rr-mark-hint {
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
  title: 'First run/2 Red X',
  render: (args) => <Scene key={JSON.stringify(args)} {...args} />,
  parameters: { layout: 'fullscreen' },
  args: {
    background: true,
    net: true,
    pulse: true,
    twoBeat: true,
    pulseSeconds: 0.9,
    // NOT a full bar, and this is a finding rather than a convenience. At
    // ENERGY.START the taught X pays +0 energy and 4 carrots — right, by
    // FLAG.OVERFLOW_CARROTS, and useless as a lesson: the bar does not move at
    // the one moment the player is told to watch it. See `FullBar`.
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
 * THE PROPOSAL, whole. Press MARK A BOMB (or the X key), then tap the pulsing
 * tile.
 *
 * What to judge, in order:
 *  · Before arming — do the tile and the button read as ONE thing?
 *  · The caption's first line points at the button, the second at the tile.
 *    Is the handover clear, or does the second line arrive too late?
 *  · Tap a wrong tile while armed. The net refuses it. Does the refusal read
 *    as "not that one" or as "the game is broken"?
 */
export const Taught: Story = {};

/**
 * THE SHIPPED VERSION, for comparison: one caption, no pulse, no net.
 *
 * Same board — already more help than the real first island gives, since here
 * the deduction is forced. Even so: nothing says the button is a mode, nothing
 * points at a tile, and a wrong tap costs 15. The baseline to beat.
 */
export const Shipped: Story = { args: { pulse: false, twoBeat: false, net: false } };

/**
 * The pulse alone, without the two-beat caption.
 *
 * Is the pulse doing the work by itself? If the moment reads here, the caption
 * can stay one line and the whole change is art rather than copy.
 */
export const PulseOnly: Story = { args: { twoBeat: false } };

/**
 * The caption alone, without the pulse.
 *
 * The mirror: words pointing at a button and then at "the tile that is
 * pulsing" — which is nothing, here. If this reads worse than `PulseOnly`, the
 * pulse is the load-bearing half.
 */
export const CaptionOnly: Story = { args: { pulse: false } };

/**
 * NO NET. Arm, tap the wrong tile, and watch −15 land on a player who has been
 * playing for ninety seconds.
 *
 * The story to look at before deciding the net is over-careful. The streak is
 * not modelled here; on the real board that tap also resets it.
 */
export const NoNet: Story = { args: { net: false } };

/**
 * THE SECOND X — the one that has to be earned.
 *
 * No pulse, no net, no caption to lean on. The proposal is that the first
 * island deals this shape TWICE, and that the second time nothing is
 * highlighted. If a player who has just been walked through `Taught` can place
 * this one unaided, the teaching worked; if they cannot, the pulse taught
 * obedience rather than reading.
 */
export const Unguided: Story = { args: { pulse: false, twoBeat: false, net: false } };

/**
 * THE FULL-BAR PROBLEM — found by driving this story, not by reading the code.
 *
 * The run opens at ENERGY.START, which IS the ceiling. So the first X a player
 * ever places has no room to pay: `+3` becomes `+0 energy, +4 carrots` by
 * FLAG.OVERFLOW_CARROTS. The rule is right — a right X always pays something —
 * but as a LESSON it fails, because the caption says "energy back" while the
 * bar visibly does not move.
 *
 * The GDD already knows the shape of this ("the first X of every run is placed
 * on a full bar — the game's central reward, invisible at the moment it is
 * taught") and answers it for a READER mid-run. It does not answer it for the
 * one X that is supposed to teach the mechanic.
 *
 * Watch the readout: ENERGY stays 100/100, CARROTS jumps. Compare with
 * `Taught`, which opens at 80 and shows the bar climb.
 *
 * The fix is not in this story: the first island has to bring the player to
 * the taught bomb with the bar already spent a little — a few tiles of walking
 * before the lesson, which the current layout (bomb at two steps) does not do.
 */
export const FullBar: Story = { args: { energy: ENERGY.START } };
