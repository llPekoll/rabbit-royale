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
import { useEffect, useState } from 'react';
import { CARROT_URL, CARROT_SIZE } from '@domin8/arcade-kit/game';

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
 * The carrot at 1x, drawn from the game's own sprite rather than the 🥕 emoji —
 * the reward on this screen should be the same object the player digs out of
 * the ground, and an emoji is whatever font the device happens to ship.
 */
function Carrot({ scale = 1 }: { scale?: number }) {
  return (
    <img
      className="rr-carrot-px"
      src={CARROT_URL}
      alt=""
      aria-hidden
      draggable={false}
      width={CARROT_SIZE.width * scale}
      height={CARROT_SIZE.height * scale}
    />
  );
}

export function CarrotCounter({ stock, fireKey, gain }: CarrotCounterProps) {
  const [showGain, setShowGain] = useState(false);

  useEffect(() => {
    // fireKey 0 is the first render: nothing has been harvested yet.
    if (!fireKey || gain <= 0) return;
    setShowGain(true);
    const t = setTimeout(() => setShowGain(false), GAIN_MS);
    return () => clearTimeout(t);
  }, [fireKey, gain]);

  return (
    <span className="rr-carrots" title={`${stock} carrots banked`}>
      <span key={fireKey} className={`rr-carrots-n${fireKey ? ' banked' : ''}`}>
        {stock}
      </span>
      <span className="rr-carrots-label">
        <Carrot />
        carrots
      </span>
      {showGain && (
        // Re-keyed per harvest so the CSS animation restarts; without the key
        // a second gain during the first one's flight would not replay.
        <span key={`gain-${fireKey}`} className="rr-carrots-gain" aria-hidden>
          +{gain}
          <Carrot />
        </span>
      )}
    </span>
  );
}
