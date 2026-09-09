'use client';

/**
 * The banked carrots, top-right on the burrow screen.
 *
 * A stack rather than a line: the number is the thing, and "carrots" underneath
 * only says what it counts. That is why the figure is big and the label is
 * small — a counter you glance at should be readable without being read.
 *
 * When a harvest lands, a "+N" rises off the right-hand side and fades. It is
 * deliberately the SMALL, quiet half of the feedback: the number itself pops
 * (see .rr-carrots-n.banked), and the gain says how much it popped BY. Both at
 * full volume would be two things shouting the same fact.
 *
 * The gain is absolutely positioned so it cannot widen the bar mid-flight — a
 * layout that reflows while the number is changing reads as a bug, not a
 * reward.
 */
import { useEffect, useRef, useState } from 'react';
import { CARROT_URL, CARROT_SIZE } from '@domin8/arcade-kit/game';
import { CarrotBurst } from '@/components/carrot-burst';

export interface CarrotCounterProps {
  /** Carrots banked, as the server has them. */
  stock: number;
  /**
   * Bumped once per harvest. Drives both the number's pop and the rising gain,
   * so a second harvest replays the animation rather than being swallowed
   * because the amount happened to match the last one.
   */
  fireKey: number;
  /** How many carrots just landed. */
  gain: number;
}

/** Short: the gain is an acknowledgement, not a cutscene. Matches rr-gain. */
const GAIN_MS = 520;

/**
 * How long the figure takes to climb to its new value. Kept just under the
 * gain's own life so the "+31" is still on screen while the number chases it —
 * the two halves of the same event should overlap, not queue.
 */
const ROLL_MS = 420;

/**
 * Count from one value to another over ROLL_MS.
 *
 * A total that jumps 100 -> 130 is a value someone assigned; one that RUNS up
 * to 130 is carrots arriving, and it is the difference between reading a number
 * and watching it happen.
 *
 * Driven by rAF against a real clock rather than by a per-step interval: the
 * roll then takes the same time on any device and simply draws fewer frames on
 * a slow one, instead of running long.
 */
function useRollingNumber(target: number, ms: number): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const start = from.current;
    const delta = target - start;
    // Only a GAIN rolls. A total that fell (a raid took carrots) should land at
    // once: animating a loss dwells on it, and the player did not choose it.
    if (delta <= 0) {
      from.current = target;
      setShown(target);
      return;
    }

    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      // Eases out, so it sprints and settles rather than crawling to the end.
      const eased = 1 - (1 - p) * (1 - p);
      setShown(Math.round(start + delta * eased));
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf.current = requestAnimationFrame(tick);

    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      // Whatever happens, the figure must end up telling the truth.
      from.current = target;
    };
  }, [target, ms]);

  return shown;
}

/**
 * The game's own carrot rather than the 🥕 emoji — the reward on this screen
 * should be the same object the player digs out of the ground, and an emoji is
 * whatever font the device happens to ship.
 *
 * Sized by HEIGHT against the text it sits beside: the sprite is tall and
 * narrow (13x29), so drawing it at its native size next to a 10px label made a
 * carrot three times the height of the word it belongs to.
 */
function Carrot({ height }: { height: number }) {
  // Width follows from the sprite's own aspect, so it is never squashed.
  const width = Math.round((CARROT_SIZE.width / CARROT_SIZE.height) * height);
  return (
    <img
      className="rr-carrot-px"
      src={CARROT_URL}
      alt=""
      aria-hidden
      draggable={false}
      width={width}
      height={height}
    />
  );
}

export function CarrotCounter({ stock, fireKey, gain }: CarrotCounterProps) {
  const [showGain, setShowGain] = useState(false);
  const shown = useRollingNumber(stock, ROLL_MS);

  useEffect(() => {
    // fireKey 0 is the first render: nothing has been harvested yet.
    if (!fireKey || gain <= 0) return;
    setShowGain(true);
    const t = setTimeout(() => setShowGain(false), GAIN_MS);
    return () => clearTimeout(t);
  }, [fireKey, gain]);

  return (
    <span className="rr-carrots" title={`${stock} carrots banked`}>
      {/* Carrots fly up behind the figure as it climbs — the loot arriving,
          with the rolling number as its result. */}
      <CarrotBurst fireKey={fireKey} amount={gain} />
      <span key={fireKey} className={`rr-carrots-n${fireKey ? ' banked' : ''}`}>
        {shown}
      </span>
      <span className="rr-carrots-label">
        <Carrot height={14} />
        carrots
      </span>
      {showGain && (
        // Re-keyed per harvest so the CSS animation restarts; without the key
        // a second gain during the first one's flight would not replay.
        <span key={`gain-${fireKey}`} className="rr-carrots-gain" aria-hidden>
          +{gain}
          <Carrot height={18} />
        </span>
      )}
    </span>
  );
}
