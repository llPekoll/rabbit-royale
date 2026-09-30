/**
 * Give every burrow back its bombs, planks and arrangement — when the ground moves.
 *
 *   DATABASE_URL=... bun run scripts/reset-burrows.ts          # lists, changes nothing
 *   DATABASE_URL=... bun run scripts/reset-burrows.ts --yes    # refunds and clears
 *
 * Bombs, planks and edits are stored by TILE INDEX on the burrow's ground.
 * When `BURROW_GROUND` changes (or burrows stop being cut from each player's
 * own seed, 2026-09-30), every index points at a different patch of land: a
 * bomb in the sea, a plank on no edge, a house moved onto a cliff. So before
 * the new ground ships, everything standing is taken up and handed back:
 *
 *   - every bomb in the ground returns to the bag, rearming or not
 *     (`refundTraps`, capped at TRAPS.MAX_HELD like a lift by hand) — the
 *     player did not choose to lose a rearm, the ground moved;
 *   - every plank returns to the bag (inventory `fence`, capped at FENCES.MAX_HELD);
 *   - the arrangement is cleared (`burrow_edits` null): the new ground's own
 *     trees, field and house stand, and the owner moves them again;
 *   - a raid walking a burrow right now is closed, with nothing taken.
 *
 * One transaction per player, so a failure halfway leaves every burrow either
 * untouched or fully reset.
 */
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '../src/lib/db';
import { fences, inventory, players, raidRuns, traps } from '../src/lib/db/schema';
import { refundTraps } from '../src/lib/game/traps';
import { FENCES } from '../config/tuning';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL must be set');
  process.exit(2);
}
const go = process.argv.includes('--yes');
const now = new Date();

const trapCounts = await db.select({ owner: traps.ownerId, n: sql<number>`count(*)::int` }).from(traps).groupBy(traps.ownerId);
const fenceCounts = await db.select({ owner: fences.ownerId, n: sql<number>`count(*)::int` }).from(fences).groupBy(fences.ownerId);
const edited = await db.select({ id: players.id }).from(players).where(sql`${players.burrowEdits} is not null`);
const open = await db.select({ id: raidRuns.id }).from(raidRuns).where(isNull(raidRuns.endedAt));

const ids = new Set([...trapCounts.map((r) => r.owner), ...fenceCounts.map((r) => r.owner), ...edited.map((r) => r.id)]);
const bombsOf = new Map(trapCounts.map((r) => [r.owner, r.n]));
const planksOf = new Map(fenceCounts.map((r) => [r.owner, r.n]));
const editedSet = new Set(edited.map((r) => r.id));

let bombs = 0, planks = 0;
for (const id of ids) {
  const b = bombsOf.get(id) ?? 0, p = planksOf.get(id) ?? 0;
  bombs += b; planks += p;
  console.log(`${go ? 'reset ' : 'would '}  ${id}  bombs ${b}  planks ${p}${editedSet.has(id) ? '  + arrangement' : ''}`);
  if (!go) continue;
  await db.transaction(async (tx) => {
    const [player] = await tx.select().from(players).where(eq(players.id, id)).for('update');
    if (!player) return;
    if (b > 0) {
      await tx.delete(traps).where(eq(traps.ownerId, id));
      await tx.update(players).set(refundTraps(player, b, now.getTime())).where(eq(players.id, id));
    }
    if (p > 0) {
      await tx.delete(fences).where(eq(fences.ownerId, id));
      await tx.insert(inventory)
        .values({ playerId: id, kind: 'fence', qty: Math.min(FENCES.MAX_HELD, p) })
        .onConflictDoUpdate({
          target: [inventory.playerId, inventory.kind],
          set: { qty: sql`least(${FENCES.MAX_HELD}, ${inventory.qty} + ${p})` },
        });
    }
    await tx.update(players).set({ burrowEdits: null }).where(eq(players.id, id));
  });
}
if (open.length) {
  console.log(`${go ? 'closed' : 'would close'} ${open.length} raid(s) in progress, nothing taken`);
  if (go) {
    await db.update(raidRuns)
      .set({ endedAt: now, succeeded: false })
      .where(and(isNull(raidRuns.endedAt), or(...open.map((r) => eq(raidRuns.id, r.id)))));
  }
}
console.log(`${ids.size} burrow(s): ${bombs} bombs, ${planks} planks${go ? ' returned to the bag' : ' — add --yes to return them'}`);
process.exit(0);
