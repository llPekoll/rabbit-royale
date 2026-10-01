/**
 * The season pass lever — open it when we decide, close it, pay the top ten.
 *
 *   DATABASE_URL=... bun run scripts/season-pass.ts status
 *   DATABASE_URL=... bun run scripts/season-pass.ts open [--days 30] [--yes]
 *   DATABASE_URL=... bun run scripts/season-pass.ts close [--yes]
 *   DATABASE_URL=... bun run scripts/season-pass.ts comp <playerId|wallet> [--yes]
 *   DATABASE_URL=... bun run scripts/season-pass.ts payouts [--season N]
 *   DATABASE_URL=... SOLANA_RPC_URL=... USDC_MINT=... \
 *     bun run scripts/season-pass.ts pay --keypair ~/treasury.json [--season N] [--yes]
 *
 * Every command that writes is a dry run without `--yes`.
 *
 * OPEN closes the running season NOW (its standings are frozen, its champion
 * crowned, every season score goes back to zero — exactly what the clock does
 * at a month's end) and starts a pass season of `--days`. The pass is on sale
 * from that moment. At its end the clock closes it like any season, writes the
 * top ten's prizes to `pass_payouts`, and opens an ordinary season.
 *
 * CLOSE ends the running pass season early, with its prizes.
 *
 * PAY sends each pending prize in USDC from the treasury keypair given on the
 * command line. The key never goes near the server: this runs on our machine,
 * against the prod database through the ssh tunnel, like every script here.
 * Each prize's signature is written BEFORE it is sent, so a crash between the
 * two can be checked on chain instead of paid twice (see `sending` below).
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { and, desc, eq, isNotNull, isNull, or } from 'drizzle-orm';
import {
  Connection, Keypair, PublicKey, Transaction, TransactionInstruction,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { db } from '../src/lib/db';
import { passPayouts, players, seasons } from '../src/lib/db/schema';
import { closeSeasonIfDue } from '../src/lib/game/season';
import {
  grantPass, holderCount, openSeason, passOf, payoutPlan, potCents, prizePoolCents, rankedHolders,
} from '../src/lib/game/season-pass';
import { PASS, USDC } from '../config/tuning';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL must be set');
  process.exit(2);
}

const args = process.argv.slice(2);
const cmd = args[0] ?? 'status';
const go = args.includes('--yes');
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const day = (d: Date) => d.toISOString().replace('T', ' ').slice(0, 16) + 'Z';

async function status() {
  const season = await openSeason();
  if (!season) return console.log('No open season.');
  console.log(`Season ${season.id}  ${day(season.startedAt)} → ${day(season.endsAt)}  pass ${season.passOn ? 'ON' : 'off'}`);
  if (!season.passOn) return;
  const pot = await potCents(db, season.id);
  console.log(`Holders ${await holderCount(db, season.id)}  pot ${usd(pot)}  prize pool ${usd(prizePoolCents(pot))} (${PASS.POT_SHARE * 100} %)`);
  const plan = payoutPlan(pot, await rankedHolders(db, season.id));
  if (plan.length === 0) console.log('No holder has scored yet.');
  for (const p of plan) console.log(`  #${p.rank}  ${usd(p.usdCents).padStart(9)}  ${String(p.score).padStart(8)} pts  ${p.name}  ${p.playerId}`);
}

async function open() {
  const days = Number(flag('--days') ?? PASS.DAYS);
  if (!(days > 0 && days <= 90)) throw new Error('--days must be between 1 and 90');
  const season = await openSeason();
  console.log(season
    ? `Closes season ${season.id} now (was due ${day(season.endsAt)}${season.passOn ? ', a PASS season: its prizes are written' : ''}): standings frozen, champion crowned, every season score → 0.`
    : 'No open season: one is created.');
  console.log(`Opens a PASS season of ${days} days, ending ${day(new Date(Date.now() + days * 86_400_000))}.`);
  if (!go) return console.log('\nDry run. Add --yes to do it.');
  const now = new Date();
  const next = { passOn: true, durationMs: days * 86_400_000 };
  const out = await db.transaction(async (tx) => {
    const rolled = await closeSeasonIfDue(tx, now, { force: true, next });
    if (rolled) return rolled;
    const [created] = await tx.insert(seasons)
      .values({ startedAt: now, endsAt: new Date(now.getTime() + next.durationMs), passOn: true })
      .returning({ id: seasons.id });
    return { closed: null, opened: created.id, payouts: 0 };
  });
  console.log(`Done: closed ${out.closed ?? '—'}, pass season ${out.opened} is open.`);
  console.log('The ws server picks it up on its next read; the leaderboard rebuilds from Postgres.');
}

async function close() {
  const season = await openSeason();
  if (!season?.passOn) return console.log('The running season is not a pass season. Nothing to close.');
  await status();
  console.log(`\nCloses pass season ${season.id} now, writes the prizes above, opens an ordinary season.`);
  if (!go) return console.log('Dry run. Add --yes to do it.');
  const out = await db.transaction((tx) => closeSeasonIfDue(tx, new Date(), { force: true }));
  console.log(`Done: closed ${out?.closed}, ${out?.payouts} prizes written, season ${out?.opened} open.`);
}

async function comp() {
  const who = args[1];
  if (!who || who.startsWith('--')) throw new Error('comp needs a player id or a wallet');
  const [player] = await db.select({ id: players.id, name: players.name }).from(players)
    .where(or(eq(players.id, who), eq(players.wallet, who))).limit(1);
  if (!player) throw new Error(`no player ${who}`);
  const season = await openSeason();
  if (!season?.passOn) throw new Error('no pass season running');
  if (await passOf(db, season.id, player.id)) return console.log(`${player.name} already holds the pass.`);
  console.log(`Gives ${player.name} (${player.id}) a free pass for season ${season.id}. Adds $0 to the pot.`);
  if (!go) return console.log('Dry run. Add --yes to do it.');
  await grantPass(db, player.id, { usdCents: 0 });
  console.log('Done.');
}

/** The latest closed pass season, or the one named by --season. */
async function payoutSeason(): Promise<number | null> {
  const named = flag('--season');
  if (named) return Number(named);
  const [last] = await db.select({ id: seasons.id }).from(seasons)
    .where(and(eq(seasons.passOn, true), isNotNull(seasons.endedAt)))
    .orderBy(desc(seasons.id)).limit(1);
  return last?.id ?? null;
}

