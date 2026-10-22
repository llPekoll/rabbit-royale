/**
 * THE RR GENESIS COLLECTION, AS THE GAME SEES IT ON CHAIN (2026-10-20).
 *
 * The pieces a crown chest gives away are real Metaplex Core assets of the RR
 * Genesis collection (the Domin8 hub's, `GNkM…B56A`), held by the game's own
 * wallet, `8jv4…sjqMy` — made for this alone (2026-10-21), so the key rr-ws
 * holds can reach these pieces and nothing else: not the RR treasury
 * (`FChws…uHB`), not the hub's vault. The hub's vault stocked it once.
 * Nothing about a piece is baked into the game: its name, rarity and image are
 * read from the asset and its metadata the moment it is won, and the transfer
 * to the winner is signed with the game wallet's key.
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
 *   GENESIS_RPC_URL            else SOLANA_RPC_URL.
 *
 * THE STOCK IS A LIST, `stock.json`: the mints the game was given (the 356
 * moved from the hub's vault on 2026-10-21), read 100 at a time with
 * getMultipleAccounts. Scanning the Core program for whatever the wallet
 * holds (getProgramAccounts) is what Alchemy refused on every call (429,
 * compute units), and a list also keeps the game off any piece it was not
 * handed. More stock = more mints in the file. Another collection (devnet, a
 * local validator) has no list and is scanned.
 */
import { Connection, PublicKey, type AccountInfo } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { createSignerFromKeypair, publicKey, signerIdentity } from '@metaplex-foundation/umi';
import { fetchAsset, transferV1 } from '@metaplex-foundation/mpl-core';
import bs58 from 'bs58';
import STOCK from './stock.json';

export const RR_GENESIS_COLLECTION = 'GNkMLCVtP3i2imay4LSRKugEFaUeb77QYHR4uDcxB56A';
export const RABBIT_WALLET = '8jv4N9KWwuG4ww8E8CqGz6A3eaheyUT4B6qsjoxsjqMy';
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

/**
 * Which of `keys` the wallet holds in the collection, from their accounts'
 * first 66 bytes (the AssetV1 layout the scan below filters on). A closed
 * (burnt) account or another program's is simply not stock.
 */
export function heldBy(keys: string[], infos: (AccountInfo<Buffer> | null)[], wallet: string, collection: string): string[] {
  return keys.filter((_, i) => {
    const info = infos[i];
    if (!info || !info.owner.equals(CORE_PROGRAM) || info.data.length < 66) return false;
    const d = info.data;
    return d[0] === 1
      && new PublicKey(d.subarray(1, 33)).toBase58() === wallet
      && d[33] === 2
      && new PublicKey(d.subarray(34, 66)).toBase58() === collection;
  });
}

/**
 * A Solana secret key as people paste it: base58 (Phantom's export) or the
 * JSON byte array of a keypair file, maybe wrapped in quotes. Null unless it
 * is the 64 bytes a keypair is made of — an address (32) or a cut-off paste
 * is not a key.
 */
export function secretKeyBytes(raw: string): Uint8Array | null {
  const s = raw.trim().replace(/^(["'])(.*)\1$/s, '$2').trim();
  try {
    const bytes = s.startsWith('[') ? Uint8Array.from(JSON.parse(s) as number[]) : bs58.decode(s);
    return bytes.length === 64 ? bytes : null;
  } catch {
    return null;
  }
}

/** The real chain, or null when no RPC is configured (dev without one). */
export function liveChain(): GenesisChain | null {
  const rpc = rpcUrl();
  if (!rpc) return null;
  const umi = createUmi(rpc);
  const raw = process.env.GENESIS_WALLET_SECRET_KEY?.trim();
  const secret = raw ? secretKeyBytes(raw) : null;
  // A key that is not one (2026-10-22, EU: "bad secret key size" thrown from
  // here on every sweep AND inside crown-chest digs): say so once and send
  // nothing, never throw — pieces wait in 'sending' until the key is fixed.
  if (raw && !secret) console.error('[genesis] GENESIS_WALLET_SECRET_KEY is not a 64-byte Solana secret key (base58 or JSON array): sending is off');
  let wallet = gameWallet();
  if (secret) {
    const kp = umi.eddsa.createKeypairFromSecretKey(secret);
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
      if (collection === RR_GENESIS_COLLECTION) {
        const out: string[] = [];
        for (let i = 0; i < STOCK.length; i += 100) {
          const keys = STOCK.slice(i, i + 100);
          const infos = await connection.getMultipleAccountsInfo(keys.map((k) => new PublicKey(k)), { dataSlice: { offset: 0, length: 66 } });
          out.push(...heldBy(keys, infos, wallet, collection));
        }
        return out;
      }
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
