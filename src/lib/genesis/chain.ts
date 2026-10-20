/**
 * THE RR GENESIS COLLECTION, AS THE GAME SEES IT ON CHAIN (2026-10-20).
 *
 * The pieces a crown chest gives away are real Metaplex Core assets of the RR
 * Genesis collection (the Domin8 hub's, `GNkM…B56A`), held by the game's own
 * wallet — "le wallet officiel des rabbits", `FChws…uHB` — which the hub's
 * vault stocked once. Nothing about a piece is baked into the game: its name,
 * rarity and image are read from the asset and its metadata the moment it is
 * won, and the transfer to the winner is signed with the game wallet's key.
 *
 * Everything chain-shaped sits behind `GenesisChain`, so the award and the
 * sender can be exercised without an RPC (tests) or against devnet (a
 * throwaway collection, `GENESIS_COLLECTION_ADDRESS` + `GENESIS_WALLET_*`).
 *
 * Env:
 *   GENESIS_WALLET_SECRET_KEY  base58 — signs the transfers. Unset = pieces
 *                              are still drawn and shown, and wait in
 *                              'sending' until the key is there.
 *   GENESIS_WALLET_ADDRESS     the game wallet (default the official one).
 *   GENESIS_COLLECTION_ADDRESS the collection (default RR Genesis mainnet).
 *   GENESIS_RPC_URL            else SOLANA_RPC_URL — getProgramAccounts must
 *                              be allowed on it.
 */
import { Connection, PublicKey } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { createSignerFromKeypair, publicKey, signerIdentity } from '@metaplex-foundation/umi';
import { fetchAsset, transferV1 } from '@metaplex-foundation/mpl-core';
import bs58 from 'bs58';

export const RR_GENESIS_COLLECTION = 'GNkMLCVtP3i2imay4LSRKugEFaUeb77QYHR4uDcxB56A';
export const RABBIT_WALLET = 'FChwsKVeuDjgToaP5HHrk9u4oz1QiPbnJH1zzpbMKuHB';
const CORE_PROGRAM = new PublicKey('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d');

export function collectionAddress(): string {
  return process.env.GENESIS_COLLECTION_ADDRESS?.trim() || RR_GENESIS_COLLECTION;
}

export function gameWallet(): string {
  return process.env.GENESIS_WALLET_ADDRESS?.trim() || RABBIT_WALLET;
}

export function rpcUrl(): string | null {
  return process.env.GENESIS_RPC_URL?.trim() || process.env.SOLANA_RPC_URL?.trim() || null;
}

/** What a piece shows: read from its asset and metadata, never guessed. */
export interface PieceLook {
  name: string;
  imageUrl: string | null;
  /** The `tier` trait the reveal wrote (common/rare/epic/legendary), or null. */
  rarity: string | null;
}

export interface GenesisChain {
  /** The game wallet's address — the only owner a piece can be sent from. */
  wallet: string;
  /** Every collection asset the game wallet holds right now. */
  stock(): Promise<string[]>;
  ownerOf(asset: string): Promise<string>;
  look(asset: string): Promise<PieceLook>;
  /** Moves `asset` to `to`; returns the base58 signature. Throws on failure. */
  transfer(asset: string, to: string): Promise<string>;
  /** False when no key is set: the sender leaves every piece waiting. */
  canSend: boolean;
}

/**
 * Errors that mean "try again later", never "this piece is lost" — the same
 * family the hub learnt to defer (hub/src/lib/nft/deliver.ts), the unfunded
 * wallet included: a transfer costs lamports, and a wallet at 0 SOL is an ops
 * fix, not a reason to give up on a player's piece.
 */
export function isTransient(e: unknown): boolean {
  const msg = String((e as Error)?.message ?? e);
  return /429|rate limit|Too Many Requests|timeout|timed out|fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|block height exceeded|Blockhash not found|expired|502|503|504|Simulation failed|insufficient lamports|insufficient funds|found no record of a prior credit|Attempt to debit an account/i.test(msg);
}

/** The metadata's `tier` (or `rarity`) trait, lowercased. */
export function rarityOf(attributes: unknown): string | null {
  if (!Array.isArray(attributes)) return null;
  for (const a of attributes as { trait_type?: unknown; value?: unknown }[]) {
    const t = String(a?.trait_type ?? '').toLowerCase().trim();
    if (t === 'tier' || t === 'rarity') return String(a?.value ?? '').toLowerCase().trim() || null;
  }
  return null;
}

/** The real chain, or null when no RPC is configured (dev without one). */
export function liveChain(): GenesisChain | null {
  const rpc = rpcUrl();
  if (!rpc) return null;
  const umi = createUmi(rpc);
  const secret = process.env.GENESIS_WALLET_SECRET_KEY?.trim();
  let wallet = gameWallet();
  if (secret) {
    const kp = umi.eddsa.createKeypairFromSecretKey(bs58.decode(secret));
    umi.use(signerIdentity(createSignerFromKeypair(umi, kp)));
    // The key decides: a mismatched GENESIS_WALLET_ADDRESS would read one
    // wallet's stock and try to send it with another's signature.
    if (kp.publicKey.toString() !== wallet) {
      console.error(`[genesis] the key is ${kp.publicKey} but GENESIS_WALLET_ADDRESS is ${wallet}: using the key`);
      wallet = kp.publicKey.toString();
    }
  }
  const connection = new Connection(rpc, 'confirmed');
  const collection = collectionAddress();
  return {
    wallet,
    canSend: !!secret,
    async stock() {
      // A Core AssetV1 account: key (1 = AssetV1, base58 "2"), owner at 1,
      // update authority kind at 33 (2 = collection) and its address at 34.
      const accounts = await connection.getProgramAccounts(CORE_PROGRAM, {
        dataSlice: { offset: 0, length: 0 },
        filters: [
          { memcmp: { offset: 0, bytes: '2' } },
          { memcmp: { offset: 1, bytes: wallet } },
          { memcmp: { offset: 34, bytes: collection } },
        ],
      });
      return accounts.map((a) => a.pubkey.toBase58());
    },
    async ownerOf(asset) {
      const a = await fetchAsset(umi, publicKey(asset), { skipDerivePlugins: true });
      return a.owner.toString();
    },
    async look(asset) {
      const a = await fetchAsset(umi, publicKey(asset), { skipDerivePlugins: true });
      let imageUrl: string | null = null;
      let rarity: string | null = null;
      try {
        const meta = (await (await fetch(a.uri, { signal: AbortSignal.timeout(8000) })).json()) as { image?: unknown; attributes?: unknown };
        imageUrl = typeof meta.image === 'string' ? meta.image : null;
        rarity = rarityOf(meta.attributes);
      } catch (e) {
        console.warn('[genesis] metadata unreadable', asset, String(e));
      }
      return { name: a.name, imageUrl, rarity };
    },
    async transfer(asset, to) {
      const out = await transferV1(umi, {
        asset: publicKey(asset),
        newOwner: publicKey(to),
        // Core requires the collection when the asset belongs to one.
        collection: publicKey(collection),
      }).sendAndConfirm(umi);
      return bs58.encode(out.signature);
    },
  };
}
