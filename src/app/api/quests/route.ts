/**
 * The quest board: claim a reward, or report something the client saw.
 *
 * `{ action: 'claim', id }` — take the reward for a quest that is DONE. The
 * condition is recomputed here from the player's own counters (never trusted
 * from the client), and the claim is written in ONE conditional statement so
 * that two taps, two tabs or a replayed request cannot pay a reward twice:
 * the append happens only if the id is not already in `questsClaimed`, and a
 * statement that appended nothing grants nothing.
 *
 * `{ action: 'mark', mark }` — record a fact only the browser can know (the
 * season board was opened; a chapter was read). Marks are named and checked
 * (config/quests.ts QUEST_MARK): a codex mark is refused while the chapter is
 * still locked, so a client cannot mark its way through the story.
 *
 * Both answer with the fresh board AND the fresh burrow, because a claim moves
 * the carrot counters and the page draws both from one read.
 */
import { and, eq, sql as raw } from 'drizzle-orm';
import { db } from '@/lib/db';
import { players } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/jwt';
import { burrowView } from '@/lib/game/burrow';
import { grantItem } from '@/lib/game/grant';
import { questBoardOf, questFacts } from '@/lib/game/quests';
import { QUEST_MARK, isQuestDone, questById } from '@/config/quests';
import { LORE } from '@/config/lore';

export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  const player = await db.query.players.findFirst({ where: eq(players.id, session.sub) });
  if (!player) return Response.json({ error: 'unknown player' }, { status: 404 });

  return Response.json({ quest: questBoardOf(player) });
}

export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { action?: string; id?: unknown; mark?: unknown };

  const player = await db.query.players.findFirst({ where: eq(players.id, session.sub) });
  if (!player) return Response.json({ error: 'unknown player' }, { status: 404 });

  if (body.action === 'claim') {
    const id = typeof body.id === 'string' ? body.id : '';
    const quest = questById(id);
    if (!quest) return Response.json({ error: 'unknown_quest' }, { status: 400 });
    if (!isQuestDone(quest, questFacts(player))) {
      return Response.json({ error: 'not_done' }, { status: 400 });
    }

    const carrots = quest.reward.carrots ?? 0;
    const item = quest.reward.item;

    const claimed = await db.transaction(async (tx) => {
      // The reward feeds all three counters like a harvest — a quest is a
      // carrot event, not a coupon. Guarded on the id NOT already being in
      // the array, which is the whole anti-double-claim.
      const [row] = await tx.update(players).set({
        questsClaimed: raw`array_append(${players.questsClaimed}, ${id}::text)`,
        ...(carrots > 0
          ? {
            stock: raw`${players.stock} + ${carrots}`,
            seasonScore: raw`${players.seasonScore} + ${carrots}`,
            lifetimeCarrots: raw`${players.lifetimeCarrots} + ${carrots}`,
          }
          : {}),
      }).where(and(
        eq(players.id, session.sub),
        raw`NOT (${id}::text = ANY(${players.questsClaimed}))`,
      )).returning({ id: players.id });
      if (!row) return false;

      if (item) await grantItem(tx, session.sub, item.kind, item.qty);
      return true;
    });

    if (!claimed) return Response.json({ error: 'already_claimed' }, { status: 409 });

    const after = await db.query.players.findFirst({ where: eq(players.id, session.sub) });
    return Response.json({
      claimed: id,
      reward: quest.reward,
      // The id, not the sentence: the server has no idea which of the four
      // languages this player reads, and the words for a quest live in the
      // dictionaries now. The client looks it up (see i18n/content.ts).
      lineFor: quest.id,
      quest: questBoardOf(after!),
      burrow: burrowView(after!),
    });
  }

  if (body.action === 'mark') {
    const mark = typeof body.mark === 'string' ? body.mark : '';
    if (!markAllowed(mark, player.lifetimeCarrots)) {
      return Response.json({ error: 'unknown_mark' }, { status: 400 });
    }

    // Appended once. A repeat is a no-op rather than an error: the client
    // marks on every open of the board, and it should not have to remember.
    await db.update(players)
      .set({ questMarks: raw`array_append(${players.questMarks}, ${mark}::text)` })
      .where(and(
        eq(players.id, session.sub),
        raw`NOT (${mark}::text = ANY(${players.questMarks}))`,
      ));

    const after = await db.query.players.findFirst({ where: eq(players.id, session.sub) });
    return Response.json({ quest: questBoardOf(after!), burrow: burrowView(after!) });
  }

  return Response.json({ error: 'unknown action' }, { status: 400 });
}

/**
 * Which marks a client may set, and when.
 *
 * A codex mark names a chapter and is accepted only once that chapter has
 * opened on lifetime carrots — the same rule the codex itself draws by.
 */
function markAllowed(mark: string, lifetimeCarrots: number): boolean {
  if (mark === QUEST_MARK.LEADERBOARD) return true;
  if (mark.startsWith(QUEST_MARK.CODEX_PREFIX)) {
    const id = mark.slice(QUEST_MARK.CODEX_PREFIX.length);
    const chapter = LORE.find((c) => c.id === id);
    return !!chapter && lifetimeCarrots >= chapter.unlockAt;
  }
  return false;
}
