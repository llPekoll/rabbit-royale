/**
 * MOVE THE GAME'S RR GENESIS STOCK: the hub's vault -> the rabbits' wallet.
 *
 *   bun scripts/genesis-stock-move.ts --list=moving.txt --key=<vault keypair> [--yes]
 *       [--to=<wallet>] [--rpc=<url>]
 *
 * `--list` is what scripts/genesis-hub-release.sql printed: one mint per line,
 * already taken out of the hub's catalogue. `--key` is the keypair file of
 * the wallet that holds them (a JSON byte array, like
 * mintbot/vault-server-mainnet.json, or a base58 string) — read here and nowhere else, never printed, never copied.
 * `--to` defaults to the game wallet, 8jv4…sjqMy (RABBIT_WALLET).
 *
 * Without `--yes` nothing is sent: every mint is READ on chain and the plan
 * says how many the vault holds, how many are already at the destination
 * (a previous run), and which cannot be moved and why. With `--yes` the
 * movable ones go in batches of five per transaction (one at a time when a
 * batch fails), and every signature lands in
 * ~/.cache/rabbit-royale/genesis/moved-<date>.txt. Safe to run again: a piece
 * already at the destination is skipped, never sent twice.
 */
import { readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { createSignerFromKeypair, publicKey, signerIdentity, transactionBuilder } from '@metaplex-foundation/umi';
import { fetchAsset, transferV1 } from '@metaplex-foundation/mpl-core';
import bs58 from 'bs58';
import { RABBIT_WALLET, RR_GENESIS_COLLECTION } from '../src/lib/genesis/chain';

const args = new Map(process.argv.slice(2).map((a) => {
  const [k, ...v] = a.replace(/^--/, '').split('=');
  return [k, v.join('=') || 'true'] as const;
}));
const listPath = args.get('list');
const keyPath = args.get('key');
if (!listPath || !keyPath) {
  console.error('usage: bun scripts/genesis-stock-move.ts --list=moving.txt --key=<vault keypair> [--yes] [--to=] [--rpc=]');
  process.exit(2);
}
const to = args.get('to') ?? RABBIT_WALLET;
const rpc = args.get('rpc') ?? 'https://api.mainnet-beta.solana.com';
const collection = args.get('collection') ?? RR_GENESIS_COLLECTION;
const go = args.get('yes') === 'true';

const raw = readFileSync(keyPath, 'utf8').trim();
const secret = raw.startsWith('[') ? Uint8Array.from(JSON.parse(raw) as number[]) : bs58.decode(raw);
const umi = createUmi(rpc);
const kp = umi.eddsa.createKeypairFromSecretKey(secret);
umi.use(signerIdentity(createSignerFromKeypair(umi, kp)));
const vault = kp.publicKey.toString();

const mints = [...new Set(readFileSync(listPath, 'utf8').split(/\s+/).filter((m) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(m)))];
console.log(`vault ${vault} -> ${to}, ${mints.length} mint(s) listed, rpc ${new URL(rpc).host}`);

const movable: string[] = [];
let already = 0;
const refused: string[] = [];
// The public RPC throttles (429) long before 356 reads: wait it out instead of
// calling a piece unreadable.
const read = async (mint: string) => {
  for (let i = 0; ; i++) {
    try {
      return await fetchAsset(umi, publicKey(mint), { skipDerivePlugins: true });
    } catch (e) {
      if (i >= 6 || !/429/.test(String(e))) throw e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
};
for (const mint of mints) {
  try {
    const a = await read(mint);
    const inCollection = a.updateAuthority.type === 'Collection' && a.updateAuthority.address?.toString() === collection;
    if (!inCollection) refused.push(`${mint} not in the RR Genesis collection`);
    else if (a.owner.toString() === to) already++;
    else if (a.owner.toString() === vault) movable.push(mint);
    else refused.push(`${mint} owned by ${a.owner} (not the vault)`);
  } catch (e) {
    refused.push(`${mint} unreadable: ${String(e).slice(0, 120)}`);
  }
}
console.log(`movable ${movable.length}, already at ${to} ${already}, refused ${refused.length}`);
for (const r of refused.slice(0, 20)) console.log('  refused', r);
if (!go) {
  console.log('plan only — rerun with --yes to send');
  process.exit(0);
}

const logDir = join(homedir(), '.cache/rabbit-royale/genesis');
mkdirSync(logDir, { recursive: true });
const log = join(logDir, `moved-${new Date().toISOString().slice(0, 10)}.txt`);
const send = async (batch: string[]) => {
  let tx = transactionBuilder();
  for (const mint of batch) tx = tx.add(transferV1(umi, { asset: publicKey(mint), newOwner: publicKey(to), collection: publicKey(collection) }));
  const out = await tx.sendAndConfirm(umi);
  const sig = bs58.encode(out.signature);
  for (const mint of batch) appendFileSync(log, `${mint} ${sig}\n`);
  return sig;
};
let sent = 0;
const failed: string[] = [];
for (let i = 0; i < movable.length; i += 5) {
  const batch = movable.slice(i, i + 5);
  try {
    await send(batch);
    sent += batch.length;
  } catch (e) {
    console.warn(`batch ${i / 5 + 1} failed (${String(e).slice(0, 120)}), one at a time`);
    for (const mint of batch) {
      try { await send([mint]); sent++; } catch (err) { failed.push(`${mint}: ${String(err).slice(0, 160)}`); }
    }
  }
  process.stdout.write(`\r${sent}/${movable.length} sent`);
}
console.log(`\nsent ${sent}, failed ${failed.length} — signatures in ${log}`);
for (const f of failed) console.log('  failed', f);
if (failed.length) console.log('A failed mint is still in the vault: rerun the same command, or put its hub row back (see genesis-hub-release.sql).');
