'use client';

/**
 * The shop and the trap board, as one hook.
 *
 * They are one hook because they are one decision: a trap you bought is a trap
 * you then have to PLACE, and the two live on the same screen for that reason.
 * Splitting them would mean two fetches, two loading states and two chances for
 * the count in the shop to disagree with the count on the board.
 *
 * The server is the authority on every number here. Nothing is optimistically
 * incremented — a shop that shows an item you did not get is worse than one
 * that takes a moment, and the response already carries the new state, so a
 * purchase refreshes everything in the same round trip.
 */
import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/i18n/provider';
import type { Dict } from '@/i18n/dictionaries';
import type { PayTokenId } from '@/lib/pay/tokens';

export type ItemKind = 'trap' | 'bomb' | 'lightning' | 'shield' | 'energy' | 'smoke' | 'mirage';

export interface ShopItem {
  kind: ItemKind;
  price: number;
  usdc: number;
  held: number;
  cap: number;
  canBuy: boolean;
  hasRoom: boolean;
}

export interface ShopState {
  stock: number;
  items: ShopItem[];
  traps: {
    held: number;
    placed: number;
    /** How many of `placed` are standing — see TrapState.armed. */
    armed: number;
    /** How many are still coming back, and when the next one lands. */
    rearming: number;
    nextRearmAt: string | null;
    maxPlaced: number;
    drain: number;
    freePerDay: number;
  };
  usdcEnabled: boolean;
  /** The rails this deployment takes. Empty when the money route is off. */
  tokens: PayTokenId[];
  /**
   * USD per whole token, per rail — so a tile can price itself in the rail the
   * player picked without a round trip per switch.
   *
   * Indicative only. The binding number is the one the quote freezes; this is
   * what the shelf is LABELLED with, and null when the money route is off.
   */
  rates: Partial<Record<PayTokenId, number>> | null;
}

/** A trap on its way back up, and when it gets there. */
export interface RearmingTrap {
  tile: number;
  /** ISO instant — the server's clock, never the browser's. */
  readyAt: string;
}

export interface TrapState {
  /** Every mined tile, standing or rearming. This is what the board draws. */
  placed: number[];
  /**
   * The subset actually defending the burrow right now.
   *
   * Split from `placed` because a burrow that reported only its standing traps
   * would look like it had LOST the others — which is the reading the arming
   * clock exists to prevent. The tile keeps its trap either way; what differs
   * is whether a raider walking it would spring anything.
   */
  armed: number[];
  /** The rest, soonest back first. */
  rearming: RearmingTrap[];
  held: number;
  maxPlaced: number;
  maxHeld: number;
  drain: number;
}

/**
 * What the player is told when something is refused.
 *
 * The server answers with a CODE (`insufficient_carrots`), never a sentence —
 * it has no idea which of the four languages this player reads. The wording
 * for each code lives in the dictionaries under `shopErrors`, which is also
 * what guarantees a language cannot ship one of them missing.
 */
export function shopMessage(t: Dict, error: string | undefined): string | null {
  if (!error) return null;
  // A code the dictionary has no line for still says something: a silent
  // refusal is the one outcome a player cannot act on.
  return t.shopErrors[error as keyof Dict['shopErrors']] ?? t.shopErrors.fallback;
}

