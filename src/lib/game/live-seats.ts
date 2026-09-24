/**
 * Is this player out on an island right now, with a run still unbanked?
 *
 * The islands live in rr-ws's memory; the /api routes are served by the same
 * process (server/api-router.ts) but cannot import the socket server. So the
 * server REGISTERS the answer here at boot, and a route asks.
 *
 * Why a route needs to: ONE TANK. A live run digs with `rabbit.energy` and
 * `bankRun` writes it back over `players.energy` as is — so anything else that
 * spends the column while the rabbit is out (a raid's toll, its steps, its
 * traps) was erased by the banking, and a raid made during a run was free.
 * The raid route refuses instead: one door at a time.
 *
 * Unregistered (tests, a script importing a route) nobody is on an island.
 */
type SeatLookup = (playerId: string) => boolean;

let lookup: SeatLookup = () => false;

export function registerSeatLookup(fn: SeatLookup): void {
  lookup = fn;
}

export function isOnIsland(playerId: string): boolean {
  return lookup(playerId);
}
