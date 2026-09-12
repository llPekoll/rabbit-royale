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
import { useCallback, useEffect, useState } from 'react';

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
}

export interface Target {
  id: string;
  name: string;
  avatar: string | null;
  stock: number;
  shielded: boolean;
}

export interface RaidOutcome {
  reachedField: boolean;
  loot: number;
  damage: number;
  progress: number;
}

const MESSAGES: Record<string, string> = {
  target_shielded: 'Their burrow is shielded. Try someone else.',
  cannot_raid_yourself: 'That is your own burrow.',
  raid_in_progress: 'You are already inside a burrow.',
  cooldown: 'You raided them too recently.',
  not_adjacent: 'Too far. One step at a time.',
  no_raid: 'That raid is over.',
  unknown_player: 'They are gone.',
};

export function raidMessage(error?: string): string | null {
  if (!error) return null;
  return MESSAGES[error] ?? 'That did not work.';
}

export function useRaid(token: string | null) {
  const [raid, setRaid] = useState<RaidState | null>(null);
  const [targets, setTargets] = useState<Target[]>([]);
  const [outcome, setOutcome] = useState<RaidOutcome | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Bumped when a trap goes off, so the scene can play the blast once. */
  const [sprung, setSprung] = useState<{ tile: number; key: number } | null>(null);

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
    const res = await fetch('/api/raid', auth()).then((r) => r.json()).catch(() => null);
    if (!res || res.error) return;
    setRaid(res.raid ?? null);
    setTargets(res.targets ?? []);
  }, [token, auth]);

  useEffect(() => { void refresh(); }, [refresh]);

  const enter = useCallback(async (defenderId: string) => {
    if (!token) return;
    setBusy(true);
    setNote(null);
    setOutcome(null);
    try {
      const res = await fetch('/api/raid', auth({
        method: 'POST',
        body: JSON.stringify({ defenderId }),
      })).then((r) => r.json());

      if (res.error) {
        setNote(raidMessage(res.error));
        // A raid already in progress comes back WITH that raid, so the player
        // is put back inside it rather than told off and left nowhere.
        if (res.raid) setRaid(res.raid);
        return;
      }
      setRaid(res.raid);
    } finally {
      setBusy(false);
    }
  }, [token, auth]);

  const step = useCallback(async (tile: number) => {
    if (!token) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch('/api/raid', auth({
        method: 'PATCH',
        body: JSON.stringify({ tile }),
      })).then((r) => r.json());

      if (res.error) {
        setNote(raidMessage(res.error));
        return;
      }
      if (res.sprungTrap) setSprung({ tile, key: Date.now() });
      setRaid(res.raid);
      if (res.outcome) setOutcome(res.outcome);
    } finally {
      setBusy(false);
    }
  }, [token, auth]);

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
    setRaid(null);
    setOutcome(null);
    setSprung(null);
    void fetch('/api/raid', auth({ method: 'DELETE' }))
      .catch(() => {})
      .finally(() => void refresh());
  }, [auth, refresh]);

  return { raid, targets, outcome, note, busy, sprung, enter, step, leave, refresh, setNote };
}