export function useShop(token: string | null) {
  const t = useT();
  const [shop, setShop] = useState<ShopState | null>(null);
  const [traps, setTraps] = useState<TrapState | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

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

  const refresh = useCallback(async () => {
    if (!token) return;
    const [s, t] = await Promise.all([
      fetch('/api/shop', auth()).then((r) => r.json()).catch(() => null),
      fetch('/api/traps', auth()).then((r) => r.json()).catch(() => null),
    ]);
    if (s && !s.error) setShop(s);
    if (t && !t.error) setTraps(t);
  }, [token, auth]);

  useEffect(() => { void refresh(); }, [refresh]);

  /** Buy with carrots. The response carries the new shelf, so nothing is guessed. */
  const buy = useCallback(async (kind: ItemKind, qty = 1) => {
    if (!token) return null;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch('/api/shop', auth({
        method: 'POST',
        body: JSON.stringify({ kind, qty }),
      })).then((r) => r.json());

      if (res.error) {
        setNote(shopMessage(t, res.error));
        return null;
      }
      setShop(res);
      // A trap purchase changes the board's allowance too.
      if (kind === 'trap') void refresh();
      setNote(purchaseNote(t, kind, qty, res.spent));
      return res;
    } finally {
      setBusy(false);
    }
  }, [token, auth, refresh]);

  /**
   * Place a trap on a burrow tile.
   *
   * Returns true when the ground actually holds it, because the caller has to
   * draw the marker — and must not draw one for a placement the server refused.
   */
  const placeTrap = useCallback(async (tile: number): Promise<boolean> => {
    if (!token) return false;
    setNote(null);
    const res = await fetch('/api/traps', auth({
      method: 'POST',
      body: JSON.stringify({ tile }),
    })).then((r) => r.json()).catch(() => ({ error: 'network' }));

    if (res.error) {
      setNote(shopMessage(t, res.error));
      return false;
    }
    setTraps(res);
    void refresh();
    return true;
  }, [token, auth, refresh]);

  /**
   * Lift a bomb back off a tile.
   *
   * The other half of `placeTrap`, and deliberately the same shape: the marker
   * is removed only after the server says the tile is clear, for the same
   * reason it is only drawn after the server says it is mined. A board that
   * shows a defence you no longer have is the same lie either way round.
   */
  const removeTrap = useCallback(async (tile: number): Promise<boolean> => {
    if (!token) return false;
    setNote(null);
    // The tile rides in the URL, not in a body: a DELETE body is legal but is
    // the one thing a proxy in front of the app may drop, and one is in front
    // of this app — which is why lifting a bomb worked in Storybook and did
    // nothing in production. The route still reads a body as a fallback.
    const res = await fetch(`/api/traps?tile=${encodeURIComponent(tile)}`, auth({
      method: 'DELETE',
    })).then((r) => r.json()).catch(() => ({ error: 'network' }));

    if (res.error) {
      setNote(shopMessage(t, res.error));
      return false;
    }
    setTraps(res);
    // The bag got one back, so the shop's counts are stale too.
    void refresh();
    return true;
  }, [token, auth, refresh]);

  /**
   * Lift EVERY bomb off the board, in one call.
   *
   * The same contract as `removeTrap` — the markers come off only once the
   * server says the ground is clear — but one round trip instead of eight, so
   * a defender rearranging their whole defence does not tap their way through
   * it one diamond at a time.
   *
   * Returns the tiles that were cleared, so the caller can take exactly those
   * markers off the board rather than guessing from its own copy of the list.
   */
  const clearTraps = useCallback(async (): Promise<number[] | null> => {
    if (!token) return null;
    setNote(null);
    const had = traps?.placed ?? [];
    const res = await fetch('/api/traps?all=1', auth({ method: 'DELETE' }))
      .then((r) => r.json()).catch(() => ({ error: 'network' }));

    if (res.error) {
      setNote(shopMessage(t, res.error));
      return null;
    }
    setTraps(res);
    // The bag got them back, so the shop's counts are stale too.
    void refresh();
    return had;
  }, [token, auth, refresh, traps]);

  return { shop, traps, busy, note, setNote, refresh, buy, placeTrap, removeTrap, clearTraps };
}

/** What a successful purchase says. Named per item, because "bought 1 item" is
 *  a receipt and this is a game. */
function purchaseNote(t: Dict, kind: ItemKind, qty: number, spent: number): string {
  const paid = t.shop.paid(spent);
  switch (kind) {
    case 'energy': return t.shop.boughtEnergy(paid);
    case 'trap': return t.shop.boughtTrap(qty, paid);
    case 'bomb': return t.shop.boughtBomb(qty, paid);
    case 'lightning': return t.shop.boughtLightning(qty, paid);
    case 'shield': return t.shop.boughtShield(qty, paid);
    case 'smoke': return t.shop.boughtSmoke(paid);
    case 'mirage': return t.shop.boughtMirage(qty, paid);
  }
}
