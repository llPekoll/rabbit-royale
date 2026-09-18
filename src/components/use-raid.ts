'use client';

/**
 * Raiding someone else's burrow, client side.
 *
 * The hook holds no game state of its own. Every response carries the whole
 * raid — where you stand, what you can see, where you may step — so the client
 * renders what it was last told and never advances anything itself. That is the
 * same rule the island run follows: a raid decides who loses carrots, so a
 * client that could move its own rabbit could walk to the field for free.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '@/i18n/provider';
import type { Dict } from '@/i18n/dictionaries';

export interface RaidTile {
  tile: number;
  clue: number | null;
  /** Which shelf the tile stands on, so the client draws it at the right
   *  height on the defender's terraced ground. */
  tier: number;
}

export interface RaidState {
  raidId: string;
  defender: { id: string; name: string; avatar: string | null; level: number };
  tile: number;
  energy: number;
  trapsSprung: number;
  view: RaidTile[];
  /** The tiles the raider has stood on — their own path, so it reveals nothing. */
  walked: number[];
  steps: number[];
  smoked: boolean;
  finished: boolean;
  succeeded: boolean;
  carrotsLooted: number;
  /**
   * Ended by the DEFENDER's lightning. Optional so a server that predates the
   * flag reads as "not struck" rather than as a missing field.
   */
  struck?: boolean;
}

/** Whether two readings of the same raid draw the same board. */
function sameRaid(a: RaidState | null, b: RaidState | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.raidId === b.raidId
    && a.tile === b.tile
    && a.energy === b.energy
    && a.trapsSprung === b.trapsSprung
    && a.finished === b.finished
    && a.succeeded === b.succeeded
    && (a.struck ?? false) === (b.struck ?? false)
    && a.smoked === b.smoked
    && a.view.length === b.view.length
    && a.walked.length === b.walked.length
    && a.steps.length === b.steps.length;
}

export interface Target {
  id: string;
  name: string;
  avatar: string | null;
  stock: number;
  /** Carrots standing in their garden — what a raid takes first. Optional
   *  so a server that predates it reads as "nothing outside". */
  garden?: number;
  shielded: boolean;
  /** Milliseconds left on their shield when the list was fetched — 0, or
   *  absent from a server that predates it, when they are open. The list
   *  counts it down itself rather than re-fetching, so a shield that lifts
   *  while the panel is open turns into a raidable row on its own. */
  shieldedFor?: number;
  /**
   * They are out on an island right now, not at home.
   *
   * Changes what the raid IS rather than whether it is allowed: an absent
   * owner is a walk, a digging one can be told the moment you step in
   * (`tellDefender`) and can end the crossing with lightning. Optional so a
   * server that predates it reads as "away" — the silence the list had before.
   */
  digging?: boolean;
}

export interface RaidOutcome {
  reachedField: boolean;
  loot: number;
  damage: number;
  progress: number;
}

/**
 * The refusals, keyed by the code the raid routes answer with.
 *
 * The wording lives in the dictionaries under `raidErrors` — the server sends
 * a code and never a sentence, because it does not know which of the four
 * languages this player reads.
 */
export function raidMessage(t: Dict, error?: string): string | null {
  if (!error) return null;
  return t.raidErrors[error as keyof Dict['raidErrors']] ?? t.raidErrors.fallback;
}

