/**
 * THE PAYMENT PATH RUNS IN A BROWSER, and must not reach for Node.
 *
 * `use-usdc-pay` builds and signs the transfer client-side — that is the whole
 * design: the server states a price and reads the chain, it never touches the
 * money. So every global that file touches has to exist in a browser.
 *
 * It did not. `Buffer.from(quote.reference, 'utf8')` built the memo, and
 * Buffer is a Node global: the shop priced every item in dollars, the player
 * pressed buy, and the run died with "Buffer is not defined" at the last step
 * before the wallet opened (2026-09-21). Nothing in the type system catches
 * this — @types/node is installed for the server half of the repo, so `Buffer`
 * type-checks happily in a file that can never have one.
 *
 * Hence a source assertion. Crude, and the only thing that actually runs here:
 * the alternative is a browser in the suite for one global.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

/** Files that ship to the browser and build a transaction. */
const CLIENT = {
  'use-usdc-pay.ts': read('../src/components/use-usdc-pay.ts'),
  'use-shop.ts': read('../src/components/use-shop.ts'),
};

/**
 * Node globals with no browser equivalent.
 *
 * `process` is deliberately absent: the bundler substitutes `process.env.X`
 * at build time, so it is not the same hazard.
 */
const NODE_ONLY = [
  // `Buffer.from(...)` / `Buffer.alloc(...)` — a call, not the word in prose.
  { name: 'Buffer', re: /\bBuffer\s*\.\s*(from|alloc|concat|isBuffer)\b/ },
  { name: '__dirname', re: /\b__dirname\b/ },
  { name: 'require()', re: /(?<!\.)\brequire\s*\(/ },
];

describe('the client payment path', () => {
  for (const [file, src] of Object.entries(CLIENT)) {
    for (const { name, re } of NODE_ONLY) {
      it(`${file} does not call ${name}`, () => {
        // A cast in a TYPE position is fine — `as unknown as Buffer` never
        // runs. Only a call reaches the browser, which is what `re` matches.
        const hit = src.match(re);
        expect(hit, `${file} reaches for ${name}: ${hit?.[0]}`).toBeNull();
      });
    }
  }

  it('encodes the memo with TextEncoder, which browsers have', () => {
    // The memo binds the transfer to ONE quote; without it any transfer of
    // the right size could be claimed by whoever spotted it in an explorer.
    // So it has to be built, and built with something that exists.
    expect(CLIENT['use-usdc-pay.ts']).toMatch(/new TextEncoder\(\)\.encode\(quote\.reference\)/);
  });

  it('encodes the memo as the UTF-8 the server matches on', () => {
    // The server compares the memo as a STRING (`l.includes(reference)` in
    // lib/pay/solana), so what has to agree across the wire is the text.
    // TextEncoder is UTF-8 by definition — pinned as a fact, not a hope.
    const reference = '3f2a9c10-7b4e-4d2f-9a1c-0e5b8d7f6a23';
    const bytes = new TextEncoder().encode(reference);
    expect(Buffer.from(bytes).toString('utf8')).toBe(reference);
    // …and byte-identical to what the old Buffer call produced.
    expect([...bytes]).toEqual([...Buffer.from(reference, 'utf8')]);
  });
});
