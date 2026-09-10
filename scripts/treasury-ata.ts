/**
 * Which address does a USDC payment actually arrive at?
 *
 * Not your wallet's. An SPL transfer lands in the ASSOCIATED TOKEN ACCOUNT — a
 * separate address derived from (wallet, mint) — and your wallet address never
 * appears as the recipient of the transfer itself. Watching the wrong one is a
 * webhook that never fires.
 *
 * Run this before configuring an Alchemy Address Activity webhook:
 *
 *   bun run scripts/treasury-ata.ts <wallet> [mainnet|devnet]
 */
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';

/** The real USDC mints. There is no third one — anything else is not USDC. */
const MINTS = {
  mainnet: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  devnet: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
} as const;

const [walletArg, networkArg = 'devnet'] = process.argv.slice(2);

if (!walletArg) {
  console.error('usage: bun run scripts/treasury-ata.ts <wallet> [mainnet|devnet]');
  process.exit(1);
}
const network = networkArg === 'mainnet' ? 'mainnet' : 'devnet';

let wallet: PublicKey;
try {
  wallet = new PublicKey(walletArg);
} catch {
  console.error(`"${walletArg}" is not a valid Solana address.`);
  process.exit(1);
}

const mint = new PublicKey(MINTS[network]);
const ata = await getAssociatedTokenAddress(mint, wallet);

console.log(`
network   ${network}
mint      ${mint.toBase58()}

Coolify (rr-web, runtime only):
  USDC_TREASURY_ADDRESS=${wallet.toBase58()}
  USDC_MINT=${mint.toBase58()}

Alchemy webhook, Account Address:
  ${ata.toBase58()}

  ...the associated token account, NOT the wallet. An SPL transfer lands here,
  and the wallet address never appears as the transfer's recipient — so a
  webhook watching the wallet would simply never fire.

  If Alchemy's Solana indexer resolves owners rather than token accounts, add
  the wallet address as a second watched address. Both is safe: this endpoint
  ignores anything that does not match an open quote.
`);