async function listPayouts() {
  const seasonId = await payoutSeason();
  if (!seasonId) return console.log('No closed pass season.');
  const rows = await db.select({
    rank: passPayouts.rank, cents: passPayouts.usdCents, wallet: passPayouts.wallet, status: passPayouts.status,
    signature: passPayouts.signature, name: players.name, playerId: passPayouts.playerId,
  }).from(passPayouts).innerJoin(players, eq(players.id, passPayouts.playerId))
    .where(eq(passPayouts.seasonId, seasonId)).orderBy(passPayouts.rank);
  console.log(`Pass season ${seasonId}: ${rows.length} prizes, ${usd(rows.reduce((a, r) => a + r.cents, 0))}`);
  for (const r of rows) {
    console.log(`  #${r.rank}  ${usd(r.cents).padStart(9)}  ${r.status.padEnd(8)}  ${r.name}  ${r.wallet ?? '(no wallet)'}${r.signature ? '  ' + r.signature : ''}`);
  }
  return { seasonId, rows };
}

const MEMO = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

async function pay() {
  const listed = await listPayouts();
  if (!listed) return;
  const keyPath = flag('--keypair')?.replace(/^~/, homedir());
  const rpc = process.env.SOLANA_RPC_URL;
  const mintRaw = process.env.USDC_MINT;
  if (!keyPath || !rpc || !mintRaw) throw new Error('pay needs --keypair, SOLANA_RPC_URL and USDC_MINT');
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keyPath, 'utf8'))));
  const treasury = process.env.USDC_TREASURY_ADDRESS;
  if (treasury && treasury !== payer.publicKey.toBase58()) {
    console.warn(`! the keypair is ${payer.publicKey.toBase58()}, not the treasury ${treasury}`);
  }
  const mint = new PublicKey(mintRaw);
  const conn = new Connection(rpc, 'confirmed');
  const from = getAssociatedTokenAddressSync(mint, payer.publicKey);

  // A prize whose signature was written but whose send was not confirmed:
  // ask the chain before anything else, never resend blind.
  const sending = await db.select().from(passPayouts)
    .where(and(eq(passPayouts.seasonId, listed.seasonId), eq(passPayouts.status, 'sending')));
  for (const p of sending) {
    const st = (await conn.getSignatureStatuses([p.signature!], { searchTransactionHistory: true })).value[0];
    if (st && !st.err) {
      await db.update(passPayouts).set({ status: 'sent', sentAt: new Date() })
        .where(and(eq(passPayouts.seasonId, p.seasonId), eq(passPayouts.playerId, p.playerId)));
      console.log(`  #${p.rank} had landed: marked sent.`);
    } else {
      console.log(`  #${p.rank} ${p.signature} is not on chain. If more than two minutes have passed, it never will be: reset it with`);
      console.log(`    update pass_payouts set status='pending', signature=null where season_id=${p.seasonId} and player_id='${p.playerId}';`);
    }
  }

  const todo = await db.select().from(passPayouts)
    .where(and(eq(passPayouts.seasonId, listed.seasonId), eq(passPayouts.status, 'pending'), isNull(passPayouts.signature)))
    .orderBy(passPayouts.rank);
  const total = todo.reduce((a, p) => a + p.usdCents, 0);
  console.log(`\n${todo.length} to send, ${usd(total)} from ${payer.publicKey.toBase58()}.`);
  if (!go) return console.log('Dry run. Add --yes to send.');

  for (const p of todo) {
    if (!p.wallet) { console.log(`  #${p.rank} has no wallet: skipped.`); continue; }
    const to = new PublicKey(p.wallet);
    const toAta = getAssociatedTokenAddressSync(mint, to, true);
    const amount = BigInt(p.usdCents) * 10n ** BigInt(USDC.DECIMALS - 2);
    const tx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, toAta, to, mint),
      createTransferCheckedInstruction(from, mint, toAta, payer.publicKey, amount, USDC.DECIMALS),
      new TransactionInstruction({ programId: MEMO, keys: [], data: Buffer.from(`rabbit-royale pass s${p.seasonId} #${p.rank}`) }),
    );
    tx.feePayer = payer.publicKey;
    tx.recentBlockhash = (await conn.getLatestBlockhash('confirmed')).blockhash;
    tx.sign(payer);
    const signature = (await import('bs58')).default.encode(tx.signature!);
    await db.update(passPayouts).set({ status: 'sending', signature })
      .where(and(eq(passPayouts.seasonId, p.seasonId), eq(passPayouts.playerId, p.playerId)));
    await conn.sendRawTransaction(tx.serialize());
    await conn.confirmTransaction(signature, 'confirmed');
    await db.update(passPayouts).set({ status: 'sent', sentAt: new Date() })
      .where(and(eq(passPayouts.seasonId, p.seasonId), eq(passPayouts.playerId, p.playerId)));
    console.log(`  #${p.rank}  ${usd(p.usdCents)} → ${p.wallet}  ${signature}`);
  }
}

const COMMANDS: Record<string, () => Promise<unknown>> = {
  status, open, close, comp, payouts: listPayouts, pay,
};
const run = COMMANDS[cmd];
if (!run) {
  console.error(`unknown command ${cmd}: ${Object.keys(COMMANDS).join(', ')}`);
  process.exit(2);
}
try {
  await run();
} catch (err) {
  console.error(String(err instanceof Error ? err.message : err));
  process.exitCode = 1;
}
process.exit();
