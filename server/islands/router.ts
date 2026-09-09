/**
 * Which process owns an island.
 *
 * Today the answer is always "this one". The function exists so that the call
 * sites are already written for the sharded world: when a second ws process
 * appears, this returns a shard index derived from the island id and the socket
 * that asked gets pointed at the right room, with no change at any call site.
 */
import { seedFrom } from '../../src/lib/game/rng';

export const SHARD_COUNT = Number(process.env.WS_SHARDS ?? 1);
export const SHARD_ID = Number(process.env.WS_SHARD_ID ?? 0);

/** Shard index owning `islandId`. Stable for the island's whole life. */
export const shardFor = (islandId: string): number => seedFrom(islandId) % SHARD_COUNT;

/** Is this island ours to simulate? Always true while SHARD_COUNT is 1. */
export const ownsIsland = (islandId: string): boolean => shardFor(islandId) === SHARD_ID;

/** The socket.io room for an island. Rooms are per-island, never global. */
export const roomFor = (islandId: string): string => `island:${islandId}`;
