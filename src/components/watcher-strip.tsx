'use client';

/**
 * WHO IS WATCHING YOU DIG — one line, directly above MARK A BOMB.
 *
 * Watching is the front door to sabotage: a rival opens your run from the
 * leaderboard, sees what you see, and decides whether to spend a bolt or bury
 * a bomb in the ground ahead of you. Until now the digger had no way of
 * knowing any of that was happening — the first sign was the bolt itself.
 *
 * So this is not a vanity counter, it is a THREAT LEVEL, and it earns its line
 * on a phone screen for that reason alone. "0 online" is the quiet board; a
 * number above zero means somebody is out there choosing a tile.
 *
 * ABOVE MARK A BOMB, not in the strip at the top. The two belong together:
 * the count says a rival is aiming, and the button below it is the answer —
 * a mark on the tile you think they buried something in. Read one, tap the
 * other, without the eye crossing the board.
 *
 * ZERO IS PRINTED, not hidden. A line that only appears when someone arrives
 * is a jump-scare that also moves the button under it mid-run; a line that is
 * always there is a gauge the player learns to glance at. It is dim at zero
 * and lit above it, so the state reads before the digits do.
 */
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useT } from '@/i18n/provider';
import { pxLabel } from './px';

/** How long a hit stays named on the strip before it falls back to the count. */
const HIT_MS = 4000;

export interface WatcherStripProps {
  /** How many rivals are watching this run — the server's `watchers`. */
  count: number;
  /** The last bolt that hit us, and who threw it. */
  struckBy?: { by: string; at: number } | null;
  /** The last buried bomb we stepped on, and whose it was. */
  bombedBy?: { by: string; at: number } | null;
  /** Names by player id — the island's rabbits, for naming the one who hit us. */
  nameOf(playerId: string): string | null;
}

export function WatcherStrip({ count, struckBy, bombedBy, nameOf }: WatcherStripProps) {
  const t = useT();

  /**
   * The last hit, as long as it is fresh.
   *
   * Kept as state with a timer rather than computed from `at` on every render,
   * because nothing else on this strip re-renders on a clock: without the
   * timeout the sentence would stay up until the next socket event happened to
   * push a frame through, which on a quiet board is a long time.
   *
   * The two sources are merged by TIME, not by priority: a player caught by a
   * bomb and then a bolt should read the bolt, which is the one that just
   * happened, and the reverse for the reverse order.
   */
  const [hit, setHit] = useState<{ by: string; kind: 'bolt' | 'bomb'; at: number } | null>(null);
  const latest = (() => {
    const s = struckBy ? { by: struckBy.by, kind: 'bolt' as const, at: struckBy.at } : null;
    const b = bombedBy ? { by: bombedBy.by, kind: 'bomb' as const, at: bombedBy.at } : null;
    if (!s) return b;
    if (!b) return s;
    return s.at >= b.at ? s : b;
  })();
  const at = latest?.at ?? 0;
  useEffect(() => {
    if (!latest) return;
    // Already stale on arrival — a hit carried over from the run before this
    // one, which the strip has nothing to say about.
    if (Date.now() - latest.at > HIT_MS) return;
    setHit(latest);
    const id = setTimeout(() => setHit(null), HIT_MS - (Date.now() - latest.at));
    return () => clearTimeout(id);
    // `at` is the identity of a hit: the same rival striking twice is two
    // events, and the sentence has to come back for the second one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at]);

  if (hit) {
    const who = nameOf(hit.by) ?? t.raid.aRival;
    return (
      <p className="rr-watchers hit" role="status" style={{ ...pxLabel, ...strip }}>
        {hit.kind === 'bolt' ? t.run.hitBolt(who) : t.run.hitBomb(who)}
      </p>
    );
  }

  return (
    <p
      className={`rr-watchers${count > 0 ? ' live' : ''}`}
      role="status"
      // Polite, not assertive: a rival arriving is worth reading, not worth
      // interrupting a screen reader mid-sentence for.
      aria-live="polite"
      style={{ ...pxLabel, ...strip }}
    >
      {t.run.watchers(count)}
    </p>
  );
}

/*
 * NO `white-space` HERE. It used to say `nowrap`, which is right for the count
 * ("7 ONLINE" must never break across two lines) and catastrophic for the
 * sentence: an inline style beats the stylesheet, so `.rr-watchers.hit`'s
 * `white-space: normal` never applied and the name ran off the right edge of
 * a 420px screen — "BLACKPAW STRUCK YOU W". Seen in the story shot.
 *
 * So the two states each declare their own, in the stylesheet, where the
 * cascade can do its job.
 */
const strip: CSSProperties = {
  position: 'fixed',
  margin: 0,
  pointerEvents: 'none',
  fontSize: 'clamp(11px, 2.2svh, 15px)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
};
