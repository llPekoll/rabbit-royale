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

export type ItemKind = 'trap' | 'bomb' | 'lightning' | 'shield' | 'energy';

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
    maxPlaced: number;
    drain: number;
    freePerDay: number;
  };
  usdcEnabled: boolean;
}

export interface TrapState {
  placed: number[];
  held: number;
  maxPlaced: number;
  maxHeld: number;
  drain: number;
}

/** What the player is told when something is refused. One place, so the same
 *  failure never gets two different wordings. */
const MESSAGES: Record<string, string> = {
  insufficient_carrots: 'Not enough carrots.',
  inventory_full: 'Your bag is full of those.',
  daily_energy_limit: 'No more refills today. The garden still grows.',
  too_many_at_once: 'Too many at once.',
  bad_quantity: 'That is not a quantity.',
  no_traps: 'No traps left. Buy one, or wait for tomorrow.',
  board_full: 'Your burrow cannot hold another trap.',
  tile_not_trappable: 'Nothing to mine there.',
  tile_already_trapped: 'Already mined.',
  no_trap_there: 'No trap there.',
  payments_unavailable: 'Card payments are not set up yet.',
  quote_expired: 'That quote expired. Try again.',
  signature_already_used: 'That payment was already used.',
  not_confirmed_yet: 'Still confirming on chain...',
  wrong_reference: 'That transaction does not match this purchase.',
  no_matching_transfer: 'No matching USDC transfer found.',
  failed_on_chain: 'The transaction failed on chain.',
};

export function shopMessage(error: string | undefined): string | null {
  if (!error) return null;
  return MESSAGES[error] ?? 'That did not work.';
}

export function useShop(token: string | null) {
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
        setNote(shopMessage(res.error));
        return null;
      }
      setShop(res);
      // A trap purchase changes the board's allowance too.
      if (kind === 'trap') void refresh();
      setNote(purchaseNote(kind, qty, res.spent));
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
      setNote(shopMessage(res.error));
      return false;
    }
    setTraps(res);
    void refresh();
    return true;
  }, [token, auth, refresh]);

  return { shop, traps, busy, note, setNote, refresh, buy, placeTrap };
}

/** What a successful purchase says. Named per item, because "bought 1 item" is
 *  a receipt and this is a game. */
function purchaseNote(kind: ItemKind, qty: number, spent: number): string {
  const n = qty > 1 ? `${qty} ` : '';
  switch (kind) {
    case 'energy': return `Energy refilled. −${spent} 🥕`;
    case 'trap': return `${n}trap${qty > 1 ? 's' : ''} in the shed. −${spent} 🥕`;
    case 'bomb': return `${n}bomb${qty > 1 ? 's' : ''} armed. −${spent} 🥕`;
    case 'lightning': return `${n}lightning bolt${qty > 1 ? 's' : ''} bottled. −${spent} 🥕`;
    case 'shield': return `${n}shield${qty > 1 ? 's' : ''} ready. −${spent} 🥕`;
  }
}
