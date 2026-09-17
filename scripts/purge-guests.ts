/**
 * Sweep the guest burrows nobody can open any more — by hand, once.
 *
 * The WS server runs the same sweep on boot and every six hours (see the
 * guest janitor in server/index.ts); this is for looking before it does, and
 * for a box that has not been redeployed yet.
 *
 *   DATABASE_URL=... bun run scripts/purge-guests.ts          # lists, deletes nothing
 *   DATABASE_URL=... bun run scripts/purge-guests.ts --yes    # deletes them
 *
 * The rule is `isOrphanGuest` in lib/auth/abandon.ts: a guest (no wallet)
 * unseen for longer than a session lives, or one who never banked a run and
 * has not been back in a day. REDIS_URL, if set, has the season board's cache
 * cleaned in the same pass; without it the board rebuilds from Postgres.
 */
import { purgeOrphanGuests } from '../src/lib/auth/abandon';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL must be set');
  process.exit(2);
}
const go = process.argv.includes('--yes');

const rows = await purgeOrphanGuests(new Date(), { dryRun: !go });
if (rows.length === 0) {
  console.log('no orphan guest burrows');
} else {
  for (const r of rows) {
    const days = Math.floor((Date.now() - r.lastSeenAt.getTime()) / 86_400_000);
    console.log(`${go ? 'deleted' : 'orphan '}  ${r.id}  runs=${r.runsPlayed}  unseen ${days}d`);
  }
  console.log(`${rows.length} orphan guest burrow(s)${go ? ' deleted' : ' — add --yes to delete'}`);
}
process.exit(0);