export function useRaid(token: string | null) {
  const t = useT();
  const [raid, setRaid] = useState<RaidState | null>(null);
  const [targets, setTargets] = useState<Target[]>([]);
  const [outcome, setOutcome] = useState<RaidOutcome | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Bumped when a trap goes off, so the scene can play the blast once. */
  const [sprung, setSprung] = useState<{ tile: number; key: number } | null>(null);
  /**
   * The struck raid the player has already left.
   *
   * A raid ended by lightning keeps being answered by `GET /api/raid` for a
   * while (see `STRUCK_SHOWN_MS`) so the raider is sure to see it; once they
   * have, the same answer must not put them back on that board every time
   * the list is refreshed. A ref, not state: nothing draws it.
   */
  const dismissed = useRef<string | null>(null);

  /**
   * TEMPORARY — carry `?reveal=1` through to the raid API.
   *
   * The debug switch that draws a whole burrow instead of the cells a raider
   * has earned (see `raidView`). Read off the page's own URL so it survives a
   * refresh mid-crossing, and so turning it on is a matter of editing the
   * address bar rather than rebuilding. Delete with TapProbe.
   */
  const reveal = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('reveal');
  const q = reveal ? '?reveal=1' : '';

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

  /** Load whatever is true right now: a raid in progress, or the target list. */
  const refresh = useCallback(async () => {
    if (!token) return;
    const res = await fetch(`/api/raid${q}`, auth()).then((r) => r.json()).catch(() => null);
    if (!res || res.error) return;
    const next: RaidState | null = res.raid ?? null;
    if (next?.finished && next.raidId === dismissed.current) {
      setRaid(null);
    } else {
      // Identity-stable while nothing changed: the page redraws the board off
      // this object, and a re-read that handed it a fresh copy of the same
      // raid would rebuild what the player is looking at.
      setRaid((prev) => (sameRaid(prev, next) ? prev : next));
    }
    setTargets(res.targets ?? []);
  }, [token, auth, q]);

  useEffect(() => { void refresh(); }, [refresh]);
  // A raid is never polled. The one change that can happen to it between two
  // of the raider's own requests — the defender's lightning — arrives on the
  // socket as `raid_struck`, and the page calls `refresh` once on it.

  const enter = useCallback(async (defenderId: string) => {
    if (!token) return;
    setBusy(true);
    setNote(null);
    setOutcome(null);
    try {
      const res = await fetch(`/api/raid${q}`, auth({
        method: 'POST',
        body: JSON.stringify({ defenderId }),
      })).then((r) => r.json());

      if (res.error) {
        setNote(raidMessage(t, res.error));
        // A raid already in progress comes back WITH that raid, so the player
        // is put back inside it rather than told off and left nowhere.
        if (res.raid) setRaid(res.raid);
        return;
      }
      setRaid(res.raid);
    } finally {
      setBusy(false);
    }
  }, [token, auth, q]);

  const step = useCallback(async (tile: number) => {
    if (!token) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/raid${q}`, auth({
        method: 'PATCH',
        body: JSON.stringify({ tile }),
      })).then((r) => r.json());

      if (res.error) {
        setNote(raidMessage(t, res.error));
        return;
      }
      if (res.sprungTrap) setSprung({ tile, key: Date.now() });
      setRaid(res.raid);
      if (res.outcome) setOutcome(res.outcome);
    } finally {
      setBusy(false);
    }
  }, [token, auth, q]);

  /**
   * Leave a raid — finished, or abandoned halfway.
   *
   * The DELETE is the part that was missing. Clearing local state alone left
   * the run open server-side with a null `endedAt`, so the next raid came back
   * `raid_in_progress` forever: retreating cost the player the whole feature.
   *
   * Local state is cleared FIRST so the board comes down immediately — the
   * request is a formality the player should not have to watch. `refresh` then
   * reloads the target list, which is where leaving is meant to land.
   */
  const leave = useCallback(() => {
    // A struck raid stays answered by the server for a while; remembered here
    // so the refresh below does not hand it straight back.
    setRaid((current) => {
      if (current?.struck) dismissed.current = current.raidId;
      return null;
    });
    setOutcome(null);
    setSprung(null);
    void fetch('/api/raid', auth({ method: 'DELETE' }))
      .catch(() => {})
      .finally(() => void refresh());
  }, [auth, refresh]);

  /**
   * Memoised, because effects DEPEND on it.
   *
   * The raid is pushed into the Pixi scene by an effect in `page.tsx`, and a
   * fresh object literal here made that effect re-run on every render of the
   * page — every poll, every HUD tick. Each re-run called `setRaid` again,
   * which destroys the defender's terrain and grows it back, so a raid was
   * being rebuilt from scratch continuously: taps landed on diamonds that were
   * about to be destroyed, and the board the player was looking at was never
   * the one their tap was tested against.
   */
  return useMemo(
    () => ({ raid, targets, outcome, note, busy, sprung, enter, step, leave, refresh, setNote }),
    [raid, targets, outcome, note, busy, sprung, enter, step, leave, refresh],
  );
}
