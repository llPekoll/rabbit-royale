'use client';

/**
 * A raid on YOUR burrow, watched from home.
 *
 * The defending half of `use-raid`. That hook is the attacker's: it walks a
 * stranger's ground one request at a time. This one holds the raid somebody
 * is walking on YOURS, and offers the one answer that is not a bomb: the
 * lightning.
 *
 * PUSHED, never polled. Every change to a raid is announced on the socket as
 * `raid_incoming` (see `lib/game/raid-events`), and `useGameSocket` hands the
 * latest one in as `pushed`. The only request this hook makes on its own is
 * ONE read on arrival, for the case a push cannot cover: the owner opening
 * the burrow while a raid is already under way.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DefenderRaidView } from '@/lib/game/defence';
import { RAID_RUN } from '@config/tuning';

export type IncomingRaid = DefenderRaidView;

/** Whether two readings draw the same raid. */
export function sameIncoming(a: IncomingRaid | null, b: IncomingRaid | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.raidId === b.raidId
    && a.tile === b.tile
    && a.energy === b.energy
    && a.trapsSprung === b.trapsSprung
    && a.finished === b.finished
    && a.succeeded === b.succeeded
    && a.struck === b.struck
    && a.walked.length === b.walked.length;
}

export function useIncomingRaid(
  token: string | null,
  active: boolean,
  /** The latest `raid_incoming` off the socket, or null. */
  pushed: IncomingRaid | null,
) {
  const [incoming, setIncoming] = useState<IncomingRaid | null>(null);
  const [striking, setStriking] = useState(false);
  /** The server's refusal code for the last strike, or null. */
  const [refusal, setRefusal] = useState<string | null>(null);
  /** The ending is shown for a beat, then the board is a home again. */
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const auth = useCallback(
    (init?: RequestInit): RequestInit => ({
      ...init,
      headers: {
        ...init?.headers,
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    }),
    [token],
  );

  /** Take a reading, from wherever it came. */
  const accept = useCallback((next: IncomingRaid | null) => {
    setIncoming((prev) => (sameIncoming(prev, next) ? prev : next));
    if (clearTimer.current) { clearTimeout(clearTimer.current); clearTimer.current = null; }
    // A finished raid stays up long enough to be seen ending, then goes —
    // the same beat the one-shot read honours server-side (ENDED_SHOWN_MS).
    if (next?.finished) {
      clearTimer.current = setTimeout(() => {
        clearTimer.current = null;
        setIncoming((cur) => (cur?.raidId === next.raidId ? null : cur));
      }, RAID_RUN.ENDED_SHOWN_MS);
    }
  }, []);

  // ONE read on arrival — see the note above. Not a poll: no interval.
  useEffect(() => {
    if (!token || !active) return;
    let gone = false;
    fetch('/api/raid/incoming', auth())
      .then((r) => r.json())
      .then((res) => { if (!gone && res && !res.error) accept(res.raid ?? null); })
      .catch(() => {});
    return () => { gone = true; };
  }, [token, active, auth, accept]);

  // The live picture, as pushed.
  useEffect(() => {
    if (!active || !pushed) return;
    accept(pushed);
  }, [active, pushed, accept]);

  // Off the burrow, the picture is stale by definition: forget it, so coming
  // back does not open on a raid that ended while the player was away.
  useEffect(() => {
    if (active) return;
    setIncoming(null);
    if (clearTimer.current) { clearTimeout(clearTimer.current); clearTimer.current = null; }
  }, [active]);

  useEffect(() => () => { if (clearTimer.current) clearTimeout(clearTimer.current); }, []);

  /**
   * Call the lightning down. Resolves true if the strike landed.
   *
   * The scene plays the shock off the caller's own call; the answer carries
   * the raid as it now stands (finished, struck), which is taken as a reading
   * like any other.
   */
  const strike = useCallback(async (): Promise<boolean> => {
    if (!token || striking) return false;
    setStriking(true);
    setRefusal(null);
    try {
      const res = await fetch('/api/raid/strike', auth({ method: 'POST' }))
        .then((r) => r.json())
        .catch(() => ({ error: 'network' }));
      if (res.error) {
        setRefusal(res.error);
        return false;
      }
      accept(res.raid ?? null);
      return true;
    } finally {
      setStriking(false);
    }
  }, [token, striking, auth, accept]);

  return useMemo(
    () => ({ incoming, strike, striking, refusal, setRefusal }),
    [incoming, strike, striking, refusal],
  );
}
